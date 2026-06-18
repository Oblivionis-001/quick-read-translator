import type { SelectorConfig, SelectorDelta, SiteRule } from '@/shared/types';
import { matchesUrl } from './GlobMatcher';

/**
 * Apply a delta (add/remove) to a base list. Returns a new array; does
 * not mutate input. Dedupes by string equality.
 */
export function applyDelta(base: string[], delta: SelectorDelta | undefined): string[] {
  if (!delta) return [...base];
  const removed = new Set(delta.remove ?? []);
  const kept = base.filter((x) => !removed.has(x));
  const added = (delta.add ?? []).filter((x) => !kept.includes(x));
  return [...kept, ...added];
}

/**
 * Merge applicable site rules on top of the base SelectorConfig. A rule
 * is "applicable" when enabled=true and at least one of its match
 * patterns matches the URL. Rules are applied in array order.
 *
 * Only `selectors`, `excludeSelectors`, and `extraBlockSelectors` are
 * mergeable via deltas; other SelectorConfig fields are taken from the
 * base as-is (they're rarely site-specific).
 */
export function mergeSiteRules(
  base: SelectorConfig,
  rules: SiteRule[],
  url: URL
): SelectorConfig {
  const applicable = rules.filter((r) => r.enabled && matchesUrl(r.matches, url));
  if (applicable.length === 0) return base;

  return applicable.reduce<SelectorConfig>((acc, rule) => {
    const next: SelectorConfig = { ...acc };
    if (rule.selectors) next.selectors = applyDelta(acc.selectors, rule.selectors);
    if (rule.excludeSelectors) next.excludeSelectors = applyDelta(acc.excludeSelectors, rule.excludeSelectors);
    if (rule.extraBlockSelectors) next.extraBlockSelectors = applyDelta(acc.extraBlockSelectors, rule.extraBlockSelectors);
    return next;
  }, base);
}
