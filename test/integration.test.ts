import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ModeDockCore, ModeDockCoreError, type ModPackageManifest, type SyncPlan } from "../src/index.js";
import { packMod, buildRegistry } from "../src/publisher/index.js";

interface Fixture {
  root: string;
  state: string;
  game: string;
  registry: string;
}

async function fixture(t: test.TestContext): Promise<Fixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), "moddock-core-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = path.join(root, "state");
  const game = path.join(root, "game");
  const registry = path.join(root, "registry");
  await Promise.all([mkdir(state), mkdir(game), mkdir(registry)]);
  return { root, state, game, registry };
}

async function createPackage(
  root: string,
  registry: string,
  manifest: Omit<ModPackageManifest, "schemaVersion">,
  files: Record<string, string>
): Promise<void> {
  const source = path.join(root, "sources", `${manifest.id}-${manifest.version}`);
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, "moddock.json"), JSON.stringify({ schemaVersion: 1, ...manifest }, null, 2));
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(source, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  await packMod(source, registry);
}

async function configuredCore(f: Fixture): Promise<ModeDockCore> {
  const core = await ModeDockCore.open({ dataDir: f.state });
  await core.createProfile({
    id: "test-profile",
    gameId: "test-game",
    gameVersion: "1.5.0",
    rootDir: f.game,
    loaderId: "bepinex",
    loaderVersion: "5.4.23",
    destinations: { root: ".", plugins: "BepInEx/plugins", config: "BepInEx/config" }
  });
  await core.addRegistry("test-profile", { name: "local", location: path.join(f.registry, "registry.json") });
  return core;
}

const commonManifest = (version: string): Omit<ModPackageManifest, "schemaVersion"> => ({
  id: "common.api",
  version,
  name: "Common API",
  game: { id: "test-game", version: ">=1.0.0 <2.0.0" },
  loader: { id: "bepinex", version: "^5.4.0" },
  files: [{ source: "Common.dll", destination: "plugins" }]
});

const uiManifest = (version: string): Omit<ModPackageManifest, "schemaVersion"> => ({
  id: "better.ui",
  version,
  name: "Better UI",
  game: { id: "test-game", version: "^1.0.0" },
  loader: { id: "bepinex", version: "^5.4.0" },
  dependencies: { "common.api": "^1.0.0" },
  files: [{ source: "BetterUI.dll", destination: "plugins" }]
});

test("publisher, registry, resolver, dry-run, install, verify, and remove form a complete workflow", async t => {
  const f = await fixture(t);
  await createPackage(f.root, f.registry, commonManifest("1.0.0"), { "Common.dll": "common-v1" });
  await createPackage(f.root, f.registry, commonManifest("1.1.0"), { "Common.dll": "common-v1.1" });
  await createPackage(f.root, f.registry, uiManifest("1.0.0"), { "BetterUI.dll": "ui-v1" });
  await buildRegistry(f.registry);
  const core = await configuredCore(f);

  const preview = await core.add("test-profile", "better.ui@^1.0.0", { dryRun: true }) as SyncPlan;
  assert.deepEqual(preview.nextLock.resolutionOrder, ["common.api", "better.ui"]);
  assert.equal(preview.nextLock.packages["common.api"]!.version, "1.1.0");
  assert.equal(preview.summary.filesWritten, 2);
  await assert.rejects(() => readFile(path.join(f.game, "BepInEx", "plugins", "BetterUI.dll")), /ENOENT/);

  const lock = await core.applyPlan(preview);
  assert.equal(lock.packages["better.ui"]!.version, "1.0.0");
  assert.equal(await readFile(path.join(f.game, "BepInEx", "plugins", "Common.dll"), "utf8"), "common-v1.1");
  assert.equal(await readFile(path.join(f.game, "BepInEx", "plugins", "BetterUI.dll"), "utf8"), "ui-v1");
  assert.equal((await core.verify("test-profile")).ok, true);

  await core.remove("test-profile", "better.ui");
  await assert.rejects(() => readFile(path.join(f.game, "BepInEx", "plugins", "BetterUI.dll")), /ENOENT/);
  await assert.rejects(() => readFile(path.join(f.game, "BepInEx", "plugins", "Common.dll")), /ENOENT/);
  assert.deepEqual((await core.profiles.get("test-profile")).requirements, {});
});

test("unmanaged files are backed up once, preserved through updates, and restored on removal", async t => {
  const f = await fixture(t);
  await mkdir(path.join(f.game, "BepInEx", "plugins"), { recursive: true });
  const destination = path.join(f.game, "BepInEx", "plugins", "Shared.dll");
  await writeFile(destination, "original-game-file");
  const manifest = (version: string): Omit<ModPackageManifest, "schemaVersion"> => ({
    id: "shared.override",
    version,
    name: "Shared override",
    game: { id: "test-game" },
    files: [{ source: "Shared.dll", destination: "plugins" }]
  });
  await createPackage(f.root, f.registry, manifest("1.0.0"), { "Shared.dll": "mod-v1" });
  await buildRegistry(f.registry);
  const core = await configuredCore(f);
  await core.add("test-profile", "shared.override@*");
  assert.equal(await readFile(destination, "utf8"), "mod-v1");

  await createPackage(f.root, f.registry, manifest("1.1.0"), { "Shared.dll": "mod-v1.1" });
  await buildRegistry(f.registry);
  await core.update("test-profile");
  assert.equal(await readFile(destination, "utf8"), "mod-v1.1");

  await core.remove("test-profile", "shared.override");
  assert.equal(await readFile(destination, "utf8"), "original-game-file");
});

test("a plan is rejected when the destination changes after planning", async t => {
  const f = await fixture(t);
  await createPackage(f.root, f.registry, {
    id: "race.test", version: "1.0.0", name: "Race test", game: { id: "test-game" },
    files: [{ source: "Race.dll", destination: "plugins" }]
  }, { "Race.dll": "payload" });
  await buildRegistry(f.registry);
  const core = await configuredCore(f);
  const plan = await core.add("test-profile", "race.test", { dryRun: true }) as SyncPlan;
  const destination = path.join(f.game, "BepInEx", "plugins", "Race.dll");
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, "appeared-after-plan");
  await assert.rejects(
    () => core.applyPlan(plan),
    (error: unknown) => error instanceof ModeDockCoreError && error.code === "PLAN_STALE"
  );
  assert.equal(await readFile(destination, "utf8"), "appeared-after-plan");
});

test("failed multi-file transaction rolls back files, lockfile, and profile requirements", async t => {
  const f = await fixture(t);
  await createPackage(f.root, f.registry, {
    id: "rollback.test", version: "1.0.0", name: "Rollback test", game: { id: "test-game" },
    files: [
      { source: "One.dll", destination: "plugins" },
      { source: "Two.dll", destination: "plugins" }
    ]
  }, { "One.dll": "one", "Two.dll": "two" });
  await buildRegistry(f.registry);
  let fired = false;
  const core = await ModeDockCore.open({
    dataDir: f.state,
    faultInjector(point) {
      if (point === "after-file" && !fired) { fired = true; throw new Error("injected failure"); }
    }
  });
  await core.createProfile({
    id: "test-profile", gameId: "test-game", rootDir: f.game,
    destinations: { root: ".", plugins: "BepInEx/plugins" }
  });
  await core.addRegistry("test-profile", { name: "local", location: path.join(f.registry, "registry.json") });
  await assert.rejects(() => core.add("test-profile", "rollback.test"), /injected failure/);
  for (const name of ["One.dll", "Two.dll"]) {
    await assert.rejects(() => readFile(path.join(f.game, "BepInEx", "plugins", name)), /ENOENT/);
  }
  assert.equal(await core.profiles.readLock("test-profile"), undefined);
  assert.deepEqual((await core.profiles.get("test-profile")).requirements, {});
  assert.deepEqual(await core.pendingTransactions(), []);
});

test("verification reports external modification", async t => {
  const f = await fixture(t);
  await createPackage(f.root, f.registry, {
    id: "verify.test", version: "1.0.0", name: "Verify test", game: { id: "test-game" },
    files: [{ source: "Verify.dll", destination: "plugins" }]
  }, { "Verify.dll": "verified" });
  await buildRegistry(f.registry);
  const core = await configuredCore(f);
  await core.add("test-profile", "verify.test");
  await writeFile(path.join(f.game, "BepInEx", "plugins", "Verify.dll"), "tampered");
  const report = await core.verify("test-profile");
  assert.equal(report.ok, false);
  assert.equal(report.issues[0]!.code, "MODIFIED");
});

test("lockfile backup paths cannot escape the profile state directory", async t => {
  const f = await fixture(t);
  await mkdir(path.join(f.game, "BepInEx", "plugins"), { recursive: true });
  await writeFile(path.join(f.game, "BepInEx", "plugins", "Owned.dll"), "original");
  await createPackage(f.root, f.registry, {
    id: "backup.path-test", version: "1.0.0", name: "Backup path test", game: { id: "test-game" },
    files: [{ source: "Owned.dll", destination: "plugins" }]
  }, { "Owned.dll": "managed" });
  await buildRegistry(f.registry);
  const core = await configuredCore(f);
  await core.add("test-profile", "backup.path-test");
  const lockPath = core.paths.lockfile("test-profile");
  const lock = JSON.parse(await readFile(lockPath, "utf8")) as { files: Record<string, { original?: { path: string } }> };
  const lockedFile = Object.values(lock.files)[0]!;
  assert.ok(lockedFile.original);
  lockedFile.original!.path = path.join(f.root, "outside-backup.bin");
  await writeFile(lockPath, JSON.stringify(lock, null, 2));
  await assert.rejects(
    () => core.profiles.readLock("test-profile"),
    (error: unknown) => error instanceof ModeDockCoreError && error.code === "CORRUPT_STATE"
  );
});

test("recovery rejects a journal whose destination does not match the game root", async t => {
  const f = await fixture(t);
  const core = await ModeDockCore.open({ dataDir: f.state });
  const profile = await core.createProfile({ id: "secure-profile", gameId: "test-game", rootDir: f.game });
  const outside = path.join(f.root, "outside.txt");
  await writeFile(outside, "do-not-touch");
  const transactionId = "maliciousjournal";
  const emptyLock = {
    schemaVersion: 1,
    profileId: profile.id,
    generatedAt: new Date().toISOString(),
    requirements: {},
    resolutionOrder: [],
    packages: {},
    files: {}
  };
  const journal = {
    schemaVersion: 1,
    id: transactionId,
    profileId: profile.id,
    gameRoot: profile.game.rootDir,
    createdAt: new Date().toISOString(),
    state: "mutating",
    previousProfile: profile,
    nextProfile: profile,
    nextLock: emptyLock,
    files: [{
      operation: {
        action: "remove",
        targetRelative: "safe.txt",
        destination: outside,
        precondition: { kind: "absent" }
      },
      state: "snapshotted"
    }]
  };
  await mkdir(core.paths.transactionDir(transactionId), { recursive: true });
  await writeFile(core.paths.journal(transactionId), JSON.stringify(journal, null, 2));
  await assert.rejects(() => core.recover(transactionId), /destination escaped the game root/);
  assert.equal(await readFile(outside, "utf8"), "do-not-touch");
});

test("resolver rejects mutually conflicting direct requirements", async t => {
  const f = await fixture(t);
  await createPackage(f.root, f.registry, {
    id: "conflict.left", version: "1.0.0", name: "Left", game: { id: "test-game" },
    conflicts: { "conflict.right": "*" },
    files: [{ source: "Left.dll", destination: "plugins" }]
  }, { "Left.dll": "left" });
  await createPackage(f.root, f.registry, {
    id: "conflict.right", version: "1.0.0", name: "Right", game: { id: "test-game" },
    files: [{ source: "Right.dll", destination: "plugins" }]
  }, { "Right.dll": "right" });
  await buildRegistry(f.registry);
  const core = await configuredCore(f);
  await core.add("test-profile", "conflict.left");
  await assert.rejects(
    () => core.add("test-profile", "conflict.right", { dryRun: true }),
    (error: unknown) => error instanceof ModeDockCoreError && error.code === "RESOLUTION_ERROR"
  );
});
