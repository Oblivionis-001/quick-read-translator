import type { SelectorConfig, TranslationThemeId } from './types';

export const DEFAULT_TARGET_LANGUAGE = 'zh-CN';
export const DEFAULT_SOURCE_LANGUAGE = 'auto';
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
export const MAX_RETRIES = 2;
export const DEFAULT_HOTKEY = 'Alt+T';

export const SCHEMA_VERSION = 2;

export const DEFAULT_SELECTOR_CONFIG: SelectorConfig = {
  selectors: [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li',
    'blockquote', 'figcaption', 'summary', 'dd', 'dt',
  ],
  excludeSelectors: [],
  excludeTags: [],
  // Code blocks: don't translate by default, matches immersive-translate.
  stayOriginalSelectors: ['pre', 'code', 'kbd', 'samp'],
  stayOriginalTags: [],
  extraBlockSelectors: [],
  extraInlineSelectors: [],
  blockMinTextCount: 1,
  paragraphMinWordCount: 1,
  containerMinTextCount: 1,
};

export const DEFAULT_TRANSLATION_THEME: TranslationThemeId = 'inherit';

export const DEFAULT_FLOATING_BALL_ENABLED = true;
