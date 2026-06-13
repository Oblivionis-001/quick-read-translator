import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { ConfigService } from "@/application/ConfigService";
import { BrowserStorageConfigRepo } from "@/infrastructure/repositories/BrowserStorageConfigRepo";
import type { AppConfig } from "@/shared/types";

const configService = new ConfigService(new BrowserStorageConfigRepo());

type Status = "ready" | "translating" | "done" | "error";

const STATUS_TEXT: Record<Status, string> = {
  ready: "",
  translating: "Translating…",
  done: "Done",
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
      await browser.tabs.sendMessage(tab.id, { type: "TRIGGER_TRANSLATE" });
      setStatus("done");
      setTimeout(() => setStatus("ready"), STATUS_RESET_MS);
    } catch (err) {
      console.error("[qrt] popup trigger failed:", err);
      setStatus("error");
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
            status === "error" ? "text-sequoia-red" : "text-sequoia-grey"
          }`}
        >
          {STATUS_TEXT[status]}
        </p>
      )}
    </div>
  );
}
