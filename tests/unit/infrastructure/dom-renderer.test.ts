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

    new DOMRenderer(document).render([makeResult("b1", "你好")]);

    const translated = document.querySelector(".qrt-translation") as HTMLElement;
    expect(translated.style.color).toBe("#928c86");
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
});
