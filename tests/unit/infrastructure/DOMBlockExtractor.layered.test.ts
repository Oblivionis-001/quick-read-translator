import { describe, expect, it, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { DOMBlockExtractor } from '@/infrastructure/extractors/DOMBlockExtractor';
import type { SelectorConfig, SiteRule } from '@/shared/types';
import { DEFAULT_SELECTOR_CONFIG } from '@/shared/constants';

describe('DOMBlockExtractor layered selectors', () => {
  let dom: JSDOM;
  let doc: Document;

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>');
    doc = dom.window.document;
  });

  function makeConfig(overrides: Partial<SelectorConfig> = {}): SelectorConfig {
    return { ...DEFAULT_SELECTOR_CONFIG, ...overrides };
  }

  it('uses configured selectors', () => {
    const root = doc.getElementById('root')!;
    root.innerHTML = '<p>one</p><blockquote>two</blockquote>';
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(root, makeConfig(), [], new URL('https://x.com/'));
    expect(blocks).toHaveLength(2);
    expect(blocks[0].sourceText).toBe('one');
    expect(blocks[1].sourceText).toBe('two');
  });

  it('excludes elements matching excludeSelectors', () => {
    const root = doc.getElementById('root')!;
    root.innerHTML = '<p>keep</p><p class="nav">skip</p>';
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(
      root,
      makeConfig({ excludeSelectors: ['.nav'] }),
      [],
      new URL('https://x.com/')
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].sourceText).toBe('keep');
  });

  it('stayOriginalSelectors matches but skips translation', () => {
    const root = doc.getElementById('root')!;
    root.innerHTML = '<p>translate me</p><pre>code stays</pre>';
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(root, makeConfig(), [], new URL('https://x.com/'));
    expect(blocks.map((b) => b.sourceText)).toEqual(['translate me']);
  });

  it('extraBlockSelectors adds additional selectors', () => {
    const root = doc.getElementById('root')!;
    root.innerHTML = '<p>p</p><div class="card">card</div>';
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(
      root,
      makeConfig({ extraBlockSelectors: ['.card'] }),
      [],
      new URL('https://x.com/')
    );
    expect(blocks.map((b) => b.sourceText).sort()).toEqual(['card', 'p']);
  });

  it('applies matching site rule', () => {
    const root = doc.getElementById('root')!;
    root.innerHTML = '<p>p</p><div class="custom">custom</div>';
    const rule: SiteRule = {
      id: 'r1',
      matches: ['*://example.com/*'],
      selectors: { add: ['.custom'] },
      enabled: true,
    };
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(
      root,
      makeConfig(),
      [rule],
      new URL('https://example.com/page')
    );
    expect(blocks.map((b) => b.sourceText).sort()).toEqual(['custom', 'p']);
  });

  it('filters by blockMinTextCount', () => {
    const root = doc.getElementById('root')!;
    root.innerHTML = '<p>ab</p><p>long enough</p>';
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(
      root,
      makeConfig({ blockMinTextCount: 5 }),
      [],
      new URL('https://x.com/')
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].sourceText).toBe('long enough');
  });

  it('skips malformed selectors instead of aborting the whole pass', () => {
    // User-supplied selectors can be malformed (typos, partial pseudos).
    // querySelectorAll would throw and abort extraction for the entire page;
    // we want to skip just the bad entries and continue.
    const root = doc.getElementById('root')!;
    root.innerHTML = '<p>keep</p>';
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(
      root,
      makeConfig({ extraBlockSelectors: [':invalidpseudo', 'a['] }),
      [],
      new URL('https://x.com/')
    );
    expect(blocks.map((b) => b.sourceText)).toEqual(['keep']);
  });
});
