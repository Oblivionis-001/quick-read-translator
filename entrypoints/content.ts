import { defineContentScript } from "wxt/utils/define-content-script";
import { browser } from "wxt/browser";
import { DOMBlockExtractor } from "@/infrastructure/extractors/DOMBlockExtractor";
import { listenHotkey } from "@/interface-adapters/content/triggers/hotkey-trigger";
import { listenSelection } from "@/interface-adapters/content/triggers/selection-trigger";
import { createHoverButton } from "@/interface-adapters/content/triggers/hover-button-trigger";
import { FloatingBallHost } from "@/infrastructure/floating-ball/FloatingBallHost";
import {
  translateBlocks,
  selectBlocksForTranslation,
  type SendMessage,
} from "@/interface-adapters/content/orchestrator";
import {
  renderResults,
  renderLoading,
  setRendererTheme,
} from "@/interface-adapters/content/renderer-adapter";
import {
  isTriggerTranslate,
  isBlockProgress,
} from "@/interface-adapters/content/message-router";
import { ConfigService } from "@/application/ConfigService";
import { BrowserStorageConfigRepo } from "@/infrastructure/repositories/BrowserStorageConfigRepo";
import type { AppConfig } from "@/shared/types";
import { DEFAULT_SELECTOR_CONFIG } from "@/shared/constants";

/**
 * Content script entry point.
 *
 * Extraction is deferred to each trigger invocation rather than running
 * once at script load. This keeps blocks fresh on SPAs that mutate the
 * DOM after load (e.g. route changes, infinite scroll): every hotkey /
 * selection / hover-button trigger re-runs extractFromElement(document.body)
 * against the current DOM, so the orchestrator never sees a stale list.
 *
 * The trade-off: on the very first hover, the hovered element's
 * data-qrt-block-id attribute is not set yet (it is populated by
 * extraction). The hover-button trigger therefore captures the hovered
 * *element* (not its id) and passes it to handleTrigger. handleTrigger
 * runs extraction first — tagging every matched element with
 * data-qrt-block-id — and then resolves the hovered element's id from
 * the freshly-set attribute. Auto-retranslation on DOM mutation (without
 * an explicit trigger) is intentionally out of MVP scope.
 *
 * Trigger wiring honors the user's configured hotkey and the per-trigger
 * toggle flags (hotkey is always on; selection and hover-button are
 * gated by their respective config flags). If config load fails (e.g.
 * storage unavailable), fall back to the default hotkey and all triggers
 * enabled so the user still gets a working extension rather than a dead
 * one.
 */
export default defineContentScript({
  matches: ["<all_urls>"],
  async main() {
    // Construct once: the extractor is stateless and cheap to keep
    // around. The actual DOM query is what we want to repeat per trigger.
    const extractor = new DOMBlockExtractor();

    // Bind once so the SendMessage contract (unknown in, unknown out) is
    // satisfied by browser.runtime.sendMessage's looser generic signature.
    const sendMessage: SendMessage = (message) =>
      browser.runtime.sendMessage(message);

    async function handleTrigger(opts: {
      selection?: string | null;
      hoveredElement?: HTMLElement | null;
    }): Promise<void> {
      // Re-extract on every trigger so blocks reflect the current DOM.
      // This also tags every matched element with data-qrt-block-id,
      // which we read below to resolve the hovered element to its block.
      const blocks = extractor.extractFromElement(
        document.body,
        config?.selectorConfig ?? DEFAULT_SELECTOR_CONFIG,
        config?.siteRules ?? [],
        new URL(window.location.href)
      );
      // Read the block id AFTER extraction has tagged the element. On the
      // very first hover this attribute is empty before extraction;
      // reading it post-extraction is what makes the first click resolve
      // to the hovered block instead of falling through to "translate all".
      const hoverBlockId = opts.hoveredElement?.dataset.qrtBlockId ?? null;
      const selected = selectBlocksForTranslation(
        blocks,
        opts.selection ?? null,
        hoverBlockId
      );
      const results = await translateBlocks(
        selected,
        config?.targetLanguage ?? "zh-CN",
        sendMessage
      );
      renderResults(results);
    }

    // Load user config to honor the configured hotkey and trigger toggles.
    // The hotkey is always registered; selection and hover-button are gated
    // by their respective flags. Fall back to defaults if config load fails
    // so the extension remains usable when storage is unavailable.
    let config: AppConfig | null = null;
    try {
      const configService = new ConfigService(new BrowserStorageConfigRepo());
      config = await configService.getConfig();
    } catch (err) {
      console.error("[qrt] failed to load config; using defaults:", err);
    }

    const hotkey = config?.hotkey ?? 'Alt+T';
    const selectionTriggerEnabled = config?.selectionTriggerEnabled ?? true;
    const hoverButtonEnabled = config?.hoverButtonEnabled ?? true;
    const translationTheme = config?.translationTheme ?? 'inherit';
    const floatingBallEnabled = config?.floatingBallEnabled ?? true;
    setRendererTheme(translationTheme);

    listenHotkey(hotkey, () => {
      void handleTrigger({});
    });
    if (selectionTriggerEnabled) {
      listenSelection((selection) => {
        void handleTrigger({ selection });
      });
    }
    if (hoverButtonEnabled) {
      createHoverButton((hoveredElement) => {
        void handleTrigger({ hoveredElement });
      });
    }

    if (floatingBallEnabled) {
      const ballHost = new FloatingBallHost();
      ballHost.attach().catch((err) =>
        console.error('[qrt] floating ball attach failed:', err)
      );
    }

    // Popup → content message bridge. The popup sends `{ type: "TRIGGER_TRANSLATE" }`
    // to ask this tab to translate. We don't need an async sendResponse (the popup
    // updates its own status optimistically), so return false to signal the channel
    // can close immediately.
    //
    // Background → content progress bridge: while a TRANSLATE_BLOCKS request is
    // in flight, the background forwards scheduler progress events back to this
    // tab as `{ type: "BLOCK_PROGRESS", blockIds, state, attempt, maxRetries }`.
    // We render a per-block loading / retrying indicator from each event; the
    // indicator is cleared automatically by renderResults / renderError when
    // the terminal state for that block arrives.
    browser.runtime.onMessage.addListener((message: unknown) => {
      if (isTriggerTranslate(message)) {
        void handleTrigger({});
      } else if (isBlockProgress(message)) {
        renderLoading(message.blockIds, message.state, message.attempt, message.maxRetries);
      }
      return false;
    });

    // Floating panel → content event bridge. The panel dispatches
    // `qrt:translate-page` on window (same JS context as content script).
    window.addEventListener('qrt:translate-page', () => {
      void handleTrigger({});
    });

    // React to config changes made from the floating panel or Options UI
    // in another view of this tab (or another tab). Without this, theme /
    // provider / hover-toggle changes from those surfaces only take effect
    // on next page load. We re-pull the entire config so `handleTrigger`
    // (which closes over `config`) sees fresh values on the next invocation.
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes.appConfig?.newValue) return;
      config = changes.appConfig.newValue as AppConfig;
      setRendererTheme(config.translationTheme ?? 'inherit');
    });
  },
});
