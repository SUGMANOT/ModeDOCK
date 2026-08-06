import { chmod, copyFile, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CoreOptions, PlannedFileOperation, ProfileDocument, ProfileLockfile, SyncPlan, TransactionJournal } from "../types.js";
import { JOURNAL_SCHEMA_VERSION } from "../types.js";
import { ModeDockCoreError, PlanStaleError } from "../errors.js";
import { CorePaths } from "../storage/paths.js";
import { ProfileStore } from "../storage/profile-store.js";
import { readJsonFile, writeJsonFile } from "../storage/json.js";
import { readResource } from "../registry/resource.js";
import { rejectNestedLinks, resolveInside } from "../utils/path.js";
import { sha256Bytes, sha256File } from "../utils/hash.js";
import { validateJournal } from "../validation.js";

export class TransactionExecutor {
  private readonly fetchImpl: typeof fetch;
  private readonly faultInjector?: CoreOptions["faultInjector"];

  constructor(
    private readonly paths: CorePaths,
    private readonly store: ProfileStore,
    options: CoreOptions
  ) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.faultInjector = options.faultInjector;
  }

  async apply(profile: ProfileDocument, nextProfile: ProfileDocument, plan: SyncPlan, previousLock?: ProfileLockfile): Promise<ProfileLockfile> {
    if (plan.profileId !== profile.id) throw new ModeDockCoreError("Plan belongs to another profile.", "INVALID_PLAN");
    await this.preflight(profile, plan.operations);
    const transactionDir = this.paths.transactionDir(plan.id);
    const journal: TransactionJournal = {
      schemaVersion: JOURNAL_SCHEMA_VERSION,
      id: plan.id,
      profileId: profile.id,
      gameRoot: profile.game.rootDir,
      createdAt: new Date().toISOString(),
      state: "planned",
      ...(previousLock ? { previousLock } : {}),
      previousProfile: profile,
      nextProfile,
      nextLock: plan.nextLock,
      files: plan.operations.map(operation => ({ operation, state: "planned" }))
    };
    await mkdir(transactionDir, { recursive: true });
    await this.saveJournal(journal);
    try {
      await this.stage(journal);
      journal.state = "staged";
      await this.saveJournal(journal);
      await this.preflight(profile, plan.operations);
      journal.state = "mutating";
      await this.saveJournal(journal);
      for (let index = 0; index < journal.files.length; index++) {
        const entry = journal.files[index]!;
        await this.applyFile(profile, journal, index);
        await this.faultInjector?.("after-file", { transactionId: journal.id, index, operation: entry.operation });
      }
      await this.store.writeLock(plan.nextLock);
      await this.store.save(nextProfile);
      journal.state = "applied";
      await this.saveJournal(journal);
      await rm(transactionDir, { recursive: true, force: true });
      return plan.nextLock;
    } catch (error) {
      const rollbackErrors = await this.rollback(journal);
      if (!rollbackErrors.length) await rm(transactionDir, { recursive: true, force: true });
      if (rollbackErrors.length) {
        throw new ModeDockCoreError(
          `Transaction failed and rollback was incomplete: ${(error as Error).message}`,
          "ROLLBACK_INCOMPLETE",
          { cause: (error as Error).message, rollbackErrors, transactionId: journal.id },
          { cause: error as Error }
        );
      }
      throw error;
    }
  }

  async recover(transactionId: string): Promise<void> {
    const journal = validateJournal(await readJsonFile<unknown>(this.paths.journal(transactionId)));
    if (journal.state === "applied") {
      await this.store.writeLock(journal.nextLock);
      await this.store.save(journal.nextProfile);
      await rm(this.paths.transactionDir(transactionId), { recursive: true, force: true });
      return;
    }
    const errors = await this.rollback(journal);
    if (errors.length) throw new ModeDockCoreError(`Recovery was incomplete for transaction '${transactionId}'.`, "ROLLBACK_INCOMPLETE", errors);
    await rm(this.paths.transactionDir(transactionId), { recursive: true, force: true });
  }

  private async stage(journal: TransactionJournal): Promise<void> {
    await mkdir(this.paths.staging(journal.id), { recursive: true });
    for (let index = 0; index < journal.files.length; index++) {
      const entry = journal.files[index]!;
      if (entry.operation.action !== "write") continue;
      const operation = entry.operation;
      if (!operation.sourceUrl || !operation.sourceSha256 || operation.sourceSize === undefined) {
        throw new ModeDockCoreError(`Write operation has no source metadata: ${operation.targetRelative}`, "INVALID_PLAN");
      }
      const bytes = await readResource(operation.sourceUrl, this.fetchImpl);
      const actualHash = sha256Bytes(bytes);
      if (actualHash !== operation.sourceSha256 || bytes.byteLength !== operation.sourceSize) {
        throw new ModeDockCoreError(`Downloaded artifact failed integrity verification: ${operation.targetRelative}`, "ARTIFACT_INTEGRITY_ERROR", {
          expected: { sha256: operation.sourceSha256, size: operation.sourceSize },
          actual: { sha256: actualHash, size: bytes.byteLength }
        });
      }
      const staged = path.join(this.paths.staging(journal.id), `${index}.payload`);
      await writeDurable(staged, bytes);
      entry.stagedPayload = staged;
      await this.saveJournal(journal);
    }
  }

  private async applyFile(profile: ProfileDocument, journal: TransactionJournal, index: number): Promise<void> {
    const entry = journal.files[index]!;
    const operation = entry.operation;
    await rejectNestedLinks(profile.game.rootDir, operation.destination);
    await assertPrecondition(operation);
    const beforeExists = await regularFileExists(operation.destination);
    if (beforeExists) {
      const snapshot = path.join(this.paths.snapshots(journal.id), `${index}.before`);
      await mkdir(path.dirname(snapshot), { recursive: true });
      await copyFile(operation.destination, snapshot);
      entry.beforeSnapshot = snapshot;
    }
    entry.state = "snapshotted";
    await this.saveJournal(journal);

    if (operation.action === "write") {
      if (!entry.stagedPayload) throw new ModeDockCoreError("Staged payload is missing.", "INVALID_JOURNAL");
      if (operation.preserveOriginal) await this.ensureOriginalBackup(operation);
      await replaceFromFile(entry.stagedPayload, operation.destination);
      if (operation.executable && process.platform !== "win32") await chmod(operation.destination, 0o755);
      const actual = await sha256File(operation.destination);
      if (actual !== operation.sourceSha256) throw new ModeDockCoreError(`Written file failed verification: ${operation.targetRelative}`, "WRITE_INTEGRITY_ERROR");
    } else if (operation.action === "remove") {
      await rm(operation.destination, { force: true });
    } else {
      if (!operation.original) throw new ModeDockCoreError("Restore operation has no original backup.", "INVALID_PLAN");
      const backupHash = await sha256File(operation.original.path);
      if (backupHash !== operation.original.sha256) throw new ModeDockCoreError(`Original backup failed verification: ${operation.targetRelative}`, "BACKUP_INTEGRITY_ERROR");
      await replaceFromFile(operation.original.path, operation.destination);
    }
    entry.state = "applied";
    await this.saveJournal(journal);
  }

  private async ensureOriginalBackup(operation: PlannedFileOperation): Promise<void> {
    const original = operation.preserveOriginal!;
    if (await regularFileExists(original.path)) {
      const existingHash = await sha256File(original.path);
      const existingSize = (await stat(original.path)).size;
      if (existingHash !== original.sha256 || existingSize !== original.size) {
        throw new ModeDockCoreError(`Persistent original backup is corrupt: ${operation.targetRelative}`, "BACKUP_INTEGRITY_ERROR");
      }
      return;
    }
    if (!await regularFileExists(operation.destination)) {
      throw new PlanStaleError(operation.targetRelative, operation.precondition, { kind: "absent" });
    }
    const actualHash = await sha256File(operation.destination);
    const actualSize = (await stat(operation.destination)).size;
    if (actualHash !== original.sha256 || actualSize !== original.size) {
      throw new PlanStaleError(operation.targetRelative, original, { sha256: actualHash, size: actualSize });
    }
    await mkdir(path.dirname(original.path), { recursive: true });
    await copyFile(operation.destination, original.path);
    if (await sha256File(original.path) !== original.sha256) throw new ModeDockCoreError("Could not verify original backup.", "BACKUP_INTEGRITY_ERROR");
  }

  private async preflight(profile: ProfileDocument, operations: PlannedFileOperation[]): Promise<void> {
    for (const operation of operations) {
      await rejectNestedLinks(profile.game.rootDir, operation.destination);
      await assertPrecondition(operation);
    }
  }

  private async rollback(journal: TransactionJournal): Promise<string[]> {
    const errors: string[] = [];
    for (let index = journal.files.length - 1; index >= 0; index--) {
      const entry = journal.files[index]!;
      if (entry.state === "planned") continue;
      try {
        const expectedDestination = resolveInside(journal.gameRoot, entry.operation.targetRelative);
        if (path.resolve(entry.operation.destination) !== expectedDestination) {
          throw new ModeDockCoreError(`Journal destination mismatch: ${entry.operation.targetRelative}`, "CORRUPT_STATE");
        }
        await rejectNestedLinks(journal.gameRoot, expectedDestination);
        const expectedSnapshot = path.join(this.paths.snapshots(journal.id), `${index}.before`);
        if (entry.beforeSnapshot && path.resolve(entry.beforeSnapshot) !== path.resolve(expectedSnapshot)) {
          throw new ModeDockCoreError(`Journal snapshot path mismatch: ${entry.operation.targetRelative}`, "CORRUPT_STATE");
        }
        if (entry.beforeSnapshot && await regularFileExists(expectedSnapshot)) {
          await replaceFromFile(expectedSnapshot, expectedDestination);
        } else {
          await rm(expectedDestination, { force: true });
        }
        entry.state = "planned";
      } catch (error) {
        errors.push(`${entry.operation.targetRelative}: ${(error as Error).message}`);
      }
    }
    try {
      if (journal.previousLock) await this.store.writeLock(journal.previousLock);
      else await rm(this.paths.lockfile(journal.profileId), { force: true });
      await this.store.save(journal.previousProfile);
    } catch (error) { errors.push(`lockfile: ${(error as Error).message}`); }
    if (!errors.length) {
      journal.state = "rolled-back";
      await this.saveJournal(journal).catch(() => undefined);
    }
    return errors;
  }

  private async saveJournal(journal: TransactionJournal): Promise<void> {
    await writeJsonFile(this.paths.journal(journal.id), journal);
  }
}

async function assertPrecondition(operation: PlannedFileOperation): Promise<void> {
  const exists = await regularFileExists(operation.destination);
  if (operation.precondition.kind === "absent") {
    if (exists) throw new PlanStaleError(operation.targetRelative, operation.precondition, { kind: "present", sha256: await sha256File(operation.destination) });
    return;
  }
  if (!exists) throw new PlanStaleError(operation.targetRelative, operation.precondition, { kind: "absent" });
  const actual = await sha256File(operation.destination);
  if (actual !== operation.precondition.sha256) {
    throw new PlanStaleError(operation.targetRelative, operation.precondition, { kind: "sha256", sha256: actual });
  }
}

async function replaceFromFile(source: string, destination: string): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.moddock-${randomUUID()}.tmp`);
  await copyFile(source, temporary);
  const handle = await open(temporary, "r+");
  try { await handle.sync(); } finally { await handle.close(); }
  try {
    if (process.platform === "win32" && await regularFileExists(destination)) {
      const previous = `${destination}.moddock-previous-${randomUUID()}`;
      await rename(destination, previous);
      try { await rename(temporary, destination); }
      catch (error) {
        await rename(previous, destination).catch(() => undefined);
        throw error;
      }
      await rm(previous, { force: true });
    } else {
      await rename(temporary, destination);
    }
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function writeDurable(file: string, bytes: Uint8Array): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const handle = await open(file, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
}

async function regularFileExists(file: string): Promise<boolean> {
  try { return (await stat(file)).isFile(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
