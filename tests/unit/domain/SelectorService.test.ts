import { describe, expect, it } from 'vitest';
import { mergeSiteRules, applyDelta } from '@/domain/services/SelectorService';
import { DEFAULT_SELECTOR_CONFIG } from '@/shared/constants';
import type { SelectorConfig, SiteRule } from '@/shared/types';

const baseConfig: SelectorConfig = { ...DEFAULT_SELECTOR_CONFIG };

describe('applyDelta', () => {
  it('adds items', () => {
    expect(applyDelta(['a'], { add: ['b', 'c'] })).toEqual(['a', 'b', 'c']);
  });

  it('removes items', () => {
    expect(applyDelta(['a', 'b', 'c'], { remove: ['b'] })).toEqual(['a', 'c']);
  });

  it('combined add + remove', () => {
    expect(applyDelta(['a', 'b'], { add: ['c'], remove: ['a'] })).toEqual(['b', 'c']);
  });

  it('dedupes', () => {
    expect(applyDelta(['a'], { add: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('handles undefined delta', () => {
    expect(applyDelta(['a'], undefined)).toEqual(['a']);
  });
});

describe('mergeSiteRules', () => {
  const url = new URL('https://news.ycombinator.com/item?id=42');

  it('returns base unchanged when no rules apply', () => {
    const result = mergeSiteRules(baseConfig, [], url);
    expect(result).toEqual(baseConfig);
  });

  it('skips disabled rules', () => {
    const rule: SiteRule = {
      id: 'r1', matches: ['*://news.ycombinator.com/*'],
      selectors: { add: ['div.custom'] }, enabled: false,
    };
    const result = mergeSiteRules(baseConfig, [rule], url);
    expect(result.selectors).toEqual(baseConfig.selectors);
  });

  it('skips rules whose pattern does not match', () => {
    const rule: SiteRule = {
      id: 'r1', matches: ['*://example.com/*'],
      selectors: { add: ['div.custom'] }, enabled: true,
    };
    const result = mergeSiteRules(baseConfig, [rule], url);
    expect(result.selectors).toEqual(baseConfig.selectors);
  });

  it('applies matching rule selectors delta', () => {
    const rule: SiteRule = {
      id: 'r1', matches: ['*://news.ycombinator.com/*'],
      selectors: { add: ['div.custom'], remove: ['dd'] },
      enabled: true,
    };
    const result = mergeSiteRules(baseConfig, [rule], url);
    expect(result.selectors).toContain('div.custom');
    expect(result.selectors).not.toContain('dd');
  });

  it('applies excludeSelectors delta', () => {
    const rule: SiteRule = {
      id: 'r1', matches: ['*://news.ycombinator.com/*'],
      excludeSelectors: { add: ['.nav', '.footer'] },
      enabled: true,
    };
    const result = mergeSiteRules(baseConfig, [rule], url);
    expect(result.excludeSelectors).toEqual(['.nav', '.footer']);
  });

  it('chains multiple matching rules in order', () => {
    const r1: SiteRule = {
      id: 'r1', matches: ['*://news.ycombinator.com/*'],
      selectors: { add: ['x'] }, enabled: true,
    };
    const r2: SiteRule = {
      id: 'r2', matches: ['*://*/*'],
      selectors: { remove: ['x'], add: ['y'] }, enabled: true,
    };
    const result = mergeSiteRules(baseConfig, [r1, r2], url);
    expect(result.selectors).not.toContain('x');
    expect(result.selectors).toContain('y');
  });
});
