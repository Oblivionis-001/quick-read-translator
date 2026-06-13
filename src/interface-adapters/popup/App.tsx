import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { ConfigService } from "@/application/ConfigService";
import { BrowserStorageConfigRepo } from "@/infrastructure/repositories/BrowserStorageConfigRepo";
import type { AppConfig } from "@/shared/types";

const configService = new ConfigService(new BrowserStorageConfigRepo());

type Status =
  | "ready"
  | "translating"
  | "done"
  | "unsupported-url"
  | "no-content-script"
  | "error";

const STATUS_TEXT: Record<Status, string> = {
  ready: "",
  translating: "Translating…",
  done: "Done",
  "unsupported-url": "Open a web page to translate.",
  "no-content-script": "Reload the page and try again.",
  error: "Failed to trigger translation",
};

const STATUS_RESET_MS = 2000;

export default function App() {
  const [status, setStatus] = useState<Status>("ready");
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    configService.getConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  const translateCurrentPage = async () => {
    setStatus("translating");
    try {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab.id) {
        setStatus("error");
        return;
      }
      // Filter out restricted schemes (chrome://, chrome-extension://,
      // PDF viewers, file://, etc.) up front: sendMessage to these will
      // always throw because no content script is permitted there. With
      // activeTab + host_permissions: ["<all_urls>"], tab.url is readable
      // when the popup is invoked; if it is undefined for any reason the
      // regex will simply not match and we fall through to the
      // unsupported-url branch, which is a safe fallback.
      const url = tab.url ?? "";
      if (!/^https?:\/\//i.test(url)) {
        setStatus("unsupported-url");
        return;
      }
      await browser.tabs.sendMessage(tab.id, { type: "TRIGGER_TRANSLATE" });
      setStatus("done");
      setTimeout(() => setStatus("ready"), STATUS_RESET_MS);
    } catch (err) {
      // The classic "Could not establish connection. Receiving end does
      // not exist." happens when the content script has not been injected
      // yet (e.g. the tab was opened before the extension was installed,
      // or the page is mid-reload). Tell the user to reload instead of
      // surfacing a generic "broken" message.
      const message = err instanceof Error ? err.message : String(err);
      if (/receiving end does not exist/i.test(message)) {
        setStatus("no-content-script");
      } else {
        console.error("[qrt] popup trigger failed:", err);
        setStatus("error");
      }
    }
  };

  const openSettings = () => {
    browser.runtime.openOptionsPage();
  };

  const currentProviderName =
    config?.providers.find((p) => p.id === config.currentProviderId)?.name ??
    "—";

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-lg font-normal">Quick Read Translator</h1>
        {config && (
          <p className="text-xs text-sequoia-grey">
            Provider: {currentProviderName}
            {" · "}
            Target: {config.targetLanguage}
          </p>
        )}
      </header>

      <button
        type="button"
        className="w-full bg-sequoia-green text-white py-2 mb-2 hover:bg-sequoia-dark-green disabled:opacity-50"
        onClick={translateCurrentPage}
        disabled={status === "translating"}
      >
        {status === "translating" ? "Translating…" : "Translate This Page"}
      </button>

      <button
        type="button"
        className="w-full bg-sequoia-button text-white py-2 mb-2"
        onClick={openSettings}
      >
        Open Settings
      </button>

      {STATUS_TEXT[status] && (
        <p
          className={`text-xs mt-2 ${
            status === "error" ||
            status === "unsupported-url" ||
            status === "no-content-script"
              ? "text-sequoia-red"
              : "text-sequoia-grey"
          }`}
        >
          {STATUS_TEXT[status]}
        </p>
      )}
    </div>
  );
}
