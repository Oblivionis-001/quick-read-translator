import { describe, it, expect, vi } from "vitest";
import {
  parseHotkey,
  matchesHotkey,
  listenHotkey,
  type KeyCombo,
} from "@/interface-adapters/content/triggers/hotkey-trigger";

/**
 * Minimal stand-in for a KeyboardEvent: the production code only reads these
 * five properties, so a structural typed object is sufficient and avoids
 * needing to construct a real DOM KeyboardEvent (which jsdom does support
 * but cannot have its `key`/modifier fields mutated at construction time in
 * a uniform way across engines).
 */
interface FakeKeyboardEvent {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
}

function makeEvent(overrides: Partial<FakeKeyboardEvent> = {}): FakeKeyboardEvent {
  return {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    key: "t",
    ...overrides,
  };
}

describe("parseHotkey", () => {
  it("parses Alt+T into a single-modifier combo", () => {
    expect(parseHotkey("Alt+T")).toEqual<KeyCombo>({
      alt: true,
      ctrl: false,
      meta: false,
      shift: false,
      key: "t",
    });
  });

  it("parses Ctrl+Shift+D into a multi-modifier combo (case-insensitive)", () => {
    expect(parseHotkey("Ctrl+Shift+D")).toEqual<KeyCombo>({
      alt: false,
      ctrl: true,
      meta: false,
      shift: true,
      key: "d",
    });
  });

  it("parses a bare key into an all-false combo", () => {
    expect(parseHotkey("t")).toEqual<KeyCombo>({
      alt: false,
      ctrl: false,
      meta: false,
      shift: false,
      key: "t",
    });
  });

  it("lowercases the key component", () => {
    const combo = parseHotkey("Alt+Z");
    expect(combo.key).toBe("z");
  });

  it("handles malformed input with multiple non-modifier tokens (last wins)", () => {
    // Documented graceful behavior: when more than one non-modifier token
    // appears, the rightmost one is taken as the key. This avoids throwing
    // on user-typed hotkeys with stray characters.
    expect(parseHotkey("Alt+T+BadFormat")).toEqual<KeyCombo>({
      alt: true,
      ctrl: false,
      meta: false,
      shift: false,
      key: "badformat",
    });
  });

  it("treats the meta modifier independently from ctrl", () => {
    const combo = parseHotkey("Meta+K");
    expect(combo).toEqual<KeyCombo>({
      alt: false,
      ctrl: false,
      meta: true,
      shift: false,
      key: "k",
    });
  });
});

describe("matchesHotkey", () => {
  it("returns true when event modifiers and key match the combo", () => {
    const combo = parseHotkey("Alt+T");
    const event = makeEvent({ altKey: true, key: "t" });
    expect(matchesHotkey(event as unknown as KeyboardEvent, combo)).toBe(true);
  });

  it("returns false when the alt modifier differs", () => {
    const combo = parseHotkey("Alt+T");
    const event = makeEvent({ altKey: false, key: "t" });
    expect(matchesHotkey(event as unknown as KeyboardEvent, combo)).toBe(false);
  });

  it("returns false when the ctrl modifier differs", () => {
    const combo = parseHotkey("Ctrl+D");
    const event = makeEvent({ ctrlKey: false, key: "d" });
    expect(matchesHotkey(event as unknown as KeyboardEvent, combo)).toBe(false);
  });

  it("returns false when the key differs", () => {
    const combo = parseHotkey("Alt+T");
    const event = makeEvent({ altKey: true, key: "y" });
    expect(matchesHotkey(event as unknown as KeyboardEvent, combo)).toBe(false);
  });

  it("is case-insensitive on the event key", () => {
    const combo = parseHotkey("Alt+T");
    const event = makeEvent({ altKey: true, key: "T" });
    expect(matchesHotkey(event as unknown as KeyboardEvent, combo)).toBe(true);
  });

  it("returns true for a multi-modifier combo", () => {
    const combo = parseHotkey("Ctrl+Shift+D");
    const event = makeEvent({ ctrlKey: true, shiftKey: true, key: "d" });
    expect(matchesHotkey(event as unknown as KeyboardEvent, combo)).toBe(true);
  });
});

describe("listenHotkey (integration with document)", () => {
  it("invokes the callback when the matching key is pressed", () => {
    const cb = vi.fn();
    const dispose = listenHotkey("Alt+T", cb);
    try {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { altKey: true, key: "t" })
      );
      expect(cb).toHaveBeenCalledTimes(1);
    } finally {
      dispose();
    }
  });

  it("does not invoke the callback when the modifiers do not match", () => {
    const cb = vi.fn();
    const dispose = listenHotkey("Alt+T", cb);
    try {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { altKey: false, key: "t" })
      );
      expect(cb).not.toHaveBeenCalled();
    } finally {
      dispose();
    }
  });

  it("calls preventDefault on the event when matched", () => {
    const cb = vi.fn();
    const dispose = listenHotkey("Alt+T", cb);
    const event = new KeyboardEvent("keydown", {
      altKey: true,
      key: "t",
      cancelable: true,
    });
    const spy = vi.spyOn(event, "preventDefault");
    try {
      document.dispatchEvent(event);
      expect(spy).toHaveBeenCalled();
    } finally {
      dispose();
    }
  });

  it("stops listening after the returned dispose is called", () => {
    const cb = vi.fn();
    const dispose = listenHotkey("Alt+T", cb);
    dispose();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { altKey: true, key: "t" })
    );
    expect(cb).not.toHaveBeenCalled();
  });
});
