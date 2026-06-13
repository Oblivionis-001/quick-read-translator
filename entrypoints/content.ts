import { defineContentScript } from "wxt/utils/define-content-script";
import { browser } from "wxt/browser";
import { DOMBlockExtractor } from "@/infrastructure/extractors/DOMBlockExtractor";
import { listenHotkey } from "@/interface-adapters/content/triggers/hotkey-trigger";
import { listenSelection } from "@/interface-adapters/content/triggers/selection-trigger";
import { createHoverButton } from "@/interface-adapters/content/triggers/hover-button-trigger";
import {
  translateBlocks,
  selectBlocksForTranslation,
  type SendMessage,
} from "@/interface-adapters/content/orchestrator";
import { renderResults } from "@/interface-adapters/content/renderer-adapter";
import { isTriggerTranslate } from "@/interface-adapters/content/message-router";

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
 * extraction). The hover-button trigger's mouseover handler resolves the
 * block id to null in that case, and selectBlocksForTranslation falls
 * back to "first block". Subsequent hovers see the freshly-tagged
 * attribute and resolve correctly. Auto-retranslation on DOM mutation
 * (without an explicit trigger) is intentionally out of MVP scope.
 */
export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    // Construct once: the extractor is stateless and cheap to keep
    // around. The actual DOM query is what we want to repeat per trigger.
    const extractor = new DOMBlockExtractor();

    // Bind once so the SendMessage contract (unknown in, unknown out) is
    // satisfied by browser.runtime.sendMessage's looser generic signature.
    const sendMessage: SendMessage = (message) =>
      browser.runtime.sendMessage(message);

    async function handleTrigger(opts: {
      selection?: string | null;
      hoverBlockId?: string | null;
    }): Promise<void> {
      // Re-extract on every trigger so blocks reflect the current DOM.
      // This also (re)tags elements with data-qrt-block-id, which
      // subsequent hovers rely on.
      const blocks = extractor.extractFromElement(document.body);
      const selected = selectBlocksForTranslation(
        blocks,
        opts.selection ?? null,
        opts.hoverBlockId ?? null
      );
      const results = await translateBlocks(selected, "zh-CN", sendMessage);
      renderResults(results);
    }

    listenHotkey("Alt+T", () => {
      void handleTrigger({});
    });
    listenSelection((selection) => {
      void handleTrigger({ selection });
    });
    createHoverButton((blockId) => {
      void handleTrigger({ hoverBlockId: blockId });
    });

    // Popup → content message bridge. The popup sends `{ type: "TRIGGER_TRANSLATE" }`
    // to ask this tab to translate. We don't need an async sendResponse (the popup
    // updates its own status optimistically), so return false to signal the channel
    // can close immediately.
    browser.runtime.onMessage.addListener((message: unknown) => {
      if (isTriggerTranslate(message)) {
        void handleTrigger({});
      }
      return false;
    });
  },
});

