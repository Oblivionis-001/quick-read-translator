import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { DOMBlockExtractor } from "@/infrastructure/extractors/DOMBlockExtractor";

describe("DOMBlockExtractor", () => {
  it("extracts paragraph blocks from DOM", () => {
    const dom = new JSDOM(`
      <article>
        <p>First paragraph.</p>
        <p>Second paragraph.</p>
      </article>
    `);
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(
      dom.window.document.querySelector("article")!
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0].sourceText).toBe("First paragraph.");
    expect(blocks[1].sourceText).toBe("Second paragraph.");
  });

  it("extracts from a mix of heading, paragraph, and list elements", () => {
    const dom = new JSDOM(`
      <article>
        <h1>Title</h1>
        <p>Body text.</p>
        <ul>
          <li>First item</li>
          <li>Second item</li>
        </ul>
      </article>
    `);
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(
      dom.window.document.querySelector("article")!
    );

    expect(blocks).toHaveLength(4);
    expect(blocks[0].sourceText).toBe("Title");
    expect(blocks[1].sourceText).toBe("Body text.");
    expect(blocks[2].sourceText).toBe("First item");
    expect(blocks[3].sourceText).toBe("Second item");
  });

  it("skips empty and whitespace-only elements", () => {
    const dom = new JSDOM(`
      <article>
        <p></p>
        <p>   </p>
        <p>Real text</p>
      </article>
    `);
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(
      dom.window.document.querySelector("article")!
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0].sourceText).toBe("Real text");
  });

  it("generates domReference in the form tag-index", () => {
    const dom = new JSDOM(`
      <article>
        <p>First</p>
        <p>Second</p>
      </article>
    `);
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(
      dom.window.document.querySelector("article")!
    );

    expect(blocks[0].domReference).toBe("p-0");
    expect(blocks[1].domReference).toBe("p-1");
  });

  it("sets sourceLanguage to auto and produces stable ids", () => {
    const dom = new JSDOM(`
      <article>
        <p>Stable content</p>
      </article>
    `);
    const extractor = new DOMBlockExtractor();
    const blocks1 = extractor.extractFromElement(
      dom.window.document.querySelector("article")!
    );
    const blocks2 = extractor.extractFromElement(
      dom.window.document.querySelector("article")!
    );

    expect(blocks1[0].sourceLanguage).toBe("auto");
    expect(blocks1[0].id).toMatch(/^[a-f0-9]+$/);
    expect(blocks1[0].id).toBe(blocks2[0].id);
  });

  it("collapses internal whitespace in extracted text", () => {
    const dom = new JSDOM(`
      <article>
        <p>Hello
                world
                with
                breaks</p>
      </article>
    `);
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(
      dom.window.document.querySelector("article")!
    );

    expect(blocks[0].sourceText).toBe("Hello world with breaks");
  });

  it("returns empty array when no matching elements exist", () => {
    const dom = new JSDOM(`<div><span>nope</span></div>`);
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(
      dom.window.document.querySelector("div")!
    );

    expect(blocks).toHaveLength(0);
  });

  it("does not produce duplicate blocks when matched elements nest inside each other", () => {
    const dom = new JSDOM(`
      <article>
        <ul>
          <li><p>nested paragraph inside list item</p></li>
        </ul>
      </article>
    `);
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(
      dom.window.document.querySelector("article")!
    );

    // The outermost matched element is <li>; the inner <p> is a descendant
    // and must be skipped so its text is not rendered twice.
    expect(blocks).toHaveLength(1);
    expect(blocks[0].sourceText).toBe("nested paragraph inside list item");
  });

  it("tags each extracted source element with data-qrt-block-id matching block.id", () => {
    const dom = new JSDOM(`
      <article>
        <p>First paragraph.</p>
        <p>Second paragraph.</p>
      </article>
    `);
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(
      dom.window.document.querySelector("article")!
    );

    const paragraphs = dom.window.document.querySelectorAll("p");
    expect(blocks).toHaveLength(2);
    expect(paragraphs[0].getAttribute("data-qrt-block-id")).toBe(blocks[0].id);
    expect(paragraphs[1].getAttribute("data-qrt-block-id")).toBe(blocks[1].id);
  });
});
