import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { getGenerationStatus, startGeneration } from "../apps/server/src/lib/generation-service";

const sessionId = "SESSION_20260218_130501";

async function ensureReference() {
  const ref = path.join(process.cwd(), "shots", sessionId, "source", "reference.png");
  await fs.mkdir(path.dirname(ref), { recursive: true });
  await fs.writeFile(ref, Buffer.from([137, 80, 78, 71]));
}

test("generation service returns queued job and eventually completes in mock mode", async () => {
  await ensureReference();
  const startRes = await startGeneration({
    session_id: sessionId,
    reference_image_path: `shots/${sessionId}/source/reference.png`,
    force_regenerate: false
  });

  assert.equal(startRes.session_id, sessionId);
  assert.ok(startRes.job_id);

  const jobId = startRes.job_id;
  await new Promise((resolve) => setTimeout(resolve, 750));

  const statusRes = await getGenerationStatus(sessionId, jobId);
  assert.ok(statusRes);
  if (!statusRes) throw new Error("Expected generation status");

  assert.equal(statusRes.status, "completed");
  assert.ok(statusRes.scene_manifest_path);

  const manifestPath = path.join(process.cwd(), statusRes.scene_manifest_path as string);
  const manifestRaw = await fs.readFile(manifestPath, "utf8");
  assert.match(manifestRaw, /mock-1.0/);
});
