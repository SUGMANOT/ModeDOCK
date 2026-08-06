import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { canonicalJson } from "./canonical-json.js";

export function sha256Bytes(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export function sha256Object(value: unknown): string {
  return sha256Bytes(canonicalJson(value));
}
