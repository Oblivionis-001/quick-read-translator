import { describe, expect, it } from 'vitest';
import { globToRegex, matchesUrl } from '@/domain/services/GlobMatcher';

describe('globToRegex', () => {
  it('matches literal string', () => {
    const re = globToRegex('hello');
    expect(re.test('hello')).toBe(true);
    expect(re.test('hell')).toBe(false);
  });

  it('* matches any chars including slash', () => {
    const re = globToRegex('*');
    expect(re.test('anything')).toBe(true);
    expect(re.test('a/b/c')).toBe(true);
    expect(re.test('')).toBe(true);
  });

  it('? matches single char', () => {
    const re = globToRegex('a?c');
    expect(re.test('abc')).toBe(true);
    expect(re.test('ac')).toBe(false);
  });

  it('escapes regex metachars', () => {
    const re = globToRegex('example.com/path');
    expect(re.test('example.com/path')).toBe(true);
    expect(re.test('exampleXcom/path')).toBe(false);
  });

  it('anchors to start and end', () => {
    const re = globToRegex('foo');
    expect(re.test('foo')).toBe(true);
    expect(re.test('foobar')).toBe(false);
    expect(re.test('afoo')).toBe(false);
  });
});

describe('matchesUrl', () => {
  const url = new URL('https://news.ycombinator.com/item?id=42');

  it('matches a wildcard pattern for entire URL', () => {
    expect(matchesUrl(['*'], url)).toBe(true);
  });

  it('matches host with wildcard path', () => {
    expect(matchesUrl(['*://news.ycombinator.com/*'], url)).toBe(true);
  });

  it('does not match wrong host', () => {
    expect(matchesUrl(['*://example.com/*'], url)).toBe(false);
  });

  it('matches any of multiple patterns', () => {
    expect(matchesUrl(['*://example.com/*', '*://news.ycombinator.com/*'], url)).toBe(true);
  });

  it('returns false for empty patterns', () => {
    expect(matchesUrl([], url)).toBe(false);
  });
});
