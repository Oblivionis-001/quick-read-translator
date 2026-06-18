import { describe, it, expect } from "vitest";
import {
  isTriggerTranslate,
  isBlockProgress,
} from "@/interface-adapters/content/message-router";

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

describe("isBlockProgress", () => {
  it("returns true for a well-formed BLOCK_PROGRESS message", () => {
    expect(
      isBlockProgress({
        type: "BLOCK_PROGRESS",
        blockIds: ["b1"],
        state: "translating",
        attempt: 0,
        maxRetries: 2,
      })
    ).toBe(true);
  });

  it("returns true for state='retrying' with a non-zero attempt", () => {
    expect(
      isBlockProgress({
        type: "BLOCK_PROGRESS",
        blockIds: ["b1", "b2"],
        state: "retrying",
        attempt: 2,
        maxRetries: 2,
      })
    ).toBe(true);
  });

  it("returns false for unrelated message types", () => {
    expect(
      isBlockProgress({ type: "TRIGGER_TRANSLATE" })
    ).toBe(false);
    expect(
      isBlockProgress({ type: "TRANSLATE_BLOCKS" })
    ).toBe(false);
  });

  it("returns false for non-object messages", () => {
    expect(isBlockProgress(null)).toBe(false);
    expect(isBlockProgress(undefined)).toBe(false);
    expect(isBlockProgress("BLOCK_PROGRESS")).toBe(false);
    expect(isBlockProgress(42)).toBe(false);
  });

  it("returns false when blockIds is missing or not an array", () => {
    expect(
      isBlockProgress({
        type: "BLOCK_PROGRESS",
        state: "translating",
        attempt: 0,
        maxRetries: 2,
      })
    ).toBe(false);
    expect(
      isBlockProgress({
        type: "BLOCK_PROGRESS",
        blockIds: "b1",
        state: "translating",
        attempt: 0,
        maxRetries: 2,
      })
    ).toBe(false);
  });

  it("returns false when state is not 'translating' or 'retrying'", () => {
    expect(
      isBlockProgress({
        type: "BLOCK_PROGRESS",
        blockIds: ["b1"],
        state: "done",
        attempt: 0,
        maxRetries: 2,
      })
    ).toBe(false);
  });

  it("narrows the type so message fields are accessible", () => {
    const msg: unknown = {
      type: "BLOCK_PROGRESS",
      blockIds: ["b1"],
      state: "translating",
      attempt: 0,
      maxRetries: 2,
    };
    if (isBlockProgress(msg)) {
      // These lines should type-check
      expect(msg.type).toBe("BLOCK_PROGRESS");
      expect(msg.state).toBe("translating");
      expect(msg.blockIds).toEqual(["b1"]);
      expect(msg.attempt).toBe(0);
      expect(msg.maxRetries).toBe(2);
    }
  });
});
