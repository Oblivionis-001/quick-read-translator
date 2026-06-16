import browser from "webextension-polyfill";
import { ConfigRepository } from "@/domain/interfaces/ConfigRepository";
import { AppConfig } from "@/shared/types";

const STORAGE_KEY = "appConfig";

export class BrowserStorageConfigRepo implements ConfigRepository {
  async load(): Promise<AppConfig | null> {
    const data = await browser.storage.local.get(STORAGE_KEY);
    return (data[STORAGE_KEY] as AppConfig | undefined) ?? null;
  }

  async save(config: AppConfig): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEY]: config });
  }
}
