# 沉浸式网页翻译扩展设计文档

## 1. 背景与目标

### 1.1 背景

`immersive-translate` 等沉浸式翻译工具逐渐闭源，需要一个开源、可控、可定制的替代方案。

### 1.2 目标

开发一个跨浏览器扩展（Chrome / Edge / Firefox），支持用户通过多种触发器翻译网页段落，并以双语内联方式呈现结果。首期聚焦两个核心能力：

1. **触发器-翻译对应段落**：支持组合键、划词、悬浮按钮三种触发方式。
2. **API 接入**：先支持 OpenAI-compatible 协议，并用 Zhipu GLM-4-Flash-250414 免费端点验证翻译速度和效果。

### 1.3 成功标准

- 在 Chrome、Edge、Firefox 上可正常安装运行。
- 组合键、划词、悬浮按钮均可触发翻译。
- 支持 OpenAI-compatible API，并可用 GLM-4-Flash-250414 跑通。
- 翻译结果以双语内联方式渲染。
- 自动重试 + 优雅降级，用户可手动重试失败的段落。
- 翻译结果按段落文本哈希缓存，避免重复请求。

---

## 2. 架构总览

整个扩展按 DDD 分层思想组织为四层：

1. **领域层（Domain）**：核心翻译领域概念与规则，不依赖浏览器 API。
2. **应用层（Application）**：编排领域对象完成具体用例。
3. **基础设施层（Infrastructure）**：外部依赖的实现。
4. **接口适配层（Interface Adapters）**：与浏览器、用户交互的入口。

### 2.1 分层职责

| 层级 | 职责 |
|------|------|
| 领域层 | 定义 `ParagraphBlock`、`TranslationRequest`、`TranslationResult`、合并/拆分策略、`TranslationProvider` 接口 |
| 应用层 | `TranslatePageUseCase`、`TranslationScheduler`、`ConfigService` |
| 基础设施层 | `OpenAICompatibleProvider`、`LocalProxyProvider`、`BrowserStorageConfigRepo`、`DOMBlockExtractor`、`DOMRenderer`、`TranslationCache` |
| 接口适配层 | Content Script、Background Script、Options Page、Popup |

---

## 3. 组件与职责

### 3.1 领域层

- **`ParagraphBlock`**：值对象，表示网页上的一个段落块。
  - 属性：`id`（文本哈希）、`sourceText`、`sourceLanguage`、`domReference`、`contextBlocks`
- **`TranslationRequest`**：值对象，表示一次待翻译请求。
  - 属性：`blockIds[]`、`combinedText`、`targetLanguage`、`context`
- **`TranslationResult`**：值对象，表示翻译结果。
  - 属性：`blockId`、`translatedText`、`providerId`、`modelId`、`latencyMs`
- **`BlockSplitter`** / **`BlockMerger`**：领域服务，负责段落块的拆分与合并策略。
- **`TranslationProvider` 接口**：领域层定义的 provider 契约。
  - 方法：`translate(batch: TranslationRequest[]): Promise<TranslationResult[]>`

### 3.2 应用层

- **`TranslatePageUseCase`**：应用服务，接收触发事件，编排“提取 → 合并 → 翻译 → 渲染”流程。
- **`TranslationScheduler`**：应用服务，负责请求队列、段落合并、限流、自动重试、provider 切换。
- **`ConfigService`**：应用服务，读取/写入用户配置，屏蔽存储细节。

### 3.3 基础设施层

- **`OpenAICompatibleProvider`**：实现 `TranslationProvider`，调用 OpenAI-compatible API。
- **`LocalProxyProvider`**：可选实现，把请求转发到用户本地代理服务。
- **`BrowserStorageConfigRepo`**：实现配置仓库，基于 `browser.storage.local`。
- **`DOMBlockExtractor`**：从网页 DOM 中提取 `ParagraphBlock`。
- **`DOMRenderer`**：把 `TranslationResult` 渲染回网页 DOM。
- **`TranslationCache`**：基于 `browser.storage.local` 或内存缓存的翻译结果缓存。

### 3.4 接口适配层

- **Content Script**：监听触发器、调用 `TranslatePageUseCase`、渲染结果。
- **Background Script**：接收 content 消息，运行 `TranslationScheduler` 和 provider。
- **Options Page**：完整配置 UI，管理 provider、模型、prompt、快捷键、本地代理等。
- **Popup**：快速开关、状态展示、一键翻译当前页。

---

## 4. 数据流

### 4.1 主翻译流程

1. **触发**：Content Script 监听到组合键 / 划词 / 悬浮按钮点击，确定目标段落块。
2. **提取**：`DOMBlockExtractor` 把目标区域 DOM 转成 `ParagraphBlock[]`。
3. **调度**：Content Script 通过 `browser.runtime.sendMessage` 把请求发给 Background。
   - `TranslationScheduler` 合并相邻请求，调用 `ConfigService` 获取当前 provider。
4. **翻译**：调用 `TranslationProvider.translate(batch)`，实际由 `OpenAICompatibleProvider` 发送 HTTP 请求。
5. **返回**：结果传回 Content Script。
6. **渲染**：`DOMRenderer` 在对应 block 旁插入译文，并标记为已翻译。

### 4.2 缓存流程

1. 提取 block 时计算 `block.id = hash(sourceText)`，用于 DOM 引用和去重。
2. 翻译前按第 6 节缓存 key 规则计算 `cacheKey = hash(sourceText + sourceLanguage + targetLanguage + providerId + modelId + promptVersion)`，查询 `TranslationCache.get(cacheKey)`，命中则直接渲染。
3. 翻译成功后写入缓存，设置 TTL（默认 30 天）。

### 4.3 配置流程

1. Options / Popup 通过 `ConfigService` 读写配置。
2. `ConfigService` 调用 `BrowserStorageConfigRepo` 操作 `browser.storage.local`。
3. Background 启动时从 storage 加载配置到内存，减少每次请求的 I/O。

---

## 5. 错误处理与重试

### 5.1 错误分类

基础设施层把错误封装为以下领域错误类型：

- `NetworkError`：网络超时、连接失败
- `RateLimitError`：触发限流
- `AuthError`：API key 无效
- `ProviderError`：API 返回其他业务错误
- `ValidationError`：响应格式无法解析

### 5.2 重试策略

- `TranslationScheduler` 对 `NetworkError`、`RateLimitError`、5xx 自动重试最多 2 次。
- `RateLimitError` 按响应头 `Retry-After` 退避，其他可重试错误采用指数退避。
- 自动重试仍失败则进入优雅降级。

### 5.3 优雅降级

- 失败的 block 保留原文。
- 在 block 旁显示 ⚠️ 图标和“重试”按钮。
- hover 图标显示简要错误原因。
- 用户点击“重试”可单独重新翻译该 block。

### 5.4 本地代理回退

- 若用户配置了本地代理但连接失败，自动回退到远程 provider（由 `fallbackProviderId` 控制）。
- 回退逻辑在 `TranslationScheduler` 中统一处理。

---

## 6. 缓存策略

- **Key**：`hash(sourceText + sourceLanguage + targetLanguage + providerId + modelId + promptVersion)`
- **Storage**：`browser.storage.local`
- **TTL**：30 天
- **更新机制**：配置变更（如 prompt 版本升级）时自动失效旧缓存。
- **内存缓存**：Background 启动时加载常用配置，Content Script 可保留当前页 block 的内存缓存以提升响应速度。

---

## 7. 测试策略

### 7.1 单元测试（Vitest）

- 领域层：`BlockSplitter`、`BlockMerger`、哈希缓存逻辑、`TranslationProvider` 接口契约。
- 应用层：`TranslationScheduler` 的合并、重试、队列逻辑（使用 mock provider）。
- 基础设施层：`OpenAICompatibleProvider` 的 request 构造与 response 解析。

### 7.2 集成测试

- 使用真实 GLM-4-Flash-250414 免费端点，翻译一段样本文本，验证返回格式和响应速度。

### 7.3 端到端测试（Playwright）

- 加载扩展，打开测试页面。
- 触发组合键翻译。
- 断言 DOM 中出现译文。

### 7.4 手动测试清单

- Chrome / Edge / Firefox 安装与基本功能
- 组合键、划词、悬浮按钮三种触发
- API key 错误、断网、限流的 UI 反馈
- Options 页面配置保存、导入/导出

### 7.5 性能基准

- 记录 GLM-4-Flash-250414 单段、多段合并请求的耗时。
- 统计首屏渲染时间和平均 token 耗时。

---

## 8. 技术栈与目录结构

### 8.1 技术栈

- **WXT**：跨浏览器扩展框架，处理 MV2/MV3/Firefox 差异
- **TypeScript**：全类型安全
- **Vitest**：单元测试
- **Playwright**：端到端测试
- **Tailwind CSS**：Options / Popup UI
- **browser.storage.local**：配置与缓存持久化

### 8.2 目录结构

```
quick-read-translator/
├── src/
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── ParagraphBlock.ts
│   │   │   ├── TranslationRequest.ts
│   │   │   └── TranslationResult.ts
│   │   ├── services/
│   │   │   ├── BlockSplitter.ts
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
│   │   │   └── App.tsx
│   │   └── popup/
│   │       └── App.tsx
│   └── shared/
│       ├── types.ts
│       ├── constants.ts
│       └── utils/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-06-13-immersive-translation-extension-design.md
├── wxt.config.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

设计文档同时包含第 12 节“UI 设计参考（Sequoia Capital 风格）”。

---

## 9. 首期范围（MVP）

### 9.1 必须实现

- [ ] WXT 项目脚手架
- [ ] Content Script：段落块识别、三种触发器监听
- [ ] Background：消息接收、请求调度、自动重试
- [ ] `OpenAICompatibleProvider`：完整 OpenAI chat completions 调用
- [ ] 用 GLM-4-Flash-250414 免费端点验证
- [ ] 双语内联渲染
- [ ] Options 页面：API 配置、模型、prompt、快捷键、本地代理开关
- [ ] `browser.storage.local` 持久化 + 导入/导出
- [ ] 段落文本哈希缓存
- [ ] 基础错误提示与手动重试

### 9.2 明确不包含

- 流式输出（SSE）—— 架构预留，后续升级
- 非 OpenAI-compatible 的 provider（如 Google Gemini、Anthropic 原生 API）
- 完整的语言自动检测（首期默认目标语言为中文/英文可选）
- 翻译后的朗读、导出 PDF 等高级功能

---

## 10. 后续扩展

1. **流式输出**：在 `TranslationProvider` 接口中增加 `translateStream` 方法，Content Script 逐步渲染。
2. **更多 Provider**：新增 GeminiProvider、AnthropicProvider 等插件化实现。
3. **整页自动翻译**：检测页面语言，自动翻译整页所有段落块。
4. **白名单/黑名单**：按域名控制是否自动启用扩展。
5. **翻译质量反馈**：用户可对结果点赞/点踩，用于后续优化 prompt。

---

## 12. UI 设计参考（Sequoia Capital 风格）

Options 页面与 Popup 的 UI 风格参考 [Sequoia Capital 团队页](https://sequoiacap.com/our-team/?_role=seed-early)。

### 12.1 整体风格

- **极简、高级、编辑感**：大量留白，信息密度低，内容居中。
- **无过重装饰**：不使用大色块背景或复杂渐变，靠字体层级和间距建立视觉秩序。
- **卡片式网格**：配置项可按模块分组，类似团队页的人物卡片布局。

### 12.2 配色

从页面 CSS 变量中提取的核心色板：

| 用途 | 颜色 |
|------|------|
| 主品牌色 | `#00a071`（Sequoia Green） |
| 主品牌 hover/深色 | `#007354`（Dark Green） |
| 背景色 | `#f3f3f2`（Sequoia White） |
| 主文字色 | `#1b1916`（Sequoia Black） |
| 次要文字/边框 | `#928c86`（Dark Grey） |
| 提示/禁用 | `#a8a39e`（Light Grey） |
| 强调色（状态、按钮） | `#1f8ac4`（Bright Blue） |
| 错误/警告 | `#eb2926`（Bright Red） |

### 12.3 字体

- 参考页面使用 `pitch-sans`（Klim Type Foundry，付费字体）。
- 扩展中采用免费替代方案：
  - 主要：**Inter**（Google Fonts，SIL 协议，最接近 neo-grotesque 风格）
  - 备选：**IBM Plex Sans**（技术感更强，带等宽 companion）
  - 系统 fallback：`ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`

### 12.4 字号与间距

参考页面预设：

| Token | 值 | 用途 |
|-------|-----|------|
| small | 13px | 标签、辅助说明 |
| medium | 20px | 小标题、配置项名称 |
| large | 36px | 区块标题 |
| x-large | 42px | 页面主标题 |
| root padding | 2.4rem | 页面左右内边距 |
| gutter | 4.8rem | 大区块间距 |
| block gap | 2.4rem | 元素之间间距 |

### 12.5 按钮与表单

- 按钮：深色背景 `#32373c`，白色文字，无圆角或极小圆角（0-2px），无描边。
- 输入框：浅色背景 `#ffffff`，细边框 `#928c86`，聚焦时边框变为主品牌绿 `#00a071`。
- 卡片：白色背景，轻微阴影或仅底部边框分隔，无强投影。
- Hover 状态：文字/链接变为主品牌绿；按钮背景变深。

### 12.6 应用到扩展

- **Options 页面**：采用居中窄布局（max-width ~62rem），分段卡片展示 Provider、触发器、缓存、导入导出等配置。
- **Popup**：保持同样配色，仅保留核心操作：当前页翻译开关、快速设置入口、状态提示。
- **悬浮按钮**：圆形或圆角矩形，主品牌绿背景，白色图标，hover 加深。
- **内联译文**：以 Sequoia Grey `#928c86` 或 Dark Green `#007354` 显示译文，与原文形成层级但不喧宾夺主。

---

## 13. 风险与假设

### 13.1 风险

- **GLM-4-Flash-250414 免费额度/稳定性变化**：需要支持用户切换其他 OpenAI-compatible 端点。
- **跨浏览器 MV3 差异**：Firefox MV2 与 Chrome MV3 的服务 worker 行为存在差异，需要充分测试。
- **网页 DOM 结构复杂**：段落块识别可能在某些动态网站（SPA）上失效，需要迭代提取策略。

### 13.2 假设

- 用户具备一定的 API key 配置能力。
- 目标网页允许内容脚本注入和修改 DOM。
- 用户使用现代 Chromium/Firefox 浏览器，支持 Manifest V3（Firefox 仍支持 MV2 时兼容）。
