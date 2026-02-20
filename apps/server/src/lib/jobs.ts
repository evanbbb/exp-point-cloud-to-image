import fs from "node:fs/promises";
import path from "node:path";
import type { GenerateJob } from "../../../../shared/schemas/generate-job";
import { config } from "./config";
import { resolveWithin, sessionBaseRelativePath } from "./paths";

function jobsDirFor(sessionId: string, sessionBucket: string | null): string {
  const sessionRel = sessionBaseRelativePath(sessionId, sessionBucket);
  return resolveWithin(config.shotsRoot, `${sessionRel}/generation/jobs`);
}

export async function upsertJob(sessionId: string, sessionBucket: string | null, job: GenerateJob): Promise<void> {
  const jobsDir = jobsDirFor(sessionId, sessionBucket);
  await fs.mkdir(jobsDir, { recursive: true });
  await fs.writeFile(path.join(jobsDir, `${job.job_id}.json`), JSON.stringify(job, null, 2));
}

export async function loadJob(sessionId: string, sessionBucket: string | null, jobId: string): Promise<GenerateJob | null> {
  const jobPath = resolveWithin(jobsDirFor(sessionId, sessionBucket), `${jobId}.json`);
  try {
    const raw = await fs.readFile(jobPath, "utf8");
    return JSON.parse(raw) as GenerateJob;
  } catch {
    return null;
  }
}

export async function findInFlightJob(sessionId: string, sessionBucket: string | null): Promise<GenerateJob | null> {
  const jobsDir = jobsDirFor(sessionId, sessionBucket);
  try {
    const names = await fs.readdir(jobsDir);
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const raw = await fs.readFile(path.join(jobsDir, name), "utf8");
      const job = JSON.parse(raw) as GenerateJob;
      if (job.status === "queued" || job.status === "running") {
        return job;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function findCompletedJob(sessionId: string, sessionBucket: string | null): Promise<GenerateJob | null> {
  const jobsDir = jobsDirFor(sessionId, sessionBucket);
  try {
    const names = await fs.readdir(jobsDir);
    let best: GenerateJob | null = null;
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const raw = await fs.readFile(path.join(jobsDir, name), "utf8");
      const job = JSON.parse(raw) as GenerateJob;
      if (job.status !== "completed") continue;
      if (!best || (job.updated_at ?? "") > (best.updated_at ?? "")) {
        best = job;
      }
    }
    return best;
  } catch {
    return null;
  }
}
