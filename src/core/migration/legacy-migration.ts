import { readdir } from "node:fs/promises";
import path from "node:path";
import type { InstallationRecord, TargetProfile } from "../../types/index.js";
import type { DataPaths } from "../../services/filesystem/paths.js";
import { legacyDataDir } from "../../services/filesystem/paths.js";
import { copyTree, exists } from "../../services/filesystem/safe-fs.js";
import { readJson, writeJson } from "../../services/config/json-file.js";
import type { TargetStore } from "../stores/target-store.js";
import type { InstallationStore } from "../stores/installation-store.js";
import { ManualTargetAdapter } from "../../adapters/targets/manual-adapter.js";

interface LegacyProfile { id: string; name: string; gameDir: string; executable: string; defaultTarget: string; }
interface LegacyManifest {
  id: string; profileId: string; name: string; sourceName: string; installedAt: string; enabled: boolean;
  files: Array<{ relative: string; sha256: string; hadOriginal: boolean; originalSha256?: string }>;
}

export class LegacyMigrationService {
  constructor(private readonly paths: DataPaths, private readonly targets: TargetStore, private readonly installations: InstallationStore) {}

  async run(): Promise<{ importedTargets: number; importedInstallations: number; skipped: boolean }> {
    if (await exists(this.paths.migration)) return { importedTargets: 0, importedInstallations: 0, skipped: true };
    const legacy = legacyDataDir();
    const profilesFile = path.join(legacy, "profiles.json");
    if (!await exists(profilesFile) || (await this.targets.list()).length) {
      await writeJson(this.paths.migration, { completedAt: new Date().toISOString(), reason: "nothing-to-import" });
      return { importedTargets: 0, importedInstallations: 0, skipped: true };
    }
    const adapter = new ManualTargetAdapter();
    const profiles = await readJson<LegacyProfile[]>(profilesFile, []);
    let importedInstallations = 0;
    for (const legacyProfile of profiles) {
      const profile: TargetProfile = adapter.createProfile({
        id: legacyProfile.id,
        name: legacyProfile.name,
        rootDir: legacyProfile.gameDir,
        executable: legacyProfile.executable,
        modsDir: legacyProfile.defaultTarget,
        pluginsDir: legacyProfile.defaultTarget,
        adapterId: "manual"
      });
      await this.targets.save(profile);
      const manifestDir = path.join(legacy, "manifests", legacyProfile.id);
      if (!await exists(manifestDir)) continue;
      for (const file of await readdir(manifestDir)) {
        if (!file.endsWith(".json")) continue;
        try {
          const manifest = await readJson<LegacyManifest>(path.join(manifestDir, file));
          const record: InstallationRecord = {
            id: manifest.id,
            targetId: profile.id,
            adapterId: "legacy-modforge",
            name: manifest.name,
            sourcePath: "",
            sourceName: manifest.sourceName,
            sourceType: "legacy",
            installedAt: manifest.installedAt,
            updatedAt: manifest.installedAt,
            enabled: manifest.enabled,
            files: manifest.files.map(item => ({ ...item, size: 0, backupCreated: item.hadOriginal }))
          };
          await this.installations.save(record);
          const oldBackup = path.join(legacy, "backups", profile.id, record.id);
          const oldDisabled = path.join(legacy, "disabled", profile.id, record.id);
          if (await exists(oldBackup)) await copyTree(oldBackup, this.paths.backupDir(profile.id, record.id));
          if (await exists(oldDisabled)) await copyTree(oldDisabled, this.paths.disabledDir(profile.id, record.id));
          importedInstallations++;
        } catch { /* keep importing other valid legacy manifests */ }
      }
    }
    await writeJson(this.paths.migration, {
      completedAt: new Date().toISOString(),
      source: legacy,
      importedTargets: profiles.length,
      importedInstallations
    });
    return { importedTargets: profiles.length, importedInstallations, skipped: false };
  }
}
