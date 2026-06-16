# Quick Read Translator

沉浸式网页翻译扩展 —— 开源、可控、可定制的 [immersive-translate](https://immersivetranslate.com/) 替代方案。

跨浏览器（Chrome / Edge / Firefox），OpenAI 兼容协议，双语内联渲染。

## 为什么

immersive-translate 逐渐闭源，社区需要一个能自己掌控的替代品。这个项目做最核心的事：

- 三种触发方式（快捷键、划词、悬浮按钮）翻译网页段落
- 双语内联呈现（原文下方紧跟译文）
- OpenAI 兼容 API，开箱支持 [智谱 GLM-4-Flash-250414](https://open.bigmodel.cn/) 免费端点
- 翻译结果按文本哈希缓存，自动重试 + 优雅降级

## 功能

- **三种触发器**：`Alt+T` 快捷键、文本选中、段落旁悬浮「译」按钮
- **API 接入**：OpenAI 兼容协议，可配置任意 baseUrl / model / prompt / temperature / maxTokens
- **批量合并**：相邻小段落合并为一次请求，超出 token 上限自动拆分
- **缓存**：SHA-256 文本哈希 + 30 天 TTL，相同段落不重复请求
- **错误处理**：NetworkError / RateLimitError 自动指数退避重试；失败段落显示 ⚠️ 图标 + 「重试」按钮
- **配置 UI**：Sequoia Capital 风格的 Options 页面，支持 provider 增删、prompt 编辑、导入/导出
- **跨浏览器**：Chrome MV3 + Firefox MV2 一套代码

## 快速开始

### 1. 获取 GLM API key（免费）

到 https://open.bigmodel.cn/ 注册，在控制台创建 API key。GLM-4-Flash-250414 是免费模型，足够验证整个流程。

如果你想用其他 provider（OpenAI、DeepSeek、Moonshot 等），任意 OpenAI 兼容端点都可以，Options 页面里改一下 baseUrl 和 model 就行。

### 2. 构建扩展

```bash
git clone https://github.com/Oblivionis-001/quick-read-translator.git
cd quick-read-translator
npm install
npm run build          # Chrome MV3 → .output/chrome-mv3/
npm run build:firefox  # Firefox MV2 → .output/firefox-mv2/
```

### 3. 加载到浏览器

**Chrome / Edge**

1. 打开 `chrome://extensions`
2. 右上角打开「开发者模式」
3. 点「加载已解压的扩展程序」
4. 选 `.output/chrome-mv3/` 目录

**Firefox**

1. 打开 `about:debugging#/runtime/this-firefox`
2. 点「Load Temporary Add-on」
3. 选 `.output/firefox-mv2/manifest.json`

> 注意：Firefox 的临时扩展会在浏览器关闭后卸载。要持久化需要走 AMO 签名流程。

### 4. 配置 API key

1. 点击工具栏扩展图标 → 「Open Settings」
2. 在 Provider 卡片填入：
   - **Base URL**: `https://open.bigmodel.cn/api/paas/v4`
   - **API Key**: 你的 GLM key
   - **Model**: `glm-4-flash-250414`
3. 设置会自动保存（400ms 防抖）。默认配置已经填好这些字段，只需要把 API Key 替换成你自己的。

### 5. 翻译

| 触发方式 | 动作 |
|---------|------|
| 快捷键 | `Alt+T`（翻译第一个段落；若先选中文本则翻译所有匹配段落） |
| 划词 | 选中一段文本，鼠标抬起时翻译匹配段落 |
| 悬浮按钮 | 鼠标悬停在 `<p>`/`<h1-6>`/`<li>` 上时显示「译」按钮，点击翻译该段 |
| Popup | 点击扩展图标，点「Translate This Page」 |

译文以 Sequoia Grey `#928c86` 显示在原文下方。失败的段落会显示 ⚠️ 图标，hover 看错误信息，点击重试。

## 开发

```bash
npm run dev            # WXT dev 模式（HMR）
npm run test           # Vitest 单元 + 集成测试
npm run e2e            # Playwright e2e（先 npm run build）
npm run build:all      # 双浏览器构建
```

### 架构

DDD 四层架构（详见 [设计文档](docs/superpowers/specs/2026-06-13-immersive-translation-extension-design.md)）：

```
src/
├── domain/              # 领域层：实体、错误、服务、接口（无浏览器依赖）
├── application/         # 应用层：用例、调度器、配置服务
├── infrastructure/      # 基础设施层：provider、cache、DOM 提取/渲染、存储
└── interface-adapters/  # 适配层：content / background / options / popup
```

### 测试

- **单元测试**（Vitest + jsdom）：domain / application / infrastructure / interface-adapters 全覆盖
- **集成测试**：GLM-4-Flash-250414 真实端点（无 key 自动 skip）
- **e2e 测试**（Playwright）：加载扩展，触发翻译，断言 DOM 渲染

要跑 GLM 集成测试：

```bash
cp .env.example .env
# 编辑 .env：GLM_API_KEY=你的key
npm run test -- tests/integration/glm-provider.test.ts
```

## 项目状态

**MVP**。下面这些是已知未做项，issue 欢迎补：

- LocalProxyProvider 类已实现但 scheduler 还没接 fallback（[设计 spec §5.4](docs/superpowers/specs/2026-06-13-immersive-translation-extension-design.md)）
- 流式输出（SSE）尚未实现，架构已预留
- 无语言自动检测（默认目标语言中文，可在 Options 改）
- 无域名黑白名单

## 设计与计划

- [设计 spec](docs/superpowers/specs/2026-06-13-immersive-translation-extension-design.md)
- [实施计划](docs/superpowers/plans/2026-06-13-immersive-translation-extension-plan.md)

## License

MIT（待添加 LICENSE 文件）
