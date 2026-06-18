import { defineBackground } from "wxt/utils/define-background";
import { browser } from "wxt/browser";
import {
  handleTranslateMessage,
  type TranslateMessage,
} from "@/interface-adapters/background/message-handler";
import type { ScheduleProgressEvent } from "@/application/TranslationScheduler";

/**
 * Wire background → content progress events: each `onProgress` callback
 * invocation forwards a `BLOCK_PROGRESS` message to the sender tab so the
 * content script can render loading / retrying indicators next to the
 * affected blocks. Falls back to a no-op when the sender has no tab id
 * (e.g. the message came from the popup or another background context).
 */
function makeTabProgressForwarder(
  tabId: number | undefined
): (event: ScheduleProgressEvent) => void {
  if (typeof tabId !== "number") return () => {};
  return (event) => {
    // Fire-and-forget; the content script's listener is the consumer and
    // we don't need an ack back. The cast is necessary because WXT's
    // webextension-polyfill typings reject our literal `type` discriminator
    // as incompatible with its broad `messages` type parameter.
    void browser.tabs
      .sendMessage(tabId, {
        type: "BLOCK_PROGRESS",
        blockIds: event.blockIds,
        state: event.state,
        attempt: event.attempt,
        maxRetries: event.maxRetries,
      })
      .catch((err: unknown) => {
        // Tab may have navigated away or closed mid-translation; the
        // final TRANSLATE_BLOCKS response still carries the terminal
        // state, so we can safely swallow progress-send failures.
        console.warn("[qrt] failed to forward progress to tab:", err);
      });
  };
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse: (response: unknown) => void) => {
      if (
        typeof message === "object" &&
        message !== null &&
        (message as { type?: unknown }).type === "TRANSLATE_BLOCKS"
      ) {
        const msg = message as TranslateMessage;
        const onProgress = makeTabProgressForwarder(sender?.tab?.id);
        handleTranslateMessage(msg, undefined, onProgress)
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
