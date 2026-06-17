# 设计: 分层选择器 / 翻译主题 / Provider 测试 / 浮动球面板

**日期**: 2026-06-18
**状态**: 草稿,待用户审阅
**关联**: [基础 MVP 设计 spec](./2026-06-13-immersive-translation-extension-design.md)

## 背景

MVP 已发布 (`v0.1.0`,2026-06-17 GitHub release)。本期扩展四块能力,灵感主要来自 [immersive-translate 文档](https://immersivetranslate.com/zh-Hans/docs/advanced/) 与 [js-sdk](https://immersivetranslate.com/zh-Hans/docs/js-sdk/):

1. **分层 DOM 选择器** — 替代当前硬编码的 7 个标签,实现 immersive-translate 1:1 风格的选择器配置(selectors / excludeSelectors / excludeTags / stayOriginal / extraBlock 等,加 per-site 规则)
2. **翻译主题系统** — 当前硬编码 Sequoia Grey inline CSS,改为可配置主题,默认 `inherit`(显式复制原文 computed style)
3. **Provider 连通性测试** — Options 里加 "Test connection" 按钮,发一次最小翻译请求验证 provider 配置正确
4. **浮动球 + 贴边面板** — content-script 注入的可拖拽球(Shadow DOM 隔离),点击展开小面板,集成 hover 开关 / provider 快选 / 主题 / 目标语言 / 翻译本页按钮

## 非目标 (YAGNI 明确)

- inline 翻译粒度(本期只做 block)
- 流式 SSE 输出
- 自动语言检测 UI(`sourceLanguage: 'auto'` 字段已存在)
- LocalProxyProvider 接 scheduler fallback
- 域名黑白名单独立功能(用 `siteRules` + `enabled: false` 表达)

## 总体架构

四个功能落到现有 DDD 四层:

```
domain/
  entities/                    (无变化)
  services/
    ThemeCatalog.ts            新增 — 主题注册表,纯数据
    SelectorService.ts         新增 — mergeSiteRules + validateSelectorConfig (纯逻辑, 无 DOM)
    GlobMatcher.ts             新增 — globToRegex + matchesUrl (纯工具)
  errors.ts                    (无变化)

shared/
  types.ts                     +SelectorConfig / SiteRule / TranslationThemeId / BallPosition 类型

application/
  ConfigService.ts             +testProvider(id) 方法
  TranslatePageUseCase.ts      (无变化)

infrastructure/
  extractors/
    DOMBlockExtractor.ts       重写 — 接受 SelectorConfig,不再硬编码
  renderers/
    DOMRenderer.ts             重写 — 根据 theme 应用样式,inherit 走 computed style
  floating-ball/               新增子包
    FloatingBallHost.ts        shadow DOM 注入 + React mount + 重挂监听
    FloatingBallController.ts  drag/dock 状态机,纯逻辑
  repositories/
    BrowserStorageConfigRepo.ts +schemaVersion 迁移逻辑

interface-adapters/
  content-script/
    main.ts                    +注入 FloatingBallHost
    triggers.ts                (无变化)
  floating-panel/              新增 — React app,在 shadow root 里渲染
    App.tsx
    floating-panel.css         Tailwind v4 入口,通过 ?inline 编译注入
    components/
      HoverToggle.tsx
      ProviderQuickSelect.tsx
      ThemeSelect.tsx
      TargetLanguageInput.tsx
      TranslatePageButton.tsx
  options/
    App.tsx                    +Selectors section +Appearance section +Test 按钮
    SelectorSection.tsx        新增
    AppearanceSection.tsx      新增
    SiteRulesSection.tsx       新增
  popup/
    App.tsx                    (无变化,保留 toolbar popup 作为 fallback)
```

关键边界决策:
- `ThemeCatalog` 放 domain — 纯注册表,无 DOM 依赖
- `SelectorConfig` 是 shared/types 里的 record(不开 domain 实体,无常量要保护);相关的纯函数(`mergeSiteRules` / `validateSelectorConfig` / `globToRegex` / `matchesUrl`)放 `domain/services/`
- 浮动球拆 `Controller`(纯状态机,jsdom 可测)/ `Host`(DOM 胶水)
- 浮动面板是独立 React 子树,不复用 popup(popup 受工具栏约束)

## 1. 分层选择器

### 1.1 数据模型 (`shared/types.ts`)

```ts
interface SelectorConfig {
  selectors: string[];                // 默认 13 个常见块级标签
  excludeSelectors: string[];         // CSS 选择器黑名单
  excludeTags: string[];              // 标签黑名单
  stayOriginalSelectors: string[];    // 匹配但不翻译
  stayOriginalTags: string[];
  extraBlockSelectors: string[];      // 额外的块级选择器
  extraInlineSelectors: string[];     // 额外的行内选择器(本期不参与抽取,占位)
  blockMinTextCount: number;          // 默认 1
  paragraphMinWordCount: number;      // 默认 1
  containerMinTextCount: number;      // 默认 1
}

interface SelectorDelta {
  add?: string[];
  remove?: string[];
}

interface SiteRule {
  id: string;
  matches: string[];                  // glob 模式,如 ['*://news.ycombinator.com/*']
  selectors?: SelectorDelta;          // 增量作用于默认列表
  excludeSelectors?: SelectorDelta;
  extraBlockSelectors?: SelectorDelta;
  enabled: boolean;
}

interface AppConfig {
  // ...现有字段...
  selectorConfig: SelectorConfig;
  siteRules: SiteRule[];
  translationTheme: TranslationThemeId;
  floatingBallEnabled: boolean;
  schemaVersion: number;
}
```

**设计要点**: 基础 config 用 flat 数组(直接 set);只有 per-site rule 用 `.add`/`.remove` 增量修饰符。保留 immersive-translate 关键能力(站点定制),避免基础 config 里到处是 delta 的复杂度。

### 1.2 默认值

```ts
const DEFAULT_SELECTOR_CONFIG: SelectorConfig = {
  selectors: ['p','h1','h2','h3','h4','h5','h6','li','blockquote','figcaption','summary','dd','dt'],
  excludeSelectors: [],
  excludeTags: [],
  stayOriginalSelectors: ['pre','code','kbd','samp'],
  stayOriginalTags: [],
  extraBlockSelectors: [],
  extraInlineSelectors: [],
  blockMinTextCount: 1,
  paragraphMinWordCount: 1,
  containerMinTextCount: 1,
};
```

`stayOriginalSelectors` 默认包含 `pre/code/kbd/samp` —— 代码块不翻译,和 immersive-translate 默认一致。

### 1.3 提取算法 (`DOMBlockExtractor` 重写)

```
extract(root, baseConfig: SelectorConfig, siteRules: SiteRule[], url: URL):
  effective = mergeSiteRules(baseConfig, siteRules, url)
  // 每个 enabled 且 matches(url) 的 rule,应用 delta: 并集 add,差集 remove

  candidates = querySelectorAll(root, effective.selectors.join(', '))
              ∪ querySelectorAll(root, effective.extraBlockSelectors.join(', '))

  filtered = candidates.filter(el =>
    !matchesAny(el, effective.excludeSelectors) &&
    !includesTag(el, effective.excludeTags) &&
    !matchesAny(el, effective.stayOriginalSelectors) &&
    !includesTag(el, effective.stayOriginalTags) &&
    visibleText(el).length >= effective.blockMinTextCount &&
    wordCount(visibleText(el)) >= effective.paragraphMinWordCount
  )

  // 现有 ancestor-dedup 逻辑保留
  deduped = filterAncestorMatches(filtered)

  return deduped.map(el => new ParagraphBlock({...}))
```

`extraInlineSelectors` 本期不参与 ParagraphBlock 抽取(行内粒度不同),仅作为配置项预留。

### 1.4 Glob 匹配

50 行手写 matcher:
- `*` 匹配任意字符(包括 `/`)
- `?` 匹配单字符
- 其他正则元字符 escape

```ts
function globToRegex(pattern: string): RegExp;
function matchesUrl(patterns: string[], url: URL): boolean;
```

不用 `URLPattern`(Firefox MV2 兼容性不稳)。

### 1.5 Options UI

新增 **Selectors** section(`SelectorSection.tsx`):
- "Default selectors" textarea (一行一个)
- "Exclude selectors" / "Exclude tags" 两列输入
- "Stay original selectors" / "Stay original tags" 两列输入
- "Extra block selectors" 输入
- "Min text count" / "Min word count" 两个数字框

新增 **Site rules** 子区块(`SiteRulesSection.tsx`,可折叠):
- 每条 rule 一行:pattern 输入框 + enabled 复选框 + 展开编辑 delta + 删除按钮
- "+ Add rule" 在底部

## 2. 翻译主题系统

### 2.1 数据模型

```ts
type TranslationThemeId = 'inherit' | 'grey' | 'dashed' | 'italic' | 'bold';
```

`AppConfig.translationTheme: TranslationThemeId`,默认 `'inherit'`。

### 2.2 ThemeCatalog (`domain/services/ThemeCatalog.ts`)

纯注册表:

```ts
export const THEME_CATALOG: ReadonlyArray<{
  id: TranslationThemeId;
  label: string;
  cssText: string;       // inherit 不走这里
}> = [
  { id: 'inherit', label: 'Inherit original style', cssText: '' },
  { id: 'grey',    label: 'Sequoia Grey',            cssText: 'color:#928c86; opacity:0.95;' },
  { id: 'dashed',  label: 'Dashed underline',        cssText: 'border-bottom:1px dashed currentColor; padding-bottom:1px;' },
  { id: 'italic',  label: 'Italic',                  cssText: 'font-style:italic; opacity:0.85;' },
  { id: 'bold',    label: 'Bold',                    cssText: 'font-weight:700;' },
];
```

### 2.3 DOMRenderer 改造

```ts
render(results, theme: TranslationThemeId): void {
  for (const result of results) {
    const original = this.findOriginalElement(result.blockId);
    if (!original) continue;
    // ...existing sibling-update logic 保留...
    const translationEl = this.doc.createElement('div");
    translationEl.className = this.translatedClass;
    translationEl.textContent = result.translatedText;
    this.applyTheme(translationEl, original, theme);
    original.after(translationEl);
  }
}

private applyTheme(el, original, theme): void {
  // 所有主题共享:块级 + 视觉间距
  el.style.display = 'block';
  el.style.marginTop = '0.25em';
  el.style.marginBottom = '0.5em';

  if (theme === 'inherit') {
    // 显式复制原文 computed style —— 兄弟节点不会自动继承原文样式
    const cs = this.doc.defaultView!.getComputedStyle(original);
    el.style.color = cs.color;
    el.style.fontSize = cs.fontSize;
    el.style.fontFamily = cs.fontFamily;
    el.style.fontWeight = cs.fontWeight;
    el.style.lineHeight = cs.lineHeight;
    el.style.letterSpacing = cs.letterSpacing;
    el.style.textAlign = cs.textAlign;
  } else {
    const themeDef = THEME_CATALOG.find(t => t.id === theme);
    if (themeDef) el.style.cssText += themeDef.cssText;
  }
}
```

**关键决策**: `inherit` 不是"不加样式",而是显式复制 computed style。兄弟节点天然不会继承原文样式,只有显式复制才能让 `<h1>` 的译文也是 h1 视觉、`<p class="article">` 的译文继承 article 字号。

### 2.4 性能

`getComputedStyle` 按 N 个块调用 N 次。浏览器内部有缓存,实际成本可接受。若发现性能问题,future 按 `original.tagName + className` 做缓存。**本期不做**。

### 2.5 Options UI

新增 **Appearance** section:
- "Translation theme" select,5 个选项,label 用 `THEME_CATALOG` 渲染
- 旁边小预览框,显示 "原文示例" + "译文示例" 应用选中主题

浮动面板里也露这个 select(快速切换),共享同一个 `translationTheme` 字段。

## 3. Provider 连通性测试

### 3.1 Application 层接口 (`ConfigService`)

```ts
export interface ProviderTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;          // 成功:简短摘要; 失败:错误详情
  statusCode?: number;      // 失败时的 HTTP 状态码(若有)
}

class ConfigService {
  async testProvider(providerId: string): Promise<ProviderTestResult> {
    const config = await this.getConfig();
    const providerCfg = config.providers.find(p => p.id === providerId);
    if (!providerCfg) return { ok: false, latencyMs: 0, message: 'Provider not found' };

    const provider = new OpenAICompatibleProvider(providerCfg);
    const start = performance.now();
    try {
      // 直接调 provider,绕过 TranslatePageUseCase 和 TranslationCache
      const result = await provider.translate({
        sourceText: 'Hello',
        sourceLanguage: 'auto',
        targetLanguage: config.targetLanguage,
      });
      return {
        ok: true,
        latencyMs: Math.round(performance.now() - start),
        message: `Translated "Hello" → "${result.translatedText}"`,
      };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      return {
        ok: false,
        latencyMs,
        message: err instanceof Error ? err.message : String(err),
        statusCode: err instanceof NetworkError || err instanceof RateLimitError
          ? err.statusCode : undefined,
      };
    }
  }
}
```

**关键决策**:
- 测试请求**绕过 TranslationCache**,直接调 `provider.translate()`
- 测试输入固定 `"Hello"`
- 复用 domain error 分类,失败结果透出 `statusCode` 帮助诊断

### 3.2 Options UI

Provider section 顶部,Provider 名字输入框旁边加 **"Test connection"** 按钮:

```
┌─ Provider ──────────────────────────────────────────────┐
│ Name [OpenAI    ]  [Test connection]                   │
│                       ↑ 点击后这里变成                  │
│                       ✓ 540ms — Translated "Hello" → "你好"
│                       或                                │
│                       ✗ 401 — Invalid API key           │
│                                                          │
│ Base URL [........]                                     │
│ ...                                                     │
└─────────────────────────────────────────────────────────────────┘
```

按钮状态机:
- `idle` → "Test connection"
- `testing` → "Testing…" + disabled
- `ok` → "✓ {latency}ms — {message}",3 秒后淡出回 idle
- `fail` → "✗ {statusCode} — {message}",保留直到用户改字段或重测

浮动面板的 provider 切换旁边也放小 Test 按钮,行为一致。

## 4. 浮动球 + 贴边面板 (Shadow DOM)

### 4.1 视觉与交互

```
空闲态(贴右下):             拖拽中:                展开态(点击后):
                                                    ╭──────────────────╮
                                                    │ Quick Read Trans │
                       ↕                            │                  │
                                                    │ Hover  [● ON]    │
                          ↕                         │ Provider [GLM ▾] │
                                                    │   [Test] ✓ 540ms │
                       ↕                            │ Theme [Inherit ▾]│
                                                    │ Target [中文 ▾]  │
                      ╭──╮                          │ [Translate Page] │
                      │译│                          ╰──────────────────╯
                      ╰──╯
```

- 默认贴右下角(实现上 = `docked: { edge: 'bottom', offsetAlong: <viewport width - 60> }`),可拖动到屏幕任意位置
- 短按(位移 < 3px) = 点击,展开/收起面板
- 长按拖动 = 移动位置
- **释放时**:如果离屏幕边 < 80px,自动 snap 到该边;否则保留 free 位置(允许 free-floating)

### 4.2 DOM 结构

```html
<!-- host-facing 容器,挂在 document.documentElement 上(不等 body) -->
<div id="qrt-floating-root" style="position:fixed; z-index:2147483647; inset:0; pointer-events:none;">
  #shadow-root (open)
    <style>/* 编译后的 Tailwind + qrt-panel.css */</style>
    <div class="qrt-ball" style="pointer-events:auto;">译</div>
    <div class="qrt-panel" hidden style="pointer-events:auto;">
      <div id="panel-mount"></div>
    </div>
</div>
```

**z-index**: `2147483647` (max int32) + `position: fixed`。外层容器 `pointer-events: none`,只有球和面板 `pointer-events: auto`,避免遮挡 host 页面交互。Shadow DOM **不**隔离 z-index,所以必须靠这个值抢 stacking context。

**shadow root 用 `open`**: 不影响安全性(球本身在 host DOM 上,本来就能 inspect),方便用户 devtools 调试。

### 4.3 位置模型

```ts
type Edge = 'top' | 'bottom' | 'left' | 'right';
type BallPosition =
  | { mode: 'docked'; edge: Edge; offsetAlong: number }  // 沿 edge 方向的像素偏移
  | { mode: 'free'; x: number; y: number };              // 自由位置
```

snap 阈值 80px。位置持久化到 `chrome.storage.local[\`floatingBall:${hostname}\`]`,drag end 写,attach 读,每个域名独立。

### 4.4 组件拆分

```
infrastructure/floating-ball/
  FloatingBallHost.ts       shadow DOM 注入, React mount, MutationObserver 重挂
  FloatingBallController.ts 纯 drag/dock 状态机, jsdom 可测

interface-adapters/floating-panel/
  App.tsx                   React 根
  floating-panel.css        Tailwind v4 入口
  components/
    HoverToggle.tsx
    ProviderQuickSelect.tsx  (内嵌 Test 按钮, 复用 Section 3 逻辑)
    ThemeSelect.tsx
    TargetLanguageInput.tsx
    TranslatePageButton.tsx
```

### 4.5 FloatingBallController (纯逻辑)

```ts
class FloatingBallController {
  // 拖拽中:根据 pointer 偏移更新临时位置
  onDrag(current: { x, y }, delta: { dx, dy }): { x, y };

  // 释放:决定 snap 到 edge 还是保持 free
  computeRelease(releasePoint: { x, y }, viewport: { w, h }): BallPosition;

  // 把 BallPosition 转 CSS 定位
  toCss(pos: BallPosition): { top?, bottom?, left?, right? };
}
```

### 4.6 FloatingBallHost (DOM 胶水)

```ts
class FloatingBallHost {
  attach(): void {
    // 1. 创建 host-facing <div>,挂到 documentElement
    // 2. attachShadow({ mode: 'open' })
    // 3. 注入编译后的 CSS (import panelCss from '...?inline')
    // 4. 渲染 ball + panel 骨架
    // 5. mount React 到 #panel-mount
    // 6. 加载持久化位置 (chrome.storage.local)
    // 7. 注册 pointer 事件 → controller
    // 8. 启动 MutationObserver 监听容器被移除
  }
  detach(): void;
  togglePanel(): void;
}
```

### 4.7 Panel ↔ content-script 通信

面板的 React 代码和 content script 共享同一个 JS context(都是 content script 注入的),所以**不用 message passing**:
- 配置读写:直接用 `ConfigService` 单例(同 Options / Popup)
- "Translate This Page" 按钮:直接 `window.dispatchEvent(new CustomEvent('qrt:translate-page'))`,由 triggers.ts 监听

### 4.8 SPA 路由存活

`MutationObserver` 观察 `document.documentElement` 的 `childList`,如果 `#qrt-floating-root` 被移除(throttled 100ms),重新 attach。比 `setInterval` 心跳开销小。

### 4.9 WXT 配置

`wxt.config.ts` content script 修改:
- `all_frames: false` (只在 top frame 注入)
- `run_at: 'document_idle'` (等 DOM 解析完)
- `matches: ['<all_urls>']`

Tailwind CSS 入口 `floating-panel.css` 用 `?inline` query 让 Vite 编译成字符串:

```ts
import panelCss from '../floating-panel/floating-panel.css?inline';
const styleEl = document.createElement('style');
styleEl.textContent = panelCss;
shadowRoot.appendChild(styleEl);
```

### 4.10 全局禁用

`AppConfig.floatingBallEnabled: boolean`(默认 `true`)。content script 启动时读 config,false 则不 attach。Options 和浮动面板里都有 toggle。

## 5. Schema 迁移

### 5.1 版本与迁移函数 (`BrowserStorageConfigRepo`)

```ts
const CURRENT_SCHEMA_VERSION = 2;

function migrate(raw: unknown): AppConfig {
  const r = raw as Partial<AppConfig> & { schemaVersion?: number };
  const version = r.schemaVersion ?? 1;

  if (version < 2) {
    return {
      ...defaultsFromV1(r),
      schemaVersion: 2,
      translationTheme: r.translationTheme ?? 'inherit',
      selectorConfig: r.selectorConfig ?? DEFAULT_SELECTOR_CONFIG,
      siteRules: r.siteRules ?? [],
      floatingBallEnabled: r.floatingBallEnabled ?? true,
    };
  }
  return r as AppConfig;
}
```

`load()` 调用 `migrate`,然后**回写**到 storage(避免下次还 migrate)。`ConfigService.getConfig()` 假定拿到的已经是最新版本。

## 6. 边界与风险

### 6.1 CSP / Shadow DOM 样式注入

- Manifest V3 默认允许 extension 自己的资源,shadow root 内 `<style>` 注入合规
- 某些站点有严格 CSP `style-src 'self'`,但 **host CSP 不适用于 extension content script**(extension 有自己的 CSP)
- **不需特殊处理**,但需要 e2e 测试在 strict-CSP 页面(如 GitHub)验证

### 6.2 z-index 战争

- Shadow DOM 不隔离 z-index
- 必须 `z-index: 2147483647` + `position: fixed` 在 host-facing 容器上
- 如果 host 页面模态用了同值且后挂载,可能仍有冲突 —— 接受这个边缘情况

### 6.3 SPA 路由切换

- React/Vue SPA 切路由可能 unmount 我们的容器
- MutationObserver 监听 `documentElement` childList,被移除时重 attach

### 6.4 Iframes

- `all_frames: false`,只在 top frame 注入
- 不在 iframe 内显示球

### 6.5 restricted schemes

- chrome://, file:// 等受限协议,content script 不会被注入,无需特殊处理

## 7. 测试策略

| 层 | 工具 | 覆盖 |
|---|---|---|
| 单元 | Vitest + jsdom | `mergeSiteRules`, `globToRegex`/`matchesUrl`, `validateSelectorConfig`, `DOMBlockExtractor` 新算法, `DOMRenderer.applyTheme`(含 inherit 的 computed style 复制), `FloatingBallController.computeRelease/onDrag/toCss`, `ConfigService.testProvider` (mocked), `migrate` v1→v2 |
| 集成 | Vitest + jsdom | `DOMBlockExtractor` 端到端 DOM, `DOMRenderer` 真实主题应用 |
| Provider 集成 | Vitest (无 key skip) | 真实 GLM `testProvider` 调用 |
| e2e | Playwright | stayOriginal 跳过代码块; inherit 主题视觉一致性; 浮动球拖动 + 持久化; 面板切换 provider + theme; Test 按钮成功/失败 |

跨浏览器: Firefox MV2 与 Chrome MV3 共享代码,WXT polyfill 处理差异。`npm run build:firefox` 跑 e2e 验证。

## 8. 实施顺序

按依赖与价值排序:

1. Schema 迁移 + 默认值(其他改动的基础)
2. Theme system(简单,用户最先感知)
3. Provider test(简单,debug 必备)
4. Layered selectors(中等,影响范围最大)
5. Floating ball + panel(最大,新功能)

每一步独立可发布,可在不完全完成所有步骤时 ship 中间版本。

## 9. 未解决的开放问题

无。设计阶段的所有关键决策已拍板,待用户审阅后进入实施计划。
