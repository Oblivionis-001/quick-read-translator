import { describe, it, expect } from "vitest";
import { ConfigService } from "@/application/ConfigService";
import { ConfigRepository } from "@/domain/interfaces/ConfigRepository";
import { AppConfig, ProviderConfig } from "@/shared/types";

/**
 * In-memory ConfigRepository for tests. Avoids needing the browser global.
 */
class FakeRepo implements ConfigRepository {
  private store: AppConfig | null = null;

  async load(): Promise<AppConfig | null> {
    return this.store;
  }

  async save(config: AppConfig): Promise<void> {
    this.store = config;
  }
}

describe("ConfigService", () => {
  it("returns default config when repo empty", async () => {
    const repo = new FakeRepo();
    const service = new ConfigService(repo);

    const config = await service.getConfig();

    expect(config.providers).toHaveLength(1);
    expect(config.providers[0].name).toBe("Zhipu GLM");
    expect(config.providers[0].id).toBe("glm");
    expect(config.targetLanguage).toBe("zh-CN");
    expect(config.sourceLanguage).toBe("auto");
    expect(config.hotkey).toBe("Alt+T");
    expect(config.hoverButtonEnabled).toBe(true);
    expect(config.selectionTriggerEnabled).toBe(true);
  });

  it("saves and loads custom config", async () => {
    const repo = new FakeRepo();
    const service = new ConfigService(repo);

    const original = await service.getConfig();
    const updated: AppConfig = {
      ...original,
      targetLanguage: "ja",
      currentProviderId: "custom",
      providers: [
        {
          ...(original.providers[0] as ProviderConfig),
          apiKey: "abc-123",
        },
      ],
    };

    await service.saveConfig(updated);

    const fresh = new ConfigService(repo);
    const loaded = await fresh.getConfig();

    expect(loaded.targetLanguage).toBe("ja");
    expect(loaded.currentProviderId).toBe("custom");
    expect(loaded.providers[0].apiKey).toBe("abc-123");
  });
});
