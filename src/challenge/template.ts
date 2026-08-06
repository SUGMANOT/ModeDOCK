import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChallengeCapsuleManifest, CreateChallengeTemplateInput } from "../types.js";
import { CHALLENGE_CAPSULE_SCHEMA_VERSION } from "../types.js";
import { validateChallengeCapsule, validateId } from "../validation.js";

export async function createChallengeTemplate(directory: string, input: CreateChallengeTemplateInput): Promise<{ directory: string; manifestPath: string; manifest: ChallengeCapsuleManifest }> {
  const target = path.resolve(directory);
  const id = validateId(input.id, "challenge capsule ID");
  const gameId = validateId(input.gameId, "challenge game ID");
  const manifest = validateChallengeCapsule({
    schemaVersion: CHALLENGE_CAPSULE_SCHEMA_VERSION,
    id,
    version: "1.0.0",
    title: input.title ?? "Example Challenge Capsule",
    summary: "A portable challenge contract: prepare the environment, issue a ticket, play using any launcher, then collect a result bundle.",
    authors: ["Your name"],
    audience: ["player", "streamer", "creator", "launcher"],
    tags: ["example", "challenge"],
    game: { id: gameId },
    environment: { mode: "overlay", packages: {} },
    brief: {
      objective: "Complete the challenge and record the requested result.",
      rules: ["Do not change the managed package environment after arming the challenge."],
      notes: ["ModeDOCK does not launch the game. Start it manually or through your preferred launcher after `capsule arm`."],
      estimatedMinutes: 30,
      difficulty: "standard"
    },
    evidence: {
      requireStableEnvironment: true,
      watch: [
        { path: "saves/challenge-result.json", capture: "copy", required: false, maxBytes: 1048576 }
      ],
      claims: [
        { id: "score", label: "Final score", type: "number", required: true },
        { id: "completed", label: "Challenge completed", type: "boolean", required: true }
      ]
    },
    handoff: {
      label: "Start the challenge in your usual launcher",
      instructions: [
        "Keep the ModeDOCK session ticket until the run is complete.",
        "Start the game manually, through Steam, or through a custom launcher.",
        "After the run, execute `moddock-core capsule finish <session-id>` with the requested claims."
      ],
      consumerData: { kind: "example-challenge" }
    }
  });
  await mkdir(target, { recursive: true });
  const manifestPath = path.join(target, "challenge.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await writeFile(path.join(target, "README.md"), `# ${manifest.title}\n\nEdit \`challenge.json\`, add package requirements and evidence paths, then validate it with:\n\n\`\`\`bash\nmoddock-core capsule inspect ./challenge.json\n\`\`\`\n`, { encoding: "utf8", flag: "wx" });
  return { directory: target, manifestPath, manifest };
}
