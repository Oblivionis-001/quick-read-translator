/**
 * Playwright fixtures for loading the built Chrome extension.
 *
 * Each test gets a fresh `context` backed by a temporary user-data directory
 * (Chrome refuses to launch a persistent context against an empty path, so we
 * create a real tempdir per test). The extension is force-loaded via
 * `--disable-extensions-except` + `--load-extension`.
 *
 * Prerequisites:
 *  - `.output/chrome-mv3/` must exist. Run `npm run build` first.
 *  - Playwright's bundled Chromium must be installed:
 *    `npx playwright install chromium`.
 *  - Chrome extensions only run in headed mode, so tests need a display.
 *    In headless CI wrap the run with `xvfb-run -a npm run e2e`.
 *
 * Why bundled Chromium and not the `chrome` channel:
 *  With `channel: "chrome"`, Playwright launches the system Google Chrome
 *  Stable and injects `--disable-extensions`, which overrides our
 *  `--load-extension` argument — Chrome Stable also emits a stderr warning
 *  ("--disable-extensions-except is not allowed in Google Chrome"). The
 *  bundled Chromium honors the flag pair, so we omit `channel` entirely.
 */

import { test as base, chromium, type BrowserContext } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

// ESM equivalent of CommonJS __dirname. The project's package.json has
// "type": "module", so __dirname is not defined at runtime.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const test = base.extend<{
  extensionId: string;
  context: BrowserContext;
}>({
  context: async ({}, use) => {
    const pathToExtension = path.resolve(__dirname, "../../.output/chrome-mv3");
    // launchPersistentContext requires a real directory; an empty string
    // throws "userDataDir: string cannot be empty". Use a fresh tempdir per
    // context so parallel/sequential runs do not collide on profile state.
    const userDataDir = mkdtempSync(path.join(tmpdir(), "qrt-playwright-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
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
    // MV3 background is a service worker. It may already be registered by
    // the time we look, or it may still be starting up.
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent("serviceworker");
    }
    const extensionId = background.url().split("/")[2];
    await use(extensionId);
  },
});

export const expect = test.expect;
