import { describe, it, expect, vi } from "vitest";
import { JSDOM } from "jsdom";
import { DOMRenderer } from "@/infrastructure/renderers/DOMRenderer";
import { TranslationResult } from "@/domain/entities/TranslationResult";

describe("DOMRenderer", () => {
  function makeResult(blockId: string, translatedText: string): TranslationResult {
    return new TranslationResult({
      blockId,
      translatedText,
      providerId: "glm",
      modelId: "m",
      latencyMs: 10,
    });
  }

  it("renders translation inline after original", () => {
    const dom = new JSDOM(`
      <article>
        <p data-qrt-block-id="block-hello">Hello</p>
      </article>
    `);
    const document = dom.window.document;

    const renderer = new DOMRenderer(document);
    renderer.render([makeResult("block-hello", "你好")]);

    const translated = document.querySelector(".qrt-translation");
    expect(translated).not.toBeNull();
    expect(translated?.textContent).toBe("你好");
    // Verify it's positioned immediately after the original.
    const original = document.querySelector('[data-qrt-block-id="block-hello"]');
    expect(original?.nextElementSibling).toBe(translated);
  });

  it("uses Sequoia Grey color for translated text", () => {
    const dom = new JSDOM(`<p data-qrt-block-id="b1">Hi</p>`);
    const document = dom.window.document;

    new DOMRenderer(document).render([makeResult("b1", "你好")], 'grey');

    const translated = document.querySelector(".qrt-translation") as HTMLElement;
    // jsdom normalizes #928c86 to rgb() on read-back; assert both forms for clarity.
    expect(["#928c86", "rgb(146, 140, 134)"]).toContain(translated.style.color);
  });

  it("does not duplicate translation on re-render (idempotent)", () => {
    const dom = new JSDOM(`<p data-qrt-block-id="b1">Hi</p>`);
    const document = dom.window.document;
    const renderer = new DOMRenderer(document);
    const result = makeResult("b1", "你好");

    renderer.render([result]);
    renderer.render([result]);

    expect(document.querySelectorAll(".qrt-translation")).toHaveLength(1);
  });

  it("updates translation in place when block is re-rendered with new text", () => {
    const dom = new JSDOM(`<p data-qrt-block-id="block-hello">Hello</p>`);
    const document = dom.window.document;
    const renderer = new DOMRenderer(document);

    renderer.render([makeResult("block-hello", "你好")]);
    renderer.render([makeResult("block-hello", "你好世界")]);

    const translations = document.querySelectorAll(".qrt-translation");
    expect(translations).toHaveLength(1);
    expect(translations[0].textContent).toBe("你好世界");
  });

  it("does nothing when original element is missing", () => {
    const dom = new JSDOM(`<article><p>Nothing here</p></article>`);
    const document = dom.window.document;
    const renderer = new DOMRenderer(document);

    expect(() => renderer.render([makeResult("nope", "x")])).not.toThrow();
    expect(document.querySelectorAll(".qrt-translation")).toHaveLength(0);
  });

  it("renders each block independently for multiple results", () => {
    const dom = new JSDOM(`
      <article>
        <p data-qrt-block-id="a">A</p>
        <p data-qrt-block-id="b">B</p>
        <p data-qrt-block-id="c">C</p>
      </article>
    `);
    const document = dom.window.document;
    new DOMRenderer(document).render([
      makeResult("a", "甲"),
      makeResult("b", "乙"),
      makeResult("c", "丙"),
    ]);

    const translations = document.querySelectorAll(".qrt-translation");
    expect(translations).toHaveLength(3);
    expect(translations[0].textContent).toBe("甲");
    expect(translations[1].textContent).toBe("乙");
    expect(translations[2].textContent).toBe("丙");
  });

  it("renderError places a warning span with title and click handler", () => {
    const dom = new JSDOM(`<p data-qrt-block-id="b1">Hi</p>`);
    const document = dom.window.document;
    const onRetry = vi.fn();

    new DOMRenderer(document).renderError("b1", "network failed", onRetry);

    const original = document.querySelector('[data-qrt-block-id="b1"]');
    const errorSpan = original?.nextElementSibling;
    expect(errorSpan).not.toBeNull();
    expect(errorSpan?.tagName).toBe("SPAN");
    expect(errorSpan?.textContent).toContain("⚠️");
    expect(errorSpan?.getAttribute("title")).toBe("network failed");

    errorSpan?.dispatchEvent(new dom.window.Event("click"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renderError does nothing when original element is missing", () => {
    const dom = new JSDOM(`<article><p>Nothing</p></article>`);
    const document = dom.window.document;
    const onRetry = vi.fn();

    expect(() => new DOMRenderer(document).renderError("nope", "x", onRetry)).not.toThrow();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("renderError is idempotent (does not stack warning spans on retry setup)", () => {
    const dom = new JSDOM(`<p data-qrt-block-id="b1">Hi</p>`);
    const document = dom.window.document;
    const renderer = new DOMRenderer(document);
    const onRetry = vi.fn();

    renderer.renderError("b1", "first failure", onRetry);
    renderer.renderError("b1", "second failure", onRetry);

    const spans = document.querySelectorAll("span");
    expect(spans).toHaveLength(1);
    // Latest error message wins on a re-setup pass.
    expect(spans[0].getAttribute("title")).toBe("second failure");
  });

  describe("renderLoading", () => {
    it("injects a loading indicator next to the block when state='translating'", () => {
      const dom = new JSDOM(`<p data-qrt-block-id="b1">Hi</p>`);
      const document = dom.window.document;

      new DOMRenderer(document).renderLoading(["b1"], "translating", 0, 2);

      const loading = document.querySelector(".qrt-loading");
      expect(loading).not.toBeNull();
      // The indicator sits immediately after the original.
      const original = document.querySelector('[data-qrt-block-id="b1"]');
      expect(original?.nextElementSibling).toBe(loading);
      // Translating state shows generic "translating" text (not a retry count).
      expect(loading?.textContent).toContain("翻译");
    });

    it("shows attempt/maxRetries count when state='retrying'", () => {
      const dom = new JSDOM(`<p data-qrt-block-id="b1">Hi</p>`);
      const document = dom.window.document;

      new DOMRenderer(document).renderLoading(["b1"], "retrying", 1, 2);

      const loading = document.querySelector(".qrt-loading");
      expect(loading?.textContent).toContain("重试");
      // Attempt 1 of maxRetries 2 — surfaces which retry is in flight.
      expect(loading?.textContent).toMatch(/1/);
      expect(loading?.textContent).toMatch(/2/);
    });

    it("is idempotent (re-render updates text in place, no stacking)", () => {
      const dom = new JSDOM(`<p data-qrt-block-id="b1">Hi</p>`);
      const document = dom.window.document;
      const renderer = new DOMRenderer(document);

      renderer.renderLoading(["b1"], "translating", 0, 2);
      renderer.renderLoading(["b1"], "retrying", 1, 2);

      expect(document.querySelectorAll(".qrt-loading")).toHaveLength(1);
      expect(document.querySelector(".qrt-loading")?.textContent).toContain("重试");
    });

    it("renders a loading indicator for each blockId in the batch", () => {
      const dom = new JSDOM(`
        <article>
          <p data-qrt-block-id="a">A</p>
          <p data-qrt-block-id="b">B</p>
        </article>
      `);
      const document = dom.window.document;

      new DOMRenderer(document).renderLoading(["a", "b"], "translating", 0, 2);

      expect(document.querySelectorAll(".qrt-loading")).toHaveLength(2);
    });

    it("does nothing when the block element is missing", () => {
      const dom = new JSDOM(`<article><p>nothing</p></article>`);
      const document = dom.window.document;

      expect(() =>
        new DOMRenderer(document).renderLoading(["nope"], "translating", 0, 2)
      ).not.toThrow();
      expect(document.querySelectorAll(".qrt-loading")).toHaveLength(0);
    });

    it("injects the spinner stylesheet exactly once", () => {
      const dom = new JSDOM(`<p data-qrt-block-id="b1">Hi</p>`);
      const document = dom.window.document;
      const renderer = new DOMRenderer(document);

      renderer.renderLoading(["b1"], "translating", 0, 2);
      renderer.renderLoading(["b1"], "retrying", 1, 2);

      const styles = document.querySelectorAll('style[data-qrt-loading-style]');
      expect(styles).toHaveLength(1);
    });

    it("render() removes the loading indicator for the block it translates", () => {
      const dom = new JSDOM(`<p data-qrt-block-id="b1">Hi</p>`);
      const document = dom.window.document;
      const renderer = new DOMRenderer(document);

      renderer.renderLoading(["b1"], "translating", 0, 2);
      expect(document.querySelector(".qrt-loading")).not.toBeNull();

      renderer.render([makeResult("b1", "你好")]);

      expect(document.querySelector(".qrt-loading")).toBeNull();
      expect(document.querySelector(".qrt-translation")).not.toBeNull();
    });

    it("renderError() removes the loading indicator for the block it errors", () => {
      const dom = new JSDOM(`<p data-qrt-block-id="b1">Hi</p>`);
      const document = dom.window.document;
      const renderer = new DOMRenderer(document);

      renderer.renderLoading(["b1"], "retrying", 2, 2);
      expect(document.querySelector(".qrt-loading")).not.toBeNull();

      renderer.renderError("b1", "rate limited", () => {});

      expect(document.querySelector(".qrt-loading")).toBeNull();
      expect(document.querySelector(".qrt-error")).not.toBeNull();
    });
  });
});
