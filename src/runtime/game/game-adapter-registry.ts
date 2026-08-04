import { ModeDockError } from "../../core/errors.js";
import type { TargetProfile } from "../../types/index.js";
import { SampleUnityMonoAdapter } from "./sample-unity-mono-adapter.js";
import type { GameAdapter, GameInstallation } from "./types.js";

export class GameAdapterRegistry {
  private readonly adapters = new Map<string, GameAdapter>();
  constructor(adapters: GameAdapter[] = [new SampleUnityMonoAdapter()]) { for (const adapter of adapters) this.register(adapter); }
  register(adapter: GameAdapter): void { if (!adapter.id || this.adapters.has(adapter.id)) throw new ModeDockError(`Duplicate game adapter ID: ${adapter.id}.`, "GAME_ADAPTER_DUPLICATE"); this.adapters.set(adapter.id, adapter); }
  get(id: string): GameAdapter { const adapter = this.adapters.get(id); if (!adapter) throw new ModeDockError(`Unknown game adapter: ${id}.`, "GAME_ADAPTER_NOT_FOUND"); return adapter; }
  list(): GameAdapter[] { return [...this.adapters.values()]; }
  async resolve(target: TargetProfile): Promise<{ adapter: GameAdapter; installation: GameInstallation }> {
    const installation = { rootDir: target.rootDir, executable: target.executable, target };
    for (const adapter of this.adapters.values()) if ((await adapter.inspect(installation)).supported) return { adapter, installation };
    throw new ModeDockError("No runtime GameAdapter supports this installation/version. File management remains available.", "GAME_RUNTIME_UNSUPPORTED", { target: target.id });
  }
}
