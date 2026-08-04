import { randomUUID } from "node:crypto";
import type { TargetProfile } from "../../types/index.js";
import type { DataPaths } from "../../services/filesystem/paths.js";
import { safeId } from "../../services/filesystem/safe-fs.js";
import { readJson, writeJson } from "../../services/config/json-file.js";
import { ModeDockError } from "../errors.js";

export class TargetStore {
  constructor(private readonly paths: DataPaths) {}

  async list(): Promise<TargetProfile[]> { return readJson<TargetProfile[]>(this.paths.targets, []); }

  async save(target: TargetProfile): Promise<TargetProfile> {
    safeId(target.id);
    const targets = await this.list();
    const index = targets.findIndex(item => item.id === target.id);
    if (index >= 0) targets[index] = target; else targets.push(target);
    await writeJson(this.paths.targets, targets);
    return target;
  }

  async create(input: Omit<TargetProfile, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<TargetProfile> {
    const now = new Date().toISOString();
    return this.save({ ...input, id: input.id ?? randomUUID().replaceAll("-", ""), createdAt: now, updatedAt: now });
  }

  async resolve(selector?: string): Promise<TargetProfile> {
    const targets = await this.list();
    if (!selector) {
      if (targets.length === 1) return targets[0]!;
      throw new ModeDockError(targets.length ? "Select a target with --target <name-or-id>." : "No targets exist. Run 'moddock target add'.", "TARGET_REQUIRED");
    }
    return resolveNamed(selector, targets, "target");
  }

  async remove(id: string): Promise<void> {
    safeId(id);
    const targets = await this.list();
    await writeJson(this.paths.targets, targets.filter(item => item.id !== id));
  }
}

export function resolveNamed<T extends { id: string; name: string }>(selector: string, items: T[], kind: string): T {
  const exactId = items.find(item => item.id.toLowerCase() === selector.toLowerCase());
  if (exactId) return exactId;
  const names = items.filter(item => item.name.toLowerCase() === selector.toLowerCase());
  if (names.length === 1) return names[0]!;
  if (names.length > 1) throw new ModeDockError(`${kind} name '${selector}' is ambiguous; use its ID.`, "AMBIGUOUS_SELECTOR");
  const prefixes = items.filter(item => item.id.toLowerCase().startsWith(selector.toLowerCase()));
  if (prefixes.length === 1) return prefixes[0]!;
  if (prefixes.length > 1) throw new ModeDockError(`${kind} ID prefix '${selector}' is ambiguous.`, "AMBIGUOUS_SELECTOR");
  throw new ModeDockError(`Unknown ${kind}: ${selector}`, "NOT_FOUND");
}
