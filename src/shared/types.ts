export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  userPromptTemplate: string;
  enabled: boolean;
}

export interface AppConfig {
  targetLanguage: string;
  sourceLanguage: 'auto' | string;
  currentProviderId: string;
  providers: ProviderConfig[];
  hotkey: string;
  hoverButtonEnabled: boolean;
  selectionTriggerEnabled: boolean;
  localProxyUrl?: string;
  fallbackProviderId?: string;
  // New in schemaVersion 2:
  schemaVersion: number;
  selectorConfig: SelectorConfig;
  siteRules: SiteRule[];
  translationTheme: TranslationThemeId;
  floatingBallEnabled: boolean;
}

export interface CacheEntry {
  translatedText: string;
  providerId: string;
  modelId: string;
  createdAt: number;
}

/**
 * Layered selector configuration. Mirrors immersive-translate's selector
 * system: a default selector list, black/white lists for exclusion and
 * stay-original behavior, and "extra" additive lists. Per-site overrides
 * live in SiteRule (see below) and apply via SelectorDelta modifiers.
 */
export interface SelectorConfig {
  selectors: string[];
  excludeSelectors: string[];
  excludeTags: string[];
  stayOriginalSelectors: string[];
  stayOriginalTags: string[];
  extraBlockSelectors: string[];
  extraInlineSelectors: string[];
  blockMinTextCount: number;
  paragraphMinWordCount: number;
  containerMinTextCount: number;
}

/**
 * Incremental modifier applied to a base SelectorConfig list. Used by
 * SiteRule to add or remove items from the base `selectors` /
 * `excludeSelectors` / `extraBlockSelectors` lists without replacing
 * them outright.
 */
export interface SelectorDelta {
  add?: string[];
  remove?: string[];
}

/**
 * Per-site rule. `matches` is a list of glob patterns (e.g.
 * `*://news.ycombinator.com/*`); when the current page URL matches any
 * pattern and `enabled` is true, the rule's deltas are applied on top
 * of the base SelectorConfig.
 */
export interface SiteRule {
  id: string;
  matches: string[];
  selectors?: SelectorDelta;
  excludeSelectors?: SelectorDelta;
  extraBlockSelectors?: SelectorDelta;
  enabled: boolean;
}

export type TranslationThemeId = 'inherit' | 'grey' | 'dashed' | 'italic' | 'bold';

export type BallEdge = 'top' | 'bottom' | 'left' | 'right';

export type BallPosition =
  | { mode: 'docked'; edge: BallEdge; offsetAlong: number }
  | { mode: 'free'; x: number; y: number };
