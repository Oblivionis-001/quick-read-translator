/**
 * End-to-end tests for the Quick Read Translator extension.
 *
 * These tests load the built Chrome extension (`.output/chrome-mv3/`),
 * open a local test page served over HTTP, and drive the same hotkey path
 * a user would. They are verification of the full content-script →
 * background → provider pipeline, not strict TDD red/green.
 *
 * Prerequisites (see `tests/e2e/fixtures.ts` for the shared setup):
 *  - Run `npm run build` so `.output/chrome-mv3/` is fresh.
 *  - `npx playwright install chrome` for the Chrome channel.
 *  - A display (Chrome extensions do not load in headless). On a headless
 *    dev box, wrap the run: `xvfb-run -a npm run e2e`.
 *
 * Why HTTP and not file://:
 *  Chrome MV3 content scripts do not run on `file://` URLs unless the user
 *  has manually toggled "Allow access to file URLs" on the extension card.
 *  We serve the fixture page from a local HTTP server to avoid that
 *  one-shot UI step.
 *
 * Provider configuration:
 *  - The translation-assertion test below requires a working provider. Set
 *    `GLM_API_KEY` in the environment before running; otherwise it skips.
 *  - The DOM-markup test does not need a provider and always runs.
 */

import { test, expect } from "./fixtures";
import http from "node:http";
import type { AddressInfo } from "node:net";

const FIXTURE_HTML = `<!DOCTYPE html>
  <html><body>
    <article>
      <p>The quick brown fox jumps over the lazy dog.</p>
      <p>Artificial intelligence is transforming how we read.</p>
    </article>
  </body></html>`;

/**
 * Start a one-shot HTTP server that always responds with the fixture HTML,
 * resolve to its base URL, and return a teardown function. The server is
 * bound to the loopback interface only.
 */
async function startFixtureServer(): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(FIXTURE_HTML);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${address.port}/`,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}

test("translates a paragraph via hotkey", async ({ context }) => {
  // Translation requires a working provider. Skip when no GLM key is
  // configured — the default AppConfig ships a single GLM provider, and
  // without a key the background script returns ok:false and renders
  // nothing. Skipping inside the test body keeps the DOM-markup test below
  // running even when no key is present.
  test.skip(!process.env.GLM_API_KEY, "requires GLM_API_KEY");

  const { url, close } = await startFixtureServer();
  try {
    const page = await context.newPage();
    await page.goto(url);

    // Click the first paragraph to focus the document.
    await page.locator("p").first().click();

    // Trigger translation via the default hotkey.
    await page.keyboard.press("Alt+T");

    // Wait for the rendered translation sibling to appear.
    const translation = page.locator(".qrt-translation").first();
    await expect(translation).toBeVisible({ timeout: 15_000 });
  } finally {
    await close();
  }
});

test("content script injects data-qrt-block-id on extraction", async ({ context }) => {
  const { url, close } = await startFixtureServer();
  try {
    const page = await context.newPage();
    await page.goto(url);

    // Hover a paragraph to exercise the mouseover handler. (Extraction
    // itself is triggered by the hotkey below, not by the hover.)
    await page.locator("p").first().hover();

    // Trigger via hotkey to force extractFromElement(document.body).
    await page.locator("p").first().click();
    await page.keyboard.press("Alt+T");

    // The data-qrt-block-id attribute is set during extraction, so at
    // least one paragraph should now carry it. Wait for the attribute
    // to appear (it is set synchronously inside the trigger handler).
    await page.waitForSelector("[data-qrt-block-id]", { timeout: 5_000 });
    const blockIds = await page.locator("[data-qrt-block-id]").count();
    expect(blockIds).toBeGreaterThan(0);
  } finally {
    await close();
  }
});
