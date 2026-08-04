import { mkdir, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  DestinationKind, InstallOptions, InstallPlan, InstallationFile, InstallationRecord, ModeDockConfig,
  PlannedFile, TargetProfile, TransactionJournal
} from "../../types/index.js";
import type { DataPaths } from "../../services/filesystem/paths.js";
import type { InstallationStore } from "../stores/installation-store.js";
import type { HistoryStore } from "../stores/history-store.js";
import type { AdapterRegistry } from "../../adapters/adapter-registry.js";
import type { FormatRegistry } from "../../adapters/formats/format-registry.js";
import type { Logger } from "../../services/logger/logger.js";
import {
  atomicCopy, atomicWrite, ensureInside, exists, normalizeRelative, rejectNestedLinks, safeId, sha256File
} from "../../services/filesystem/safe-fs.js";
import { readJson, writeJson } from "../../services/config/json-file.js";
import { ConfirmationRequiredError, ModeDockError } from "../errors.js";
import { normalizeExtension } from "../../adapters/targets/manual-adapter.js";

export type InstallationHealth = "active" | "disabled" | "error";

export class InstallerService {
  constructor(
    private readonly paths: DataPaths,
    private readonly store: InstallationStore,
    private readonly history: HistoryStore,
    private readonly adapters: AdapterRegistry,
    private readonly formats: FormatRegistry,
    private readonly config: () => ModeDockConfig,
    private readonly logger: Logger
  ) {}

  async plan(source: string, target: TargetProfile, options: InstallOptions = {}): Promise<InstallPlan> {
    const targetIssues = await this.adapters.forProfile(target).validate(target);
    if (targetIssues.length) throw new ModeDockError(`Target is invalid:\n- ${targetIssues.join("\n- ")}`, "INVALID_TARGET", targetIssues);
    const expanded = await this.formats.expand(source, this.config());
    const name = path.basename(expanded.sourcePath, path.extname(expanded.sourcePath));
    const packageEntries = new Set(expanded.entries.map(entry => normalizeRelative(entry.relative).toLowerCase()));
    if (packageEntries.has("bin/moddock.mjs") && packageEntries.has("include/moddock_plugin.h"))
      throw new ModeDockError(
        "The selected package is a ModeDOCK application distribution, not a game mod. Install ModeDOCK with install.ps1 and select an actual mod archive for the game.",
        "APPLICATION_PACKAGE_NOT_MOD",
        { markers: ["bin/moddock.mjs", "include/moddock_plugin.h"] }
      );
    const existingRecords = await this.store.list(target.id);
    const duplicate = existingRecords.find(item => item.name.toLowerCase() === name.toLowerCase() && item.id !== options.excludeInstallationId);
    if (duplicate) throw new ModeDockError(
      `'${name}' is already installed (ID ${duplicate.id}). Run: moddock reinstall ${duplicate.id}`,
      "DUPLICATE_INSTALL",
      { installationId: duplicate.id, name: duplicate.name }
    );
    const owners = new Map<string, string>();
    for (const record of existingRecords.filter(item => item.enabled && item.id !== options.excludeInstallationId))
      for (const file of record.files) owners.set(file.relative.toLowerCase(), record.name);

    const supportedExtensions = target.supportedExtensions.map(normalizeExtension);
    const unsupportedEntries = options.force ? [] : expanded.entries.filter(entry => {
      const extension = normalizeExtension(path.extname(entry.relative));
      return !supportedExtensions.includes(extension) && !([".mjs", ".cjs"].includes(extension) && supportedExtensions.includes(".js"));
    });
    if (unsupportedEntries.length) {
      const shown = unsupportedEntries.slice(0, 12).map(entry => `- ${path.extname(entry.relative) || "<no extension>"}: ${entry.relative}`);
      if (unsupportedEntries.length > shown.length) shown.push(`- ...and ${unsupportedEntries.length - shown.length} more`);
      throw new ModeDockError(
        `Package contains unsupported game-mod files:\n${shown.join("\n")}\nChoose the actual mod archive, update the target profile, or use --force only if you understand every file.`,
        "UNSUPPORTED_FORMAT",
        { files: unsupportedEntries.map(entry => entry.relative) }
      );
    }
    const adapter = this.adapters.forProfile(target);
    const files: PlannedFile[] = [];
    for (const entry of expanded.entries) {
      const extension = normalizeExtension(path.extname(entry.relative));
      const destinationKind = options.destination ?? adapter.routeFile(target, entry.relative);
      const destinationRoot = this.destinationRoot(target, destinationKind);
      const preserveTree = expanded.type !== "file";
      const relativeWithinDestination = this.relativeWithinDestination(target, destinationKind, entry.relative, preserveTree);
      const destination = ensureInside(target.rootDir, path.join(destinationRoot, relativeWithinDestination));
      await rejectNestedLinks(target.rootDir, destination);
      const targetRelative = normalizeRelative(path.relative(target.rootDir, destination));
      const owner = owners.get(targetRelative.toLowerCase());
      files.push({ ...entry, destination, targetRelative, destinationKind, exists: await exists(destination), conflictOwner: owner });
    }
    const conflicts = files.filter(file => file.conflictOwner).map(file => ({ path: file.targetRelative, owner: file.conflictOwner! }));
    if (conflicts.length) throw new ModeDockError(
      `Installation conflicts with active managed files:\n${conflicts.map(item => `- ${item.path} (${item.owner})`).join("\n")}`,
      "FILE_CONFLICT", conflicts);
    return {
      id: randomUUID().replaceAll("-", ""),
      target,
      sourcePath: expanded.sourcePath,
      sourceName: path.basename(expanded.sourcePath),
      sourceType: expanded.type,
      name,
      adapterId: adapter.id,
      files,
      overwrites: files.filter(file => file.exists).map(file => file.targetRelative),
      conflicts,
      totalBytes: files.reduce((total, file) => total + file.size, 0)
    };
  }

  async install(plan: InstallPlan, options: InstallOptions = {}): Promise<InstallationRecord> {
    if (options.dryRun) throw new ModeDockError("A dry-run plan cannot be applied.", "DRY_RUN_ONLY");
    if (plan.overwrites.length && !options.force)
      throw new ConfirmationRequiredError(`Installation would overwrite ${plan.overwrites.length} existing file(s). Confirm or use --force.`, plan.overwrites);
    if (plan.overwrites.length && (options.noBackup || !this.config().createBackups))
      throw new ModeDockError("ModeDOCK refuses to overwrite existing files without a backup. Enable backups or choose a different destination.", "BACKUP_REQUIRED");

    const backupRoot = this.paths.backupDir(plan.target.id, plan.id);
    const journal: TransactionJournal = {
      id: plan.id,
      operation: "install",
      targetId: plan.target.id,
      targetRoot: plan.target.rootDir,
      createdAt: new Date().toISOString(),
      files: plan.files.map(file => ({
        destination: file.destination,
        targetRelative: file.targetRelative,
        backupPath: file.exists ? path.join(backupRoot, file.targetRelative) : undefined,
        hadOriginal: file.exists,
        expectedSha256: file.sha256,
        state: "planned"
      }))
    };
    await writeJson(this.paths.transaction(journal.id), journal);
    const installedFiles: InstallationFile[] = [];
    try {
      for (let index = 0; index < plan.files.length; index++) {
        const file = plan.files[index]!;
        const tx = journal.files[index]!;
        let originalSha256: string | undefined;
        if (file.exists) {
          originalSha256 = await sha256File(file.destination);
          await atomicCopy(file.destination, tx.backupPath!);
        }
        tx.state = "prepared";
        await writeJson(this.paths.transaction(journal.id), journal);
        if (file.sourcePath) await atomicCopy(file.sourcePath, file.destination);
        else if (file.content) await atomicWrite(file.destination, file.content);
        else throw new ModeDockError(`Planned source content is missing: ${file.targetRelative}`, "INVALID_PLAN");
        const actualHash = await sha256File(file.destination);
        if (actualHash !== file.sha256) throw new ModeDockError(`Hash verification failed after writing ${file.targetRelative}.`, "HASH_MISMATCH");
        tx.state = "applied";
        installedFiles.push({
          relative: file.targetRelative,
          sha256: actualHash,
          size: file.size,
          hadOriginal: file.exists,
          backupCreated: file.exists,
          originalSha256
        });
        await writeJson(this.paths.transaction(journal.id), journal);
      }
      const now = new Date().toISOString();
      const record: InstallationRecord = {
        id: plan.id,
        targetId: plan.target.id,
        adapterId: plan.adapterId,
        name: plan.name,
        sourcePath: plan.sourcePath,
        sourceName: plan.sourceName,
        sourceType: plan.sourceType,
        installedAt: now,
        updatedAt: now,
        enabled: true,
        files: installedFiles
      };
      await this.store.save(record);
      await rm(this.paths.transaction(journal.id), { force: true });
      await this.history.add("install", record.targetId, record.id);
      await this.logger.write("info", "install", { targetId: record.targetId, itemId: record.id, files: record.files.length });
      return record;
    } catch (error) {
      const rollbackErrors = await this.rollbackJournal(journal);
      if (!rollbackErrors.length) await rm(this.paths.transaction(journal.id), { force: true });
      await this.logger.write("error", "install-failed", { targetId: plan.target.id, error: (error as Error).message, rollbackErrors });
      if (rollbackErrors.length) throw new ModeDockError(
        `${(error as Error).message}\nRollback was incomplete:\n- ${rollbackErrors.join("\n- ")}`,
        "ROLLBACK_INCOMPLETE", rollbackErrors);
      throw error;
    }
  }

  async health(target: TargetProfile, record: InstallationRecord): Promise<InstallationHealth> {
    try {
      for (const file of record.files) {
        const destination = ensureInside(target.rootDir, path.join(target.rootDir, normalizeRelative(file.relative)));
        const payload = record.enabled ? destination : path.join(this.paths.disabledDir(target.id, record.id), file.relative);
        if (!await exists(payload) || await sha256File(payload) !== file.sha256) return "error";
        if (file.hadOriginal) {
          const backup = path.join(this.paths.backupDir(target.id, record.id), file.relative);
          if (!file.backupCreated || !await exists(backup)) return "error";
          if (file.originalSha256 && await sha256File(backup) !== file.originalSha256) return "error";
          if (!record.enabled && (!await exists(destination) || await sha256File(destination) !== await sha256File(backup))) return "error";
        } else if (!record.enabled && await exists(destination)) return "error";
      }
      return record.enabled ? "active" : "disabled";
    } catch { return "error"; }
  }

  async preview(target: TargetProfile, record: InstallationRecord, action: "enable" | "disable" | "remove"): Promise<Array<{ action: string; path: string }>> {
    return record.files.map(file => ({
      action: action === "enable" ? "restore payload" : file.hadOriginal ? "restore original" : "remove payload",
      path: path.join(target.rootDir, file.relative)
    }));
  }

  async disable(target: TargetProfile, record: InstallationRecord, force = false): Promise<void> {
    if (!record.enabled) return;
    if (!force && await this.health(target, record) !== "active") throw new ModeDockError("Managed files changed or backups are missing; disable was cancelled.", "INTEGRITY_ERROR");
    const parkedRoot = this.paths.disabledDir(target.id, record.id);
    const moved: Array<{ destination: string; parked: string }> = [];
    try {
      for (const file of record.files) {
        const destination = ensureInside(target.rootDir, path.join(target.rootDir, file.relative));
        const parked = path.join(parkedRoot, file.relative);
        if (!await exists(destination)) throw new ModeDockError(`Managed file is missing: ${file.relative}`, "INTEGRITY_ERROR", { path: file.relative });
        if (file.hadOriginal) {
          const backup = path.join(this.paths.backupDir(target.id, record.id), file.relative);
          if (!file.backupCreated || !await exists(backup)) throw new ModeDockError(`Required original backup is missing: ${file.relative}`, "BACKUP_MISSING", { path: file.relative });
          if (file.originalSha256 && await sha256File(backup) !== file.originalSha256) throw new ModeDockError(`Original backup changed: ${file.relative}`, "BACKUP_INTEGRITY_ERROR", { path: file.relative });
        }
        await mkdir(path.dirname(parked), { recursive: true });
        await atomicCopy(destination, parked);
        moved.push({ destination, parked });
        if (file.hadOriginal) await atomicCopy(path.join(this.paths.backupDir(target.id, record.id), file.relative), destination);
        else await rm(destination, { force: true });
      }
    } catch (error) {
      for (const item of moved.reverse()) if (await exists(item.parked)) await atomicCopy(item.parked, item.destination);
      throw error;
    }
    record.enabled = false;
    record.updatedAt = new Date().toISOString();
    await this.store.save(record);
    await this.history.add("disable", target.id, record.id);
  }

  async enable(target: TargetProfile, record: InstallationRecord, force = false): Promise<void> {
    if (record.enabled) return;
    if (!force && await this.health(target, record) !== "disabled") throw new ModeDockError("Disabled payload or restored originals changed; enable was cancelled.", "INTEGRITY_ERROR");
    const owners = new Map<string, string>();
    for (const active of (await this.store.list(target.id)).filter(item => item.enabled && item.id !== record.id))
      for (const file of active.files) owners.set(file.relative.toLowerCase(), active.name);
    for (const file of record.files) {
      const owner = owners.get(file.relative.toLowerCase());
      if (owner) throw new ModeDockError(`${file.relative} is already owned by active item '${owner}'.`, "FILE_CONFLICT");
    }
    for (const file of record.files) {
      const destination = ensureInside(target.rootDir, path.join(target.rootDir, file.relative));
      const parked = path.join(this.paths.disabledDir(target.id, record.id), file.relative);
      if (!await exists(parked)) throw new ModeDockError(`Disabled payload is missing: ${file.relative}`, "INTEGRITY_ERROR", { path: file.relative });
      await atomicCopy(parked, destination);
      await rm(parked, { force: true });
    }
    await rm(this.paths.disabledDir(target.id, record.id), { recursive: true, force: true });
    record.enabled = true;
    record.updatedAt = new Date().toISOString();
    await this.store.save(record);
    await this.history.add("enable", target.id, record.id);
  }

  async remove(target: TargetProfile, record: InstallationRecord, force = false): Promise<void> {
    if (record.enabled) {
      if (force && await this.health(target, record) !== "active") {
        for (const file of record.files) {
          const destination = path.join(target.rootDir, file.relative);
          if (file.hadOriginal && file.backupCreated) await atomicCopy(path.join(this.paths.backupDir(target.id, record.id), file.relative), destination);
          else if (await exists(destination) && await sha256File(destination) === file.sha256) await rm(destination, { force: true });
        }
      } else await this.disable(target, record);
    }
    await rm(this.paths.backupDir(target.id, record.id), { recursive: true, force: true });
    await rm(this.paths.disabledDir(target.id, record.id), { recursive: true, force: true });
    await this.store.remove(target.id, record.id);
    await this.history.add("remove", target.id, record.id);
  }

  async reinstall(target: TargetProfile, record: InstallationRecord, options: InstallOptions = {}): Promise<InstallationRecord> {
    if (!record.sourcePath || !await exists(record.sourcePath))
      throw new ModeDockError("The original source is unavailable; provide it with a new install command.", "SOURCE_MISSING");
    const wasEnabled = record.enabled;
    if (wasEnabled) await this.disable(target, record, options.force === true);
    try {
      const plan = await this.plan(record.sourcePath, target, { ...options, excludeInstallationId: record.id });
      const replacement = await this.install(plan, { ...options, force: true });
      await rm(this.paths.backupDir(target.id, record.id), { recursive: true, force: true });
      await rm(this.paths.disabledDir(target.id, record.id), { recursive: true, force: true });
      await this.store.remove(target.id, record.id);
      await this.history.add("reinstall", target.id, replacement.id);
      return replacement;
    } catch (error) {
      if (wasEnabled) await this.enable(target, record, options.force === true).catch(() => undefined);
      throw error;
    }
  }

  async interrupted(): Promise<TransactionJournal[]> {
    if (!await exists(this.paths.transactions)) return [];
    const { readdir } = await import("node:fs/promises");
    const result: TransactionJournal[] = [];
    for (const file of await readdir(this.paths.transactions)) {
      if (!file.endsWith(".json")) continue;
      try { result.push(await readJson<TransactionJournal>(path.join(this.paths.transactions, file))); } catch { /* doctor handles corrupt state */ }
    }
    return result;
  }

  async recoverInterrupted(): Promise<Array<{ id: string; errors: string[] }>> {
    const results: Array<{ id: string; errors: string[] }> = [];
    for (const journal of await this.interrupted()) {
      if (journal.operation === "install" && await exists(this.paths.installation(journal.targetId, journal.id))) {
        await rm(this.paths.transaction(journal.id), { force: true });
        results.push({ id: journal.id, errors: [] });
        continue;
      }
      const errors = await this.rollbackJournal(journal);
      if (!errors.length) await rm(this.paths.transaction(journal.id), { force: true });
      results.push({ id: journal.id, errors });
    }
    return results;
  }

  private destinationRoot(target: TargetProfile, kind: DestinationKind | string): string {
    const relative = kind === "root" ? "."
      : kind === "mods" ? target.modsDir
      : kind === "plugins" ? target.pluginsDir
      : kind === "config" ? target.configDir
      : normalizeRelative(kind);
    return ensureInside(target.rootDir, path.join(target.rootDir, relative));
  }

  private relativeWithinDestination(
    target: TargetProfile,
    kind: DestinationKind | string,
    sourceRelative: string,
    preserveTree: boolean
  ): string {
    if (!preserveTree) return path.basename(sourceRelative);
    const source = normalizeRelative(sourceRelative);
    const configured = normalizeRelative(
      kind === "root" ? "."
        : kind === "mods" ? target.modsDir
        : kind === "plugins" ? target.pluginsDir
        : kind === "config" ? target.configDir
        : kind
    );
    if (configured === ".") return source;

    const sourceParts = source.split("/");
    const configuredParts = configured.split("/");
    const startsAtDestination = configuredParts.every(
      (part, index) => sourceParts[index]?.toLowerCase() === part.toLowerCase()
    );
    if (!startsAtDestination || sourceParts.length === configuredParts.length) return source;
    return normalizeRelative(sourceParts.slice(configuredParts.length).join("/"));
  }

  private async rollbackJournal(journal: TransactionJournal): Promise<string[]> {
    const errors: string[] = [];
    for (const file of [...journal.files].reverse()) {
      if (file.state === "planned") continue;
      try {
        if (file.hadOriginal && file.backupPath && await exists(file.backupPath)) await atomicCopy(file.backupPath, file.destination);
        else if (await exists(file.destination) && await sha256File(file.destination) === file.expectedSha256) await rm(file.destination, { force: true });
      } catch (error) { errors.push(`${file.targetRelative}: ${(error as Error).message}`); }
    }
    return errors;
  }
}
