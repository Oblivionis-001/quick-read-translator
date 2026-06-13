import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
//
// srcDir is set to "src" so that WXT's built-in `@` alias resolves to
// `<root>/src/` (matching the project's tsconfig path mapping and the
// vitest alias). entrypointsDir is then configured relative to srcDir so
// the existing top-level entrypoints/ directory is still discovered.
export default defineConfig({
  srcDir: "src",
  entrypointsDir: "../entrypoints",
  manifest: {
    name: "Quick Read Translator",
    description: "Immersive bilingual translation for web pages",
    version: "0.1.0",
    permissions: ["storage", "activeTab"],
    host_permissions: ["<all_urls>"],
    action: {},
    options_ui: {
      page: "options.html",
      open_in_tab: true,
    },
  },
});
