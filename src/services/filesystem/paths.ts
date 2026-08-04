import os from "node:os";
import path from "node:path";

export function defaultDataDir(): string {
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA ?? os.homedir(), "ModeDOCK");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "ModeDOCK");
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "moddock");
}

export function legacyDataDir(): string {
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA ?? os.homedir(), "ModForgeLauncher");
  return path.join(os.homedir(), ".local", "share", "ModForgeLauncher");
}

export class DataPaths {
  constructor(public readonly root: string) {}

  get config(): string { return path.join(this.root, "config.json"); }
  get targets(): string { return path.join(this.root, "targets.json"); }
  get installations(): string { return path.join(this.root, "installations"); }
  get backups(): string { return path.join(this.root, "backups"); }
  get disabled(): string { return path.join(this.root, "disabled"); }
  get snapshots(): string { return path.join(this.root, "snapshots"); }
  get transactions(): string { return path.join(this.root, "transactions"); }
  get logs(): string { return path.join(this.root, "logs"); }
  get history(): string { return path.join(this.root, "history.ndjson"); }
  get migration(): string { return path.join(this.root, "migration.json"); }
  get runtimePlans(): string { return path.join(this.root, "runtime-plans"); }

  installationDir(targetId: string): string { return path.join(this.installations, targetId); }
  installation(targetId: string, id: string): string { return path.join(this.installationDir(targetId), `${id}.json`); }
  backupDir(targetId: string, id: string): string { return path.join(this.backups, targetId, id); }
  disabledDir(targetId: string, id: string): string { return path.join(this.disabled, targetId, id); }
  snapshotDir(targetId: string, id: string): string { return path.join(this.snapshots, targetId, id); }
  transaction(id: string): string { return path.join(this.transactions, `${id}.json`); }
}
