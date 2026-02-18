import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { parseSessionId, resolveWithin } from "../apps/server/src/lib/paths";

test("parseSessionId accepts canonical format", () => {
  assert.equal(parseSessionId("SESSION_20260218_130501"), "SESSION_20260218_130501");
});

test("parseSessionId rejects invalid format", () => {
  assert.throws(() => parseSessionId("session_bad"), /INVALID_SESSION_ID/);
});

test("resolveWithin blocks traversal", () => {
  const base = path.resolve("shots");
  assert.throws(() => resolveWithin(base, "../etc/passwd"), /INVALID_SESSION_PATH/);
});
