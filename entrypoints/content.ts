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

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(document.body);

    // Bind once so the SendMessage contract (unknown in, unknown out) is
    // satisfied by browser.runtime.sendMessage's looser generic signature.
    const sendMessage: SendMessage = (message) =>
      browser.runtime.sendMessage(message);

    async function handleTrigger(opts: {
      selection?: string | null;
      hoverBlockId?: string | null;
    }): Promise<void> {
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
  },
});

