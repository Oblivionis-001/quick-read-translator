import { describe, expect, it } from 'vitest';
import { migrateConfig } from '@/infrastructure/repositories/migrate';
import { DEFAULT_SELECTOR_CONFIG } from '@/shared/constants';

describe('migrateConfig', () => {
  it('returns v2 config unchanged', () => {
    const v2 = {
      schemaVersion: 2,
      targetLanguage: 'zh-CN',
      sourceLanguage: 'auto',
      currentProviderId: 'glm',
      providers: [{ id: 'glm', name: 'GLM', baseUrl: 'x', apiKey: '', model: 'm', temperature: 0, maxTokens: 0, systemPrompt: '', userPromptTemplate: '', enabled: true }],
      hotkey: 'Alt+T',
      hoverButtonEnabled: true,
      selectionTriggerEnabled: true,
      selectorConfig: DEFAULT_SELECTOR_CONFIG,
      siteRules: [],
      translationTheme: 'grey',
      floatingBallEnabled: false,
    };
    expect(migrateConfig(v2)).toEqual(v2);
  });

  it('migrates v1 (no schemaVersion) to v2 with defaults', () => {
    const v1 = {
      targetLanguage: 'zh-CN',
      sourceLanguage: 'auto',
      currentProviderId: 'glm',
      providers: [{ id: 'glm', name: 'GLM', baseUrl: 'x', apiKey: '', model: 'm', temperature: 0, maxTokens: 0, systemPrompt: '', userPromptTemplate: '', enabled: true }],
      hotkey: 'Alt+T',
      hoverButtonEnabled: true,
      selectionTriggerEnabled: true,
    };
    const migrated = migrateConfig(v1);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.selectorConfig).toEqual(DEFAULT_SELECTOR_CONFIG);
    expect(migrated.siteRules).toEqual([]);
    expect(migrated.translationTheme).toBe('inherit');
    expect(migrated.floatingBallEnabled).toBe(true);
    // Preserves original fields
    expect(migrated.hotkey).toBe('Alt+T');
    expect(migrated.providers).toHaveLength(1);
  });

  it('handles explicitly undefined schemaVersion as v1', () => {
    const v1 = { schemaVersion: undefined, providers: [] };
    const migrated = migrateConfig(v1 as unknown);
    expect(migrated.schemaVersion).toBe(2);
  });

  it('applies user overrides on top of v1 defaults', () => {
    const v1 = {
      translationTheme: 'bold',
      floatingBallEnabled: false,
      providers: [{ id: 'p', name: 'n', baseUrl: 'x', apiKey: '', model: 'm', temperature: 0, maxTokens: 0, systemPrompt: '', userPromptTemplate: '', enabled: true }],
      currentProviderId: 'p',
    };
    const migrated = migrateConfig(v1);
    expect(migrated.translationTheme).toBe('bold');
    expect(migrated.floatingBallEnabled).toBe(false);
  });

  it('defaults currentProviderId to the first provider when missing', () => {
    // A v1 payload that omitted currentProviderId would otherwise migrate
    // to '' — which then fails validateImportedConfig on subsequent import.
    const v1 = {
      providers: [{ id: 'glm', name: 'GLM', baseUrl: 'x', apiKey: '', model: 'm', temperature: 0, maxTokens: 0, systemPrompt: '', userPromptTemplate: '', enabled: true }],
    };
    const migrated = migrateConfig(v1);
    expect(migrated.currentProviderId).toBe('glm');
  });
});
