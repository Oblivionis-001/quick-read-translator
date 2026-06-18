import { useEffect, useState } from "react";
import { ConfigService } from "@/application/ConfigService";
import { BrowserStorageConfigRepo } from "@/infrastructure/repositories/BrowserStorageConfigRepo";
import { THEME_CATALOG } from "@/domain/services/ThemeCatalog";
import type { TranslationThemeId } from "@/shared/types";

const configService = new ConfigService(new BrowserStorageConfigRepo());

export function ThemeSelect() {
  const [theme, setTheme] = useState<TranslationThemeId>('inherit');

  useEffect(() => {
    configService.getConfig().then((c) => setTheme(c.translationTheme));
  }, []);

  const onChange = async (v: TranslationThemeId) => {
    setTheme(v);
    const c = await configService.getConfig();
    await configService.saveConfig({ ...c, translationTheme: v });
  };

  return (
    <div className="mb-3">
      <label className="block text-xs text-sequoia-grey mb-1">Theme</label>
      <select
        className="w-full border border-sequoia-grey p-1 text-sm bg-white"
        value={theme}
        onChange={(e) => onChange(e.target.value as TranslationThemeId)}
      >
        {THEME_CATALOG.map((t) => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>
    </div>
  );
}
