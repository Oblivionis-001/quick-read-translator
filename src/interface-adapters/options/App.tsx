import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfigService } from "@/application/ConfigService";
import { BrowserStorageConfigRepo } from "@/infrastructure/repositories/BrowserStorageConfigRepo";
import { browser } from "wxt/browser";
import type { AppConfig, ProviderConfig } from "@/shared/types";
import {
  LabeledInput,
  LabeledSelect,
  LabeledTextarea,
} from "@/interface-adapters/options/components";
import {
  addProvider,
  deleteProvider,
  updateProvider,
} from "@/interface-adapters/options/operations";

const configService = new ConfigService(new BrowserStorageConfigRepo());

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    configService.getConfig().then(setConfig);
  }, []);

  const save = useCallback(async (next: AppConfig) => {
    await configService.saveConfig(next);
    setConfig(next);
    setSavedAt(Date.now());
  }, []);

  const handleUpdateProvider = useCallback(
    (id: string, patch: Partial<ProviderConfig>) => {
      if (!config) return;
      save(updateProvider(config, id, patch));
    },
    [config, save]
  );

  const handleAddProvider = useCallback(() => {
    if (!config) return;
    const { config: next } = addProvider(config, () => `provider-${Date.now()}`);
    save(next);
  }, [config, save]);

  const handleDeleteProvider = useCallback(
    (id: string) => {
      if (!config) return;
      const result = deleteProvider(config, id);
      if (!result) {
        alert("At least one provider is required.");
        return;
      }
      save(result.config);
    },
    [config, save]
  );

  const exportConfig = useCallback(async () => {
    const data = await browser.storage.local.get();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "qrt-config.json";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const importConfig = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text) as Record<string, unknown>;
        await browser.storage.local.set(data);
        // ConfigService caches the prior config; reset by reloading fresh.
        const refreshed = await new BrowserStorageConfigRepo().load();
        if (refreshed) {
          setConfig(refreshed);
          setSavedAt(Date.now());
        }
      } catch (err) {
        alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    input.click();
  }, []);

  const currentProvider = useMemo(() => {
    if (!config) return null;
    return (
      config.providers.find((p) => p.id === config.currentProviderId) ??
      config.providers[0] ??
      null
    );
  }, [config]);

  if (!config || !currentProvider) {
    return (
      <div className="p-8 text-center text-sequoia-grey">Loading…</div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-normal text-center mb-2">
          Quick Read Translator
        </h1>
        {savedAt && (
          <p className="text-xs text-sequoia-grey text-center">
            Saved at {new Date(savedAt).toLocaleTimeString()}
          </p>
        )}
      </header>

      <ProviderSection
        config={config}
        currentProvider={currentProvider}
        onSelectCurrent={(id) => save({ ...config, currentProviderId: id })}
        onAdd={handleAddProvider}
        onDelete={handleDeleteProvider}
        onUpdate={handleUpdateProvider}
      />

      <TriggersSection
        config={config}
        onHotkeyChange={(v) => save({ ...config, hotkey: v })}
        onHoverButtonToggle={(v) => save({ ...config, hoverButtonEnabled: v })}
        onSelectionTriggerToggle={(v) =>
          save({ ...config, selectionTriggerEnabled: v })
        }
      />

      <LanguageSection
        config={config}
        onTargetLanguageChange={(v) => save({ ...config, targetLanguage: v })}
        onSourceLanguageChange={(v) => save({ ...config, sourceLanguage: v })}
      />

      <LocalProxySection
        config={config}
        onProxyUrlChange={(v) =>
          save({ ...config, localProxyUrl: v || undefined })
        }
        onFallbackProviderChange={(v) =>
          save({ ...config, fallbackProviderId: v || undefined })
        }
      />

      <DataSection onExport={exportConfig} onImport={importConfig} />
    </div>
  );
}

interface ProviderSectionProps {
  config: AppConfig;
  currentProvider: ProviderConfig;
  onSelectCurrent: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ProviderConfig>) => void;
}

function ProviderSection({
  config,
  currentProvider,
  onSelectCurrent,
  onAdd,
  onDelete,
  onUpdate,
}: ProviderSectionProps) {
  return (
    <section className="bg-white p-6 shadow-sm mb-6">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-xl">Provider</h2>
        <div className="flex gap-2 items-center">
          <select
            className="border border-sequoia-grey p-1 text-sm bg-white"
            value={config.currentProviderId}
            onChange={(e) => onSelectCurrent(e.target.value)}
          >
            {config.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="text-xs underline text-sequoia-grey"
            onClick={onAdd}
          >
            + Add
          </button>
          <button
            type="button"
            className="text-xs underline text-sequoia-red"
            onClick={() => onDelete(currentProvider.id)}
          >
            Delete
          </button>
        </div>
      </div>

      <LabeledInput
        label="Name"
        value={currentProvider.name}
        onChange={(v) => onUpdate(currentProvider.id, { name: v })}
      />
      <LabeledInput
        label="Base URL"
        value={currentProvider.baseUrl}
        onChange={(v) => onUpdate(currentProvider.id, { baseUrl: v })}
      />
      <LabeledInput
        label="API Key"
        type="password"
        value={currentProvider.apiKey}
        onChange={(v) => onUpdate(currentProvider.id, { apiKey: v })}
      />
      <LabeledInput
        label="Model"
        value={currentProvider.model}
        onChange={(v) => onUpdate(currentProvider.id, { model: v })}
      />
      <LabeledInput
        label="Temperature"
        type="number"
        value={String(currentProvider.temperature)}
        onChange={(v) =>
          onUpdate(currentProvider.id, { temperature: Number(v) || 0 })
        }
      />
      <LabeledInput
        label="Max Tokens"
        type="number"
        value={String(currentProvider.maxTokens)}
        onChange={(v) =>
          onUpdate(currentProvider.id, { maxTokens: Number(v) || 0 })
        }
      />
      <LabeledTextarea
        label="System Prompt"
        value={currentProvider.systemPrompt}
        onChange={(v) => onUpdate(currentProvider.id, { systemPrompt: v })}
      />
      <LabeledTextarea
        label="User Prompt Template (use {{source}} and {{target}})"
        value={currentProvider.userPromptTemplate}
        onChange={(v) =>
          onUpdate(currentProvider.id, { userPromptTemplate: v })
        }
      />
      <label className="flex items-center gap-2 mt-4 text-sm">
        <input
          type="checkbox"
          checked={currentProvider.enabled}
          onChange={(e) =>
            onUpdate(currentProvider.id, { enabled: e.target.checked })
          }
        />
        Enabled
      </label>
    </section>
  );
}

interface TriggersSectionProps {
  config: AppConfig;
  onHotkeyChange: (v: string) => void;
  onHoverButtonToggle: (v: boolean) => void;
  onSelectionTriggerToggle: (v: boolean) => void;
}

function TriggersSection({
  config,
  onHotkeyChange,
  onHoverButtonToggle,
  onSelectionTriggerToggle,
}: TriggersSectionProps) {
  return (
    <section className="bg-white p-6 shadow-sm mb-6">
      <h2 className="text-xl mb-4">Triggers</h2>
      <LabeledInput
        label="Hotkey (e.g. Alt+T)"
        value={config.hotkey}
        onChange={onHotkeyChange}
      />
      <label className="flex items-center gap-2 mb-2 text-sm">
        <input
          type="checkbox"
          checked={config.hoverButtonEnabled}
          onChange={(e) => onHoverButtonToggle(e.target.checked)}
        />
        Hover button enabled
      </label>
      <label className="flex items-center gap-2 mb-2 text-sm">
        <input
          type="checkbox"
          checked={config.selectionTriggerEnabled}
          onChange={(e) => onSelectionTriggerToggle(e.target.checked)}
        />
        Selection trigger enabled
      </label>
    </section>
  );
}

interface LanguageSectionProps {
  config: AppConfig;
  onTargetLanguageChange: (v: string) => void;
  onSourceLanguageChange: (v: string) => void;
}

function LanguageSection({
  config,
  onTargetLanguageChange,
  onSourceLanguageChange,
}: LanguageSectionProps) {
  return (
    <section className="bg-white p-6 shadow-sm mb-6">
      <h2 className="text-xl mb-4">Language</h2>
      <LabeledInput
        label="Target Language"
        value={config.targetLanguage}
        onChange={onTargetLanguageChange}
      />
      <LabeledInput
        label="Source Language ('auto' for detection)"
        value={config.sourceLanguage}
        onChange={onSourceLanguageChange}
      />
    </section>
  );
}

interface LocalProxySectionProps {
  config: AppConfig;
  onProxyUrlChange: (v: string) => void;
  onFallbackProviderChange: (v: string) => void;
}

function LocalProxySection({
  config,
  onProxyUrlChange,
  onFallbackProviderChange,
}: LocalProxySectionProps) {
  return (
    <section className="bg-white p-6 shadow-sm mb-6">
      <h2 className="text-xl mb-4">Local Proxy (optional)</h2>
      <LabeledInput
        label="Local Proxy URL"
        value={config.localProxyUrl ?? ""}
        onChange={onProxyUrlChange}
      />
      <LabeledSelect
        label="Fallback Provider"
        value={config.fallbackProviderId ?? ""}
        onChange={onFallbackProviderChange}
        options={[
          { value: "", label: "(none)" },
          ...config.providers.map((p) => ({ value: p.id, label: p.name })),
        ]}
      />
    </section>
  );
}

interface DataSectionProps {
  onExport: () => void;
  onImport: () => void;
}

function DataSection({ onExport, onImport }: DataSectionProps) {
  return (
    <section className="bg-white p-6 shadow-sm">
      <h2 className="text-xl mb-4">Data</h2>
      <div className="flex gap-3">
        <button
          type="button"
          className="bg-sequoia-button text-white px-4 py-2"
          onClick={onExport}
        >
          Export
        </button>
        <button
          type="button"
          className="bg-sequoia-button text-white px-4 py-2"
          onClick={onImport}
        >
          Import
        </button>
      </div>
    </section>
  );
}
