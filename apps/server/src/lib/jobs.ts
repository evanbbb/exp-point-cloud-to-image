import fs from "node:fs/promises";
import path from "node:path";
import type { GenerateJob } from "../../../../shared/schemas/generate-job";
import { config } from "./config";
import { resolveWithin } from "./paths";

export async function upsertJob(sessionId: string, job: GenerateJob): Promise<void> {
  const jobsDir = resolveWithin(config.shotsRoot, `${sessionId}/generation/jobs`);
  await fs.mkdir(jobsDir, { recursive: true });
  await fs.writeFile(path.join(jobsDir, `${job.job_id}.json`), JSON.stringify(job, null, 2));
}

export async function loadJob(sessionId: string, jobId: string): Promise<GenerateJob | null> {
  const jobPath = resolveWithin(config.shotsRoot, `${sessionId}/generation/jobs/${jobId}.json`);
  try {
    const raw = await fs.readFile(jobPath, "utf8");
    return JSON.parse(raw) as GenerateJob;
  } catch {
    return null;
  }
}

export async function findInFlightJob(sessionId: string): Promise<GenerateJob | null> {
  const jobsDir = resolveWithin(config.shotsRoot, `${sessionId}/generation/jobs`);
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

export async function findCompletedJob(sessionId: string): Promise<GenerateJob | null> {
  const jobsDir = resolveWithin(config.shotsRoot, `${sessionId}/generation/jobs`);
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
