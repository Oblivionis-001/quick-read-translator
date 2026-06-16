import { describe, it, expect } from "vitest";
import { createHoverButton } from "@/interface-adapters/content/triggers/hover-button-trigger";

/**
 * Basic structural tests for the hover button. End-to-end mouseover/click
 * interaction is hard to simulate faithfully in jsdom (getBoundingClientRect
 * returns zeros and mouseover event delegation has subtle differences), so
 * we assert only on the static, deterministic properties: the button is
 * appended to the body, has the expected text, brand-green background, and
 * is removed on destroy. Full interaction is covered by Playwright e2e.
 */
describe("createHoverButton", () => {
  it("appends a '译' button to document.body", () => {
    const before = document.querySelectorAll("button.qrt-hover-button").length;
    const handle = createHoverButton(() => {});
    try {
      const after = document.querySelectorAll("button.qrt-hover-button").length;
      expect(after).toBe(before + 1);
      const button = document.querySelector("button.qrt-hover-button");
      expect(button?.textContent).toBe("译");
    } finally {
      handle.destroy();
    }
  });

  it("uses the Sequoia primary green as background", () => {
    const handle = createHoverButton(() => {});
    try {
      const button = document.querySelector(
        "button.qrt-hover-button"
      ) as HTMLButtonElement;
      // jsdom normalizes #00a071 to rgb() on read-back; accept both.
      expect(["#00a071", "rgb(0, 160, 113)"]).toContain(button.style.background);
    } finally {
      handle.destroy();
    }
  });

  it("starts hidden (display:none) until a hover target is found", () => {
    const handle = createHoverButton(() => {});
    try {
      const button = document.querySelector(
        "button.qrt-hover-button"
      ) as HTMLButtonElement;
      expect(button.style.display).toBe("none");
    } finally {
      handle.destroy();
    }
  });

  it("is removed from the DOM after destroy", () => {
    const handle = createHoverButton(() => {});
    const before = document.querySelectorAll("button.qrt-hover-button").length;
    handle.destroy();
    const after = document.querySelectorAll("button.qrt-hover-button").length;
    expect(after).toBe(before - 1);
  });
});
