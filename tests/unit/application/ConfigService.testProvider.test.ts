import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ConfigService } from '@/application/ConfigService';
import type { AppConfig, ProviderConfig } from '@/shared/types';
import type { ConfigRepository } from '@/domain/interfaces/ConfigRepository';

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'glm', name: 'GLM', baseUrl: 'https://x', apiKey: 'k', model: 'm',
    temperature: 0, maxTokens: 0,
    systemPrompt: 'Translate to {{targetLanguage}}.',
    userPromptTemplate: '{{text}}',
    enabled: true, ...overrides,
  };
}

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    targetLanguage: 'zh-CN',
    sourceLanguage: 'auto',
    currentProviderId: 'glm',
    providers: [makeProvider({ id: 'glm' })],
    hotkey: 'Alt+T',
    hoverButtonEnabled: true,
    selectionTriggerEnabled: true,
    schemaVersion: 2,
    selectorConfig: {
      selectors: [], excludeSelectors: [], excludeTags: [],
      stayOriginalSelectors: [], stayOriginalTags: [],
      extraBlockSelectors: [], extraInlineSelectors: [],
      blockMinTextCount: 1, paragraphMinWordCount: 1, containerMinTextCount: 1,
    },
    siteRules: [],
    translationTheme: 'inherit',
    floatingBallEnabled: true,
    ...overrides,
  };
}

function makeRepo(config: AppConfig): ConfigRepository {
  return {
    load: vi.fn(async () => config),
    save: vi.fn(async () => undefined),
  };
}

function makeOpenAIResponse(text: string) {
  const body = {
    choices: [{ message: { content: text } }],
  };
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function makeOpenAIError(status: number, body = 'error') {
  return {
    ok: false,
    status,
    headers: new Headers(),
    text: async () => body,
  };
}

describe('ConfigService.testProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ok result on successful translation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOpenAIResponse('你好'));
    vi.stubGlobal('fetch', fetchMock);

    const config = makeConfig();
    const repo = makeRepo(config);
    const svc = new ConfigService(repo);

    const result = await svc.testProvider('glm');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('你好');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('returns failure result on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOpenAIError(401, 'unauthorized')));

    const config = makeConfig();
    const repo = makeRepo(config);
    const svc = new ConfigService(repo);

    const result = await svc.testProvider('glm');
    expect(result.ok).toBe(false);
    // AuthError for 401; its message includes the status text from the response body.
    expect(result.message).toContain('AuthError');
  });

  it('returns failure when provider not found', async () => {
    const config = makeConfig();
    const repo = makeRepo(config);
    const svc = new ConfigService(repo);
    const result = await svc.testProvider('nonexistent');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('not found');
  });
});
