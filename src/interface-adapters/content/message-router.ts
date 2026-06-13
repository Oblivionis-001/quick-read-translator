/**
 * Type-guard for the popup → content-script TRIGGER_TRANSLATE message.
 *
 * Kept as a standalone pure function so the matching logic can be unit
 * tested in isolation (the content-script entry wraps it in a
 * browser.runtime.onMessage listener that is hard to exercise without a
 * real extension host).
 */
export type TriggerTranslateMessage = { type: "TRIGGER_TRANSLATE" };

export function isTriggerTranslate(
  message: unknown
): message is TriggerTranslateMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type: unknown }).type === "TRIGGER_TRANSLATE"
  );
}
