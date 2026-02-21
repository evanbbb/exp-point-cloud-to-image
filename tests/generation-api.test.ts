import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { cancelGeneration, getGenerationStatus, startGeneration } from "../apps/server/src/lib/generation-service";
import { upsertJob } from "../apps/server/src/lib/jobs";
import type { GenerateJob } from "../shared/schemas/generate-job";

const sessionId = "SESSION_20990101_000001";
const storageRoot = process.cwd();
const sessionRoot = path.join(storageRoot, sessionId);

function resolveAssetPath(assetPath: string): string {
  const normalized = String(assetPath).replace(/^\/+/, "");
  if (normalized.startsWith("shots/")) {
    return path.join(storageRoot, normalized.slice("shots/".length));
  }
  return path.join(storageRoot, normalized);
}

test.after(async () => {
  await fs.rm(sessionRoot, { recursive: true, force: true });
});

async function ensureReference() {
  const ref = path.join(sessionRoot, "source", "reference.png");
  await fs.mkdir(path.dirname(ref), { recursive: true });
  const tinyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0/8AAAAASUVORK5CYII=";
  await fs.writeFile(ref, Buffer.from(tinyPngBase64, "base64"));
}

async function waitForTerminalStatus(jobId: string, timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await getGenerationStatus(sessionId, "", jobId);
    if (status && (status.status === "completed" || status.status === "failed")) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for terminal generation status for ${jobId}`);
}

test("generation service uses real ml-sharp execution path", async () => {
  await ensureReference();
  const refDir = path.join(sessionRoot, "source");
  await fs.rm(path.join(refDir, "scene"), { recursive: true, force: true });
  await fs.rm(path.join(sessionRoot, "generation"), { recursive: true, force: true });

  const startRes = await startGeneration({
    session_id: sessionId,
    reference_image_path: `shots/${sessionId}/source/reference.png`,
    force_regenerate: true
  });

  assert.equal(startRes.session_id, sessionId);
  assert.ok(startRes.job_id);

  const jobId = startRes.job_id;
  const statusRes = await waitForTerminalStatus(jobId);
  assert.ok(statusRes);
  if (!statusRes) throw new Error("Expected generation status");

  if (statusRes.status === "completed") {
    assert.ok(statusRes.scene_manifest_path);
    const manifestPath = resolveAssetPath(statusRes.scene_manifest_path as string);
    const manifestRaw = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw) as { version: string; ply_path?: string };
    assert.equal(manifest.version, "1.0");
    assert.ok(manifest.ply_path);
    const plyPath = resolveAssetPath(manifest.ply_path as string);
    await fs.access(plyPath);
    return;
  }

  assert.equal(statusRes.status, "failed");
  assert.ok(statusRes.error);
  assert.match(statusRes.error!.code, /ML_SHARP_(EXEC_FAILED|TIMEOUT)/);
});

test("cancelGeneration marks queued job as cancelled", async () => {
  const jobId = "gen_cancel_queue";
  const now = new Date().toISOString();
  const queued: GenerateJob = {
    job_id: jobId,
    session_id: sessionId,
    status: "queued",
    stage: "queued",
    progress_percent: 0,
    created_at: now,
    updated_at: now
  };
  await upsertJob(sessionId, null, queued);
  const cancelled = await cancelGeneration(sessionId, "", jobId);
  assert.ok(cancelled);
  if (!cancelled) throw new Error("Expected cancelled job");
  assert.equal(cancelled.status, "failed");
  assert.equal(cancelled.error?.code, "JOB_CANCELLED");
  assert.equal(cancelled.stage, "failed");
});

test("cancelGeneration returns terminal job unchanged", async () => {
  const jobId = "gen_cancel_done";
  const now = new Date().toISOString();
  const completed: GenerateJob = {
    job_id: jobId,
    session_id: sessionId,
    status: "completed",
    stage: "completed",
    progress_percent: 100,
    created_at: now,
    updated_at: now
  };
  await upsertJob(sessionId, null, completed);
  const result = await cancelGeneration(sessionId, "", jobId);
  assert.ok(result);
  if (!result) throw new Error("Expected job");
  assert.equal(result.status, "completed");
});
