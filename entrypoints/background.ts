import { defineBackground } from "wxt/utils/define-background";
import { browser } from "wxt/browser";
import {
  handleTranslateMessage,
  type TranslateMessage,
} from "@/interface-adapters/background/message-handler";

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    (message: unknown, _sender, sendResponse: (response: unknown) => void) => {
      if (
        typeof message === "object" &&
        message !== null &&
        (message as { type?: unknown }).type === "TRANSLATE_BLOCKS"
      ) {
        const msg = message as TranslateMessage;
        handleTranslateMessage(msg)
          .then((response) => {
            sendResponse({ ok: true, ...response });
          })
          .catch((error: unknown) => {
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        // Keep the message channel open for the async sendResponse above.
        return true;
      }
      return false;
    }
  );
});
