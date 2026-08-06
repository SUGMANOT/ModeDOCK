import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, satisfies, sortVersionsDescending } from "../src/semver.js";

test("semantic version ranges cover exact, wildcard, caret, tilde, comparator, and OR", () => {
  assert.equal(satisfies("1.2.3", "1.2.3"), true);
  assert.equal(satisfies("1.2.3", "1.2.x"), true);
  assert.equal(satisfies("1.9.0", "^1.2.3"), true);
  assert.equal(satisfies("2.0.0", "^1.2.3"), false);
  assert.equal(satisfies("1.2.9", "~1.2.3"), true);
  assert.equal(satisfies("1.3.0", "~1.2.3"), false);
  assert.equal(satisfies("1.5.0", ">=1.0.0 <2.0.0"), true);
  assert.equal(satisfies("3.0.0", "^1.0.0 || ^3.0.0"), true);
});

test("semantic versions sort newest first and prereleases below releases", () => {
  assert.ok(compareVersions("1.0.0", "1.0.0-beta.1") > 0);
  assert.deepEqual(sortVersionsDescending(["1.0.0", "2.0.0", "1.1.0"]), ["2.0.0", "1.1.0", "1.0.0"]);
});
