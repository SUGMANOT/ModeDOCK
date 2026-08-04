import { pathToFileURL } from "node:url";
import type { ModeDockConfig, TargetAdapter, TargetProfile } from "../types/index.js";
import { ModeDockError } from "../core/errors.js";
import { ManualTargetAdapter } from "./targets/manual-adapter.js";
import { SteamTargetAdapter } from "./targets/steam-adapter.js";
import { EpicTargetAdapter } from "./targets/epic-adapter.js";
import { StandardTargetAdapter } from "./targets/standard-adapter.js";

export class AdapterRegistry {
  private readonly adapters = new Map<string, TargetAdapter>();

  constructor() {
    this.register(new ManualTargetAdapter());
    this.register(new SteamTargetAdapter());
    this.register(new EpicTargetAdapter());
    this.register(new StandardTargetAdapter());
  }

  register(adapter: TargetAdapter): void {
    if (!adapter.id || this.adapters.has(adapter.id)) throw new ModeDockError(`Duplicate or empty adapter ID: ${adapter.id}`, "ADAPTER_ERROR");
    this.adapters.set(adapter.id, adapter);
  }

  async loadCustom(config: ModeDockConfig): Promise<string[]> {
    const errors: string[] = [];
    for (const file of config.customAdapters) {
      try {
        const module = await import(pathToFileURL(file).href);
        const adapter = (module.default ?? module.adapter) as TargetAdapter;
        this.register(adapter);
      } catch (error) { errors.push(`${file}: ${(error as Error).message}`); }
    }
    return errors;
  }

  get(id: string): TargetAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new ModeDockError(`Unknown target adapter: ${id}`, "ADAPTER_NOT_FOUND");
    return adapter;
  }

  forProfile(profile: TargetProfile): TargetAdapter { return this.get(profile.adapterId); }
  list(): TargetAdapter[] { return [...this.adapters.values()]; }
}
