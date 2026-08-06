import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ModeDockCore,
  ModeDockCoreError,
  ValidationError,
  validateChallengeCapsule,
  type ChallengeCapsuleManifest
} from "../src/index.js";

async function challengeFixture(t: test.TestContext): Promise<{ root: string; state: string; game: string; capsule: string; core: ModeDockCore }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "moddock-challenge-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = path.join(root, "state");
  const game = path.join(root, "game");
  await Promise.all([mkdir(state), mkdir(game)]);
  const core = await ModeDockCore.open({ dataDir: state });
  await core.createProfile({
    id: "challenge-profile",
    gameId: "test-game",
    gameVersion: "1.5.0",
    rootDir: game,
    loaderId: "bepinex",
    loaderVersion: "5.4.23",
    destinations: { root: ".", plugins: "BepInEx/plugins" }
  });
  const capsule = path.join(root, "challenge.json");
  return { root, state, game, capsule, core };
}

function capsuleManifest(): ChallengeCapsuleManifest {
  return {
    schemaVersion: 1,
    id: "creator.example-challenge",
    version: "1.0.0",
    title: "Example Challenge Capsule",
    audience: ["player", "streamer", "creator", "launcher"],
    game: {
      id: "test-game",
      version: ">=1.0.0 <2.0.0",
      loader: { id: "bepinex", version: "^5.4.0" }
    },
    environment: { mode: "overlay", packages: {} },
    brief: {
      objective: "Create a result file and report the score.",
      rules: ["Keep the prepared environment unchanged."],
      estimatedMinutes: 10,
      difficulty: "standard"
    },
    evidence: {
      requireStableEnvironment: true,
      watch: [{ path: "saves/challenge-result.json", capture: "copy", required: true, maxBytes: 1024 }],
      claims: [
        { id: "score", label: "Score", type: "number", required: true },
        { id: "completed", label: "Completed", type: "boolean", required: true }
      ]
    },
    handoff: {
      label: "Start with any launcher",
      instructions: ["ModeDOCK does not start the game."],
      consumerData: { overlay: "example" }
    }
  };
}

test("Challenge Capsule prepares, arms, captures evidence, produces a result, and restores", async t => {
  const f = await challengeFixture(t);
  await writeFile(f.capsule, JSON.stringify(capsuleManifest(), null, 2));

  const inspection = await f.core.challenges.inspect(f.capsule, "challenge-profile");
  assert.equal(inspection.compatible, true);
  assert.equal(inspection.capsule.environment.mode, "overlay");

  const preview = await f.core.challenges.prepare("challenge-profile", f.capsule, { dryRun: true });
  assert.equal(preview.session, undefined);
  assert.deepEqual(await f.core.challenges.list(), []);

  const prepared = await f.core.challenges.prepare("challenge-profile", f.capsule);
  assert.equal(prepared.session?.status, "prepared");
  const sessionId = prepared.session!.id;

  const ticket = await f.core.challenges.arm(sessionId, { participant: "StreamerOne" });
  assert.equal(ticket.participant, "StreamerOne");
  assert.match(ticket.integrity, /^[a-f0-9]{64}$/);

  await mkdir(path.join(f.game, "saves"), { recursive: true });
  await writeFile(path.join(f.game, "saves", "challenge-result.json"), JSON.stringify({ score: 4200 }));
  const outputDir = path.join(f.root, "result-bundle");
  const finished = await f.core.challenges.finish(sessionId, {
    claims: { score: 4200, completed: true },
    outputDir
  });

  assert.equal(finished.result.verdict.valid, true);
  assert.equal(finished.result.environmentStable, true);
  assert.equal(finished.result.evidence[0]!.changed, true);
  assert.equal(finished.result.evidence[0]!.after.exists, true);
  assert.equal(await readFile(path.join(outputDir, "evidence", "saves", "challenge-result.json"), "utf8"), JSON.stringify({ score: 4200 }));
  assert.equal(JSON.parse(await readFile(finished.resultPath, "utf8")).integrity, finished.result.integrity);

  const restored = await f.core.challenges.restore(sessionId);
  assert.equal(restored.session?.status, "restored");
  assert.deepEqual((await f.core.profiles.get("challenge-profile")).requirements, {});
});

test("Challenge result records an invalid verdict when environment or required claims changed", async t => {
  const f = await challengeFixture(t);
  const manifest = capsuleManifest();
  manifest.evidence!.watch![0]!.required = false;
  await writeFile(f.capsule, JSON.stringify(manifest, null, 2));
  const prepared = await f.core.challenges.prepare("challenge-profile", f.capsule);
  const sessionId = prepared.session!.id;
  await f.core.challenges.arm(sessionId);

  const profile = await f.core.profiles.get("challenge-profile");
  await f.core.profiles.save({ ...profile, requirements: { "outside.change": "*" } });
  const finished = await f.core.challenges.finish(sessionId, { claims: { score: 1 } });
  assert.equal(finished.result.verdict.valid, false);
  assert.equal(finished.result.environmentStable, false);
  assert.equal(finished.result.verdict.requiredClaimsPresent, false);
  assert.equal(finished.result.verdict.reasons.length, 2);

  await f.core.challenges.restore(sessionId);
  assert.deepEqual((await f.core.profiles.get("challenge-profile")).requirements, {});
});

test("Challenge Capsule validation rejects unsafe evidence and active-session stacking", async t => {
  assert.throws(
    () => validateChallengeCapsule({ ...capsuleManifest(), evidence: { watch: [{ path: "." }] } }),
    (error: unknown) => error instanceof ValidationError
  );
  assert.throws(
    () => validateChallengeCapsule({ ...capsuleManifest(), evidence: { watch: [{ path: "../secret" }] } }),
    (error: unknown) => error instanceof ValidationError
  );

  const f = await challengeFixture(t);
  await writeFile(f.capsule, JSON.stringify(capsuleManifest(), null, 2));
  await f.core.challenges.prepare("challenge-profile", f.capsule);
  await assert.rejects(
    () => f.core.challenges.prepare("challenge-profile", f.capsule),
    (error: unknown) => error instanceof ModeDockCoreError && error.code === "CHALLENGE_SESSION_ACTIVE"
  );
});
