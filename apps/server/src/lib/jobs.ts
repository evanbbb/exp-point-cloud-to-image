import type { GenerateJob } from "../../../../shared/schemas/generate-job";

const jobsBySession = new Map<string, Map<string, GenerateJob>>();

function sessionKey(sessionId: string, sessionBucket: string | null): string {
  return `${sessionBucket ?? ""}::${sessionId}`;
}

function cloneJob(job: GenerateJob): GenerateJob {
  return {
    ...job,
    logs_tail: job.logs_tail ? [...job.logs_tail] : undefined,
    error: job.error ? { ...job.error } : undefined
  };
}

export async function upsertJob(sessionId: string, sessionBucket: string | null, job: GenerateJob): Promise<void> {
  const key = sessionKey(sessionId, sessionBucket);
  let sessionJobs = jobsBySession.get(key);
  if (!sessionJobs) {
    sessionJobs = new Map<string, GenerateJob>();
    jobsBySession.set(key, sessionJobs);
  }
  sessionJobs.set(job.job_id, cloneJob(job));
}

export async function loadJob(sessionId: string, sessionBucket: string | null, jobId: string): Promise<GenerateJob | null> {
  const key = sessionKey(sessionId, sessionBucket);
  const job = jobsBySession.get(key)?.get(jobId);
  return job ? cloneJob(job) : null;
}

export async function findInFlightJob(sessionId: string, sessionBucket: string | null): Promise<GenerateJob | null> {
  const key = sessionKey(sessionId, sessionBucket);
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
  const key = sessionKey(sessionId, sessionBucket);
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
