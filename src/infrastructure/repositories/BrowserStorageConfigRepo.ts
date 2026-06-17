import browser from "webextension-polyfill";
import { ConfigRepository } from "@/domain/interfaces/ConfigRepository";
import { AppConfig } from "@/shared/types";
import { migrateConfig } from "./migrate";

const STORAGE_KEY = "appConfig";

export class BrowserStorageConfigRepo implements ConfigRepository {
  async load(): Promise<AppConfig | null> {
    const data = await browser.storage.local.get(STORAGE_KEY);
    const raw = data[STORAGE_KEY];
    if (raw === undefined) return null;

    const migrated = migrateConfig(raw);
    // Write back so the next load skips migration. Idempotent: re-running
    // migrate on the migrated form is a no-op (early-return branch).
    if ((raw as { schemaVersion?: number }).schemaVersion !== migrated.schemaVersion) {
      await browser.storage.local.set({ [STORAGE_KEY]: migrated });
    }
    return migrated;
  }

  async save(config: AppConfig): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEY]: config });
  }
}
