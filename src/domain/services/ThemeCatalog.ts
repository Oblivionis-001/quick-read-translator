import type { TranslationThemeId } from '@/shared/types';

export interface ThemeDefinition {
  id: TranslationThemeId;
  label: string;
  /**
   * Inline CSS appended to the shared layout styles (display: block,
   * margin) when applying this theme. The `inherit` theme does not use
   * cssText; it instead clones the original element's computed style
   * (handled separately in DOMRenderer).
   */
  cssText: string;
}

export const THEME_CATALOG: ReadonlyArray<ThemeDefinition> = [
  { id: 'inherit', label: 'Inherit original style', cssText: '' },
  { id: 'grey',    label: 'Sequoia Grey',            cssText: 'color:#928c86; opacity:0.95;' },
  { id: 'dashed',  label: 'Dashed underline',        cssText: 'border-bottom:1px dashed currentColor; padding-bottom:1px;' },
  { id: 'italic',  label: 'Italic',                  cssText: 'font-style:italic; opacity:0.85;' },
  { id: 'bold',    label: 'Bold',                    cssText: 'font-weight:700;' },
];

export function getTheme(id: TranslationThemeId): ThemeDefinition | undefined {
  return THEME_CATALOG.find((t) => t.id === id);
}
