import type { AppConfig } from '@/shared/types';
import {
  DEFAULT_SELECTOR_CONFIG,
  DEFAULT_TRANSLATION_THEME,
  DEFAULT_FLOATING_BALL_ENABLED,
  SCHEMA_VERSION,
} from '@/shared/constants';

type V1Config = Partial<AppConfig> & { schemaVersion?: number };

/**
 * Migrate an unknown payload from storage into the current AppConfig
 * shape. Currently handles v1 → v2 (adding layered selector config,
 * translation theme, floating ball toggle).
 *
 * For future versions, append new branches before the final return.
 */
export function migrateConfig(raw: unknown): AppConfig {
  const r = (raw ?? {}) as V1Config;
  const version = r.schemaVersion ?? 1;

  if (version >= SCHEMA_VERSION) {
    return r as AppConfig;
  }

  // v1 → v2: add selector / theme / ball fields with defaults.
  // User-supplied values for the new fields (if somehow already present
  // in a v1 payload) are preserved.
  return {
    targetLanguage: r.targetLanguage ?? 'zh-CN',
    sourceLanguage: r.sourceLanguage ?? 'auto',
    currentProviderId: r.currentProviderId ?? r.providers?.[0]?.id ?? '',
    providers: r.providers ?? [],
    hotkey: r.hotkey ?? 'Alt+T',
    hoverButtonEnabled: r.hoverButtonEnabled ?? true,
    selectionTriggerEnabled: r.selectionTriggerEnabled ?? true,
    localProxyUrl: r.localProxyUrl,
    fallbackProviderId: r.fallbackProviderId,
    schemaVersion: SCHEMA_VERSION,
    selectorConfig: r.selectorConfig ?? DEFAULT_SELECTOR_CONFIG,
    siteRules: r.siteRules ?? [],
    translationTheme: r.translationTheme ?? DEFAULT_TRANSLATION_THEME,
    floatingBallEnabled: r.floatingBallEnabled ?? DEFAULT_FLOATING_BALL_ENABLED,
  };
}
