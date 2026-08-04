import { mkdir } from "node:fs/promises";
import type { ConfigService } from "../services/config/config-service.js";
import { bootstrapConfig } from "../services/config/config-service.js";
import type { DataPaths } from "../services/filesystem/paths.js";
import { AdapterRegistry } from "../adapters/adapter-registry.js";
import { FormatRegistry } from "../adapters/formats/format-registry.js";
import { TargetStore } from "./stores/target-store.js";
import { InstallationStore } from "./stores/installation-store.js";
import { HistoryStore } from "./stores/history-store.js";
import { TargetService } from "./targets/target-service.js";
import { InstallerService } from "./installer/installer-service.js";
import { BackupService } from "./backups/backup-service.js";
import { DoctorService } from "./diagnostics/doctor-service.js";
import { LegacyMigrationService } from "./migration/legacy-migration.js";
import { UpdateService } from "./update/update-service.js";
import { Logger } from "../services/logger/logger.js";
import { exists } from "../services/filesystem/safe-fs.js";
import { RuntimeService } from "../runtime/game/runtime-service.js";

export interface AppContext {
  config: ConfigService;
  paths: DataPaths;
  adapters: AdapterRegistry;
  formats: FormatRegistry;
  targetStore: TargetStore;
  installationStore: InstallationStore;
  targets: TargetService;
  installer: InstallerService;
  backups: BackupService;
  doctor: DoctorService;
  migration: LegacyMigrationService;
  update: UpdateService;
  logger: Logger;
  runtime: RuntimeService;
  initialize(): Promise<unknown>;
}

export async function createAppContext(options: { configPath?: string; dataDir?: string; verbose?: boolean } = {}): Promise<AppContext> {
  const { config, paths } = await bootstrapConfig(options);
  const adapters = new AdapterRegistry();
  const adapterErrors = await adapters.loadCustom(config.getAll());
  const formats = new FormatRegistry();
  const targetStore = new TargetStore(paths);
  const installationStore = new InstallationStore(paths);
  const history = new HistoryStore(paths);
  const logger = new Logger(paths.logs, config.get("logLevel"), options.verbose);
  const targets = new TargetService(targetStore, installationStore, adapters, config, paths);
  const installer = new InstallerService(paths, installationStore, history, adapters, formats, () => config.getAll(), logger);
  const backups = new BackupService(paths, installationStore);
  const migration = new LegacyMigrationService(paths, targetStore, installationStore);
  const doctor = new DoctorService(paths, () => config.getAll(), targets, installationStore, installer, adapterErrors);
  const update = new UpdateService();
  const runtime = new RuntimeService(paths, installationStore, installer);

  return {
    config, paths, adapters, formats, targetStore, installationStore, targets, installer, backups, doctor, migration, update, logger, runtime,
    async initialize() {
      await Promise.all([paths.root, paths.installations, paths.backups, paths.disabled, paths.snapshots, paths.transactions, paths.logs, paths.runtimePlans].map(directory => mkdir(directory, { recursive: true })));
      if (!await exists(config.file)) await config.replace(config.getAll());
      return migration.run();
    }
  };
}
