import type { GenerateJob } from "../../../../shared/schemas/generate-job";
import { makeSessionKey, pruneBoundedSessionStore } from "./session-memory-store";

const MAX_JOBS_PER_SESSION = 200;
const JOB_TTL_MS = 6 * 60 * 60 * 1000;
const IN_FLIGHT_SORT_OFFSET = 1_000_000_000_000_000;
const jobsBySession = new Map<string, Map<string, GenerateJob>>();

function cloneJob(job: GenerateJob): GenerateJob {
  return {
    ...job,
    logs_tail: job.logs_tail ? [...job.logs_tail] : undefined,
    error: job.error ? { ...job.error } : undefined
  };
}

function jobTimestamp(job: GenerateJob): number {
  const updated = Date.parse(job.updated_at ?? "");
  if (Number.isFinite(updated) && updated > 0) return updated;
  const created = Date.parse(job.created_at ?? "");
  return Number.isFinite(created) && created > 0 ? created : 0;
}

function pruneJobsStore(): void {
  pruneBoundedSessionStore({
    store: jobsBySession,
    maxPerSession: MAX_JOBS_PER_SESSION,
    shouldExpire: (job, nowMs) => {
      const timestamp = jobTimestamp(job);
      const isTerminal = job.status === "completed" || job.status === "failed";
      return isTerminal && timestamp > 0 && nowMs - timestamp > JOB_TTL_MS;
    },
    sortValue: (job) => {
      const isTerminal = job.status === "completed" || job.status === "failed";
      return (isTerminal ? 0 : IN_FLIGHT_SORT_OFFSET) + jobTimestamp(job);
    }
  });
}

export async function upsertJob(sessionId: string, sessionBucket: string | null, job: GenerateJob): Promise<void> {
  pruneJobsStore();
  const key = makeSessionKey(sessionId, sessionBucket);
  let sessionJobs = jobsBySession.get(key);
  if (!sessionJobs) {
    sessionJobs = new Map<string, GenerateJob>();
    jobsBySession.set(key, sessionJobs);
  }
  sessionJobs.set(job.job_id, cloneJob(job));
  pruneJobsStore();
}

export async function loadJob(sessionId: string, sessionBucket: string | null, jobId: string): Promise<GenerateJob | null> {
  pruneJobsStore();
  const key = makeSessionKey(sessionId, sessionBucket);
  const job = jobsBySession.get(key)?.get(jobId);
  return job ? cloneJob(job) : null;
}

export async function findInFlightJob(sessionId: string, sessionBucket: string | null): Promise<GenerateJob | null> {
  pruneJobsStore();
  const key = makeSessionKey(sessionId, sessionBucket);
  const sessionJobs = jobsBySession.get(key);
  if (!sessionJobs) return null;
  for (const job of sessionJobs.values()) {
    if (job.status === "queued" || job.status === "running") {
      return cloneJob(job);
    }
  }
  return null;
}

export async function findCompletedJob(sessionId: string, sessionBucket: string | null): Promise<GenerateJob | null> {
  pruneJobsStore();
  const key = makeSessionKey(sessionId, sessionBucket);
  const sessionJobs = jobsBySession.get(key);
  if (!sessionJobs) return null;

  let best: GenerateJob | null = null;
  for (const job of sessionJobs.values()) {
    if (job.status !== "completed") continue;
    if (!best || (job.updated_at ?? "") > (best.updated_at ?? "")) {
      best = job;
    }
  }
  return best ? cloneJob(best) : null;
}
