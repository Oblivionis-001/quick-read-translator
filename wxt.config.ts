import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
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
