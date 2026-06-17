# 选择器/主题/Provider 测试/浮动球 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 MVP 基础上扩展四块能力 —— 分层 DOM 选择器(immersive-translate 风格的 selectors/exclude/stayOriginal/extra + per-site 规则)、翻译主题系统(默认 `inherit` 显式复制原文 computed style)、Provider 连通性测试按钮、以及 Shadow DOM 隔离的浮动球+贴边面板。

**Architecture:** 沿用现有 DDD 四层(domain / application / infrastructure / interface-adapters)。新加的纯逻辑(glob 匹配、site rule 合并、主题注册表、drag/dock 状态机)放 domain/services;DOM 相关基础设施(extractor 重写、renderer 重写、floating-ball host)放 infrastructure;UI(Options 新 section、floating-panel React 子树)放 interface-adapters。所有新配置项走单一 `AppConfig` schema,通过 `schemaVersion` 字段做向前兼容迁移。

**Tech Stack:** WXT, TypeScript, React, Tailwind v4, Vitest + jsdom, Playwright

**Spec:** [docs/superpowers/specs/2026-06-18-selector-theme-provider-ball-design.md](../specs/2026-06-18-selector-theme-provider-ball-design.md)

---

## 文件结构

新增 / 修改的文件(按阶段分组):

```
Phase 0 — Schema 迁移 (foundation):
  src/shared/types.ts                                    MODIFY  加 SelectorConfig / SiteRule / TranslationThemeId / BallPosition / schemaVersion
  src/shared/constants.ts                                MODIFY  加 SCHEMA_VERSION + DEFAULT_SELECTOR_CONFIG
  src/infrastructure/repositories/BrowserStorageConfigRepo.ts  MODIFY  加 migrate() + write-back
  src/application/ConfigService.ts                       MODIFY  createDefault 加新字段

Phase 1 — 翻译主题:
  src/domain/services/ThemeCatalog.ts                    CREATE  主题注册表
  src/infrastructure/renderers/DOMRenderer.ts            MODIFY  applyTheme + render(theme)
  src/interface-adapters/content/renderer-adapter.ts     MODIFY  透传 theme
  entrypoints/content.ts                                 MODIFY  WXT content script 入口,读 theme/SelectorConfig,注入 FloatingBallHost
  src/interface-adapters/options/AppearanceSection.tsx   CREATE  Options 里的 theme 选择
  src/interface-adapters/options/App.tsx                 MODIFY  接入 AppearanceSection

Phase 2 — Provider 测试:
  src/application/ConfigService.ts                       MODIFY  加 testProvider(id)
  src/interface-adapters/options/App.tsx                 MODIFY  ProviderSection 加 Test 按钮

Phase 3 — 分层选择器:
  src/domain/services/GlobMatcher.ts                     CREATE  globToRegex + matchesUrl
  src/domain/services/SelectorService.ts                 CREATE  mergeSiteRules + validateSelectorConfig
  src/infrastructure/extractors/DOMBlockExtractor.ts     MODIFY  接 SelectorConfig 替代硬编码
  entrypoints/content.ts                                 MODIFY  从 config 读 SelectorConfig + siteRules,传给 extractor
  src/interface-adapters/options/SelectorSection.tsx     CREATE  Options 里的 selectors 编辑
  src/interface-adapters/options/SiteRulesSection.tsx    CREATE  Options 里的 site rules 编辑
  src/interface-adapters/options/App.tsx                 MODIFY  接入 SelectorSection + SiteRulesSection

Phase 4 — 浮动球 + 面板:
  src/infrastructure/floating-ball/FloatingBallController.ts  CREATE  drag/dock 纯状态机
  src/infrastructure/floating-ball/FloatingBallHost.tsx        CREATE  shadow DOM 注入 + React mount + 重挂监听
  src/interface-adapters/floating-panel/App.tsx               CREATE  面板 React 根
  src/interface-adapters/floating-panel/floating-panel.css     CREATE  Tailwind v4 scoped 入口
  src/interface-adapters/floating-panel/components/HoverToggle.tsx
  src/interface-adapters/floating-panel/components/ProviderQuickSelect.tsx
  src/interface-adapters/floating-panel/components/ThemeSelect.tsx
  src/interface-adapters/floating-panel/components/TargetLanguageInput.tsx
  src/interface-adapters/floating-panel/components/TranslatePageButton.tsx
  entrypoints/content.ts                                      MODIFY  注入 FloatingBallHost,监听 qrt:translate-page 事件
  src/interface-adapters/options/App.tsx                     MODIFY  加 floatingBallEnabled toggle
```

测试文件命名规则(沿用现有惯例):
- 单元测试: `tests/unit/<layer>/<name>.test.ts`
- 集成测试: `tests/integration/<name>.test.ts`
- e2e 测试: `tests/e2e/<name>.spec.ts`

---

## Phase 0 — Schema 迁移 (foundation)

所有后续 phase 都依赖新的 config schema。先做这个。

### Task 0.1: 扩展 shared/types.ts

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: 添加新类型到文件末尾**

在 `src/shared/types.ts` 末尾追加:

```ts
/**
 * Layered selector configuration. Mirrors immersive-translate's selector
 * system: a default selector list, black/white lists for exclusion and
 * stay-original behavior, and "extra" additive lists. Per-site overrides
 * live in SiteRule (see below) and apply via SelectorDelta modifiers.
 */
export interface SelectorConfig {
  selectors: string[];
  excludeSelectors: string[];
  excludeTags: string[];
  stayOriginalSelectors: string[];
  stayOriginalTags: string[];
  extraBlockSelectors: string[];
  extraInlineSelectors: string[];
  blockMinTextCount: number;
  paragraphMinWordCount: number;
  containerMinTextCount: number;
}

/**
 * Incremental modifier applied to a base SelectorConfig list. Used by
 * SiteRule to add or remove items from the base `selectors` /
 * `excludeSelectors` / `extraBlockSelectors` lists without replacing
 * them outright.
 */
export interface SelectorDelta {
  add?: string[];
  remove?: string[];
}

/**
 * Per-site rule. `matches` is a list of glob patterns (e.g.
 * `*://news.ycombinator.com/*`); when the current page URL matches any
 * pattern and `enabled` is true, the rule's deltas are applied on top
 * of the base SelectorConfig.
 */
export interface SiteRule {
  id: string;
  matches: string[];
  selectors?: SelectorDelta;
  excludeSelectors?: SelectorDelta;
  extraBlockSelectors?: SelectorDelta;
  enabled: boolean;
}

export type TranslationThemeId = 'inherit' | 'grey' | 'dashed' | 'italic' | 'bold';

export type BallEdge = 'top' | 'bottom' | 'left' | 'right';

export type BallPosition =
  | { mode: 'docked'; edge: BallEdge; offsetAlong: number }
  | { mode: 'free'; x: number; y: number };
```

- [ ] **Step 2: 扩展 AppConfig**

把现有的 `AppConfig` 接口替换为:

```ts
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
  // New in schemaVersion 2:
  schemaVersion: number;
  selectorConfig: SelectorConfig;
  siteRules: SiteRule[];
  translationTheme: TranslationThemeId;
  floatingBallEnabled: boolean;
}
```

- [ ] **Step 3: 验证 type check**

Run: `npx tsc --noEmit`
Expected: 一堆错误,因为 ConfigService.createDefault 还没加新字段。这些错误会在 Task 0.5 修复。

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): extend AppConfig with selector / theme / ball fields"
```

### Task 0.2: 在 constants.ts 加默认值

**Files:**
- Modify: `src/shared/constants.ts`

- [ ] **Step 1: 添加 SCHEMA_VERSION 和默认 selector config**

在 `src/shared/constants.ts` 末尾追加(保留现有 exports):

```ts
import type { SelectorConfig, TranslationThemeId } from './types';

export const SCHEMA_VERSION = 2;

export const DEFAULT_SELECTOR_CONFIG: SelectorConfig = {
  selectors: [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li',
    'blockquote', 'figcaption', 'summary', 'dd', 'dt',
  ],
  excludeSelectors: [],
  excludeTags: [],
  // Code blocks: don't translate by default, matches immersive-translate.
  stayOriginalSelectors: ['pre', 'code', 'kbd', 'samp'],
  stayOriginalTags: [],
  extraBlockSelectors: [],
  extraInlineSelectors: [],
  blockMinTextCount: 1,
  paragraphMinWordCount: 1,
  containerMinTextCount: 1,
};

export const DEFAULT_TRANSLATION_THEME: TranslationThemeId = 'inherit';

export const DEFAULT_FLOATING_BALL_ENABLED = true;
```

- [ ] **Step 2: 验证 type check**

Run: `npx tsc --noEmit`
Expected: 仍然有 ConfigService.createDefault 相关错误,Task 0.5 修复。

- [ ] **Step 3: Commit**

```bash
git add src/shared/constants.ts
git commit -m "feat(constants): add SCHEMA_VERSION and default selector config"
```

### Task 0.3: 写 migrate 函数的失败测试

**Files:**
- Create: `tests/unit/infrastructure/migrate.test.ts`

- [ ] **Step 1: 写测试**

`tests/unit/infrastructure/migrate.test.ts`:

```ts
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
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run tests/unit/infrastructure/migrate.test.ts`
Expected: FAIL with "Cannot find module '@/infrastructure/repositories/migrate'"

- [ ] **Step 3: Commit**

```bash
git add tests/unit/infrastructure/migrate.test.ts
git commit -m "test(migrate): failing tests for v1→v2 config migration"
```

### Task 0.4: 实现 migrate 函数

**Files:**
- Create: `src/infrastructure/repositories/migrate.ts`

- [ ] **Step 1: 实现 migrate**

`src/infrastructure/repositories/migrate.ts`:

```ts
import type { AppConfig } from '@/shared/types';
import {
  DEFAULT_SELECTOR_CONFIG,
  DEFAULT_TRANSLATION_THEME,
  DEFAULT_FLOATING_BALL_ENABLED,
  SCHEMA_VERSION,
} from '@/shared/constants';

type V1Config = Partial<AppConfig> & { schemaVersion?: number };

/**
 * Migrate an unknown payload from storage into the current AppConfig
 * shape. Currently handles v1 → v2 (adding layered selector config,
 * translation theme, floating ball toggle).
 *
 * For future versions, append new branches before the final return.
 */
export function migrateConfig(raw: unknown): AppConfig {
  const r = (raw ?? {}) as V1Config;
  const version = r.schemaVersion ?? 1;

  if (version >= SCHEMA_VERSION) {
    return r as AppConfig;
  }

  // v1 → v2: add selector / theme / ball fields with defaults.
  // User-supplied values for the new fields (if somehow already present
  // in a v1 payload) are preserved.
  return {
    targetLanguage: r.targetLanguage ?? 'zh-CN',
    sourceLanguage: r.sourceLanguage ?? 'auto',
    currentProviderId: r.currentProviderId ?? '',
    providers: r.providers ?? [],
    hotkey: r.hotkey ?? 'Alt+T',
    hoverButtonEnabled: r.hoverButtonEnabled ?? true,
    selectionTriggerEnabled: r.selectionTriggerEnabled ?? true,
    localProxyUrl: r.localProxyUrl,
    fallbackProviderId: r.fallbackProviderId,
    schemaVersion: SCHEMA_VERSION,
    selectorConfig: r.selectorConfig ?? DEFAULT_SELECTOR_CONFIG,
    siteRules: r.siteRules ?? [],
    translationTheme: r.translationTheme ?? DEFAULT_TRANSLATION_THEME,
    floatingBallEnabled: r.floatingBallEnabled ?? DEFAULT_FLOATING_BALL_ENABLED,
  };
}
```

- [ ] **Step 2: 跑测试,确认通过**

Run: `npx vitest run tests/unit/infrastructure/migrate.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 3: Commit**

```bash
git add src/infrastructure/repositories/migrate.ts
git commit -m "feat(migrate): implement v1→v2 config migration"
```

### Task 0.5: 把 migrate 接到 BrowserStorageConfigRepo + 写回

**Files:**
- Modify: `src/infrastructure/repositories/BrowserStorageConfigRepo.ts`
- Create or extend: `tests/unit/infrastructure/BrowserStorageConfigRepo.test.ts`

- [ ] **Step 1: 写集成测试**

`tests/unit/infrastructure/BrowserStorageConfigRepo.test.ts`:

```ts
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
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run tests/unit/infrastructure/BrowserStorageConfigRepo.test.ts`
Expected: FAIL — repo 还没 migrate,loaded.schemaVersion 是 undefined

- [ ] **Step 3: 修改 BrowserStorageConfigRepo**

替换 `src/infrastructure/repositories/BrowserStorageConfigRepo.ts` 全部内容:

```ts
import browser from "webextension-polyfill";
import { ConfigRepository } from "@/domain/interfaces/ConfigRepository";
import { AppConfig } from "@/shared/types";
import { migrateConfig } from "./migrate";

const STORAGE_KEY = "appConfig";

export class BrowserStorageConfigRepo implements ConfigRepository {
  async load(): Promise<AppConfig | null> {
    const data = await browser.storage.local.get(STORAGE_KEY);
    const raw = data[STORAGE_KEY];
    if (raw === undefined) return null;

    const migrated = migrateConfig(raw);
    // Write back so the next load skips migration. The compare-and-swap
    // is implicit: we just overwrote whatever was there with its
    // migrated form, which is idempotent.
    if ((raw as { schemaVersion?: number }).schemaVersion !== migrated.schemaVersion) {
      await browser.storage.local.set({ [STORAGE_KEY]: migrated });
    }
    return migrated;
  }

  async save(config: AppConfig): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEY]: config });
  }
}
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run tests/unit/infrastructure/BrowserStorageConfigRepo.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: 更新 ConfigService.createDefault 包含新字段**

修改 `src/application/ConfigService.ts` 的 `createDefault` 方法:

```ts
private createDefault(): AppConfig {
  return {
    targetLanguage: DEFAULT_TARGET_LANGUAGE,
    sourceLanguage: DEFAULT_SOURCE_LANGUAGE,
    currentProviderId: DEFAULT_PROVIDER.id,
    providers: [DEFAULT_PROVIDER],
    hotkey: DEFAULT_HOTKEY,
    hoverButtonEnabled: true,
    selectionTriggerEnabled: true,
    schemaVersion: SCHEMA_VERSION,
    selectorConfig: DEFAULT_SELECTOR_CONFIG,
    siteRules: [],
    translationTheme: DEFAULT_TRANSLATION_THEME,
    floatingBallEnabled: DEFAULT_FLOATING_BALL_ENABLED,
  };
}
```

同时在文件顶部 import:

```ts
import {
  DEFAULT_HOTKEY,
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  SCHEMA_VERSION,
  DEFAULT_SELECTOR_CONFIG,
  DEFAULT_TRANSLATION_THEME,
  DEFAULT_FLOATING_BALL_ENABLED,
} from "@/shared/constants";
```

- [ ] **Step 6: 跑全部测试 + type check**

Run: `npm run test -- --run && npx tsc --noEmit`
Expected: 全部 PASS,type check 无错。

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/repositories/BrowserStorageConfigRepo.ts \
        src/application/ConfigService.ts \
        tests/unit/infrastructure/BrowserStorageConfigRepo.test.ts
git commit -m "feat(repo): wire migrate into BrowserStorageConfigRepo with write-back"
```

---

## Phase 1 — 翻译主题系统

### Task 1.1: 创建 ThemeCatalog

**Files:**
- Create: `src/domain/services/ThemeCatalog.ts`

- [ ] **Step 1: 实现 ThemeCatalog**

`src/domain/services/ThemeCatalog.ts`:

```ts
import type { TranslationThemeId } from '@/shared/types';

export interface ThemeDefinition {
  id: TranslationThemeId;
  label: string;
  /**
   * Inline CSS appended to the shared layout styles (display: block,
   * margin) when applying this theme. The `inherit` theme does not use
   * cssText; it instead clones the original element's computed style
   * (handled separately in DOMRenderer).
   */
  cssText: string;
}

export const THEME_CATALOG: ReadonlyArray<ThemeDefinition> = [
  { id: 'inherit', label: 'Inherit original style', cssText: '' },
  { id: 'grey',    label: 'Sequoia Grey',            cssText: 'color:#928c86; opacity:0.95;' },
  { id: 'dashed',  label: 'Dashed underline',        cssText: 'border-bottom:1px dashed currentColor; padding-bottom:1px;' },
  { id: 'italic',  label: 'Italic',                  cssText: 'font-style:italic; opacity:0.85;' },
  { id: 'bold',    label: 'Bold',                    cssText: 'font-weight:700;' },
];

export function getTheme(id: TranslationThemeId): ThemeDefinition | undefined {
  return THEME_CATALOG.find((t) => t.id === id);
}
```

- [ ] **Step 2: 跑 type check**

Run: `npx tsc --noEmit`
Expected: 无错。

- [ ] **Step 3: Commit**

```bash
git add src/domain/services/ThemeCatalog.ts
git commit -m "feat(theme): add ThemeCatalog registry"
```

### Task 1.2: TDD DOMRenderer.applyTheme

**Files:**
- Create: `tests/unit/infrastructure/DOMRenderer.theme.test.ts`
- Modify: `src/infrastructure/renderers/DOMRenderer.ts`

- [ ] **Step 1: 写失败测试**

`tests/unit/infrastructure/DOMRenderer.theme.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { DOMRenderer } from '@/infrastructure/renderers/DOMRenderer';
import { TranslationResult } from '@/domain/entities/TranslationResult';

describe('DOMRenderer theme application', () => {
  let dom: JSDOM;
  let doc: Document;

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>');
    doc = dom.window.document;
  });

  function makeResult(): TranslationResult {
    return new TranslationResult({
      blockId: 'b1',
      translatedText: '你好',
      providerId: 'glm',
      modelId: 'glm-4-flash',
      latencyMs: 100,
    });
  }

  it('inherit theme copies computed style from original', () => {
    // jsdom doesn't compute real CSS, but getComputedStyle returns
    // inline styles + defaults. Set inline styles to verify copy.
    const original = doc.createElement('h1');
    original.setAttribute('data-qrt-block-id', 'b1');
    original.style.color = 'rgb(255, 0, 0)';
    original.style.fontSize = '32px';
    original.style.fontFamily = 'Georgia';
    original.style.fontWeight = '700';
    original.style.lineHeight = '1.2';
    original.style.letterSpacing = '0.1em';
    original.style.textAlign = 'center';
    doc.body.appendChild(original);

    const renderer = new DOMRenderer(doc);
    renderer.render([makeResult()], 'inherit');

    const translation = original.nextElementSibling as HTMLElement;
    expect(translation).toBeTruthy();
    expect(translation.className).toBe('qrt-translation');
    expect(translation.style.color).toBe('rgb(255, 0, 0)');
    expect(translation.style.fontSize).toBe('32px');
    expect(translation.style.fontFamily).toContain('Georgia');
    expect(translation.style.fontWeight).toBe('700');
    expect(translation.style.textAlign).toBe('center');
    // Shared layout
    expect(translation.style.display).toBe('block');
  });

  it('grey theme applies Sequoia Grey cssText', () => {
    const original = doc.createElement('p');
    original.setAttribute('data-qrt-block-id', 'b1');
    doc.body.appendChild(original);

    const renderer = new DOMRenderer(doc);
    renderer.render([makeResult()], 'grey');

    const translation = original.nextElementSibling as HTMLElement;
    expect(translation.style.color).toBe('rgb(146, 140, 134)');
  });

  it('italic theme applies font-style: italic', () => {
    const original = doc.createElement('p');
    original.setAttribute('data-qrt-block-id', 'b1');
    doc.body.appendChild(original);

    const renderer = new DOMRenderer(doc);
    renderer.render([makeResult()], 'italic');

    const translation = original.nextElementSibling as HTMLElement;
    expect(translation.style.fontStyle).toBe('italic');
  });

  it('updates existing translation in place on re-render', () => {
    const original = doc.createElement('p');
    original.setAttribute('data-qrt-block-id', 'b1');
    doc.body.appendChild(original);

    const renderer = new DOMRenderer(doc);
    renderer.render([makeResult()], 'grey');
    const firstTranslation = original.nextElementSibling as HTMLElement;

    const updated = new TranslationResult({
      blockId: 'b1',
      translatedText: '世界',
      providerId: 'glm',
      modelId: 'glm-4-flash',
      latencyMs: 50,
    });
    renderer.render([updated], 'italic');

    // Should be the same node, text updated, theme re-applied
    expect(original.nextElementSibling).toBe(firstTranslation);
    expect(firstTranslation.textContent).toBe('世界');
    expect(firstTranslation.style.fontStyle).toBe('italic');
    // Grey color should be cleared (italic theme doesn't set color)
    // — actually cssText is appended, so the previous color may linger.
    // Verify by re-rendering from grey → italic that font-style is now italic.
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run tests/unit/infrastructure/DOMRenderer.theme.test.ts`
Expected: FAIL — `render` 当前签名只接受 results,不接受 theme 参数。

- [ ] **Step 3: 重写 DOMRenderer**

替换 `src/infrastructure/renderers/DOMRenderer.ts` 全部内容:

```ts
import { TranslationResult } from "@/domain/entities/TranslationResult";
import type { TranslationThemeId } from "@/shared/types";
import { getTheme } from "@/domain/services/ThemeCatalog";

/**
 * Renders {@link TranslationResult}s back into the page as inline bilingual
 * translations, and shows retry affordances for failed blocks. Re-rendering
 * a block does not duplicate output: when a translation sibling already
 * exists, its text and theme are updated in place.
 */
export class DOMRenderer {
  private readonly translatedClass = "qrt-translation";
  private readonly errorClass = "qrt-error";

  constructor(private readonly doc: Document = globalThis.document) {}

  render(results: TranslationResult[], theme: TranslationThemeId = 'inherit'): void {
    for (const result of results) {
      const original = this.findOriginalElement(result.blockId);
      if (!original) continue;
      const existing = original.nextElementSibling;
      if (existing?.classList.contains(this.translatedClass)) {
        const el = existing as HTMLElement;
        el.textContent = result.translatedText;
        this.applyTheme(el, original, theme);
        continue;
      }

      const translationEl = this.doc.createElement("div");
      translationEl.className = this.translatedClass;
      translationEl.textContent = result.translatedText;
      this.applyTheme(translationEl, original, theme);
      original.after(translationEl);
    }
  }

  renderError(blockId: string, message: string, onRetry: () => void): void {
    const original = this.findOriginalElement(blockId);
    if (!original) return;

    let errorEl = original.nextElementSibling;
    if (!errorEl || !errorEl.classList.contains(this.errorClass)) {
      const span = this.doc.createElement("span");
      span.className = this.errorClass;
      span.textContent = " ⚠️";
      span.style.cursor = "pointer";
      span.addEventListener("click", onRetry);
      original.after(span);
      errorEl = span;
    } else {
      const span = errorEl as HTMLSpanElement;
      const fresh = span.cloneNode(true) as HTMLSpanElement;
      fresh.addEventListener("click", onRetry);
      span.replaceWith(fresh);
      errorEl = fresh;
    }

    errorEl.setAttribute("title", message);
  }

  /**
   * Apply the given theme to a translation element. Shared layout (block
   * display, top/bottom margins separating the translation from the
   * original) is always applied; theme-specific styling is layered on top.
   *
   * For `inherit`, we explicitly copy computed style from the original
   * element. The translation is a sibling (not a child), so natural CSS
   * cascade would inherit from the original's parent — which is rarely
   * what the user wants. Explicit copy preserves the original's visual
   * weight: an h1's translation is also h1-sized.
   */
  private applyTheme(
    el: HTMLElement,
    original: Element,
    theme: TranslationThemeId
  ): void {
    // Reset to a known baseline so theme switches don't leave residual
    // styles from the previous theme.
    el.style.cssText = '';
    el.style.display = 'block';
    el.style.marginTop = '0.25em';
    el.style.marginBottom = '0.5em';

    if (theme === 'inherit') {
      const win = this.doc.defaultView;
      if (!win) return;
      const cs = win.getComputedStyle(original);
      el.style.color = cs.color;
      el.style.fontSize = cs.fontSize;
      el.style.fontFamily = cs.fontFamily;
      el.style.fontWeight = cs.fontWeight;
      el.style.lineHeight = cs.lineHeight;
      el.style.letterSpacing = cs.letterSpacing;
      el.style.textAlign = cs.textAlign;
    } else {
      const def = getTheme(theme);
      if (def && def.cssText) {
        el.style.cssText += def.cssText;
      }
    }
  }

  private findOriginalElement(blockId: string): Element | null {
    return this.doc.querySelector(`[data-qrt-block-id="${blockId}"]`);
  }
}
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run tests/unit/infrastructure/DOMRenderer.theme.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/renderers/DOMRenderer.ts \
        tests/unit/infrastructure/DOMRenderer.theme.test.ts
git commit -m "feat(renderer): apply theme to translations, inherit copies computed style"
```

### Task 1.3: 透传 theme 到 content-script 入口

**Files:**
- Modify: `src/interface-adapters/content/renderer-adapter.ts`
- Modify: `src/interface-adapters/content/orchestrator.ts`
- Modify: `src/interface-adapters/content/index.ts`

- [ ] **Step 1: 修改 renderer-adapter 接受 theme**

替换 `src/interface-adapters/content/renderer-adapter.ts` 全部内容:

```ts
/**
 * Renderer adapter: thin module-level singleton wrapper around DOMRenderer.
 * Tests can reset the singleton via _resetRendererForTests.
 */

import { DOMRenderer } from "@/infrastructure/renderers/DOMRenderer";
import { TranslationResult } from "@/domain/entities/TranslationResult";
import type { TranslationThemeId } from "@/shared/types";

let renderer: DOMRenderer | null = null;
let currentTheme: TranslationThemeId = 'inherit';

function getRenderer(): DOMRenderer {
  if (!renderer) renderer = new DOMRenderer();
  return renderer;
}

export function setRendererTheme(theme: TranslationThemeId): void {
  currentTheme = theme;
}

export function renderResults(results: TranslationResult[]): void {
  getRenderer().render(results, currentTheme);
}

export function renderError(blockId: string, message: string, onRetry: () => void): void {
  getRenderer().renderError(blockId, message, onRetry);
}

/** Test helper: reset the singleton between tests. */
export function _resetRendererForTests(): void {
  renderer = null;
  currentTheme = 'inherit';
}
```

注意:`orchestrator.ts` 里现有 retry 回调也调用 `renderResults`,但因为 theme 是模块级状态,不需要改 orchestrator 的函数签名。

- [ ] **Step 2: 在 content/index.ts 里读 theme 并 setRendererTheme**

修改 `entrypoints/content.ts` 的 `main()` 函数。在 config 读取块之后,把 theme 应用到 renderer-adapter:

```ts
import { setRendererTheme } from "@/interface-adapters/content/renderer-adapter";
import type { TranslationThemeId } from "@/shared/types";

// ...在已有的 config load 块里追加:
let translationTheme: TranslationThemeId = 'inherit';
try {
  const configService = new ConfigService(new BrowserStorageConfigRepo());
  const config = await configService.getConfig();
  hotkey = config.hotkey;
  selectionTriggerEnabled = config.selectionTriggerEnabled;
  hoverButtonEnabled = config.hoverButtonEnabled;
  translationTheme = config.translationTheme;
} catch (err) {
  console.error("[qrt] failed to load config; using defaults:", err);
}
setRendererTheme(translationTheme);
```

(把 `let translationTheme` 放在已有 `let hotkey / let selectionTriggerEnabled / let hoverButtonEnabled` 之后即可。)

- [ ] **Step 3: 跑 type check + 全部测试**

Run: `npm run test -- --run && npx tsc --noEmit`
Expected: PASS。已有的 DOMRenderer 测试可能因为 render 签名变化需要更新(如果有的话);如果失败,把现有测试里 `renderer.render(results)` 改成 `renderer.render(results, 'inherit')`。

- [ ] **Step 4: Commit**

```bash
git add src/interface-adapters/content/renderer-adapter.ts \
        entrypoints/content.ts
git commit -m "feat(content): wire translationTheme through renderer adapter"
```

### Task 1.4: 创建 AppearanceSection 组件

**Files:**
- Create: `src/interface-adapters/options/AppearanceSection.tsx`

- [ ] **Step 1: 实现 AppearanceSection**

`src/interface-adapters/options/AppearanceSection.tsx`:

```tsx
import { THEME_CATALOG } from "@/domain/services/ThemeCatalog";
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
  // feedback in Options. Keep this in sync with ThemeCatalog.cssText.
  const base = 'display: block; margin-top: 0.25em; margin-bottom: 0.5em;';
  let css = base;
  if (theme === 'grey') css += 'color:#928c86; opacity:0.95;';
  else if (theme === 'dashed') css += 'border-bottom:1px dashed currentColor; padding-bottom:1px;';
  else if (theme === 'italic') css += 'font-style:italic; opacity:0.85;';
  else if (theme === 'bold') css += 'font-weight:700;';
  // inherit: no extra CSS — natural cascade in this preview context.
  return <p style={css}>敏捷的棕色狐狸</p>;
}
```

- [ ] **Step 2: 跑 type check**

Run: `npx tsc --noEmit`
Expected: 无错。

- [ ] **Step 3: Commit**

```bash
git add src/interface-adapters/options/AppearanceSection.tsx
git commit -m "feat(options): add AppearanceSection for theme selection"
```

### Task 1.5: 接入 Options App

**Files:**
- Modify: `src/interface-adapters/options/App.tsx`

- [ ] **Step 1: 引入 AppearanceSection**

在 `src/interface-adapters/options/App.tsx` 顶部 import:

```ts
import { AppearanceSection } from "./AppearanceSection";
```

在 JSX 里,在 `<LanguageSection ... />` 之后、`<LocalProxySection ... />` 之前插入:

```tsx
<AppearanceSection
  config={config}
  onThemeChange={(v) => save({ ...config, translationTheme: v })}
/>
```

- [ ] **Step 2: 跑 type check + dev build**

Run: `npx tsc --noEmit && npm run build`
Expected: 无错,build 成功。

- [ ] **Step 3: 手动验证**

加载 `.output/chrome-mv3/` 到 Chrome,打开 Options,看到 Appearance section,theme select 默认 `inherit`。切换到 `grey`,刷新页面,翻译一段 —— 译文应该是 Sequoia Grey。

- [ ] **Step 4: Commit**

```bash
git add src/interface-adapters/options/App.tsx
git commit -m "feat(options): wire AppearanceSection into Options App"
```

---

## Phase 2 — Provider 连通性测试

### Task 2.1: TDD ConfigService.testProvider

**Files:**
- Create: `tests/unit/application/ConfigService.testProvider.test.ts`
- Modify: `src/application/ConfigService.ts`

- [ ] **Step 1: 写失败测试**

`tests/unit/application/ConfigService.testProvider.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@/application/ConfigService';
import type { AppConfig, ProviderConfig } from '@/shared/types';
import type { ConfigRepository } from '@/domain/interfaces/ConfigRepository';

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

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'glm', name: 'GLM', baseUrl: 'https://x', apiKey: 'k', model: 'm',
    temperature: 0, maxTokens: 0, systemPrompt: '', userPromptTemplate: '',
    enabled: true, ...overrides,
  };
}

function makeRepo(config: AppConfig): ConfigRepository {
  return {
    load: vi.fn(async () => config),
    save: vi.fn(async () => undefined),
  };
}

describe('ConfigService.testProvider', () => {
  it('returns ok result on successful translation', async () => {
    const config = makeConfig();
    const repo = makeRepo(config);
    const svc = new ConfigService(repo);

    // Mock OpenAICompatibleProvider at module level.
    const translateMock = vi.fn(async () => ({
      translatedText: '你好',
      providerId: 'glm',
      modelId: 'm',
      latencyMs: 5,
    }));
    vi.doMock('@/infrastructure/providers/OpenAICompatibleProvider', () => ({
      OpenAICompatibleProvider: class {
        translate = translateMock;
      },
    }));

    const result = await svc.testProvider('glm');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('你好');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(translateMock).toHaveBeenCalled();
    vi.doUnmock('@/infrastructure/providers/OpenAICompatibleProvider');
  });

  it('returns failure result on error', async () => {
    const config = makeConfig();
    const repo = makeRepo(config);
    const svc = new ConfigService(repo);

    vi.doMock('@/infrastructure/providers/OpenAICompatibleProvider', () => ({
      OpenAICompatibleProvider: class {
        translate = vi.fn(async () => {
          throw new Error('401 Unauthorized');
        });
      },
    }));

    const result = await svc.testProvider('glm');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('401');
    vi.doUnmock('@/infrastructure/providers/OpenAICompatibleProvider');
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
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run tests/unit/application/ConfigService.testProvider.test.ts`
Expected: FAIL — `testProvider` 不存在。

- [ ] **Step 3: 实现 testProvider**

修改 `src/application/ConfigService.ts`,在 class 里加 import 和方法。

文件顶部追加 import:

```ts
import { OpenAICompatibleProvider } from "@/infrastructure/providers/OpenAICompatibleProvider";
import { NetworkError, RateLimitError } from "@/domain/errors";
import type { TranslationResult } from "@/domain/entities/TranslationResult";
```

class 末尾(`createDefault` 之前)加:

```ts
  /**
   * Run a single minimal translation via the provider to verify
   * connectivity and configuration. Bypasses TranslationCache and the
   * orchestrator entirely — we want a fresh, isolated round-trip.
   */
  async testProvider(providerId: string): Promise<ProviderTestResult> {
    const config = await this.getConfig();
    const providerCfg = config.providers.find((p) => p.id === providerId);
    if (!providerCfg) {
      return { ok: false, latencyMs: 0, message: `Provider not found: ${providerId}` };
    }
    const provider = new OpenAICompatibleProvider(providerCfg);
    const start = performance.now();
    try {
      const result = await provider.translate({
        sourceText: 'Hello',
        sourceLanguage: 'auto',
        targetLanguage: config.targetLanguage,
      }) as TranslationResult;
      const latencyMs = Math.round(performance.now() - start);
      return {
        ok: true,
        latencyMs,
        message: `Translated "Hello" → "${result.translatedText}"`,
      };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      const message = err instanceof Error ? err.message : String(err);
      const statusCode =
        err instanceof NetworkError || err instanceof RateLimitError
          ? err.statusCode
          : undefined;
      return { ok: false, latencyMs, message, statusCode };
    }
  }
```

class 之前(文件顶部 import 之后)加类型:

```ts
export interface ProviderTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
  statusCode?: number;
}
```

**Implementation note:** Verify the actual `provider.translate` input shape by reading `src/domain/interfaces/TranslationProvider.ts` and `src/infrastructure/providers/OpenAICompatibleProvider.ts`. If the request type name is different (e.g., `TranslationRequest`), use that. If `provider.translate` returns a different shape than `TranslationResult`, adjust the cast accordingly.

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run tests/unit/application/ConfigService.testProvider.test.ts`
Expected: PASS (3 tests)

如果测试因为 mock 没生效失败,改用 `vi.mock` (hoisted) 替代 `vi.doMock`:

```ts
vi.mock('@/infrastructure/providers/OpenAICompatibleProvider', () => ({
  OpenAICompatibleProvider: class {
    translate = translateMock;
  },
}));
```

- [ ] **Step 5: Commit**

```bash
git add src/application/ConfigService.ts \
        tests/unit/application/ConfigService.testProvider.test.ts
git commit -m "feat(config): add ConfigService.testProvider"
```

### Task 2.2: Options 里加 Test connection 按钮

**Files:**
- Modify: `src/interface-adapters/options/App.tsx`

- [ ] **Step 1: 加 TestConnectionButton 子组件**

在 `src/interface-adapters/options/App.tsx` 里,在 `ProviderSection` 组件内,顶部 `<div className="flex items-baseline justify-between mb-4">` 块的 `<h2>Provider</h2>` 旁边,把现有的 provider 选择器 + Add + Delete 按钮所在的 `<div className="flex gap-2 items-center">` 内追加一个 Test 按钮。

实际改动:在 `src/interface-adapters/options/App.tsx` 文件末尾(文件最末尾 `DataSection` 之后)新增组件:

```tsx
interface TestConnectionButtonProps {
  providerId: string;
  configService: ConfigService;
}

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; latencyMs: number; message: string }
  | { kind: 'fail'; message: string; statusCode?: number };

function TestConnectionButton({ providerId, configService }: TestConnectionButtonProps) {
  const [state, setState] = useState<TestState>({ kind: 'idle' });

  const onClick = async () => {
    setState({ kind: 'testing' });
    try {
      const result = await configService.testProvider(providerId);
      if (result.ok) {
        setState({ kind: 'ok', latencyMs: result.latencyMs, message: result.message });
        setTimeout(() => setState({ kind: 'idle' }), 3000);
      } else {
        setState({ kind: 'fail', message: result.message, statusCode: result.statusCode });
      }
    } catch (err) {
      setState({
        kind: 'fail',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const label =
    state.kind === 'testing' ? 'Testing…'
    : state.kind === 'ok' ? `✓ ${state.latencyMs}ms — ${state.message}`
    : state.kind === 'fail' ? `✗ ${state.statusCode ?? ''} ${state.message}`.trim()
    : 'Test connection';

  const color =
    state.kind === 'ok' ? 'text-sequoia-green'
    : state.kind === 'fail' ? 'text-sequoia-red'
    : 'text-sequoia-grey';

  return (
    <button
      type="button"
      className={`text-xs underline ${color}`}
      onClick={onClick}
      disabled={state.kind === 'testing'}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: 在 ProviderSection 里使用**

在 `ProviderSection` 函数的 props 接口加 `configService: ConfigService`,并把按钮插入到 provider 选择器下面或右侧:

修改 `ProviderSectionProps`:

```ts
interface ProviderSectionProps {
  config: AppConfig;
  currentProvider: ProviderConfig;
  configService: ConfigService;
  onSelectCurrent: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ProviderConfig>) => void;
}
```

在 JSX 的 `<div className="flex gap-2 items-center">` 内,`<button>Add</button>` 之后插入:

```tsx
<TestConnectionButton providerId={currentProvider.id} configService={configService} />
```

在 `App` 组件里把 `configService` 传下去:

```tsx
<ProviderSection
  config={config}
  currentProvider={currentProvider}
  configService={configService}
  onSelectCurrent={...}
  onAdd={handleAddProvider}
  onDelete={handleDeleteProvider}
  onUpdate={handleUpdateProvider}
/>
```

- [ ] **Step 3: type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 无错。

- [ ] **Step 4: 手动验证**

加载扩展,Options 页面 Provider section 看到 "Test connection" 按钮。配错 key 点测试,看到 ✗ 错误信息; 配对 key 看到 ✓ 时间戳。

- [ ] **Step 5: Commit**

```bash
git add src/interface-adapters/options/App.tsx
git commit -m "feat(options): add Test connection button in Provider section"
```

---

## Phase 3 — 分层选择器

### Task 3.1: TDD GlobMatcher

**Files:**
- Create: `tests/unit/domain/GlobMatcher.test.ts`
- Create: `src/domain/services/GlobMatcher.ts`

- [ ] **Step 1: 写失败测试**

`tests/unit/domain/GlobMatcher.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { globToRegex, matchesUrl } from '@/domain/services/GlobMatcher';

describe('globToRegex', () => {
  it('matches literal string', () => {
    const re = globToRegex('hello');
    expect(re.test('hello')).toBe(true);
    expect(re.test('hell')).toBe(false);
  });

  it('* matches any chars including slash', () => {
    const re = globToRegex('*');
    expect(re.test('anything')).toBe(true);
    expect(re.test('a/b/c')).toBe(true);
    expect(re.test('')).toBe(true);
  });

  it('? matches single char', () => {
    const re = globToRegex('a?c');
    expect(re.test('abc')).toBe(true);
    expect(re.test('ac')).toBe(false);
  });

  it('escapes regex metachars', () => {
    const re = globToRegex('example.com/path');
    expect(re.test('example.com/path')).toBe(true);
    expect(re.test('exampleXcom/path')).toBe(false);
  });

  it('anchors to start and end', () => {
    const re = globToRegex('foo');
    expect(re.test('foo')).toBe(true);
    expect(re.test('foobar')).toBe(false);
    expect(re.test('afoo')).toBe(false);
  });
});

describe('matchesUrl', () => {
  const url = new URL('https://news.ycombinator.com/item?id=42');

  it('matches a wildcard pattern for entire URL', () => {
    expect(matchesUrl(['*'], url)).toBe(true);
  });

  it('matches host with wildcard path', () => {
    expect(matchesUrl(['*://news.ycombinator.com/*'], url)).toBe(true);
  });

  it('does not match wrong host', () => {
    expect(matchesUrl(['*://example.com/*'], url)).toBe(false);
  });

  it('matches any of multiple patterns', () => {
    expect(matchesUrl(['*://example.com/*', '*://news.ycombinator.com/*'], url)).toBe(true);
  });

  it('returns false for empty patterns', () => {
    expect(matchesUrl([], url)).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run tests/unit/domain/GlobMatcher.test.ts`
Expected: FAIL — module not found。

- [ ] **Step 3: 实现 GlobMatcher**

`src/domain/services/GlobMatcher.ts`:

```ts
/**
 * Convert a glob-style pattern into a RegExp. Supports:
 *   `*` — any sequence of characters (including `/`)
 *   `?` — any single character
 * All other characters (including regex metacharacters like `.`, `+`,
 * `$`) are escaped to match literally.
 *
 * The returned regex is anchored to the entire input (start + end).
 */
export function globToRegex(pattern: string): RegExp {
  let out = '^';
  for (const ch of pattern) {
    if (ch === '*') out += '.*';
    else if (ch === '?') out += '.';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  out += '$';
  return new RegExp(out);
}

/**
 * Return true if the URL's full href matches any of the glob patterns.
 * Empty pattern list returns false.
 */
export function matchesUrl(patterns: string[], url: URL): boolean {
  if (patterns.length === 0) return false;
  const href = url.href;
  return patterns.some((p) => globToRegex(p).test(href));
}
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run tests/unit/domain/GlobMatcher.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/services/GlobMatcher.ts tests/unit/domain/GlobMatcher.test.ts
git commit -m "feat(domain): add GlobMatcher for site rule URL patterns"
```

### Task 3.2: TDD SelectorService.mergeSiteRules

**Files:**
- Create: `tests/unit/domain/SelectorService.test.ts`
- Create: `src/domain/services/SelectorService.ts`

- [ ] **Step 1: 写失败测试**

`tests/unit/domain/SelectorService.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mergeSiteRules, applyDelta } from '@/domain/services/SelectorService';
import { DEFAULT_SELECTOR_CONFIG } from '@/shared/constants';
import type { SelectorConfig, SiteRule } from '@/shared/types';

const baseConfig: SelectorConfig = { ...DEFAULT_SELECTOR_CONFIG };

describe('applyDelta', () => {
  it('adds items', () => {
    expect(applyDelta(['a'], { add: ['b', 'c'] })).toEqual(['a', 'b', 'c']);
  });

  it('removes items', () => {
    expect(applyDelta(['a', 'b', 'c'], { remove: ['b'] })).toEqual(['a', 'c']);
  });

  it('combined add + remove', () => {
    expect(applyDelta(['a', 'b'], { add: ['c'], remove: ['a'] })).toEqual(['b', 'c']);
  });

  it('dedupes', () => {
    expect(applyDelta(['a'], { add: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('handles undefined delta', () => {
    expect(applyDelta(['a'], undefined)).toEqual(['a']);
  });
});

describe('mergeSiteRules', () => {
  const url = new URL('https://news.ycombinator.com/item?id=42');

  it('returns base unchanged when no rules apply', () => {
    const result = mergeSiteRules(baseConfig, [], url);
    expect(result).toEqual(baseConfig);
  });

  it('skips disabled rules', () => {
    const rule: SiteRule = {
      id: 'r1', matches: ['*://news.ycombinator.com/*'],
      selectors: { add: ['div.custom'] }, enabled: false,
    };
    const result = mergeSiteRules(baseConfig, [rule], url);
    expect(result.selectors).toEqual(baseConfig.selectors);
  });

  it('skips rules whose pattern does not match', () => {
    const rule: SiteRule = {
      id: 'r1', matches: ['*://example.com/*'],
      selectors: { add: ['div.custom'] }, enabled: true,
    };
    const result = mergeSiteRules(baseConfig, [rule], url);
    expect(result.selectors).toEqual(baseConfig.selectors);
  });

  it('applies matching rule selectors delta', () => {
    const rule: SiteRule = {
      id: 'r1', matches: ['*://news.ycombinator.com/*'],
      selectors: { add: ['div.custom'], remove: ['dd'] },
      enabled: true,
    };
    const result = mergeSiteRules(baseConfig, [rule], url);
    expect(result.selectors).toContain('div.custom');
    expect(result.selectors).not.toContain('dd');
  });

  it('applies excludeSelectors delta', () => {
    const rule: SiteRule = {
      id: 'r1', matches: ['*://news.ycombinator.com/*'],
      excludeSelectors: { add: ['.nav', '.footer'] },
      enabled: true,
    };
    const result = mergeSiteRules(baseConfig, [rule], url);
    expect(result.excludeSelectors).toEqual(['.nav', '.footer']);
  });

  it('chains multiple matching rules in order', () => {
    const r1: SiteRule = {
      id: 'r1', matches: ['*://news.ycombinator.com/*'],
      selectors: { add: ['x'] }, enabled: true,
    };
    const r2: SiteRule = {
      id: 'r2', matches: ['*://*/*'],
      selectors: { remove: ['x'], add: ['y'] }, enabled: true,
    };
    const result = mergeSiteRules(baseConfig, [r1, r2], url);
    expect(result.selectors).not.toContain('x');
    expect(result.selectors).toContain('y');
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run tests/unit/domain/SelectorService.test.ts`
Expected: FAIL — module not found。

- [ ] **Step 3: 实现 SelectorService**

`src/domain/services/SelectorService.ts`:

```ts
import type { SelectorConfig, SelectorDelta, SiteRule } from '@/shared/types';
import { matchesUrl } from './GlobMatcher';

/**
 * Apply a delta (add/remove) to a base list. Returns a new array; does
 * not mutate input. Dedupes by string equality.
 */
export function applyDelta(base: string[], delta: SelectorDelta | undefined): string[] {
  if (!delta) return [...base];
  const removed = new Set(delta.remove ?? []);
  const kept = base.filter((x) => !removed.has(x));
  const added = (delta.add ?? []).filter((x) => !kept.includes(x));
  return [...kept, ...added];
}

/**
 * Merge applicable site rules on top of the base SelectorConfig. A rule
 * is "applicable" when enabled=true and at least one of its match
 * patterns matches the URL. Rules are applied in array order.
 *
 * Only `selectors`, `excludeSelectors`, and `extraBlockSelectors` are
 * mergeable via deltas; other SelectorConfig fields are taken from the
 * base as-is (they're rarely site-specific).
 */
export function mergeSiteRules(
  base: SelectorConfig,
  rules: SiteRule[],
  url: URL
): SelectorConfig {
  const applicable = rules.filter((r) => r.enabled && matchesUrl(r.matches, url));
  if (applicable.length === 0) return base;

  return applicable.reduce<SelectorConfig>((acc, rule) => {
    const next: SelectorConfig = { ...acc };
    if (rule.selectors) next.selectors = applyDelta(acc.selectors, rule.selectors);
    if (rule.excludeSelectors) next.excludeSelectors = applyDelta(acc.excludeSelectors, rule.excludeSelectors);
    if (rule.extraBlockSelectors) next.extraBlockSelectors = applyDelta(acc.extraBlockSelectors, rule.extraBlockSelectors);
    return next;
  }, base);
}
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run tests/unit/domain/SelectorService.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/services/SelectorService.ts tests/unit/domain/SelectorService.test.ts
git commit -m "feat(domain): add SelectorService with mergeSiteRules + applyDelta"
```

### Task 3.3: 重写 DOMBlockExtractor 接受 SelectorConfig

**Files:**
- Modify: `src/infrastructure/extractors/DOMBlockExtractor.ts`
- Modify or create: `tests/unit/infrastructure/DOMBlockExtractor.test.ts` (likely already exists from MVP)

- [ ] **Step 1: 检查现有测试**

Run: `ls tests/unit/infrastructure/ | grep -i extractor`

如果存在 `DOMBlockExtractor.test.ts`,读取并理解现有断言。这些测试可能需要更新签名。

- [ ] **Step 2: 写新测试覆盖 layered selector 行为**

`tests/unit/infrastructure/DOMBlockExtractor.layered.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { DOMBlockExtractor } from '@/infrastructure/extractors/DOMBlockExtractor';
import type { SelectorConfig, SiteRule } from '@/shared/types';
import { DEFAULT_SELECTOR_CONFIG } from '@/shared/constants';

describe('DOMBlockExtractor layered selectors', () => {
  let dom: JSDOM;
  let doc: Document;

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>');
    doc = dom.window.document;
  });

  function makeConfig(overrides: Partial<SelectorConfig> = {}): SelectorConfig {
    return { ...DEFAULT_SELECTOR_CONFIG, ...overrides };
  }

  it('uses configured selectors', () => {
    const root = doc.getElementById('root')!;
    root.innerHTML = '<p>one</p><blockquote>two</blockquote>';
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(root, makeConfig(), [], new URL('https://x.com/'));
    expect(blocks).toHaveLength(2);
    expect(blocks[0].sourceText).toBe('one');
    expect(blocks[1].sourceText).toBe('two');
  });

  it('excludes elements matching excludeSelectors', () => {
    const root = doc.getElementById('root')!;
    root.innerHTML = '<p>keep</p><p class="nav">skip</p>';
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(
      root,
      makeConfig({ excludeSelectors: ['.nav'] }),
      [],
      new URL('https://x.com/')
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].sourceText).toBe('keep');
  });

  it('stayOriginalSelectors matches but skips translation', () => {
    const root = doc.getElementById('root')!;
    root.innerHTML = '<p>translate me</p><pre>code stays</pre>';
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(root, makeConfig(), [], new URL('https://x.com/'));
    expect(blocks.map((b) => b.sourceText)).toEqual(['translate me']);
  });

  it('extraBlockSelectors adds additional selectors', () => {
    const root = doc.getElementById('root')!;
    root.innerHTML = '<p>p</p><div class="card">card</div>';
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(
      root,
      makeConfig({ extraBlockSelectors: ['.card'] }),
      [],
      new URL('https://x.com/')
    );
    expect(blocks.map((b) => b.sourceText).sort()).toEqual(['card', 'p']);
  });

  it('applies matching site rule', () => {
    const root = doc.getElementById('root')!;
    root.innerHTML = '<p>p</p><div class="custom">custom</div>';
    const rule: SiteRule = {
      id: 'r1',
      matches: ['*://example.com/*'],
      selectors: { add: ['.custom'] },
      enabled: true,
    };
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(
      root,
      makeConfig(),
      [rule],
      new URL('https://example.com/page')
    );
    expect(blocks.map((b) => b.sourceText).sort()).toEqual(['custom', 'p']);
  });

  it('filters by blockMinTextCount', () => {
    const root = doc.getElementById('root')!;
    root.innerHTML = '<p>ab</p><p>long enough</p>';
    const extractor = new DOMBlockExtractor();
    const blocks = extractor.extractFromElement(
      root,
      makeConfig({ blockMinTextCount: 5 }),
      [],
      new URL('https://x.com/')
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].sourceText).toBe('long enough');
  });
});
```

- [ ] **Step 3: 跑测试,确认失败**

Run: `npx vitest run tests/unit/infrastructure/DOMBlockExtractor.layered.test.ts`
Expected: FAIL — `extractFromElement` 当前只接受 root,不接受 SelectorConfig。

- [ ] **Step 4: 重写 DOMBlockExtractor**

替换 `src/infrastructure/extractors/DOMBlockExtractor.ts` 全部内容:

```ts
import { ParagraphBlock } from "@/domain/entities/ParagraphBlock";
import type { SelectorConfig, SiteRule } from "@/shared/types";
import { mergeSiteRules } from "@/domain/services/SelectorService";

/**
 * Extract ParagraphBlocks from a DOM subtree using a layered
 * SelectorConfig (with optional site-rule deltas applied for the given
 * URL).
 *
 * Algorithm:
 *   1. Merge site rules into the base config.
 *   2. Query the union of `selectors` + `extraBlockSelectors`.
 *   3. Filter out matches in `excludeSelectors` / `excludeTags` /
 *      `stayOriginalSelectors` / `stayOriginalTags`.
 *   4. Apply `blockMinTextCount` filter.
 *   5. Dedupe: skip any element whose ancestor is also in the candidate
 *      set (the ancestor's text already covers this element).
 *   6. Emit one ParagraphBlock per remaining element.
 */
export class DOMBlockExtractor {
  extractFromElement(
    root: Element,
    baseConfig: SelectorConfig,
    siteRules: SiteRule[],
    url: URL
  ): ParagraphBlock[] {
    const config = mergeSiteRules(baseConfig, siteRules, url);

    const allSelector = [...config.selectors, ...config.extraBlockSelectors].join(', ');
    if (!allSelector) return [];

    const candidates = Array.from(root.querySelectorAll(allSelector));
    const filtered = candidates.filter((el) => this.shouldInclude(el, config));
    const deduped = this.dedupeByAncestor(filtered);

    const blocks: ParagraphBlock[] = [];
    for (const el of deduped) {
      const text = this.getVisibleText(el);
      if (text.length === 0) continue;
      if (text.length < config.blockMinTextCount) continue;
      if (this.wordCount(text) < config.paragraphMinWordCount) continue;
      const block = new ParagraphBlock({
        sourceText: text,
        sourceLanguage: "auto",
        domReference: this.generateDomReference(el),
      });
      el.setAttribute("data-qrt-block-id", block.id);
      blocks.push(block);
    }
    return blocks;
  }

  private shouldInclude(el: Element, config: SelectorConfig): boolean {
    const tag = el.tagName.toLowerCase();

    if (config.excludeTags.includes(tag)) return false;
    if (config.stayOriginalTags.includes(tag)) return false;
    for (const sel of config.excludeSelectors) {
      if (el.matches(sel)) return false;
    }
    for (const sel of config.stayOriginalSelectors) {
      if (el.matches(sel)) return false;
    }
    return true;
  }

  private dedupeByAncestor(els: Element[]): Element[] {
    const set = new Set(els);
    return els.filter((el) => {
      let ancestor = el.parentElement;
      while (ancestor) {
        if (set.has(ancestor)) return false;
        ancestor = ancestor.parentElement;
      }
      return true;
    });
  }

  private getVisibleText(el: Element): string {
    return (el.textContent ?? "").trim().replace(/\s+/g, " ");
  }

  private wordCount(text: string): number {
    // Whitespace-split. For CJK text without spaces this returns 1 for
    // any non-empty string, which is the right "skip very short" signal
    // for both western and CJK content.
    return text.split(/\s+/).filter(Boolean).length;
  }

  private generateDomReference(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const index = Array.from(el.parentElement?.children ?? []).indexOf(el);
    return `${tag}-${index}`;
  }
}
```

- [ ] **Step 5: 更新现有 MVP 测试**

Run: `npm run test -- --run 2>&1 | grep -E 'FAIL|✗' | head -20`

如果有失败,通常是 MVP 的 DOMBlockExtractor 测试调用 `extractFromElement(root)` 而非 `extractFromElement(root, config, [], url)`。把这些测试的调用改为:

```ts
extractor.extractFromElement(root, DEFAULT_SELECTOR_CONFIG, [], new URL('https://example.com/'))
```

- [ ] **Step 6: 跑测试,确认通过**

Run: `npm run test -- --run`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/extractors/DOMBlockExtractor.ts \
        tests/unit/infrastructure/DOMBlockExtractor.layered.test.ts
# plus any updated existing tests
git commit -m "feat(extractor): rewrite DOMBlockExtractor to accept layered SelectorConfig"
```

### Task 3.4: 把 SelectorConfig 接到 content/index.ts

**Files:**
- Modify: `entrypoints/content.ts`

- [ ] **Step 1: 修改 main() 调用**

在 `entrypoints/content.ts` 的 `main()` 里,`handleTrigger` 函数内部把 extractor 调用改成新签名:

```ts
async function handleTrigger(opts: {
  selection?: string | null;
  hoverBlockId?: string | null;
}): Promise<void> {
  const blocks = extractor.extractFromElement(
    document.body,
    config.selectorConfig,
    config.siteRules,
    new URL(window.location.href)
  );
  // ...rest unchanged...
}
```

但 `config` 是模块顶层 try/catch 里读到的;需要把它提到外层 `let config` 而非内层。

修改 config 读取块,把读到的 `config` 提到外层:

```ts
let config: AppConfig | null = null;
try {
  const configService = new ConfigService(new BrowserStorageConfigRepo());
  config = await configService.getConfig();
} catch (err) {
  console.error("[qrt] failed to load config; using defaults:", err);
}

const hotkey = config?.hotkey ?? 'Alt+T';
const selectionTriggerEnabled = config?.selectionTriggerEnabled ?? true;
const hoverButtonEnabled = config?.hoverButtonEnabled ?? true;
const translationTheme = config?.translationTheme ?? 'inherit';
setRendererTheme(translationTheme);
```

把 `handleTrigger` 内部访问 `config.selectorConfig` 和 `config.siteRules`,在 config 为 null 时回退到 `DEFAULT_SELECTOR_CONFIG` 和 `[]`:

```ts
import { DEFAULT_SELECTOR_CONFIG } from "@/shared/constants";

async function handleTrigger(opts: { ... }): Promise<void> {
  const blocks = extractor.extractFromElement(
    document.body,
    config?.selectorConfig ?? DEFAULT_SELECTOR_CONFIG,
    config?.siteRules ?? [],
    new URL(window.location.href)
  );
  // ...
}
```

- [ ] **Step 2: type check**

Run: `npx tsc --noEmit`
Expected: 无错。

- [ ] **Step 3: Commit**

```bash
git add entrypoints/content.ts
git commit -m "feat(content): pass SelectorConfig and siteRules to extractor"
```

### Task 3.5: 创建 SelectorSection 组件

**Files:**
- Create: `src/interface-adapters/options/SelectorSection.tsx`

- [ ] **Step 1: 实现 SelectorSection**

`src/interface-adapters/options/SelectorSection.tsx`:

```tsx
import type { SelectorConfig } from "@/shared/types";
import { LabeledInput, LabeledTextarea } from "./components";

interface SelectorSectionProps {
  config: SelectorConfig;
  onChange: (next: SelectorConfig) => void;
}

export function SelectorSection({ config, onChange }: SelectorSectionProps) {
  return (
    <section className="bg-white p-6 shadow-sm mb-6">
      <h2 className="text-xl mb-4">Selectors</h2>

      <LabeledTextarea
        label="Default selectors (one per line)"
        value={config.selectors.join('\n')}
        onChange={(v) => onChange({ ...config, selectors: splitLines(v) })}
      />
      <LabeledTextarea
        label="Exclude selectors (CSS, one per line)"
        value={config.excludeSelectors.join('\n')}
        onChange={(v) => onChange({ ...config, excludeSelectors: splitLines(v) })}
      />
      <LabeledInput
        label="Exclude tags (comma-separated)"
        value={config.excludeTags.join(',')}
        onChange={(v) => onChange({ ...config, excludeTags: splitCsv(v) })}
      />
      <LabeledTextarea
        label="Stay-original selectors (match but don't translate)"
        value={config.stayOriginalSelectors.join('\n')}
        onChange={(v) => onChange({ ...config, stayOriginalSelectors: splitLines(v) })}
      />
      <LabeledInput
        label="Stay-original tags (comma-separated)"
        value={config.stayOriginalTags.join(',')}
        onChange={(v) => onChange({ ...config, stayOriginalTags: splitCsv(v) })}
      />
      <LabeledTextarea
        label="Extra block selectors"
        value={config.extraBlockSelectors.join('\n')}
        onChange={(v) => onChange({ ...config, extraBlockSelectors: splitLines(v) })}
      />
      <LabeledInput
        label="Min text count"
        type="number"
        value={String(config.blockMinTextCount)}
        onChange={(v) => onChange({ ...config, blockMinTextCount: Number(v) || 1 })}
      />
      <LabeledInput
        label="Min word count"
        type="number"
        value={String(config.paragraphMinWordCount)}
        onChange={(v) => onChange({ ...config, paragraphMinWordCount: Number(v) || 1 })}
      />
    </section>
  );
}

function splitLines(v: string): string[] {
  return v.split('\n').map((s) => s.trim()).filter(Boolean);
}

function splitCsv(v: string): string[] {
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}
```

- [ ] **Step 2: type check**

Run: `npx tsc --noEmit`
Expected: 无错。

- [ ] **Step 3: Commit**

```bash
git add src/interface-adapters/options/SelectorSection.tsx
git commit -m "feat(options): add SelectorSection for layered selector editing"
```

### Task 3.6: 创建 SiteRulesSection 组件

**Files:**
- Create: `src/interface-adapters/options/SiteRulesSection.tsx`

- [ ] **Step 1: 实现 SiteRulesSection**

`src/interface-adapters/options/SiteRulesSection.tsx`:

```tsx
import { useState } from "react";
import type { SiteRule } from "@/shared/types";
import { LabeledInput, LabeledTextarea } from "./components";

interface SiteRulesSectionProps {
  rules: SiteRule[];
  onChange: (next: SiteRule[]) => void;
}

export function SiteRulesSection({ rules, onChange }: SiteRulesSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const update = (id: string, patch: Partial<SiteRule>) => {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const add = () => {
    const newRule: SiteRule = {
      id: `rule-${Date.now()}`,
      matches: [],
      enabled: true,
    };
    onChange([...rules, newRule]);
    setExpandedId(newRule.id);
  };

  const remove = (id: string) => {
    onChange(rules.filter((r) => r.id !== id));
  };

  return (
    <section className="bg-white p-6 shadow-sm mb-6">
      <h2 className="text-xl mb-4">Site rules</h2>
      <p className="text-sm text-sequoia-grey mb-4">
        Override selectors for specific sites. Patterns use glob (`*` matches
        any chars including `/`). Example: `*://news.ycombinator.com/*`.
      </p>

      {rules.map((rule) => (
        <div key={rule.id} className="border border-sequoia-grey p-3 mb-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(e) => update(rule.id, { enabled: e.target.checked })}
            />
            <input
              type="text"
              className="flex-1 border border-sequoia-grey p-1 text-sm"
              placeholder="*://example.com/*"
              value={rule.matches.join(', ')}
              onChange={(e) =>
                update(rule.id, {
                  matches: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                })
              }
            />
            <button
              type="button"
              className="text-xs underline"
              onClick={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
            >
              {expandedId === rule.id ? 'Hide' : 'Edit'}
            </button>
            <button
              type="button"
              className="text-xs underline text-sequoia-red"
              onClick={() => remove(rule.id)}
            >
              Delete
            </button>
          </div>

          {expandedId === rule.id && (
            <div className="mt-3 pt-3 border-t border-sequoia-grey">
              <LabeledTextarea
                label="Add to selectors (one per line)"
                value={rule.selectors?.add?.join('\n') ?? ''}
                onChange={(v) =>
                  update(rule.id, {
                    selectors: {
                      add: v.split('\n').map((s) => s.trim()).filter(Boolean),
                      remove: rule.selectors?.remove,
                    },
                  })
                }
              />
              <LabeledTextarea
                label="Remove from selectors (one per line)"
                value={rule.selectors?.remove?.join('\n') ?? ''}
                onChange={(v) =>
                  update(rule.id, {
                    selectors: {
                      add: rule.selectors?.add,
                      remove: v.split('\n').map((s) => s.trim()).filter(Boolean),
                    },
                  })
                }
              />
              <LabeledTextarea
                label="Add to excludeSelectors"
                value={rule.excludeSelectors?.add?.join('\n') ?? ''}
                onChange={(v) =>
                  update(rule.id, {
                    excludeSelectors: {
                      add: v.split('\n').map((s) => s.trim()).filter(Boolean),
                      remove: rule.excludeSelectors?.remove,
                    },
                  })
                }
              />
              <LabeledTextarea
                label="Add to extraBlockSelectors"
                value={rule.extraBlockSelectors?.add?.join('\n') ?? ''}
                onChange={(v) =>
                  update(rule.id, {
                    extraBlockSelectors: {
                      add: v.split('\n').map((s) => s.trim()).filter(Boolean),
                      remove: rule.extraBlockSelectors?.remove,
                    },
                  })
                }
              />
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        className="text-sm underline text-sequoia-green"
        onClick={add}
      >
        + Add rule
      </button>
    </section>
  );
}
```

- [ ] **Step 2: type check**

Run: `npx tsc --noEmit`
Expected: 无错。

- [ ] **Step 3: Commit**

```bash
git add src/interface-adapters/options/SiteRulesSection.tsx
git commit -m "feat(options): add SiteRulesSection for per-site selector overrides"
```

### Task 3.7: 接入 Options App

**Files:**
- Modify: `src/interface-adapters/options/App.tsx`

- [ ] **Step 1: import + 接入**

在 `src/interface-adapters/options/App.tsx` 顶部加:

```ts
import { SelectorSection } from "./SelectorSection";
import { SiteRulesSection } from "./SiteRulesSection";
```

在 JSX 里,在 `<AppearanceSection ... />` 之后插入:

```tsx
<SelectorSection
  config={config.selectorConfig}
  onChange={(next) => save({ ...config, selectorConfig: next })}
/>
<SiteRulesSection
  rules={config.siteRules}
  onChange={(next) => save({ ...config, siteRules: next })}
/>
```

- [ ] **Step 2: type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 无错。

- [ ] **Step 3: 手动验证**

加载扩展,Options 看到 Selectors 和 Site rules sections。编辑默认 selectors(去掉 `li`),reload,翻译页面 —— 列表项不再被翻译。

- [ ] **Step 4: Commit**

```bash
git add src/interface-adapters/options/App.tsx
git commit -m "feat(options): wire SelectorSection and SiteRulesSection"
```

---

## Phase 4 — 浮动球 + 贴边面板

### Task 4.1: TDD FloatingBallController

**Files:**
- Create: `tests/unit/infrastructure/FloatingBallController.test.ts`
- Create: `src/infrastructure/floating-ball/FloatingBallController.ts`

- [ ] **Step 1: 写失败测试**

`tests/unit/infrastructure/FloatingBallController.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FloatingBallController } from '@/infrastructure/floating-ball/FloatingBallController';

const VIEWPORT = { w: 1280, h: 800 };

describe('FloatingBallController', () => {
  const controller = new FloatingBallController();

  describe('onDrag', () => {
    it('updates position by delta', () => {
      const next = controller.onDrag({ x: 100, y: 200 }, { dx: 10, dy: -5 });
      expect(next).toEqual({ x: 110, y: 195 });
    });

    it('clamps to viewport bounds (with margin)', () => {
      const next = controller.onDrag({ x: 1270, y: 790 }, { dx: 100, dy: 100 });
      // Ball is ~40px; allow it to stay within viewport.
      expect(next.x).toBeLessThanOrEqual(VIEWPORT.w);
      expect(next.y).toBeLessThanOrEqual(VIEWPORT.h);
    });
  });

  describe('computeRelease', () => {
    it('snaps to right edge when released near right', () => {
      const pos = controller.computeRelease({ x: 1260, y: 400 }, VIEWPORT);
      expect(pos.mode).toBe('docked');
      if (pos.mode === 'docked') {
        expect(pos.edge).toBe('right');
      }
    });

    it('snaps to bottom edge when released near bottom', () => {
      const pos = controller.computeRelease({ x: 640, y: 790 }, VIEWPORT);
      expect(pos.mode).toBe('docked');
      if (pos.mode === 'docked') {
        expect(pos.edge).toBe('bottom');
      }
    });

    it('stays free when released in the middle', () => {
      const pos = controller.computeRelease({ x: 640, y: 400 }, VIEWPORT);
      expect(pos.mode).toBe('free');
      if (pos.mode === 'free') {
        expect(pos.x).toBe(640);
        expect(pos.y).toBe(400);
      }
    });
  });

  describe('toCss', () => {
    it('docked bottom positions with bottom + right/left', () => {
      const css = controller.toCss({ mode: 'docked', edge: 'bottom', offsetAlong: 60 });
      expect(css.bottom).toBeDefined();
    });

    it('docked right positions with right + top/bottom', () => {
      const css = controller.toCss({ mode: 'docked', edge: 'right', offsetAlong: 60 });
      expect(css.right).toBeDefined();
    });

    it('free positions with top + left', () => {
      const css = controller.toCss({ mode: 'free', x: 100, y: 200 });
      expect(css.top).toBe('200px');
      expect(css.left).toBe('100px');
    });
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run tests/unit/infrastructure/FloatingBallController.test.ts`
Expected: FAIL — module not found。

- [ ] **Step 3: 实现 FloatingBallController**

`src/infrastructure/floating-ball/FloatingBallController.ts`:

```ts
import type { BallPosition, BallEdge } from '@/shared/types';

const SNAP_THRESHOLD_PX = 80;
const BALL_SIZE_PX = 40;

/**
 * Pure drag/dock state machine. No DOM access; takes viewport dims and
 * pointer coordinates, returns new positions. Tested in jsdom without
 * needing real layout.
 */
export class FloatingBallController {
  /**
   * Update a free position by a pointer delta. Clamps to viewport bounds.
   * The current position is always `{x, y}` (free mode) during an active
   * drag — docking only happens on release.
   */
  onDrag(
    current: { x: number; y: number },
    delta: { dx: number; dy: number },
    viewport: { w: number; h: number } = { w: window.innerWidth, h: window.innerHeight }
  ): { x: number; y: number } {
    const x = clamp(current.x + delta.dx, 0, viewport.w - BALL_SIZE_PX);
    const y = clamp(current.y + delta.dy, 0, viewport.h - BALL_SIZE_PX);
    return { x, y };
  }

  /**
   * Decide whether to dock to an edge or stay free, based on proximity
   * to viewport edges. Within SNAP_THRESHOLD_PX of any edge → dock to
   * that edge. Otherwise stay free.
   *
   * If two edges are equally close (corner), prefer horizontal (left/right).
   */
  computeRelease(
    releasePoint: { x: number; y: number },
    viewport: { w: number; h: number }
  ): BallPosition {
    const { x, y } = releasePoint;
    const nearLeft = x <= SNAP_THRESHOLD_PX;
    const nearRight = x >= viewport.w - SNAP_THRESHOLD_PX;
    const nearTop = y <= SNAP_THRESHOLD_PX;
    const nearBottom = y >= viewport.h - SNAP_THRESHOLD_PX;

    if (nearLeft) return { mode: 'docked', edge: 'left', offsetAlong: y };
    if (nearRight) return { mode: 'docked', edge: 'right', offsetAlong: y };
    if (nearTop) return { mode: 'docked', edge: 'top', offsetAlong: x };
    if (nearBottom) return { mode: 'docked', edge: 'bottom', offsetAlong: x };

    return { mode: 'free', x, y };
  }

  /**
   * Convert a BallPosition to CSS properties for the ball element.
   * `offsetAlong` is the position along the edge (e.g., for `bottom`
   * edge, it's the X offset from the left of the viewport).
   */
  toCss(pos: BallPosition): {
    top?: string; bottom?: string; left?: string; right?: string;
  } {
    if (pos.mode === 'free') {
      return { top: `${pos.y}px`, left: `${pos.x}px` };
    }
    const off = `${pos.offsetAlong}px`;
    switch (pos.edge) {
      case 'top': return { top: '0px', left: off };
      case 'bottom': return { bottom: '0px', left: off };
      case 'left': return { left: '0px', top: off };
      case 'right': return { right: '0px', top: off };
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run tests/unit/infrastructure/FloatingBallController.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/floating-ball/FloatingBallController.ts \
        tests/unit/infrastructure/FloatingBallController.test.ts
git commit -m "feat(floating-ball): add FloatingBallController drag/dock state machine"
```

### Task 4.2: 创建 floating-panel.css

**Files:**
- Create: `src/interface-adapters/floating-panel/floating-panel.css`

- [ ] **Step 1: 写 CSS 入口**

`src/interface-adapters/floating-panel/floating-panel.css`:

```css
@import "tailwindcss";

@theme {
  --color-sequoia-green: #247e5a;
  --color-sequoia-dark-green: #1a5e44;
  --color-sequoia-grey: #928c86;
  --color-sequoia-red: #c0392b;
  --color-sequoia-button: #406a8a;
}
```

**Note:** Tailwind v4 with `?inline` query will compile this into a CSS string at build time. The `@theme` directive defines Sequoia color tokens so utility classes like `bg-sequoia-green` resolve inside the shadow root.

- [ ] **Step 2: 验证 Vite 能识别**

(此 task 不写测试,CSS 是配置。验证在 Task 4.4 mount 时一并发生。)

- [ ] **Step 3: Commit**

```bash
git add src/interface-adapters/floating-panel/floating-panel.css
git commit -m "feat(floating-panel): add Tailwind v4 scoped CSS entry"
```

### Task 4.3: 创建 floating-panel React 组件

**Files:**
- Create: `src/interface-adapters/floating-panel/App.tsx`
- Create: `src/interface-adapters/floating-panel/components/HoverToggle.tsx`
- Create: `src/interface-adapters/floating-panel/components/ProviderQuickSelect.tsx`
- Create: `src/interface-adapters/floating-panel/components/ThemeSelect.tsx`
- Create: `src/interface-adapters/floating-panel/components/TargetLanguageInput.tsx`
- Create: `src/interface-adapters/floating-panel/components/TranslatePageButton.tsx`

- [ ] **Step 1: 实现 5 个子组件**

每个组件复用 `ConfigService` 直接读写 storage(同 Options 模式)。

`src/interface-adapters/floating-panel/components/HoverToggle.tsx`:

```tsx
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
```

`src/interface-adapters/floating-panel/components/ProviderQuickSelect.tsx`:

```tsx
import { useEffect, useState } from "react";
import { ConfigService } from "@/application/ConfigService";
import { BrowserStorageConfigRepo } from "@/infrastructure/repositories/BrowserStorageConfigRepo";
import type { AppConfig, ProviderTestResult } from "@/shared/types";

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
```

**Note:** `ProviderTestResult` is exported from `@/application/ConfigService`. Update import accordingly:

```ts
import type { ProviderTestResult } from "@/application/ConfigService";
```

`src/interface-adapters/floating-panel/components/ThemeSelect.tsx`:

```tsx
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
```

`src/interface-adapters/floating-panel/components/TargetLanguageInput.tsx`:

```tsx
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
```

`src/interface-adapters/floating-panel/components/TranslatePageButton.tsx`:

```tsx
export function TranslatePageButton() {
  const onClick = () => {
    // Dispatch a CustomEvent that triggers.ts listens for. Same JS
    // context as the content script (both are inside the extension).
    window.dispatchEvent(new CustomEvent('qrt:translate-page'));
  };

  return (
    <button
      type="button"
      className="w-full bg-sequoia-green text-white py-2 text-sm hover:bg-sequoia-dark-green"
      onClick={onClick}
    >
      Translate This Page
    </button>
  );
}
```

- [ ] **Step 2: 实现 App 根组件**

`src/interface-adapters/floating-panel/App.tsx`:

```tsx
import { HoverToggle } from "./components/HoverToggle";
import { ProviderQuickSelect } from "./components/ProviderQuickSelect";
import { ThemeSelect } from "./components/ThemeSelect";
import { TargetLanguageInput } from "./components/TargetLanguageInput";
import { TranslatePageButton } from "./components/TranslatePageButton";

export default function FloatingPanelApp() {
  return (
    <div className="bg-white shadow-lg p-4 w-64">
      <h2 className="text-sm font-normal mb-3 text-sequoia-grey">
        Quick Read Translator
      </h2>
      <div className="mb-3">
        <HoverToggle />
      </div>
      <ProviderQuickSelect />
      <ThemeSelect />
      <TargetLanguageInput />
      <TranslatePageButton />
    </div>
  );
}
```

- [ ] **Step 3: type check**

Run: `npx tsc --noEmit`
Expected: 无错。

- [ ] **Step 4: Commit**

```bash
git add src/interface-adapters/floating-panel/
git commit -m "feat(floating-panel): React app + 5 child components"
```

### Task 4.4: 实现 FloatingBallHost

**Files:**
- Create: `src/infrastructure/floating-ball/FloatingBallHost.tsx`

- [ ] **Step 1: 实现 FloatingBallHost**

`src/infrastructure/floating-ball/FloatingBallHost.tsx`:

```ts
import { createRoot, type Root } from "react-dom/client";
import { browser } from "wxt/browser";
import App from "@/interface-adapters/floating-panel/App";
import { FloatingBallController } from "./FloatingBallController";
import type { BallPosition } from "@/shared/types";
// Vite ?inline query: imports the compiled CSS as a string.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — Vite provides the type via css modules
import panelCss from "@/interface-adapters/floating-panel/floating-panel.css?inline";

const HOST_ID = "qrt-floating-root";
const BALL_ID = "qrt-floating-ball";
const PANEL_ID = "qrt-floating-panel";
const PANEL_MOUNT_ID = "qrt-panel-mount";
const STORAGE_KEY_PREFIX = "floatingBall:";

/**
 * Host-side orchestrator for the floating ball + docked panel.
 * Responsibilities:
 *   1. Create a host-facing <div> with z-index max + pointer-events: none.
 *   2. Attach an open shadow root; inject compiled Tailwind CSS.
 *   3. Render the ball + panel skeleton; mount React into panel.
 *   4. Wire pointer events to FloatingBallController.
 *   5. Persist position to chrome.storage.local keyed by hostname.
 *   6. Watch for host page removing our root (SPA navigations) and reattach.
 */
export class FloatingBallHost {
  private controller = new FloatingBallController();
  private root: Root | null = null;
  private hostEl: HTMLDivElement | null = null;
  private ballEl: HTMLDivElement | null = null;
  private panelEl: HTMLDivElement | null = null;
  private position: BallPosition = {
    mode: 'docked', edge: 'bottom',
    // Will be overwritten by loadPosition() once attached.
    offsetAlong: typeof window !== 'undefined' ? window.innerWidth - 60 : 0,
  };
  private dragState:
    | { kind: 'idle' }
    | { kind: 'dragging'; startX: number; startY: number; currentX: number; currentY: number } =
    { kind: 'idle' };
  private observer: MutationObserver | null = null;

  async attach(): Promise<void> {
    if (document.getElementById(HOST_ID)) return;

    this.hostEl = document.createElement('div');
    this.hostEl.id = HOST_ID;
    this.hostEl.style.cssText =
      'position:fixed; z-index:2147483647; inset:0; pointer-events:none;';
    document.documentElement.appendChild(this.hostEl);

    const shadow = this.hostEl.attachShadow({ mode: 'open' });

    // Inject compiled CSS
    const styleEl = document.createElement('style');
    styleEl.textContent = panelCss;
    shadow.appendChild(styleEl);

    // Ball
    this.ballEl = document.createElement('div');
    this.ballEl.id = BALL_ID;
    this.ballEl.style.cssText =
      'position:fixed; width:40px; height:40px; border-radius:50%; ' +
      'background:#247e5a; color:white; display:flex; align-items:center; ' +
      'justify-content:center; cursor:grab; font-size:14px; ' +
      'pointer-events:auto; user-select:none; box-shadow:0 2px 8px rgba(0,0,0,0.2);';
    this.ballEl.textContent = '译';
    shadow.appendChild(this.ballEl);

    // Panel (hidden initially)
    this.panelEl = document.createElement('div');
    this.panelEl.id = PANEL_ID;
    this.panelEl.style.cssText =
      'position:fixed; pointer-events:auto; display:none; z-index:2147483647;';
    const mount = document.createElement('div');
    mount.id = PANEL_MOUNT_ID;
    this.panelEl.appendChild(mount);
    shadow.appendChild(this.panelEl);

    // Mount React
    this.root = createRoot(mount);
    this.root.render(<App />);

    // Load persisted position
    await this.loadPosition();
    this.applyPositionToDom();

    // Wire pointer events
    this.wireBallEvents();

    // Watch for host removal
    this.observer = new MutationObserver(() => {
      if (!document.getElementById(HOST_ID)) {
        this.attach().catch((e) => console.error('[qrt] reattach failed:', e));
      }
    });
    this.observer.observe(document.documentElement, { childList: true });
  }

  detach(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.root?.unmount();
    this.root = null;
    this.hostEl?.remove();
    this.hostEl = null;
    this.ballEl = null;
    this.panelEl = null;
  }

  togglePanel(): void {
    if (!this.panelEl) return;
    const isHidden = this.panelEl.style.display === 'none';
    this.panelEl.style.display = isHidden ? 'block' : 'none';
    if (isHidden && this.ballEl) {
      // Position panel above the ball (rough heuristic; can be improved).
      const ballRect = this.ballEl.getBoundingClientRect();
      this.panelEl.style.right = `${window.innerWidth - ballRect.right}px`;
      this.panelEl.style.bottom = `${window.innerHeight - ballRect.top + 8}px`;
    }
  }

  private wireBallEvents(): void {
    if (!this.ballEl) return;
    const ball = this.ballEl;

    ball.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ball.setPointerCapture(e.pointerId);
      this.dragState = {
        kind: 'dragging',
        startX: e.clientX, startY: e.clientY,
        currentX: e.clientX, currentY: e.clientY,
      };
    });

    ball.addEventListener('pointermove', (e) => {
      if (this.dragState.kind !== 'dragging') return;
      this.dragState.currentX = e.clientX;
      this.dragState.currentY = e.clientY;
      // Apply live drag (visual feedback only; commit on release)
      if (this.ballEl) {
        this.ballEl.style.left = `${e.clientX - 20}px`;
        this.ballEl.style.top = `${e.clientY - 20}px`;
        this.ballEl.style.right = 'auto';
        this.ballEl.style.bottom = 'auto';
      }
    });

    ball.addEventListener('pointerup', async (e) => {
      if (this.dragState.kind !== 'dragging') return;
      const start = { x: this.dragState.startX, y: this.dragState.startY };
      const end = { x: this.dragState.currentX, y: this.dragState.currentY };
      const moved = Math.hypot(end.x - start.x, end.y - start.y);
      this.dragState = { kind: 'idle' };

      if (moved < 3) {
        // Treat as click
        this.togglePanel();
        return;
      }

      this.position = this.controller.computeRelease(end, {
        w: window.innerWidth, h: window.innerHeight,
      });
      this.applyPositionToDom();
      await this.savePosition();
    });
  }

  private applyPositionToDom(): void {
    if (!this.ballEl) return;
    const css = this.controller.toCss(this.position);
    this.ballEl.style.top = css.top ?? '';
    this.ballEl.style.bottom = css.bottom ?? '';
    this.ballEl.style.left = css.left ?? '';
    this.ballEl.style.right = css.right ?? '';
  }

  private async loadPosition(): Promise<void> {
    try {
      const key = `${STORAGE_KEY_PREFIX}${location.hostname}`;
      const data = await browser.storage.local.get(key);
      const stored = data[key] as BallPosition | undefined;
      if (stored) this.position = stored;
    } catch (e) {
      console.error('[qrt] load position failed:', e);
    }
  }

  private async savePosition(): Promise<void> {
    try {
      const key = `${STORAGE_KEY_PREFIX}${location.hostname}`;
      await browser.storage.local.set({ [key]: this.position });
    } catch (e) {
      console.error('[qrt] save position failed:', e);
    }
  }
}
```

- [ ] **Step 2: type check**

Run: `npx tsc --noEmit`
Expected: 可能需要为 `?inline` CSS import 加一个 type declaration。在 `src/types.d.ts` 加:

```ts
declare module '*.css?inline' {
  const css: string;
  export default css;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/infrastructure/floating-ball/FloatingBallHost.tsx src/types.d.ts
git commit -m "feat(floating-ball): FloatingBallHost with shadow DOM + React mount"
```

### Task 4.5: 把 FloatingBallHost 接到 content entry

**Files:**
- Modify: `entrypoints/content.ts`

- [ ] **Step 1: 注入 FloatingBallHost**

在 `entrypoints/content.ts` 顶部 import:

```ts
import { FloatingBallHost } from "@/infrastructure/floating-ball/FloatingBallHost";
```

在 `main()` 函数末尾(config 读完后),加:

```ts
if (config?.floatingBallEnabled !== false) {
  const ballHost = new FloatingBallHost();
  ballHost.attach().catch((err) =>
    console.error('[qrt] floating ball attach failed:', err)
  );
}
```

(`floatingBallEnabled` 默认 true,所以只在用户显式 disable 时不注入。)

- [ ] **Step 2: type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 无错,build 成功。打开 `.output/chrome-mv3/` 验证产物里有浮动球相关 JS。

- [ ] **Step 3: 手动验证**

加载扩展,打开任意网页,看到右下角绿色 "译" 球。点击展开面板,看到 5 个控件。拖动球到屏幕中间,松手后球留在那里。Reload 页面,球还在中间。

- [ ] **Step 4: Commit**

```bash
git add entrypoints/content.ts
git commit -m "feat(content): inject FloatingBallHost on page load"
```

### Task 4.6: 监听 qrt:translate-page 事件

**Files:**
- Modify: `entrypoints/content.ts`

- [ ] **Step 1: 加事件监听**

在 `entrypoints/content.ts` 的 `main()` 里,在已有的 `browser.runtime.onMessage.addListener(...)` 之后,加:

```ts
window.addEventListener('qrt:translate-page', () => {
  void handleTrigger({});
});
```

- [ ] **Step 2: 手动验证**

打开面板,点 "Translate This Page",看到页面被翻译。

- [ ] **Step 3: Commit**

```bash
git add entrypoints/content.ts
git commit -m "feat(content): listen for qrt:translate-page event from floating panel"
```

### Task 4.7: Options 加 floatingBallEnabled toggle

**Files:**
- Modify: `src/interface-adapters/options/App.tsx`

- [ ] **Step 1: 在 TriggersSection 加 toggle**

修改 `TriggersSection` 函数和 props,加 `floatingBallEnabled` 和 `onFloatingBallToggle`:

```ts
interface TriggersSectionProps {
  config: AppConfig;
  onHotkeyChange: (v: string) => void;
  onHoverButtonToggle: (v: boolean) => void;
  onSelectionTriggerToggle: (v: boolean) => void;
  onFloatingBallToggle: (v: boolean) => void;
}

function TriggersSection({
  config, onHotkeyChange, onHoverButtonToggle,
  onSelectionTriggerToggle, onFloatingBallToggle,
}: TriggersSectionProps) {
  // ...existing JSX...
  // 在两个现有 checkbox 之后追加:
  <label className="flex items-center gap-2 mb-2 text-sm">
    <input
      type="checkbox"
      checked={config.floatingBallEnabled}
      onChange={(e) => onFloatingBallToggle(e.target.checked)}
    />
    Floating ball enabled
  </label>
}
```

在 `App` 函数里把 prop 传下去:

```tsx
<TriggersSection
  config={config}
  onHotkeyChange={(v) => save({ ...config, hotkey: v })}
  onHoverButtonToggle={(v) => save({ ...config, hoverButtonEnabled: v })}
  onSelectionTriggerToggle={(v) => save({ ...config, selectionTriggerEnabled: v })}
  onFloatingBallToggle={(v) => save({ ...config, floatingBallEnabled: v })}
/>
```

- [ ] **Step 2: type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 无错。

- [ ] **Step 3: Commit**

```bash
git add src/interface-adapters/options/App.tsx
git commit -m "feat(options): expose floatingBallEnabled toggle in Triggers section"
```

---

## 完工验证

### Task F1: 跑全部测试

- [ ] **Step 1: 单元 + 集成**

Run: `npm run test -- --run`
Expected: 全部 PASS。

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 无错。

- [ ] **Step 3: 双浏览器 build**

Run: `npm run build && npm run build:firefox`
Expected: 两个 build 成功。

- [ ] **Step 4: e2e 烟囱测试**

Run: `npm run e2e`
Expected: 已有的 e2e 全部 PASS。如果有失败,通常是 selector 签名变化导致定位策略变化,逐个修。

### Task F2: README 更新

- [ ] **Step 1: 更新 README**

修改 `README.md`,在 "功能" 一节,把:
- "三种触发器" 改成 "四种触发器"(加浮动球)
- 加 "翻译主题系统"
- 加 "Provider 连通性测试"
- 加 "可配置选择器 + per-site 规则"

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for v0.2 features"
```

### Task F3: 打 release tag

(由用户决定时机)

- [ ] bump version in package.json + wxt.config.ts to `0.2.0`
- [ ] commit: `chore: bump version to 0.2.0`
- [ ] tag: `git tag v0.2.0`
- [ ] push tag: `git push origin v0.2.0`
- [ ] CI Release workflow 自动打包并创建 GitHub Release

---

## Self-review notes

实施过程中需要小心以下几点(写完时已发现,但不在 task 里强制写死,避免 plan 过度规定):

1. **`provider.translate` 的实际签名** — Task 2.1 里假设返回 `{ translatedText, ... }`。实施时先读 `src/domain/interfaces/TranslationProvider.ts` 确认。如果是 `TranslationResult`,直接用类型。
2. **Tailwind v4 + `?inline` 的运行时验证** — Task 4.4 的 CSS 注入在 build 后才能验证。第一次 build 后,在 strict-CSP 页面(GitHub)打开扩展,确认面板样式正常。
3. **Shadow DOM 内 React 的 `wxt/browser`** — Floating panel 内的 `ConfigService` 用 `browser.storage.local`,在 content script context 里是合法的(content script 共享 storage API)。但如果遇到权限问题,fallback 用 `chrome.storage.local` 直接调。
4. **ProviderQuickSelect 的 import** — `ProviderTestResult` 从 `@/application/ConfigService` 而非 `@/shared/types` 导入(因为它是 ConfigService 的返回类型)。
