import path from "node:path";
import { rm } from "node:fs/promises";
import type { DetectedTarget, ModeDockConfig, TargetProfile } from "../../types/index.js";
import type { ConfigService } from "../../services/config/config-service.js";
import type { AdapterRegistry } from "../../adapters/adapter-registry.js";
import type { TargetStore } from "../stores/target-store.js";
import type { InstallationStore } from "../stores/installation-store.js";
import type { DataPaths } from "../../services/filesystem/paths.js";
import { ModeDockError } from "../errors.js";
import { analyzeInstallation, type AnalyzedTargetInput } from "../../adapters/targets/detection-utils.js";

export class TargetService {
  constructor(
    private readonly store: TargetStore,
    private readonly installations: InstallationStore,
    private readonly adapters: AdapterRegistry,
    private readonly config: ConfigService,
    private readonly paths: DataPaths
  ) {}

  async list(): Promise<TargetProfile[]> { return this.store.list(); }

  async analyze(rootDir: string, preferredExecutable?: string, preferredName?: string): Promise<AnalyzedTargetInput> {
    return analyzeInstallation(rootDir, preferredExecutable, preferredName);
  }

  async active(selector?: string): Promise<TargetProfile> {
    return this.store.resolve(selector ?? this.config.get("defaultTarget"));
  }

  async add(input: Partial<TargetProfile> & Pick<TargetProfile, "name" | "rootDir" | "executable">): Promise<TargetProfile> {
    const adapter = this.adapters.get(input.adapterId ?? "manual");
    const profile = adapter.createProfile(input);
    const issues = await adapter.validate(profile);
    if (issues.length) throw new ModeDockError(`Target validation failed:\n- ${issues.join("\n- ")}`, "INVALID_TARGET", issues);
    await this.store.save(profile);
    if (!this.config.get("defaultTarget")) await this.config.set("defaultTarget", profile.id);
    return profile;
  }

  async edit(selector: string, changes: Partial<TargetProfile>): Promise<TargetProfile> {
    const current = await this.store.resolve(selector);
    const adapter = this.adapters.get(changes.adapterId ?? current.adapterId);
    const updated = adapter.createProfile({ ...current, ...changes, id: current.id, createdAt: current.createdAt });
    const hasInstalls = (await this.installations.list(current.id)).length > 0;
    if (hasInstalls && path.resolve(updated.rootDir).toLowerCase() !== path.resolve(current.rootDir).toLowerCase())
      throw new ModeDockError("The target root cannot change while mods or plugins are installed.", "TARGET_IN_USE");
    const issues = await adapter.validate(updated);
    if (issues.length) throw new ModeDockError(`Target validation failed:\n- ${issues.join("\n- ")}`, "INVALID_TARGET", issues);
    await this.store.save(updated);
    return updated;
  }

  async select(selector: string): Promise<TargetProfile> {
    const target = await this.store.resolve(selector);
    await this.config.set("defaultTarget", target.id);
    return target;
  }

  async remove(selector: string, force = false): Promise<TargetProfile> {
    const target = await this.store.resolve(selector);
    const installed = await this.installations.list(target.id);
    if (installed.length && !force) {
      const items = installed.map(item => `- ${item.name} (${item.id}): moddock remove ${item.id} --target ${target.id} --force`).join("\n");
      throw new ModeDockError(
        `Target '${target.name}' still has ${installed.length} managed item(s).\n${items}\nTo forget only the profile and leave game files untouched, run: moddock target remove ${target.id} --force`,
        "TARGET_IN_USE",
        { targetId: target.id, items: installed.map(item => ({ id: item.id, name: item.name })) }
      );
    }
    await this.store.remove(target.id);
    if (force) {
      await rm(this.paths.installationDir(target.id), { recursive: true, force: true });
      await rm(path.join(this.paths.backups, target.id), { recursive: true, force: true });
      await rm(path.join(this.paths.disabled, target.id), { recursive: true, force: true });
    }
    if (this.config.get("defaultTarget") === target.id) {
      const next = (await this.store.list()).sort((a, b) => a.name.localeCompare(b.name))[0];
      await this.config.set("defaultTarget", next?.id);
    }
    return target;
  }

  async validate(selector?: string): Promise<Array<{ target: TargetProfile; issues: string[] }>> {
    const targets = selector ? [await this.store.resolve(selector)] : await this.store.list();
    return Promise.all(targets.map(async target => ({ target, issues: await this.adapters.forProfile(target).validate(target) })));
  }

  async detect(adapterId?: string): Promise<DetectedTarget[]> {
    const config = this.config.getAll();
    const adapters = adapterId
      ? [this.adapters.get(adapterId)]
      : this.adapters.list().filter(adapter => ["steam", "epic"].includes(adapter.id));
    const groups = await Promise.all(adapters.map(adapter => adapter.detect({ roots: config.detectionRoots, platform: process.platform })));
    const existing = new Set((await this.store.list()).map(item => path.resolve(item.rootDir).toLowerCase()));
    return groups.flat().filter(item => !existing.has(path.resolve(item.rootDir).toLowerCase()));
  }

  async addDetected(detected: DetectedTarget): Promise<TargetProfile> {
    const analyzed = await this.analyze(detected.rootDir, detected.executable, detected.name);
    return this.add({ ...analyzed, adapterId: detected.adapterId, ...(detected.loader ? { loader: detected.loader } : {}) });
  }

  inspect(target: TargetProfile) {
    return {
      ...target,
      executablePath: path.isAbsolute(target.executable) ? target.executable : path.join(target.rootDir, target.executable),
      directories: {
        root: target.rootDir,
        mods: path.join(target.rootDir, target.modsDir),
        plugins: path.join(target.rootDir, target.pluginsDir),
        config: path.join(target.rootDir, target.configDir)
      }
    };
  }
}
