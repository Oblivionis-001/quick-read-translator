import { describe, expect, it } from "vitest";
import {
  addProvider,
  createProvider,
  deleteProvider,
  updateProvider,
  validateImportedConfig,
} from "@/interface-adapters/options/operations";
import type { AppConfig, ProviderConfig } from "@/shared/types";

function makeProvider(id: string, name: string = id): ProviderConfig {
  return {
    id,
    name,
    baseUrl: "https://example.com",
    apiKey: "",
    model: "m",
    temperature: 0.5,
    maxTokens: 100,
    systemPrompt: "",
    userPromptTemplate: "",
    enabled: true,
  };
}

function makeConfig(providers: ProviderConfig[]): AppConfig {
  return {
    targetLanguage: "zh-CN",
    sourceLanguage: "auto",
    currentProviderId: providers[0]?.id ?? "",
    providers,
    hotkey: "Alt+T",
    hoverButtonEnabled: true,
    selectionTriggerEnabled: true,
  };
}

describe("operations", () => {
  describe("createProvider", () => {
    it("returns a provider with the given id and default values", () => {
      const p = createProvider("xyz");
      expect(p.id).toBe("xyz");
      expect(p.enabled).toBe(true);
      expect(p.temperature).toBeGreaterThan(0);
      expect(p.maxTokens).toBeGreaterThan(0);
      expect(p.systemPrompt.length).toBeGreaterThan(0);
      expect(p.userPromptTemplate).toContain("{{target}}");
      expect(p.userPromptTemplate).toContain("{{source}}");
    });
  });

  describe("addProvider", () => {
    it("appends a new provider and switches current to it", () => {
      const config = makeConfig([makeProvider("a")]);
      const { config: next, newId } = addProvider(config, () => "b");
      expect(next.providers.map((p) => p.id)).toEqual(["a", "b"]);
      expect(next.currentProviderId).toBe("b");
      expect(newId).toBe("b");
    });

    it("does not mutate the original config", () => {
      const config = makeConfig([makeProvider("a")]);
      addProvider(config, () => "b");
      expect(config.providers.map((p) => p.id)).toEqual(["a"]);
    });
  });

  describe("deleteProvider", () => {
    it("removes the provider and reassigns current when needed", () => {
      const config = makeConfig([makeProvider("a"), makeProvider("b")]);
      config.currentProviderId = "a";
      const result = deleteProvider(config, "a");
      expect(result).not.toBeNull();
      expect(result!.config.providers.map((p) => p.id)).toEqual(["b"]);
      expect(result!.config.currentProviderId).toBe("b");
    });

    it("keeps currentProviderId when deleting a non-current provider", () => {
      const config = makeConfig([makeProvider("a"), makeProvider("b")]);
      config.currentProviderId = "a";
      const result = deleteProvider(config, "b");
      expect(result).not.toBeNull();
      expect(result!.config.providers.map((p) => p.id)).toEqual(["a"]);
      expect(result!.config.currentProviderId).toBe("a");
    });

    it("refuses to delete when only one provider remains", () => {
      const config = makeConfig([makeProvider("a")]);
      expect(deleteProvider(config, "a")).toBeNull();
    });
  });

  describe("updateProvider", () => {
    it("patches the matching provider and leaves others untouched", () => {
      const config = makeConfig([makeProvider("a"), makeProvider("b")]);
      const next = updateProvider(config, "a", { apiKey: "sk-x" });
      expect(next.providers[0].apiKey).toBe("sk-x");
      expect(next.providers[1].apiKey).toBe("");
    });

    it("does not mutate the original config", () => {
      const config = makeConfig([makeProvider("a")]);
      updateProvider(config, "a", { apiKey: "sk-x" });
      expect(config.providers[0].apiKey).toBe("");
    });
  });

  describe("validateImportedConfig", () => {
    it("returns the config when shape is valid", () => {
      const config = makeConfig([makeProvider("a")]);
      const result = validateImportedConfig(config);
      expect(result).not.toBeNull();
      expect(result!.currentProviderId).toBe("a");
      expect(result!.providers).toHaveLength(1);
    });

    it("returns null when providers missing", () => {
      const data = {
        targetLanguage: "zh-CN",
        currentProviderId: "a",
      };
      expect(validateImportedConfig(data)).toBeNull();
    });

    it("returns null when providers array is empty", () => {
      const data = {
        ...makeConfig([makeProvider("a")]),
        providers: [],
      };
      expect(validateImportedConfig(data)).toBeNull();
    });

    it("returns null when currentProviderId not in providers", () => {
      const data = makeConfig([makeProvider("a")]);
      data.currentProviderId = "nonexistent";
      expect(validateImportedConfig(data)).toBeNull();
    });

    it("returns null when data is not an object", () => {
      expect(validateImportedConfig(null)).toBeNull();
      expect(validateImportedConfig(undefined)).toBeNull();
      expect(validateImportedConfig("string")).toBeNull();
      expect(validateImportedConfig(42)).toBeNull();
      expect(validateImportedConfig([])).toBeNull();
    });

    it("returns null when a provider is missing a required string field", () => {
      const base = makeConfig([makeProvider("a")]);
      // remove baseUrl (required string)
      const badProvider = { ...base.providers[0] } as Record<string, unknown>;
      delete badProvider.baseUrl;
      const data = { ...base, providers: [badProvider] };
      expect(validateImportedConfig(data)).toBeNull();
    });

    it("returns null when a provider field has wrong type", () => {
      const base = makeConfig([makeProvider("a")]);
      const badProvider = { ...base.providers[0], baseUrl: 123 };
      const data = { ...base, providers: [badProvider] };
      expect(validateImportedConfig(data)).toBeNull();
    });

    it("returns null when currentProviderId is not a string", () => {
      const base = makeConfig([makeProvider("a")]);
      const data = { ...base, currentProviderId: 42 };
      expect(validateImportedConfig(data)).toBeNull();
    });
  });
});
