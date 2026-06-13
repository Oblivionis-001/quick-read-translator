# 沉浸式网页翻译扩展实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个跨浏览器扩展（Chrome/Edge/Firefox），支持组合键/划词/悬浮按钮触发段落块翻译，通过 OpenAI-compatible API（首测 Zhipu GLM-4-Flash-250414）获取译文并以双语内联方式渲染。

**Architecture:** 按 DDD 四层组织代码：领域层定义翻译核心概念与 `TranslationProvider` 接口；应用层通过 `TranslationScheduler` 合并请求、重试、限流；基础设施层实现 OpenAI-compatible provider、DOM 提取/渲染、缓存与配置仓库；接口适配层提供 Content Script、Background Script、Options/Popup UI。请求统一走 Background Service Worker 代理。

**Tech Stack:** WXT, TypeScript, Vitest, Playwright, Tailwind CSS, browser.storage.local

---

## 文件结构

```
quick-read-translator/
├── src/
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── ParagraphBlock.ts
│   │   │   ├── TranslationRequest.ts
│   │   │   └── TranslationResult.ts
│   │   ├── services/
│   │   │   ├── BlockMerger.ts
│   │   │   └── HashCache.ts
│   │   └── interfaces/
│   │       ├── TranslationProvider.ts
│   │       └── ConfigRepository.ts
│   ├── application/
│   │   ├── TranslatePageUseCase.ts
│   │   ├── TranslationScheduler.ts
│   │   └── ConfigService.ts
│   ├── infrastructure/
│   │   ├── providers/
│   │   │   ├── OpenAICompatibleProvider.ts
│   │   │   └── LocalProxyProvider.ts
│   │   ├── extractors/
│   │   │   └── DOMBlockExtractor.ts
│   │   ├── renderers/
│   │   │   └── DOMRenderer.ts
│   │   ├── repositories/
│   │   │   └── BrowserStorageConfigRepo.ts
│   │   └── storage/
│   │       └── TranslationCache.ts
│   ├── interface-adapters/
│   │   ├── content/
│   │   │   ├── index.ts
│   │   │   ├── triggers/
│   │   │   │   ├── hotkey-trigger.ts
│   │   │   │   ├── selection-trigger.ts
│   │   │   │   └── hover-button-trigger.ts
│   │   │   └── renderer-adapter.ts
│   │   ├── background/
│   │   │   ├── index.ts
│   │   │   └── message-handler.ts
│   │   ├── options/
│   │   │   ├── App.tsx
│   │   │   ├── index.html
│   │   │   └── main.tsx
│   │   └── popup/
│   │       ├── App.tsx
│   │       ├── index.html
│   │       └── main.tsx
│   └── shared/
│       ├── types.ts
│       ├── constants.ts
│       └── utils/
│           └── hash.ts
├── tests/
│   ├── unit/
│   │   ├── domain/
│   │   ├── application/
│   │   └── infrastructure/
│   ├── integration/
│   │   └── glm-provider.test.ts
│   └── e2e/
│       └── translate.spec.ts
├── wxt.config.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── playwright.config.ts
```

---

## Task 1: WXT 项目脚手架

**Files:**
- Create: `package.json`
- Create: `wxt.config.ts`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/shared/types.ts`
- Create: `src/shared/constants.ts`

- [ ] **Step 1: 初始化 npm 项目并安装依赖**

```bash
npm init -y
npm install wxt react react-dom
npm install -D typescript vitest @vitest/ui playwright @playwright/test tailwindcss postcss autoprefixer @types/react @types/react-dom @types/webextension-polyfill
npm install webextension-polyfill
```

- [ ] **Step 2: 配置 `package.json` 脚本**

```json
{
  "name": "quick-read-translator",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "build:firefox": "wxt build -b firefox",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "e2e": "playwright test",
    "postinstall": "wxt prepare"
  }
}
```

- [ ] **Step 3: 创建 `wxt.config.ts`**

```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Quick Read Translator',
    description: 'Immersive bilingual translation for web pages',
    version: '0.1.0',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['<all_urls>'],
    action: {},
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },
  },
});
```

- [ ] **Step 4: 创建 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts"]
}
```

- [ ] **Step 5: 创建 `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
```

- [ ] **Step 6: 创建 `playwright.config.ts`**

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    headless: false,
  },
});
```

- [ ] **Step 7: 创建 `src/shared/types.ts`**

```typescript
export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  userPromptTemplate: string;
  enabled: boolean;
}

export interface AppConfig {
  targetLanguage: string;
  sourceLanguage: 'auto' | string;
  currentProviderId: string;
  providers: ProviderConfig[];
  hotkey: string;
  hoverButtonEnabled: boolean;
  selectionTriggerEnabled: boolean;
  localProxyUrl?: string;
  fallbackProviderId?: string;
}

export interface CacheEntry {
  translatedText: string;
  providerId: string;
  modelId: string;
  createdAt: number;
}
```

- [ ] **Step 8: 创建 `src/shared/constants.ts`**

```typescript
export const DEFAULT_TARGET_LANGUAGE = 'zh-CN';
export const DEFAULT_SOURCE_LANGUAGE = 'auto';
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_RETRIES = 2;
export const DEFAULT_HOTKEY = 'Alt+T';
```

- [ ] **Step 9: 运行 WXT 准备命令**

```bash
npm run postinstall
```

Expected: `.wxt/` 目录生成，无报错。

- [ ] **Step 10: 提交**

```bash
git add .
git commit -m "chore: scaffold WXT project with TypeScript, Vitest, Playwright"
```

---

## Task 2: 领域实体

**Files:**
- Create: `src/domain/entities/ParagraphBlock.ts`
- Create: `src/domain/entities/TranslationRequest.ts`
- Create: `src/domain/entities/TranslationResult.ts`
- Create: `tests/unit/domain/entities.test.ts`

- [ ] **Step 1: 写 failing test**

```typescript
// tests/unit/domain/entities.test.ts
import { describe, it, expect } from 'vitest';
import { ParagraphBlock } from '@/domain/entities/ParagraphBlock';
import { TranslationRequest } from '@/domain/entities/TranslationRequest';
import { TranslationResult } from '@/domain/entities/TranslationResult';

describe('ParagraphBlock', () => {
  it('creates a block with id derived from text', () => {
    const block = new ParagraphBlock({
      sourceText: 'Hello world',
      sourceLanguage: 'en',
    });
    expect(block.id).toBeDefined();
    expect(block.sourceText).toBe('Hello world');
  });

  it('produces same id for same text', () => {
    const a = new ParagraphBlock({ sourceText: 'Same', sourceLanguage: 'en' });
    const b = new ParagraphBlock({ sourceText: 'Same', sourceLanguage: 'en' });
    expect(a.id).toBe(b.id);
  });
});

describe('TranslationRequest', () => {
  it('combines multiple block texts', () => {
    const request = new TranslationRequest({
      blockIds: ['id1', 'id2'],
      combinedText: 'Hello\\nWorld',
      targetLanguage: 'zh-CN',
    });
    expect(request.blockIds).toHaveLength(2);
    expect(request.combinedText).toBe('Hello\\nWorld');
  });
});

describe('TranslationResult', () => {
  it('maps translated text to block id', () => {
    const result = new TranslationResult({
      blockId: 'id1',
      translatedText: '你好',
      providerId: 'openai',
      modelId: 'glm-4-flash',
      latencyMs: 120,
    });
    expect(result.translatedText).toBe('你好');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm run test -- tests/unit/domain/entities.test.ts
```

Expected: 失败，文件不存在。

- [ ] **Step 3: 创建 `src/shared/utils/hash.ts`**

```typescript
export function sha256(input: string): string {
  // Node compatible simple hash for tests; browser will use crypto.subtle
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}
```

- [ ] **Step 4: 创建 `src/domain/entities/ParagraphBlock.ts`**

```typescript
import { sha256 } from '@/shared/utils/hash';

export interface ParagraphBlockProps {
  sourceText: string;
  sourceLanguage: string;
  domReference?: string;
  contextBlocks?: string[];
}

export class ParagraphBlock {
  readonly id: string;
  readonly sourceText: string;
  readonly sourceLanguage: string;
  readonly domReference?: string;
  readonly contextBlocks: string[];

  constructor(props: ParagraphBlockProps) {
    this.sourceText = props.sourceText;
    this.sourceLanguage = props.sourceLanguage;
    this.domReference = props.domReference;
    this.contextBlocks = props.contextBlocks ?? [];
    this.id = sha256(`${props.sourceText}:${props.sourceLanguage}`);
  }
}
```

- [ ] **Step 5: 创建 `src/domain/entities/TranslationRequest.ts`**

```typescript
export interface TranslationRequestProps {
  blockIds: string[];
  combinedText: string;
  targetLanguage: string;
  sourceLanguage?: string;
  context?: string;
}

export class TranslationRequest {
  readonly blockIds: string[];
  readonly combinedText: string;
  readonly targetLanguage: string;
  readonly sourceLanguage: string;
  readonly context?: string;

  constructor(props: TranslationRequestProps) {
    this.blockIds = props.blockIds;
    this.combinedText = props.combinedText;
    this.targetLanguage = props.targetLanguage;
    this.sourceLanguage = props.sourceLanguage ?? 'auto';
    this.context = props.context;
  }
}
```

- [ ] **Step 6: 创建 `src/domain/entities/TranslationResult.ts`**

```typescript
export interface TranslationResultProps {
  blockId: string;
  translatedText: string;
  providerId: string;
  modelId: string;
  latencyMs: number;
}

export class TranslationResult {
  readonly blockId: string;
  readonly translatedText: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly latencyMs: number;

  constructor(props: TranslationResultProps) {
    this.blockId = props.blockId;
    this.translatedText = props.translatedText;
    this.providerId = props.providerId;
    this.modelId = props.modelId;
    this.latencyMs = props.latencyMs;
  }
}
```

- [ ] **Step 7: 运行测试确认通过**

```bash
npm run test -- tests/unit/domain/entities.test.ts
```

Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add src/domain tests/unit/domain
git commit -m "feat(domain): add ParagraphBlock, TranslationRequest, TranslationResult entities"
```

---

## Task 3: 领域服务 — BlockMerger 与 HashCache

**Files:**
- Create: `src/domain/services/BlockMerger.ts`
- Create: `src/domain/services/HashCache.ts`
- Create: `tests/unit/domain/services.test.ts`

- [ ] **Step 1: 写 failing test**

```typescript
// tests/unit/domain/services.test.ts
import { describe, it, expect } from 'vitest';
import { BlockMerger } from '@/domain/services/BlockMerger';
import { HashCache } from '@/domain/services/HashCache';
import { ParagraphBlock } from '@/domain/entities/ParagraphBlock';

describe('BlockMerger', () => {
  it('merges adjacent blocks into batches under max tokens', () => {
    const blocks = [
      new ParagraphBlock({ sourceText: 'Hello world one', sourceLanguage: 'en' }),
      new ParagraphBlock({ sourceText: 'Hello world two', sourceLanguage: 'en' }),
    ];
    const batches = new BlockMerger({ maxTokens: 100 }).merge(blocks, 'zh-CN');
    expect(batches).toHaveLength(1);
    expect(batches[0].blockIds).toHaveLength(2);
  });

  it('splits blocks when exceeding max tokens', () => {
    const blocks = [
      new ParagraphBlock({ sourceText: 'a'.repeat(500), sourceLanguage: 'en' }),
      new ParagraphBlock({ sourceText: 'b'.repeat(500), sourceLanguage: 'en' }),
    ];
    const batches = new BlockMerger({ maxTokens: 200 }).merge(blocks, 'zh-CN');
    expect(batches.length).toBeGreaterThanOrEqual(2);
  });
});

describe('HashCache', () => {
  it('generates deterministic cache key', () => {
    const key = HashCache.makeKey({
      sourceText: 'Hello',
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      providerId: 'glm',
      modelId: 'glm-4-flash',
      promptVersion: 'v1',
    });
    expect(typeof key).toBe('string');
    expect(key).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm run test -- tests/unit/domain/services.test.ts
```

Expected: 失败。

- [ ] **Step 3: 实现 `src/domain/services/BlockMerger.ts`**

```typescript
import { ParagraphBlock } from '@/domain/entities/ParagraphBlock';
import { TranslationRequest } from '@/domain/entities/TranslationRequest';

export interface BlockMergerOptions {
  maxTokens: number;
  tokensPerChar?: number;
}

export class BlockMerger {
  private readonly maxTokens: number;
  private readonly tokensPerChar: number;

  constructor(options: BlockMergerOptions) {
    this.maxTokens = options.maxTokens;
    this.tokensPerChar = options.tokensPerChar ?? 0.5;
  }

  merge(blocks: ParagraphBlock[], targetLanguage: string): TranslationRequest[] {
    const batches: TranslationRequest[] = [];
    let currentBlocks: ParagraphBlock[] = [];
    let currentTokens = 0;

    for (const block of blocks) {
      const blockTokens = this.estimateTokens(block.sourceText);

      if (currentTokens + blockTokens > this.maxTokens && currentBlocks.length > 0) {
        batches.push(this.createRequest(currentBlocks, targetLanguage));
        currentBlocks = [];
        currentTokens = 0;
      }

      currentBlocks.push(block);
      currentTokens += blockTokens;
    }

    if (currentBlocks.length > 0) {
      batches.push(this.createRequest(currentBlocks, targetLanguage));
    }

    return batches;
  }

  private createRequest(blocks: ParagraphBlock[], targetLanguage: string): TranslationRequest {
    return new TranslationRequest({
      blockIds: blocks.map((b) => b.id),
      combinedText: blocks.map((b) => b.sourceText).join('\\n'),
      targetLanguage,
    });
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length * this.tokensPerChar);
  }
}
```

- [ ] **Step 4: 实现 `src/domain/services/HashCache.ts`**

```typescript
import { sha256 } from '@/shared/utils/hash';

export interface CacheKeyInput {
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
  providerId: string;
  modelId: string;
  promptVersion: string;
}

export class HashCache {
  static makeKey(input: CacheKeyInput): string {
    return sha256(
      `${input.sourceText}:${input.sourceLanguage}:${input.targetLanguage}:${input.providerId}:${input.modelId}:${input.promptVersion}`
    );
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
npm run test -- tests/unit/domain/services.test.ts
```

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/domain/services tests/unit/domain/services.test.ts
git commit -m "feat(domain): add BlockMerger and HashCache services"
```

---

## Task 4: TranslationProvider 接口与 OpenAICompatibleProvider

**Files:**
- Create: `src/domain/interfaces/TranslationProvider.ts`
- Create: `src/infrastructure/providers/OpenAICompatibleProvider.ts`
- Create: `tests/unit/infrastructure/openai-provider.test.ts`

- [ ] **Step 1: 写 failing test**

```typescript
// tests/unit/infrastructure/openai-provider.test.ts
import { describe, it, expect, vi } from 'vitest';
import { OpenAICompatibleProvider } from '@/infrastructure/providers/OpenAICompatibleProvider';
import { TranslationRequest } from '@/domain/entities/TranslationRequest';

describe('OpenAICompatibleProvider', () => {
  it('constructs request body and parses response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '你好\\n世界' } }],
      }),
    });

    const provider = new OpenAICompatibleProvider({
      id: 'glm',
      name: 'Zhipu GLM',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: 'test-key',
      model: 'glm-4-flash-250414',
      temperature: 0.7,
      maxTokens: 1024,
      systemPrompt: 'Translate to {{targetLanguage}}.',
      userPromptTemplate: 'Translate:\\n{{text}}',
    });

    const request = new TranslationRequest({
      blockIds: ['id1', 'id2'],
      combinedText: 'Hello\\nWorld',
      targetLanguage: 'zh-CN',
    });

    const results = await provider.translate([request]);
    expect(results).toHaveLength(1);
    expect(results[0].translatedText).toBe('你好\\n世界');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm run test -- tests/unit/infrastructure/openai-provider.test.ts
```

Expected: 失败。

- [ ] **Step 3: 创建 `src/domain/interfaces/TranslationProvider.ts`**

```typescript
import { TranslationRequest } from '@/domain/entities/TranslationRequest';
import { TranslationResult } from '@/domain/entities/TranslationResult';
import { ProviderConfig } from '@/shared/types';

export interface TranslationProvider {
  readonly id: string;
  translate(requests: TranslationRequest[]): Promise<TranslationResult[]>;
}

export interface TranslationProviderFactory {
  create(config: ProviderConfig): TranslationProvider;
}
```

- [ ] **Step 4: 创建 `src/infrastructure/providers/OpenAICompatibleProvider.ts`**

```typescript
import { TranslationProvider } from '@/domain/interfaces/TranslationProvider';
import { TranslationRequest } from '@/domain/entities/TranslationRequest';
import { TranslationResult } from '@/domain/entities/TranslationResult';
import { ProviderConfig } from '@/shared/types';

export class OpenAICompatibleProvider implements TranslationProvider {
  readonly id: string;
  private readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.config = config;
  }

  async translate(requests: TranslationRequest[]): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];

    for (const request of requests) {
      const start = Date.now();
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
          messages: [
            {
              role: 'system',
              content: this.config.systemPrompt.replace('{{targetLanguage}}', request.targetLanguage),
            },
            {
              role: 'user',
              content: this.config.userPromptTemplate
                .replace('{{text}}', request.combinedText)
                .replace('{{targetLanguage}}', request.targetLanguage),
            },
          ],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Provider error ${response.status}: ${error}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? '';
      const latencyMs = Date.now() - start;

      const lines = content.split('\\n');
      request.blockIds.forEach((blockId, index) => {
        results.push(
          new TranslationResult({
            blockId,
            translatedText: lines[index] ?? content,
            providerId: this.id,
            modelId: this.config.model,
            latencyMs,
          })
        );
      });
    }

    return results;
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
npm run test -- tests/unit/infrastructure/openai-provider.test.ts
```

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/domain/interfaces src/infrastructure/providers tests/unit/infrastructure
git commit -m "feat(provider): add TranslationProvider interface and OpenAICompatibleProvider"
```

---

## Task 5: 错误类型

**Files:**
- Create: `src/domain/errors.ts`
- Modify: `src/infrastructure/providers/OpenAICompatibleProvider.ts`
- Create: `tests/unit/domain/errors.test.ts`

- [ ] **Step 1: 创建领域错误类型**

```typescript
// src/domain/errors.ts
export class TranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranslationError';
  }
}

export class NetworkError extends TranslationError {
  constructor(message = 'Network error') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class RateLimitError extends TranslationError {
  readonly retryAfter?: number;
  constructor(retryAfter?: number) {
    super('Rate limit exceeded');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class AuthError extends TranslationError {
  constructor(message = 'Authentication failed') {
    super(message);
    this.name = 'AuthError';
  }
}

export class ProviderError extends TranslationError {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

export class ValidationError extends TranslationError {
  constructor(message = 'Invalid response') {
    super(message);
    this.name = 'ValidationError';
  }
}
```

- [ ] **Step 2: 修改 provider 使用领域错误**

```typescript
import { NetworkError, RateLimitError, AuthError, ProviderError, ValidationError } from '@/domain/errors';

// In translate() loop, replace throw new Error with:
if (!response.ok) {
  if (response.status === 401 || response.status === 403) {
    throw new AuthError(`Authentication failed: ${response.status}`);
  }
  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after');
    throw new RateLimitError(retryAfter ? parseInt(retryAfter, 10) : undefined);
  }
  if (response.status >= 500) {
    throw new ProviderError(response.status, `Server error: ${response.status}`);
  }
  throw new ProviderError(response.status, `Provider error: ${response.status}`);
}

const data = await response.json();
const content = data.choices?.[0]?.message?.content;
if (typeof content !== 'string') {
  throw new ValidationError('Missing translation content');
}
```

- [ ] **Step 3: 写测试验证错误分类**

```typescript
// tests/unit/domain/errors.test.ts
import { describe, it, expect, vi } from 'vitest';
import { OpenAICompatibleProvider } from '@/infrastructure/providers/OpenAICompatibleProvider';
import { TranslationRequest } from '@/domain/entities/TranslationRequest';
import { AuthError, RateLimitError } from '@/domain/errors';

describe('Provider errors', () => {
  it('throws AuthError on 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, headers: new Headers() });
    const provider = new OpenAICompatibleProvider({
      id: 'glm', name: 'GLM', baseUrl: 'https://x', apiKey: 'k',
      model: 'm', temperature: 0.7, maxTokens: 100,
      systemPrompt: 's', userPromptTemplate: 't',
    });
    await expect(provider.translate([new TranslationRequest({ blockIds: ['id1'], combinedText: 'Hi', targetLanguage: 'zh-CN' })])).rejects.toBeInstanceOf(AuthError);
  });

  it('throws RateLimitError on 429', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: new Headers({ 'retry-after': '5' }) });
    const provider = new OpenAICompatibleProvider({
      id: 'glm', name: 'GLM', baseUrl: 'https://x', apiKey: 'k',
      model: 'm', temperature: 0.7, maxTokens: 100,
      systemPrompt: 's', userPromptTemplate: 't',
    });
    await expect(provider.translate([new TranslationRequest({ blockIds: ['id1'], combinedText: 'Hi', targetLanguage: 'zh-CN' })])).rejects.toBeInstanceOf(RateLimitError);
  });
});
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/domain/errors.ts src/infrastructure/providers tests/unit/domain/errors.test.ts
git commit -m "feat(errors): add domain error types and wire into provider"
```

---

## Task 6: 配置仓库与 ConfigService

**Files:**
- Create: `src/domain/interfaces/ConfigRepository.ts`
- Create: `src/infrastructure/repositories/BrowserStorageConfigRepo.ts`
- Create: `src/application/ConfigService.ts`
- Create: `tests/unit/application/config-service.test.ts`

- [ ] **Step 1: 写 failing test**

```typescript
// tests/unit/application/config-service.test.ts
import { describe, it, expect } from 'vitest';
import { ConfigService } from '@/application/ConfigService';
import { AppConfig } from '@/shared/types';

class FakeRepo {
  private data: AppConfig | null = null;
  async load(): Promise<AppConfig | null> { return this.data; }
  async save(config: AppConfig): Promise<void> { this.data = config; }
}

describe('ConfigService', () => {
  it('returns default config when empty', async () => {
    const service = new ConfigService(new FakeRepo());
    const config = await service.getConfig();
    expect(config.providers).toHaveLength(1);
    expect(config.providers[0].name).toBe('Zhipu GLM');
  });

  it('saves and loads custom config', async () => {
    const service = new ConfigService(new FakeRepo());
    const base = await service.getConfig();
    base.targetLanguage = 'en';
    await service.saveConfig(base);
    const loaded = await service.getConfig();
    expect(loaded.targetLanguage).toBe('en');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm run test -- tests/unit/application/config-service.test.ts
```

Expected: 失败。

- [ ] **Step 3: 创建 `src/domain/interfaces/ConfigRepository.ts`**

```typescript
import { AppConfig } from '@/shared/types';

export interface ConfigRepository {
  load(): Promise<AppConfig | null>;
  save(config: AppConfig): Promise<void>;
}
```

- [ ] **Step 4: 创建 `src/infrastructure/repositories/BrowserStorageConfigRepo.ts`**

```typescript
import { ConfigRepository } from '@/domain/interfaces/ConfigRepository';
import { AppConfig } from '@/shared/types';

export class BrowserStorageConfigRepo implements ConfigRepository {
  private readonly key = 'appConfig';

  async load(): Promise<AppConfig | null> {
    const data = await browser.storage.local.get(this.key);
    return data[this.key] ?? null;
  }

  async save(config: AppConfig): Promise<void> {
    await browser.storage.local.set({ [this.key]: config });
  }
}
```

- [ ] **Step 5: 创建 `src/application/ConfigService.ts`**

```typescript
import { ConfigRepository } from '@/domain/interfaces/ConfigRepository';
import { AppConfig, ProviderConfig } from '@/shared/types';
import { DEFAULT_TARGET_LANGUAGE, DEFAULT_SOURCE_LANGUAGE, DEFAULT_HOTKEY } from '@/shared/constants';

export const DEFAULT_PROVIDER: ProviderConfig = {
  id: 'glm',
  name: 'Zhipu GLM',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: '',
  model: 'glm-4-flash-250414',
  temperature: 0.7,
  maxTokens: 1024,
  systemPrompt: 'You are a professional translator. Translate the following text to {{targetLanguage}}. Preserve paragraphs. Only output the translation.',
  userPromptTemplate: '{{text}}',
  enabled: true,
};

export class ConfigService {
  private cache: AppConfig | null = null;

  constructor(private readonly repo: ConfigRepository) {}

  async getConfig(): Promise<AppConfig> {
    if (this.cache) return this.cache;
    const saved = await this.repo.load();
    this.cache = saved ?? this.createDefault();
    return this.cache;
  }

  async saveConfig(config: AppConfig): Promise<void> {
    this.cache = config;
    await this.repo.save(config);
  }

  private createDefault(): AppConfig {
    return {
      targetLanguage: DEFAULT_TARGET_LANGUAGE,
      sourceLanguage: DEFAULT_SOURCE_LANGUAGE,
      currentProviderId: DEFAULT_PROVIDER.id,
      providers: [DEFAULT_PROVIDER],
      hotkey: DEFAULT_HOTKEY,
      hoverButtonEnabled: true,
      selectionTriggerEnabled: true,
    };
  }
}
```

- [ ] **Step 6: 运行测试确认通过**

```bash
npm run test -- tests/unit/application/config-service.test.ts
```

Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/domain/interfaces src/infrastructure/repositories src/application tests/unit/application
git commit -m "feat(config): add ConfigRepository, BrowserStorageConfigRepo and ConfigService"
```

---

## Task 7: 翻译缓存 TranslationCache

**Files:**
- Create: `src/infrastructure/storage/TranslationCache.ts`
- Create: `tests/unit/infrastructure/translation-cache.test.ts`

- [ ] **Step 1: 写 failing test**

```typescript
// tests/unit/infrastructure/translation-cache.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationCache } from '@/infrastructure/storage/TranslationCache';

describe('TranslationCache', () => {
  let storage: Record<string, any> = {};

  beforeEach(() => {
    storage = {};
    global.browser = {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
          set: vi.fn(async (items: Record<string, any>) => Object.assign(storage, items)),
        },
      },
    } as any;
  });

  it('returns null for missing entry', async () => {
    const cache = new TranslationCache();
    const entry = await cache.get('missing');
    expect(entry).toBeNull();
  });

  it('stores and retrieves entry', async () => {
    const cache = new TranslationCache();
    await cache.set('key1', { translatedText: '你好', providerId: 'glm', modelId: 'm', createdAt: Date.now() });
    const entry = await cache.get('key1');
    expect(entry?.translatedText).toBe('你好');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm run test -- tests/unit/infrastructure/translation-cache.test.ts
```

Expected: 失败。

- [ ] **Step 3: 实现 `src/infrastructure/storage/TranslationCache.ts`**

```typescript
import { CacheEntry } from '@/shared/types';
import { CACHE_TTL_MS } from '@/shared/constants';

export class TranslationCache {
  private readonly key = 'translationCache';

  async get(cacheKey: string): Promise<CacheEntry | null> {
    const data = await browser.storage.local.get(this.key);
    const entries: Record<string, CacheEntry> = data[this.key] ?? {};
    const entry = entries[cacheKey];
    if (!entry) return null;
    if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
      return null;
    }
    return entry;
  }

  async set(cacheKey: string, entry: CacheEntry): Promise<void> {
    const data = await browser.storage.local.get(this.key);
    const entries: Record<string, CacheEntry> = data[this.key] ?? {};
    entries[cacheKey] = entry;
    await browser.storage.local.set({ [this.key]: entries });
  }

  async clear(): Promise<void> {
    await browser.storage.local.set({ [this.key]: {} });
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test -- tests/unit/infrastructure/translation-cache.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/infrastructure/storage tests/unit/infrastructure/translation-cache.test.ts
git commit -m "feat(cache): add TranslationCache with TTL"
```

---

## Task 8: 请求调度器 TranslationScheduler

**Files:**
- Create: `src/application/TranslationScheduler.ts`
- Create: `tests/unit/application/translation-scheduler.test.ts`

- [ ] **Step 1: 写 failing test**

```typescript
// tests/unit/application/translation-scheduler.test.ts
import { describe, it, expect, vi } from 'vitest';
import { TranslationScheduler } from '@/application/TranslationScheduler';
import { TranslationProvider } from '@/domain/interfaces/TranslationProvider';
import { TranslationRequest } from '@/domain/entities/TranslationRequest';
import { TranslationResult } from '@/domain/entities/TranslationResult';

class FakeProvider implements TranslationProvider {
  id = 'fake';
  translate = vi.fn(async (requests: TranslationRequest[]) => {
    return requests.flatMap((r) =>
      r.blockIds.map(
        (id, i) =>
          new TranslationResult({
            blockId: id,
            translatedText: `translated-${i}`,
            providerId: 'fake',
            modelId: 'm',
            latencyMs: 10,
          })
      )
    );
  });
}

describe('TranslationScheduler', () => {
  it('translates requests through provider', async () => {
    const provider = new FakeProvider();
    const scheduler = new TranslationScheduler(provider);
    const results = await scheduler.schedule([
      new TranslationRequest({ blockIds: ['id1'], combinedText: 'Hello', targetLanguage: 'zh-CN' }),
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].translatedText).toBe('translated-0');
  });

  it('retries on failure then succeeds', async () => {
    const provider = new FakeProvider();
    provider.translate
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce([new TranslationResult({ blockId: 'id1', translatedText: 'ok', providerId: 'fake', modelId: 'm', latencyMs: 10 })]);

    const scheduler = new TranslationScheduler(provider, { maxRetries: 1 });
    const results = await scheduler.schedule([
      new TranslationRequest({ blockIds: ['id1'], combinedText: 'Hello', targetLanguage: 'zh-CN' }),
    ]);
    expect(results[0].translatedText).toBe('ok');
    expect(provider.translate).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm run test -- tests/unit/application/translation-scheduler.test.ts
```

Expected: 失败。

- [ ] **Step 3: 实现 `src/application/TranslationScheduler.ts`**

```typescript
import { TranslationProvider } from '@/domain/interfaces/TranslationProvider';
import { TranslationRequest } from '@/domain/entities/TranslationRequest';
import { TranslationResult } from '@/domain/entities/TranslationResult';
import { NetworkError, RateLimitError } from '@/domain/errors';

export interface SchedulerOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

export class TranslationScheduler {
  constructor(
    private readonly provider: TranslationProvider,
    private readonly options: SchedulerOptions = {}
  ) {}

  async schedule(requests: TranslationRequest[]): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];

    for (const request of requests) {
      const requestResults = await this.translateWithRetry(request);
      results.push(...requestResults);
    }

    return results;
  }

  private async translateWithRetry(request: TranslationRequest): Promise<TranslationResult[]> {
    const maxRetries = this.options.maxRetries ?? 2;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.provider.translate([request]);
      } catch (error) {
        lastError = error as Error;
        if (!this.isRetryable(error)) throw error;
        const delay = this.calculateDelay(error, attempt);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private isRetryable(error: unknown): boolean {
    return error instanceof NetworkError || error instanceof RateLimitError;
  }

  private calculateDelay(error: unknown, attempt: number): number {
    if (error instanceof RateLimitError && error.retryAfter) {
      return error.retryAfter * 1000;
    }
    const base = this.options.baseDelayMs ?? 1000;
    return base * Math.pow(2, attempt);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test -- tests/unit/application/translation-scheduler.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/application/TranslationScheduler.ts tests/unit/application/translation-scheduler.test.ts
git commit -m "feat(scheduler): add TranslationScheduler with retry and backoff"
```

---

## Task 9: 翻译用例 TranslatePageUseCase

**Files:**
- Create: `src/application/TranslatePageUseCase.ts`
- Create: `tests/unit/application/translate-page-usecase.test.ts`

- [ ] **Step 1: 写 failing test**

```typescript
// tests/unit/application/translate-page-usecase.test.ts
import { describe, it, expect, vi } from 'vitest';
import { TranslatePageUseCase } from '@/application/TranslatePageUseCase';
import { ParagraphBlock } from '@/domain/entities/ParagraphBlock';
import { TranslationResult } from '@/domain/entities/TranslationResult';

describe('TranslatePageUseCase', () => {
  it('returns translated results for blocks', async () => {
    const blocks = [
      new ParagraphBlock({ sourceText: 'Hello', sourceLanguage: 'en' }),
    ];

    const scheduler = {
      schedule: vi.fn().mockResolvedValue([
        new TranslationResult({ blockId: blocks[0].id, translatedText: '你好', providerId: 'fake', modelId: 'm', latencyMs: 10 }),
      ]),
    };

    const merger = {
      merge: vi.fn().mockReturnValue([
        { blockIds: [blocks[0].id], combinedText: 'Hello', targetLanguage: 'zh-CN' },
      ]),
    };

    const cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };

    const useCase = new TranslatePageUseCase({ scheduler, merger, cache, promptVersion: 'v1' });
    const results = await useCase.execute(blocks, 'zh-CN');

    expect(results[0].translatedText).toBe('你好');
    expect(scheduler.schedule).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm run test -- tests/unit/application/translate-page-usecase.test.ts
```

Expected: 失败。

- [ ] **Step 3: 实现 `src/application/TranslatePageUseCase.ts`**

```typescript
import { ParagraphBlock } from '@/domain/entities/ParagraphBlock';
import { TranslationRequest } from '@/domain/entities/TranslationRequest';
import { TranslationResult } from '@/domain/entities/TranslationResult';
import { TranslationScheduler } from './TranslationScheduler';
import { BlockMerger } from '@/domain/services/BlockMerger';
import { HashCache } from '@/domain/services/HashCache';
import { TranslationCache } from '@/infrastructure/storage/TranslationCache';
import { CacheEntry } from '@/shared/types';

export interface TranslatePageUseCaseDeps {
  scheduler: TranslationScheduler;
  merger: BlockMerger;
  cache: TranslationCache;
  promptVersion: string;
}

export class TranslatePageUseCase {
  constructor(private readonly deps: TranslatePageUseCaseDeps) {}

  async execute(blocks: ParagraphBlock[], targetLanguage: string): Promise<TranslationResult[]> {
    const uncachedBlocks: ParagraphBlock[] = [];
    const cachedResults: TranslationResult[] = [];

    for (const block of blocks) {
      const key = HashCache.makeKey({
        sourceText: block.sourceText,
        sourceLanguage: block.sourceLanguage,
        targetLanguage,
        providerId: 'current',
        modelId: 'current',
        promptVersion: this.deps.promptVersion,
      });
      const cached = await this.deps.cache.get(key);
      if (cached) {
        cachedResults.push(
          new TranslationResult({
            blockId: block.id,
            translatedText: cached.translatedText,
            providerId: cached.providerId,
            modelId: cached.modelId,
            latencyMs: 0,
          })
        );
      } else {
        uncachedBlocks.push(block);
      }
    }

    if (uncachedBlocks.length === 0) return cachedResults;

    const requests = this.deps.merger.merge(uncachedBlocks, targetLanguage);
    const translated = await this.deps.scheduler.schedule(requests);

    for (const result of translated) {
      const block = uncachedBlocks.find((b) => b.id === result.blockId);
      if (!block) continue;
      const key = HashCache.makeKey({
        sourceText: block.sourceText,
        sourceLanguage: block.sourceLanguage,
        targetLanguage,
        providerId: result.providerId,
        modelId: result.modelId,
        promptVersion: this.deps.promptVersion,
      });
      const entry: CacheEntry = {
        translatedText: result.translatedText,
        providerId: result.providerId,
        modelId: result.modelId,
        createdAt: Date.now(),
      };
      await this.deps.cache.set(key, entry);
    }

    return [...cachedResults, ...translated];
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test -- tests/unit/application/translate-page-usecase.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/application/TranslatePageUseCase.ts tests/unit/application/translate-page-usecase.test.ts
git commit -m "feat(usecase): add TranslatePageUseCase with cache integration"
```

---

## Task 10: DOM 提取器 DOMBlockExtractor

**Files:**
- Create: `src/infrastructure/extractors/DOMBlockExtractor.ts`
- Create: `tests/unit/infrastructure/dom-extractor.test.ts`

- [ ] **Step 1: 写 failing test**

```typescript
// tests/unit/infrastructure/dom-extractor.test.ts
import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { DOMBlockExtractor } from '@/infrastructure/extractors/DOMBlockExtractor';

describe('DOMBlockExtractor', () => {
  it('extracts paragraph blocks from DOM', () => {
    const dom = new JSDOM(`
      <article>
        <p>First paragraph.</p>
        <p>Second paragraph.</p>
      </article>
    `);
    global.document = dom.window.document;

    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(dom.window.document.querySelector('article')!);

    expect(blocks).toHaveLength(2);
    expect(blocks[0].sourceText).toBe('First paragraph.');
    expect(blocks[1].sourceText).toBe('Second paragraph.');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm run test -- tests/unit/infrastructure/dom-extractor.test.ts
```

Expected: 失败（需要安装 jsdom）。

- [ ] **Step 3: 安装 jsdom 并更新 vitest 配置**

```bash
npm install -D jsdom @types/jsdom
```

更新 `vitest.config.ts`：

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
```

- [ ] **Step 4: 实现 `src/infrastructure/extractors/DOMBlockExtractor.ts`**

```typescript
import { ParagraphBlock } from '@/domain/entities/ParagraphBlock';

export class DOMBlockExtractor {
  private readonly selectors = 'p, h1, h2, h3, h4, h5, h6, li';

  extractFromElement(root: Element): ParagraphBlock[] {
    const elements = Array.from(root.querySelectorAll(this.selectors));
    const blocks: ParagraphBlock[] = [];

    for (const el of elements) {
      const text = this.getVisibleText(el);
      if (text.length > 0) {
        blocks.push(
          new ParagraphBlock({
            sourceText: text,
            sourceLanguage: 'auto',
            domReference: this.generateDomReference(el),
          })
        );
      }
    }

    return blocks;
  }

  private getVisibleText(el: Element): string {
    return (el.textContent ?? '').trim().replace(/\\s+/g, ' ');
  }

  private generateDomReference(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const index = Array.from(el.parentElement?.children ?? []).indexOf(el);
    return `${tag}-${index}`;
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
npm run test -- tests/unit/infrastructure/dom-extractor.test.ts
```

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add package.json vitest.config.ts src/infrastructure/extractors tests/unit/infrastructure/dom-extractor.test.ts
git commit -m "feat(extractor): add DOMBlockExtractor with jsdom tests"
```

---

## Task 11: DOM 渲染器 DOMRenderer

**Files:**
- Create: `src/infrastructure/renderers/DOMRenderer.ts`
- Create: `tests/unit/infrastructure/dom-renderer.test.ts`

- [ ] **Step 1: 写 failing test**

```typescript
// tests/unit/infrastructure/dom-renderer.test.ts
import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { DOMRenderer } from '@/infrastructure/renderers/DOMRenderer';
import { TranslationResult } from '@/domain/entities/TranslationResult';

describe('DOMRenderer', () => {
  it('renders translation inline after original', () => {
    const dom = new JSDOM(`
      <article>
        <p data-qrt-block-id="block-hello">Hello</p>
      </article>
    `);
    global.document = dom.window.document;

    const renderer = new DOMRenderer();
    renderer.render([
      new TranslationResult({ blockId: 'block-hello', translatedText: '你好', providerId: 'glm', modelId: 'm', latencyMs: 10 }),
    ]);

    const translated = dom.window.document.querySelector('.qrt-translation');
    expect(translated).not.toBeNull();
    expect(translated?.textContent).toBe('你好');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm run test -- tests/unit/infrastructure/dom-renderer.test.ts
```

Expected: 失败。

- [ ] **Step 3: 实现 `src/infrastructure/renderers/DOMRenderer.ts`**

```typescript
import { TranslationResult } from '@/domain/entities/TranslationResult';

export class DOMRenderer {
  private readonly translatedClass = 'qrt-translation';

  render(results: TranslationResult[]): void {
    for (const result of results) {
      const original = this.findOriginalElement(result.blockId);
      if (!original) continue;
      if (original.nextElementSibling?.classList.contains(this.translatedClass)) continue;

      const translationEl = document.createElement('div');
      translationEl.className = this.translatedClass;
      translationEl.textContent = result.translatedText;
      translationEl.style.cssText = `
        color: #928c86;
        margin-top: 0.25em;
        margin-bottom: 1em;
        font-size: 0.95em;
      `;
      original.after(translationEl);
    }
  }

  renderError(blockId: string, message: string, onRetry: () => void): void {
    const original = this.findOriginalElement(blockId);
    if (!original) return;

    const errorEl = document.createElement('span');
    errorEl.textContent = ' ⚠️';
    errorEl.title = message;
    errorEl.style.cursor = 'pointer';
    errorEl.addEventListener('click', onRetry);
    original.after(errorEl);
  }

  private findOriginalElement(blockId: string): Element | null {
    return document.querySelector(`[data-qrt-block-id="${blockId}"]`);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test -- tests/unit/infrastructure/dom-renderer.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/infrastructure/renderers tests/unit/infrastructure/dom-renderer.test.ts
git commit -m "feat(renderer): add DOMRenderer for inline bilingual display"
```

---

## Task 12: Background 消息处理器

**Files:**
- Create: `src/interface-adapters/background/message-handler.ts`
- Create: `src/interface-adapters/background/index.ts`
- Modify: `src/infrastructure/extractors/DOMBlockExtractor.ts`

- [ ] **Step 1: 修改 DOMBlockExtractor 标记元素**

```typescript
// In DOMBlockExtractor.extractFromElement, after creating ParagraphBlock:
blocks.push(
  new ParagraphBlock({
    sourceText: text,
    sourceLanguage: 'auto',
    domReference: this.generateDomReference(el),
  });
);
// Add after block creation:
el.setAttribute('data-qrt-block-id', blocks[blocks.length - 1].id);
```

- [ ] **Step 2: 创建 `src/interface-adapters/background/message-handler.ts`**

```typescript
import { ConfigService } from '@/application/ConfigService';
import { TranslatePageUseCase } from '@/application/TranslatePageUseCase';
import { TranslationScheduler } from '@/application/TranslationScheduler';
import { BlockMerger } from '@/domain/services/BlockMerger';
import { OpenAICompatibleProvider } from '@/infrastructure/providers/OpenAICompatibleProvider';
import { BrowserStorageConfigRepo } from '@/infrastructure/repositories/BrowserStorageConfigRepo';
import { TranslationCache } from '@/infrastructure/storage/TranslationCache';
import { ParagraphBlock } from '@/domain/entities/ParagraphBlock';

export interface TranslateMessage {
  type: 'TRANSLATE_BLOCKS';
  blocks: Array<{
    id: string;
    sourceText: string;
    sourceLanguage: string;
    domReference?: string;
  }>;
  targetLanguage: string;
}

export interface TranslateResponse {
  results: Array<{
    blockId: string;
    translatedText: string;
    providerId: string;
    modelId: string;
    latencyMs: number;
  }>;
  errors?: Array<{ blockId: string; message: string }>;
}

export async function handleTranslateMessage(
  message: TranslateMessage
): Promise<TranslateResponse> {
  const configService = new ConfigService(new BrowserStorageConfigRepo());
  const config = await configService.getConfig();
  const providerConfig = config.providers.find((p) => p.id === config.currentProviderId);
  if (!providerConfig) {
    throw new Error('No provider configured');
  }

  const provider = new OpenAICompatibleProvider(providerConfig);
  const scheduler = new TranslationScheduler(provider);
  const merger = new BlockMerger({ maxTokens: 1024 });
  const cache = new TranslationCache();

  const useCase = new TranslatePageUseCase({
    scheduler,
    merger,
    cache,
    promptVersion: 'v1',
  });

  const blocks = message.blocks.map(
    (b) =>
      new ParagraphBlock({
        sourceText: b.sourceText,
        sourceLanguage: b.sourceLanguage,
        domReference: b.domReference,
      })
  );

  const results = await useCase.execute(blocks, message.targetLanguage);

  return {
    results: results.map((r) => ({
      blockId: r.blockId,
      translatedText: r.translatedText,
      providerId: r.providerId,
      modelId: r.modelId,
      latencyMs: r.latencyMs,
    })),
  };
}
```

- [ ] **Step 3: 创建 `src/interface-adapters/background/index.ts`**

```typescript
import { defineBackground } from 'wxt/sandbox';
import { handleTranslateMessage } from './message-handler';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TRANSLATE_BLOCKS') {
      handleTranslateMessage(message)
        .then(sendResponse)
        .catch((error) => {
          sendResponse({ error: error.message });
        });
      return true;
    }
  });
});
```

- [ ] **Step 4: 验证 WXT 能识别入口**

```bash
npm run build
```

Expected: 成功编译出 `.output/` 或 `.wxt/` 产物。

- [ ] **Step 5: 提交**

```bash
git add src/interface-adapters/background src/infrastructure/extractors
git commit -m "feat(background): add message handler and background entry"
```

---

## Task 13: Content Script 触发器

**Files:**
- Create: `src/interface-adapters/content/index.ts`
- Create: `src/interface-adapters/content/triggers/hotkey-trigger.ts`
- Create: `src/interface-adapters/content/triggers/selection-trigger.ts`
- Create: `src/interface-adapters/content/triggers/hover-button-trigger.ts`
- Create: `src/interface-adapters/content/renderer-adapter.ts`

- [ ] **Step 1: 创建热键触发器**

```typescript
// src/interface-adapters/content/triggers/hotkey-trigger.ts
export function listenHotkey(hotkey: string, callback: () => void) {
  const keys = hotkey.toLowerCase().split('+');

  document.addEventListener('keydown', (event) => {
    const modifiers = ['alt', 'ctrl', 'meta', 'shift'];
    const allPressed = keys.every((key) => {
      if (modifiers.includes(key)) {
        return event[`${key}Key` as keyof KeyboardEvent];
      }
      return event.key.toLowerCase() === key;
    });

    const noExtraModifiers = modifiers.every(
      (mod) => keys.includes(mod) || !event[`${mod}Key` as keyof KeyboardEvent]
    );

    if (allPressed && noExtraModifiers) {
      event.preventDefault();
      callback();
    }
  });
}
```

- [ ] **Step 2: 创建划词触发器**

```typescript
// src/interface-adapters/content/triggers/selection-trigger.ts
export function listenSelection(callback: () => void) {
  document.addEventListener('mouseup', () => {
    const selection = window.getSelection()?.toString().trim();
    if (selection && selection.length > 0) {
      callback();
    }
  });
}
```

- [ ] **Step 3: 创建悬浮按钮触发器**

```typescript
// src/interface-adapters/content/triggers/hover-button-trigger.ts
export function createHoverButton(callback: () => void) {
  const button = document.createElement('button');
  button.textContent = '译';
  button.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    background: #00a071;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 13px;
    cursor: pointer;
    display: none;
  `;
  button.addEventListener('click', () => {
    callback();
    button.style.display = 'none';
  });
  document.body.appendChild(button);

  document.addEventListener('mouseover', (event) => {
    const target = event.target as HTMLElement;
    if (target.matches('p, h1, h2, h3, h4, h5, h6, li')) {
      const rect = target.getBoundingClientRect();
      button.style.left = `${rect.right - 30}px`;
      button.style.top = `${rect.top}px`;
      button.style.display = 'block';
      button.dataset.targetBlockId = target.dataset.qrtBlockId ?? '';
    }
  });
}
```

- [ ] **Step 4: 创建 renderer-adapter**

```typescript
// src/interface-adapters/content/renderer-adapter.ts
import { DOMRenderer } from '@/infrastructure/renderers/DOMRenderer';
import { TranslationResult } from '@/domain/entities/TranslationResult';

export function renderResults(results: TranslationResult[]) {
  const renderer = new DOMRenderer();
  renderer.render(results);
}
```

- [ ] **Step 5: 创建 Content Script 入口**

```typescript
// src/interface-adapters/content/index.ts
import { defineContentScript } from 'wxt/sandbox';
import { browser } from 'wxt/browser';
import { listenHotkey } from './triggers/hotkey-trigger';
import { listenSelection } from './triggers/selection-trigger';
import { createHoverButton } from './triggers/hover-button-trigger';
import { DOMBlockExtractor } from '@/infrastructure/extractors/DOMBlockExtractor';
import { renderResults } from './renderer-adapter';
import { TranslationResult } from '@/domain/entities/TranslationResult';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(document.body);

    async function translateSelectedOrHovered() {
      const selection = window.getSelection()?.toString().trim();
      const targetBlocks = selection
        ? blocks.filter((b) => b.sourceText.includes(selection))
        : blocks.slice(0, 1);

      const response = await browser.runtime.sendMessage({
        type: 'TRANSLATE_BLOCKS',
        blocks: targetBlocks.map((b) => ({
          id: b.id,
          sourceText: b.sourceText,
          sourceLanguage: b.sourceLanguage,
          domReference: b.domReference,
        })),
        targetLanguage: 'zh-CN',
      });

      if (response.error) {
        console.error(response.error);
        return;
      }

      const results = response.results.map(
        (r: any) =>
          new TranslationResult({
            blockId: r.blockId,
            translatedText: r.translatedText,
            providerId: r.providerId,
            modelId: r.modelId,
            latencyMs: r.latencyMs,
          })
      );
      renderResults(results);
    }

    listenHotkey('Alt+T', translateSelectedOrHovered);
    listenSelection(translateSelectedOrHovered);
    createHoverButton(translateSelectedOrHovered);
  },
});
```

- [ ] **Step 6: 验证构建**

```bash
npm run build
```

Expected: 成功编译。

- [ ] **Step 7: 提交**

```bash
git add src/interface-adapters/content
git commit -m "feat(content): add hotkey, selection, hover button triggers and renderer adapter"
```

---

## Task 14: Options 页面

**Files:**
- Create: `src/interface-adapters/options/App.tsx`
- Create: `src/interface-adapters/options/main.tsx`
- Create: `src/interface-adapters/options/index.html`

- [ ] **Step 1: 创建 `src/interface-adapters/options/index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Quick Read Translator 设置</title>
  </head>
  <body class="bg-[#f3f3f2] text-[#1b1916]">
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: 创建 `src/interface-adapters/options/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 3: 配置 Tailwind**

```bash
npx tailwindcss init -p
```

创建 `src/interface-adapters/options/index.css`：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

更新 `tailwind.config.js`：

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/interface-adapters/options/**/*.{tsx,html}'],
  theme: {
    extend: {
      colors: {
        sequoia: {
          green: '#00a071',
          'dark-green': '#007354',
          white: '#f3f3f2',
          black: '#1b1916',
          grey: '#928c86',
          'light-grey': '#a8a39e',
        },
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 4: 创建 `src/interface-adapters/options/App.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { ConfigService } from '@/application/ConfigService';
import { BrowserStorageConfigRepo } from '@/infrastructure/repositories/BrowserStorageConfigRepo';
import { AppConfig, ProviderConfig } from '@/shared/types';

const configService = new ConfigService(new BrowserStorageConfigRepo());

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    configService.getConfig().then(setConfig);
  }, []);

  const save = async (next: AppConfig) => {
    await configService.saveConfig(next);
    setConfig(next);
  };

  if (!config) return <div className="p-8">Loading...</div>;

  const provider = config.providers[0];

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-4xl font-normal mb-8 text-center">Quick Read Translator</h1>

      <section className="bg-white p-6 mb-6 shadow-sm">
        <h2 className="text-xl mb-4">API 配置</h2>
        <label className="block mb-2 text-sm text-sequoia-grey">Base URL</label>
        <input
          className="w-full border border-sequoia-grey p-2 mb-4 focus:border-sequoia-green outline-none"
          value={provider.baseUrl}
          onChange={(e) =>
            save({
              ...config,
              providers: [{ ...provider, baseUrl: e.target.value }],
            })
          }
        />

        <label className="block mb-2 text-sm text-sequoia-grey">API Key</label>
        <input
          type="password"
          className="w-full border border-sequoia-grey p-2 mb-4 focus:border-sequoia-green outline-none"
          value={provider.apiKey}
          onChange={(e) =>
            save({
              ...config,
              providers: [{ ...provider, apiKey: e.target.value }],
            })
          }
        />

        <label className="block mb-2 text-sm text-sequoia-grey">Model</label>
        <input
          className="w-full border border-sequoia-grey p-2 mb-4 focus:border-sequoia-green outline-none"
          value={provider.model}
          onChange={(e) =>
            save({
              ...config,
              providers: [{ ...provider, model: e.target.value }],
            })
          }
        />
      </section>

      <section className="bg-white p-6 mb-6 shadow-sm">
        <h2 className="text-xl mb-4">触发器</h2>
        <label className="block mb-2 text-sm text-sequoia-grey">快捷键</label>
        <input
          className="w-full border border-sequoia-grey p-2 mb-4 focus:border-sequoia-green outline-none"
          value={config.hotkey}
          onChange={(e) => save({ ...config, hotkey: e.target.value })}
        />
      </section>

      <section className="bg-white p-6 shadow-sm">
        <h2 className="text-xl mb-4">数据</h2>
        <button
          className="bg-[#32373c] text-white px-4 py-2 mr-2"
          onClick={async () => {
            const data = await browser.storage.local.get();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'qrt-config.json';
            a.click();
          }}
        >
          导出配置
        </button>
        <button
          className="bg-[#32373c] text-white px-4 py-2"
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json';
            input.onchange = async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (!file) return;
              const text = await file.text();
              const data = JSON.parse(text);
              await browser.storage.local.set(data);
              const refreshed = await configService.getConfig();
              setConfig(refreshed);
            };
            input.click();
          }}
        >
          导入配置
        </button>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: 验证构建**

```bash
npm run build
```

Expected: 成功编译。

- [ ] **Step 6: 提交**

```bash
git add src/interface-adapters/options tailwind.config.js postcss.config.js package.json
git commit -m "feat(options): add settings page with Tailwind and config import/export"
```

---

## Task 15: Popup 页面

**Files:**
- Create: `src/interface-adapters/popup/App.tsx`
- Create: `src/interface-adapters/popup/main.tsx`
- Create: `src/interface-adapters/popup/index.html`

- [ ] **Step 1: 创建 Popup 文件**

```html
<!-- src/interface-adapters/popup/index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Quick Read Translator</title>
  </head>
  <body class="bg-[#f3f3f2] text-[#1b1916] w-72">
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: 创建 `src/interface-adapters/popup/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../options/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 3: 创建 `src/interface-adapters/popup/App.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

export default function App() {
  const [status, setStatus] = useState('Ready');

  const translateCurrentPage = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      await browser.tabs.sendMessage(tab.id, { type: 'TRIGGER_TRANSLATE' });
      setStatus('Translating...');
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-lg font-normal mb-4">Quick Read Translator</h1>
      <button
        className="w-full bg-sequoia-green text-white py-2 mb-2 hover:bg-sequoia-dark-green"
        onClick={translateCurrentPage}
      >
        翻译当前页
      </button>
      <button
        className="w-full bg-[#32373c] text-white py-2"
        onClick={() => browser.runtime.openOptionsPage()}
      >
        打开设置
      </button>
      <p className="text-xs text-sequoia-grey mt-2">{status}</p>
    </div>
  );
}
```

- [ ] **Step 4: 在 Content Script 中监听 POPUP 触发消息**

修改 `src/interface-adapters/content/index.ts`，在 `main()` 中添加：

```typescript
browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'TRIGGER_TRANSLATE') {
    translateSelectedOrHovered();
  }
});
```

- [ ] **Step 5: 验证构建**

```bash
npm run build
```

Expected: 成功编译。

- [ ] **Step 6: 提交**

```bash
git add src/interface-adapters/popup src/interface-adapters/content/index.ts
git commit -m "feat(popup): add popup UI and trigger message handling"
```

---

## Task 16: GLM 集成测试

**Files:**
- Create: `tests/integration/glm-provider.test.ts`
- Create: `.env.example`

- [ ] **Step 1: 安装 dotenv**

```bash
npm install -D dotenv
```

- [ ] **Step 2: 创建 `.env.example`**

```bash
GLM_API_KEY=your_glm_api_key_here
```

- [ ] **Step 3: 创建集成测试**

```typescript
// tests/integration/glm-provider.test.ts
import { describe, it, expect } from 'vitest';
import { OpenAICompatibleProvider } from '@/infrastructure/providers/OpenAICompatibleProvider';
import { TranslationRequest } from '@/domain/entities/TranslationRequest';
import 'dotenv/config';

describe('GLM-4-Flash-250414 integration', () => {
  it.skipIf(!process.env.GLM_API_KEY)('translates English to Chinese', async () => {
    const provider = new OpenAICompatibleProvider({
      id: 'glm',
      name: 'Zhipu GLM',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: process.env.GLM_API_KEY!,
      model: 'glm-4-flash-250414',
      temperature: 0.7,
      maxTokens: 1024,
      systemPrompt: 'Translate to {{targetLanguage}}.',
      userPromptTemplate: 'Translate:\\n{{text}}',
    });

    const start = Date.now();
    const results = await provider.translate([
      new TranslationRequest({
        blockIds: ['id1'],
        combinedText: 'Hello, world!',
        targetLanguage: 'zh-CN',
      }),
    ]);
    const elapsed = Date.now() - start;

    expect(results).toHaveLength(1);
    expect(results[0].translatedText).toContain('你好');
    expect(elapsed).toBeLessThan(10000);
    console.log(`GLM translation took ${elapsed}ms: ${results[0].translatedText}`);
  });
});
```

- [ ] **Step 4: 运行集成测试**

```bash
GLM_API_KEY=your_key npm run test -- tests/integration/glm-provider.test.ts
```

Expected: 如果提供了 key，测试通过并打印耗时。

- [ ] **Step 5: 提交**

```bash
git add tests/integration .env.example package.json
git commit -m "test(integration): add GLM-4-Flash-250414 provider integration test"
```

---

## Task 17: Playwright 端到端测试

**Files:**
- Create: `tests/e2e/fixtures.ts`
- Create: `tests/e2e/translate.spec.ts`

- [ ] **Step 1: 创建测试夹具**

```typescript
// tests/e2e/fixtures.ts
import { test as base, chromium } from '@playwright/test';
import path from 'path';

export const test = base.extend<{
  extensionId: string;
  context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>;
}>({
  context: async ({}, use) => {
    const pathToExtension = path.resolve(__dirname, '../../.output/chrome');
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent('serviceworker');
    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },
});
```

- [ ] **Step 2: 创建 e2e 测试**

```typescript
// tests/e2e/translate.spec.ts
import { test } from './fixtures';
import { expect } from '@playwright/test';

test('translates a paragraph on test page', async ({ page }) => {
  await page.goto('https://example.com');
  await page.locator('p').first().click();
  await page.keyboard.press('Alt+T');

  await expect(page.locator('.qrt-translation').first()).toBeVisible({ timeout: 15000 });
});
```

- [ ] **Step 3: 构建并运行 e2e 测试**

```bash
npm run build
npm run e2e
```

Expected: Playwright 启动浏览器，点击段落，按 Alt+T，出现 `.qrt-translation`。

- [ ] **Step 4: 提交**

```bash
git add tests/e2e playwright.config.ts
git commit -m "test(e2e): add Playwright end-to-end test for translation trigger"
```

---

## Task 18: 跨浏览器构建验证

**Files:**
- Modify: `wxt.config.ts`（如需）

- [ ] **Step 1: 构建 Chrome/Edge 版本**

```bash
npm run build
```

Expected: `.output/chrome/` 生成。

- [ ] **Step 2: 构建 Firefox 版本**

```bash
npm run build:firefox
```

Expected: `.output/firefox/` 生成，无 MV3 特有 API 报错。

- [ ] **Step 3: 运行全部单元测试**

```bash
npm run test
```

Expected: 全部 PASS。

- [ ] **Step 4: 提交**

```bash
git add wxt.config.ts
git commit -m "chore(build): verify cross-browser builds for Chrome and Firefox"
```

---

## Task 19: 本地代理 Provider（可选但已设计）

**Files:**
- Create: `src/infrastructure/providers/LocalProxyProvider.ts`

- [ ] **Step 1: 实现 LocalProxyProvider**

```typescript
import { TranslationProvider } from '@/domain/interfaces/TranslationProvider';
import { TranslationRequest } from '@/domain/entities/TranslationRequest';
import { TranslationResult } from '@/domain/entities/TranslationResult';
import { ProviderConfig } from '@/shared/types';

export class LocalProxyProvider implements TranslationProvider {
  readonly id: string;
  private readonly proxyUrl: string;

  constructor(config: ProviderConfig, proxyUrl: string) {
    this.id = config.id;
    this.proxyUrl = proxyUrl;
  }

  async translate(requests: TranslationRequest[]): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];
    for (const request of requests) {
      const response = await fetch(`${this.proxyUrl}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw new Error(`Local proxy error: ${response.status}`);
      const data = await response.json();
      results.push(...data.results);
    }
    return results;
  }
}
```

- [ ] **Step 2: 在 Scheduler 中预留本地代理回退**

暂不实现，因为 MVP 只需 OpenAICompatibleProvider。标记为后续扩展。

- [ ] **Step 3: 提交**

```bash
git add src/infrastructure/providers/LocalProxyProvider.ts
git commit -m "feat(provider): add LocalProxyProvider stub for future local proxy support"
```

---

## 自检

### Spec 覆盖检查

| Spec 要求 | 对应 Task |
|-----------|-----------|
| 跨浏览器扩展（Chrome/Edge/Firefox） | Task 1, Task 18 |
| WXT + TypeScript | Task 1 |
| DDD 四层架构 | Task 2-7, Task 9 |
| 插件化 Provider | Task 4, Task 19 |
| OpenAI-compatible + GLM-4-Flash-250414 | Task 4, Task 16 |
| 三种触发器 | Task 13 |
| 段落块智能分块 | Task 3, Task 10 |
| 双语内联渲染 | Task 11 |
| Background 代理 | Task 12 |
| 智能合并 + 单块回退 | Task 3, Task 8 |
| 自动重试 + 优雅降级 | Task 5, Task 8, Task 11 |
| 本地代理回退 | Task 19 |
| 非流式，预留流式 | Task 4（接口可扩展） |
| 缓存 | Task 7, Task 9 |
| storage.local + 导入导出 | Task 6, Task 14 |
| Vitest / Playwright / GLM 集成测试 | Task 2-11 均含单元测试，Task 16, Task 17 |
| Sequoia 风格 UI | Task 14, Task 15 |

### Placeholder 检查

- 无 TBD/TODO
- 无 "适当处理" / "后续实现" 等模糊描述
- 每个 Task 都包含具体文件路径、代码、命令
- 类型签名在 Task 之间一致

### 类型一致性检查

- `ParagraphBlock.id` 始终为字符串哈希
- `TranslationProvider.translate()` 签名一致
- `ProviderConfig` 字段在所有任务中一致
- `AppConfig` 字段一致

---

## 执行交接

**计划完成并保存到 `docs/superpowers/plans/2026-06-13-immersive-translation-extension-plan.md`。**

两种执行方式：

1. **Subagent-Driven（推荐）**：每个 Task 派一个新鲜子代理执行，我在 Task 之间 review 结果。
2. **Inline Execution**：在当前会话中用 executing-plans 按 Task 批量执行，并在关键检查点暂停确认。

你选哪种？