import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  // 3 min per test: launching a fresh Chrome profile + extension is slow on
  // the first run of a session. Tighter timeouts cause spurious failures.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    // Chrome extensions only load in headed mode (a real browser window).
    // For headless CI, wrap `npm run e2e` in xvfb-run.
    //
    // We deliberately do NOT set `channel: "chrome"` here. With a channel
    // set, Playwright launches the system Chrome Stable binary AND injects
    // `--disable-extensions` (overriding our `--load-extension`), so the
    // extension never installs. Without a channel, Playwright uses its
    // bundled Chromium which honors --disable-extensions-except.
    headless: false,
  },
});
