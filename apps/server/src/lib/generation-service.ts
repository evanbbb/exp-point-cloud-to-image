import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { generateRequestSchema, type GenerateJob } from "../../../../shared/schemas/generate-job";
import { config } from "./config";
import { findCompletedJob, findInFlightJob, loadJob, upsertJob } from "./jobs";
import { parseSessionId, resolveWithin, toRepoRelative } from "./paths";

function nowIso(): string {
  return new Date().toISOString();
}

async function writeMockManifest(sessionId: string): Promise<string> {
  const manifestPath = resolveWithin(config.shotsRoot, `${sessionId}/source/scene/manifest.json`);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        version: "mock-1.0",
        generated_at: nowIso(),
        note: "Mock scene manifest. Replace with ml-sharp output manifest in real mode."
      },
      null,
      2
    )
  );
  return toRepoRelative(config.repoRoot, manifestPath);
}

export async function startGeneration(input: unknown): Promise<{
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
  session_id: string;
  created_at: string;
}> {
  const body = generateRequestSchema.parse(input ?? {});
  const sessionId = parseSessionId(body.session_id);
  const sessionRoot = resolveWithin(config.shotsRoot, `${sessionId}`);
  const referencePath = resolveWithin(config.repoRoot, body.reference_image_path);
  if (!referencePath.startsWith(sessionRoot + path.sep)) {
    throw new Error("INVALID_SESSION_PATH");
  }

  await fs.access(referencePath);

  if (!body.force_regenerate) {
    const manifestPath = resolveWithin(config.shotsRoot, `${sessionId}/source/scene/manifest.json`);
    try {
      await fs.access(manifestPath);
      const completed = await findCompletedJob(sessionId);
      if (completed) {
        return {
          job_id: completed.job_id,
          status: "completed",
          session_id: completed.session_id,
          created_at: completed.created_at
        };
      }
    } catch {
      // No completed manifest yet; continue with normal flow.
    }

    const existing = await findInFlightJob(sessionId);
    if (existing) {
      return {
        job_id: existing.job_id,
        status: existing.status,
        session_id: existing.session_id,
        created_at: existing.created_at
      };
    }
  }

  const createdAt = nowIso();
  const jobId = `gen_${randomUUID().slice(0, 8)}`;
  let job: GenerateJob = {
    job_id: jobId,
    session_id: sessionId,
    status: "queued",
    stage: "queued",
    progress_percent: 0,
    created_at: createdAt,
    updated_at: createdAt
  };

  await upsertJob(sessionId, job);

  if (config.generationMode === "mock") {
    setTimeout(async () => {
      try {
        job = { ...job, status: "running", stage: "running_ml_sharp", progress_percent: 50, updated_at: nowIso() };
        await upsertJob(sessionId, job);

        const manifestPath = await writeMockManifest(sessionId);
        job = {
          ...job,
          status: "completed",
          stage: "completed",
          progress_percent: 100,
          scene_manifest_path: manifestPath,
          updated_at: nowIso()
        };
        await upsertJob(sessionId, job);
      } catch (error) {
        job = {
          ...job,
          status: "failed",
          stage: "failed",
          progress_percent: 100,
          updated_at: nowIso(),
          error: { code: "MOCK_GENERATION_FAILED", message: error instanceof Error ? error.message : "Unknown error" }
        };
        await upsertJob(sessionId, job);
      }
    }, 500);
  }

  return {
    job_id: job.job_id,
    status: job.status,
    session_id: job.session_id,
    created_at: job.created_at
  };
}

export async function getGenerationStatus(sessionIdRaw: string, jobId: string): Promise<GenerateJob | null> {
  const sessionId = parseSessionId(sessionIdRaw);
  return loadJob(sessionId, jobId);
}
