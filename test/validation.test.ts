import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRelative } from "../src/utils/path.js";
import { validateManifest } from "../src/validation.js";

test("path normalization rejects traversal, reserved names, alternate streams, and duplicate separators", () => {
  for (const unsafe of ["../escape.dll", "C:/escape.dll", "Mods//file.dll", "CON", "file.dll:stream", "folder./file.dll"]) {
    assert.throws(() => normalizeRelative(unsafe));
  }
  assert.equal(normalizeRelative("BepInEx\\plugins\\Good.dll"), "BepInEx/plugins/Good.dll");
});

test("manifest validation rejects duplicate logical targets", () => {
  assert.throws(() => validateManifest({
    schemaVersion: 1,
    id: "duplicate.test",
    version: "1.0.0",
    name: "Duplicate",
    game: { id: "game.test" },
    files: [
      { source: "A.dll", destination: "plugins", target: "Same.dll" },
      { source: "B.dll", destination: "plugins", target: "same.dll" }
    ]
  }), /Duplicate package target/);
});
