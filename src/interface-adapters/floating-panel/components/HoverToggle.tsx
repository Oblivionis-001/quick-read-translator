import { useEffect, useState } from "react";
import { ConfigService } from "@/application/ConfigService";
import { BrowserStorageConfigRepo } from "@/infrastructure/repositories/BrowserStorageConfigRepo";

const configService = new ConfigService(new BrowserStorageConfigRepo());

export function HoverToggle() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    configService.getConfig().then((c) => setEnabled(c.hoverButtonEnabled));
  }, []);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    const c = await configService.getConfig();
    await configService.saveConfig({ ...c, hoverButtonEnabled: next });
  };

  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={enabled} onChange={toggle} />
      Hover button
    </label>
  );
}
