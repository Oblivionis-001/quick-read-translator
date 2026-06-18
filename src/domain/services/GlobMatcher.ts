/**
 * Convert a glob-style pattern into a RegExp. Supports:
 *   `*` — any sequence of characters (including `/`)
 *   `?` — any single character
 * All other characters (including regex metacharacters like `.`, `+`,
 * `$`) are escaped to match literally.
 *
 * The returned regex is anchored to the entire input (start + end).
 */
export function globToRegex(pattern: string): RegExp {
  let out = '^';
  for (const ch of pattern) {
    if (ch === '*') out += '.*';
    else if (ch === '?') out += '.';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  out += '$';
  return new RegExp(out);
}

/**
 * Return true if the URL's full href matches any of the glob patterns.
 * Empty pattern list returns false.
 *
 * Patterns are matched against `url.href`, which includes path, query
 * string, and fragment. A pattern like `*://example.com/article` will
 * NOT match `https://example.com/article?ref=newsletter`; end patterns
 * with `*` if the URL may carry query strings.
 */
export function matchesUrl(patterns: string[], url: URL): boolean {
  if (patterns.length === 0) return false;
  const href = url.href;
  return patterns.some((p) => globToRegex(p).test(href));
}
