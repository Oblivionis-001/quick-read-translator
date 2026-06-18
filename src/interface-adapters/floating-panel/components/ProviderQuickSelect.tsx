import { useEffect, useState } from "react";
import { ConfigService, type ProviderTestResult } from "@/application/ConfigService";
import { BrowserStorageConfigRepo } from "@/infrastructure/repositories/BrowserStorageConfigRepo";
import type { AppConfig } from "@/shared/types";

const configService = new ConfigService(new BrowserStorageConfigRepo());

export function ProviderQuickSelect() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [testState, setTestState] = useState<ProviderTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    configService.getConfig().then(setConfig);
  }, []);

  if (!config) return null;

  const onSwitch = async (id: string) => {
    const next = { ...config, currentProviderId: id };
    setConfig(next);
    await configService.saveConfig(next);
  };

  const onTest = async () => {
    setTesting(true);
    setTestState(null);
    try {
      const result = await configService.testProvider(config.currentProviderId);
      setTestState(result);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mb-3">
      <label className="block text-xs text-sequoia-grey mb-1">Provider</label>
      <div className="flex gap-2 items-center">
        <select
          className="flex-1 border border-sequoia-grey p-1 text-sm bg-white"
          value={config.currentProviderId}
          onChange={(e) => onSwitch(e.target.value)}
        >
          {config.providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button
          type="button"
          className="text-xs underline"
          onClick={onTest}
          disabled={testing}
        >
          {testing ? '...' : 'Test'}
        </button>
      </div>
      {testState && (
        <p className={`text-xs mt-1 ${testState.ok ? 'text-sequoia-green' : 'text-sequoia-red'}`}>
          {testState.ok ? `✓ ${testState.latencyMs}ms` : `✗ ${testState.message}`}
        </p>
      )}
    </div>
  );
}
