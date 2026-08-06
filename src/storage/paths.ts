import os from "node:os";
import path from "node:path";
import { validateId } from "../validation.js";

export function defaultDataDir(): string {
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA ?? os.homedir(), "ModeDOCK", "core");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "ModeDOCK", "core");
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "moddock", "core");
}

export class CorePaths {
  readonly root: string;
  readonly profiles: string;
  readonly transactions: string;
  readonly cache: string;
  readonly challenges: string;
  readonly challengeSessions: string;
  readonly challengeResults: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.profiles = path.join(this.root, "profiles");
    this.transactions = path.join(this.root, "transactions");
    this.cache = path.join(this.root, "cache");
    this.challenges = path.join(this.root, "challenges");
    this.challengeSessions = path.join(this.challenges, "sessions");
    this.challengeResults = path.join(this.challenges, "results");
  }

  profileDir(profileId: string): string { return path.join(this.profiles, validateId(profileId, "profile ID")); }
  profile(profileId: string): string { return path.join(this.profileDir(profileId), "profile.json"); }
  lockfile(profileId: string): string { return path.join(this.profileDir(profileId), "moddock.lock.json"); }
  profileMutex(profileId: string): string { return path.join(this.profileDir(profileId), ".sync.lock"); }
  originals(profileId: string): string { return path.join(this.profileDir(profileId), "originals"); }
  original(profileId: string, key: string): string { return path.join(this.originals(profileId), `${key}.bin`); }
  transactionDir(transactionId: string): string { return path.join(this.transactions, validateId(transactionId, "transaction ID")); }
  journal(transactionId: string): string { return path.join(this.transactionDir(transactionId), "journal.json"); }
  staging(transactionId: string): string { return path.join(this.transactionDir(transactionId), "staging"); }
  snapshots(transactionId: string): string { return path.join(this.transactionDir(transactionId), "snapshots"); }
  challengeSessionDir(sessionId: string): string { return path.join(this.challengeSessions, validateId(sessionId, "challenge session ID")); }
  challengeSession(sessionId: string): string { return path.join(this.challengeSessionDir(sessionId), "session.json"); }
  challengeSessionMutex(sessionId: string): string { return path.join(this.challengeSessionDir(sessionId), ".session.lock"); }
  challengeProfileMutex(profileId: string): string { return path.join(this.profileDir(profileId), ".challenge.lock"); }
  challengeResultDir(resultId: string): string { return path.join(this.challengeResults, validateId(resultId, "challenge result ID")); }
  challengeResult(resultId: string): string { return path.join(this.challengeResultDir(resultId), "result.json"); }
}
