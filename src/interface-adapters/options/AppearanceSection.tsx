import type { CSSProperties } from "react";
import { THEME_CATALOG, getTheme } from "@/domain/services/ThemeCatalog";
import type { TranslationThemeId } from "@/shared/types";
import { LabeledSelect } from "./components";

interface AppearanceSectionProps {
  theme: TranslationThemeId;
  onThemeChange: (v: TranslationThemeId) => void;
}

export function AppearanceSection({ theme, onThemeChange }: AppearanceSectionProps) {
  return (
    <section className="bg-white p-6 shadow-sm mb-6">
      <h2 className="text-xl mb-4">Appearance</h2>
      <LabeledSelect
        label="Translation theme"
        value={theme}
        onChange={(v) => onThemeChange(v as TranslationThemeId)}
        options={THEME_CATALOG.map((t) => ({ value: t.id, label: t.label }))}
      />
      <div className="mt-4 p-3 border border-sequoia-grey text-sm">
        <p className="mb-1">Preview:</p>
        <p className="font-bold text-lg">The quick brown fox</p>
        <ThemePreview theme={theme} />
      </div>
    </section>
  );
}

function ThemePreview({ theme }: { theme: TranslationThemeId }) {
  // Mirror the runtime CSS applied by DOMRenderer.applyTheme for at-a-glance
  // feedback in Options. Layout string matches the renderer's baseline.
  const base = 'display: block; margin-top: 0.25em; margin-bottom: 0.5em;';
  const def = getTheme(theme);
  const css = def?.cssText ? base + def.cssText : base;
  return <p style={{ cssText: css } as CSSProperties}>敏捷的棕色狐狸</p>;
}
