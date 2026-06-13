import { describe, it, expect } from "vitest";
import { isTriggerTranslate } from "@/interface-adapters/content/message-router";

describe("isTriggerTranslate", () => {
  it("returns true for a TRIGGER_TRANSLATE message", () => {
    expect(isTriggerTranslate({ type: "TRIGGER_TRANSLATE" })).toBe(true);
  });

  it("returns false for unrelated message types", () => {
    expect(isTriggerTranslate({ type: "OTHER" })).toBe(false);
  });

  it("returns false for non-object messages", () => {
    expect(isTriggerTranslate(null)).toBe(false);
    expect(isTriggerTranslate(undefined)).toBe(false);
    expect(isTriggerTranslate("TRIGGER_TRANSLATE")).toBe(false);
    expect(isTriggerTranslate(42)).toBe(false);
  });

  it("returns false for objects without type field", () => {
    expect(isTriggerTranslate({})).toBe(false);
    expect(isTriggerTranslate({ payload: "x" })).toBe(false);
  });

  it("narrows the type so message.type is accessible", () => {
    const msg: unknown = { type: "TRIGGER_TRANSLATE" };
    if (isTriggerTranslate(msg)) {
      // This line should type-check
      expect(msg.type).toBe("TRIGGER_TRANSLATE");
    }
  });
});
