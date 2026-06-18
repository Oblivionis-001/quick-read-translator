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

/**
 * Background → content-script progress message. Fired by the background
 * script's `onProgress` callback (forwarded from `TranslationScheduler`)
 * so the content script can render loading / retrying indicators next to
 * the affected blocks before the final TRANSLATE_BLOCKS response arrives.
 *
 * `blockIds` are the scheduler request's block ids (after merging), so a
 * single event may reference multiple original paragraph blocks.
 */
export type BlockProgressState = "translating" | "retrying";

export interface BlockProgressMessage {
  type: "BLOCK_PROGRESS";
  blockIds: string[];
  state: BlockProgressState;
  attempt: number;
  maxRetries: number;
}

export function isBlockProgress(
  message: unknown
): message is BlockProgressMessage {
  if (typeof message !== "object" || message === null) return false;
  const m = message as { type?: unknown; blockIds?: unknown; state?: unknown; attempt?: unknown; maxRetries?: unknown };
  if (m.type !== "BLOCK_PROGRESS") return false;
  if (!Array.isArray(m.blockIds) || !m.blockIds.every((b) => typeof b === "string")) {
    return false;
  }
  if (m.state !== "translating" && m.state !== "retrying") return false;
  if (typeof m.attempt !== "number" || !Number.isFinite(m.attempt)) return false;
  if (typeof m.maxRetries !== "number" || !Number.isFinite(m.maxRetries)) {
    return false;
  }
  return true;
}
