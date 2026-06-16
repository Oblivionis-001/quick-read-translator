/**
 * Hotkey trigger: parse a user-typed hotkey string (e.g. "Alt+T") into a
 * normalized KeyCombo, test it against a KeyboardEvent, and bind a
 * document-level keydown listener.
 *
 * The pure helpers (parseHotkey, matchesHotkey) are separated from the
 * DOM-binding side effect (listenHotkey) so the modifier-matching logic
 * can be unit-tested without dispatching real events.
 */

export interface KeyCombo {
  /** True when the Alt modifier is required. */
  alt: boolean;
  /** True when the Ctrl modifier is required. */
  ctrl: boolean;
  /** True when the Meta (Cmd) modifier is required. */
  meta: boolean;
  /** True when the Shift modifier is required. */
  shift: boolean;
  /** Lowercase key name (e.g. "t", "d"). */
  key: string;
}

const MODIFIERS = ["alt", "ctrl", "meta", "shift"] as const;

/**
 * Parse a hotkey string of the form "Modifier+...+Key" into a KeyCombo.
 *
 * Parsing rules:
 * - The string is split on "+" and lowercased.
 * - Tokens equal to one of the four recognized modifiers toggle the
 *   corresponding flag.
 * - All other tokens are treated as candidate keys. The LAST non-modifier
 *   token wins (this gives graceful behavior for inputs like "Alt+T+Bad"
 *   rather than throwing, while still preferring a trailing real key in
 *   unusual inputs).
 *
 * Examples:
 *   "Alt+T"            -> { alt:true, ctrl:false, meta:false, shift:false, key:"t" }
 *   "Ctrl+Shift+D"     -> { ctrl:true, shift:true, key:"d" }
 *   "t"                -> { key:"t" }  (all modifiers false)
 */
export function parseHotkey(hotkey: string): KeyCombo {
  const parts = hotkey.toLowerCase().split("+");
  const modifiers = new Set(parts);
  const nonModifierKeys = parts.filter((p) => !MODIFIERS.includes(p as (typeof MODIFIERS)[number]));
  return {
    alt: modifiers.has("alt"),
    ctrl: modifiers.has("ctrl"),
    meta: modifiers.has("meta"),
    shift: modifiers.has("shift"),
    key: nonModifierKeys[nonModifierKeys.length - 1] ?? "",
  };
}

/**
 * Return true iff the keyboard event's modifiers and key match the combo.
 * Comparison is case-insensitive on the key (the combo is stored lowercase).
 */
export function matchesHotkey(event: KeyboardEvent, combo: KeyCombo): boolean {
  return (
    event.altKey === combo.alt &&
    event.ctrlKey === combo.ctrl &&
    event.metaKey === combo.meta &&
    event.shiftKey === combo.shift &&
    event.key.toLowerCase() === combo.key
  );
}

/**
 * Bind a document-level keydown listener that fires `callback` whenever
 * the pressed key matches `hotkey`. Prevents default on match so that
 * browser shortcuts (e.g. Alt+T in some locales) do not also fire.
 *
 * Returns a dispose function that removes the listener.
 */
export function listenHotkey(hotkey: string, callback: () => void): () => void {
  const combo = parseHotkey(hotkey);
  const handler = (event: KeyboardEvent) => {
    if (matchesHotkey(event, combo)) {
      event.preventDefault();
      callback();
    }
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}
