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
            // handleTranslateMessage now always returns a TranslateResponse
            // (including its own ok field and, on failure, populated
            // errors), so we forward it verbatim rather than re-wrapping.
            sendResponse(response);
          })
          .catch((error: unknown) => {
            // Defensive: handleTranslateMessage is not expected to throw
            // (it catches internally), but if it does (e.g. synchronous
            // setup failure), still produce a well-formed failure response.
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
