import { describe, expect, it, beforeEach, vi } from 'vitest';
import { BrowserStorageConfigRepo } from '@/infrastructure/repositories/BrowserStorageConfigRepo';

// Minimal mock of webextension-polyfill's storage.local. The repo only
// uses .get(key) and .set({ [key]: value }).
const store = new Map<string, unknown>();
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async (key: string) => {
          const v = store.get(key);
          return v === undefined ? {} : { [key]: v };
        }),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(obj)) store.set(k, v);
        }),
      },
    },
  },
}));

describe('BrowserStorageConfigRepo', () => {
  beforeEach(() => store.clear());

  it('migrates v1 payload and writes back', async () => {
    const v1 = {
      targetLanguage: 'zh-CN',
      currentProviderId: 'glm',
      providers: [{ id: 'glm', name: 'GLM', baseUrl: 'x', apiKey: '', model: 'm', temperature: 0, maxTokens: 0, systemPrompt: '', userPromptTemplate: '', enabled: true }],
      hotkey: 'Alt+T',
      hoverButtonEnabled: true,
      selectionTriggerEnabled: true,
    };
    store.set('appConfig', v1);

    const repo = new BrowserStorageConfigRepo();
    const loaded = await repo.load();
    expect(loaded?.schemaVersion).toBe(2);
    expect(loaded?.selectorConfig).toBeDefined();
    expect(loaded?.translationTheme).toBe('inherit');

    // Write-back: storage now contains the migrated form.
    const stored = store.get('appConfig') as { schemaVersion: number };
    expect(stored.schemaVersion).toBe(2);
  });

  it('returns null when storage is empty', async () => {
    const repo = new BrowserStorageConfigRepo();
    expect(await repo.load()).toBeNull();
  });
});
