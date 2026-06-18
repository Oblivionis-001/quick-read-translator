import { useEffect, useState } from "react";
import { ConfigService } from "@/application/ConfigService";
import { BrowserStorageConfigRepo } from "@/infrastructure/repositories/BrowserStorageConfigRepo";

const configService = new ConfigService(new BrowserStorageConfigRepo());

export function TargetLanguageInput() {
  const [value, setValue] = useState('zh-CN');

  useEffect(() => {
    configService.getConfig().then((c) => setValue(c.targetLanguage));
  }, []);

  const onChange = async (v: string) => {
    setValue(v);
    const c = await configService.getConfig();
    await configService.saveConfig({ ...c, targetLanguage: v });
  };

  return (
    <div className="mb-3">
      <label className="block text-xs text-sequoia-grey mb-1">Target language</label>
      <input
        type="text"
        className="w-full border border-sequoia-grey p-1 text-sm bg-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
