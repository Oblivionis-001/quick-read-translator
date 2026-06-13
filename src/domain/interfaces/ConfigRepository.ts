import { AppConfig } from "@/shared/types";

export interface ConfigRepository {
  load(): Promise<AppConfig | null>;
  save(config: AppConfig): Promise<void>;
}
