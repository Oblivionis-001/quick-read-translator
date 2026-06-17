import { describe, expect, it, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { DOMRenderer } from '@/infrastructure/renderers/DOMRenderer';
import { TranslationResult } from '@/domain/entities/TranslationResult';

describe('DOMRenderer theme application', () => {
  let dom: JSDOM;
  let doc: Document;

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>');
    doc = dom.window.document;
  });

  function makeResult(): TranslationResult {
    return new TranslationResult({
      blockId: 'b1',
      translatedText: '你好',
      providerId: 'glm',
      modelId: 'glm-4-flash',
      latencyMs: 100,
    });
  }

  it('inherit theme copies computed style from original', () => {
    // jsdom doesn't compute real CSS, but getComputedStyle returns
    // inline styles + defaults. Set inline styles to verify copy.
    const original = doc.createElement('h1');
    original.setAttribute('data-qrt-block-id', 'b1');
    original.style.color = 'rgb(255, 0, 0)';
    original.style.fontSize = '32px';
    original.style.fontFamily = 'Georgia';
    original.style.fontWeight = '700';
    original.style.lineHeight = '1.2';
    original.style.letterSpacing = '0.1em';
    original.style.textAlign = 'center';
    doc.body.appendChild(original);

    const renderer = new DOMRenderer(doc);
    renderer.render([makeResult()], 'inherit');

    const translation = original.nextElementSibling as HTMLElement;
    expect(translation).toBeTruthy();
    expect(translation.className).toBe('qrt-translation');
    expect(translation.style.color).toBe('rgb(255, 0, 0)');
    expect(translation.style.fontSize).toBe('32px');
    expect(translation.style.fontFamily).toContain('Georgia');
    expect(translation.style.fontWeight).toBe('700');
    expect(translation.style.textAlign).toBe('center');
    // Shared layout
    expect(translation.style.display).toBe('block');
  });

  it('grey theme applies Sequoia Grey cssText', () => {
    const original = doc.createElement('p');
    original.setAttribute('data-qrt-block-id', 'b1');
    doc.body.appendChild(original);

    const renderer = new DOMRenderer(doc);
    renderer.render([makeResult()], 'grey');

    const translation = original.nextElementSibling as HTMLElement;
    expect(translation.style.color).toBe('rgb(146, 140, 134)');
  });

  it('italic theme applies font-style: italic', () => {
    const original = doc.createElement('p');
    original.setAttribute('data-qrt-block-id', 'b1');
    doc.body.appendChild(original);

    const renderer = new DOMRenderer(doc);
    renderer.render([makeResult()], 'italic');

    const translation = original.nextElementSibling as HTMLElement;
    expect(translation.style.fontStyle).toBe('italic');
  });

  it('updates existing translation in place on re-render', () => {
    const original = doc.createElement('p');
    original.setAttribute('data-qrt-block-id', 'b1');
    doc.body.appendChild(original);

    const renderer = new DOMRenderer(doc);
    renderer.render([makeResult()], 'grey');
    const firstTranslation = original.nextElementSibling as HTMLElement;

    const updated = new TranslationResult({
      blockId: 'b1',
      translatedText: '世界',
      providerId: 'glm',
      modelId: 'glm-4-flash',
      latencyMs: 50,
    });
    renderer.render([updated], 'italic');

    // Should be the same node, text updated, theme re-applied
    expect(original.nextElementSibling).toBe(firstTranslation);
    expect(firstTranslation.textContent).toBe('世界');
    expect(firstTranslation.style.fontStyle).toBe('italic');
  });
});
