import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { generateRequestSchema, type GenerateJob } from "../../../../shared/schemas/generate-job";
import { config } from "./config";
import { findCompletedJob, findInFlightJob, loadJob, upsertJob } from "./jobs";
import { parseSessionBucket, parseSessionId, resolveWithin, sessionBaseRelativePath } from "./paths";

const MAX_LOG_TAIL = 200;
const activeGenerationProcesses = new Map<string, ChildProcess>();
const cancelRequestedJobs = new Set<string>();

function nowIso(): string {
  return new Date().toISOString();
}

function appendLogTail(existing: string[] | undefined, line: string): string[] {
  const next = [...(existing ?? []), line];
  if (next.length > MAX_LOG_TAIL) {
    next.splice(0, next.length - MAX_LOG_TAIL);
  }
  return next;
}

function inferProgressFromLog(line: string, current: number): number {
  if (line.includes("Loading checkpoint")) return Math.max(current, 15);
  if (line.includes("Processing") && line.includes("valid image files")) return Math.max(current, 20);
  if (line.includes("Running preprocessing")) return Math.max(current, 35);
  if (line.includes("Running inference")) return Math.max(current, 60);
  if (line.includes("Running postprocessing")) return Math.max(current, 75);
  if (line.includes("Saving 3DGS")) return Math.max(current, 85);
  if (line.includes("Rendering trajectory")) return Math.max(current, 88);
  return current;
}

function toShotsAssetPath(absolutePath: string): string {
  const rel = path.relative(config.shotsRoot, absolutePath).split(path.sep).join("/");
  return `shots/${rel}`;
}

function resolveReferenceImagePath(referenceImagePath: string): string {
  const normalized = String(referenceImagePath ?? "").replace(/^\/+/, "");
  if (normalized.startsWith("shots/")) {
    return resolveWithin(config.shotsRoot, normalized.slice("shots/".length));
  }
  return resolveWithin(config.repoRoot, normalized);
}

async function writeRealManifest(referencePath: string, plyAbsPath: string): Promise<string> {
  const refDir = path.dirname(referencePath);
  const manifestPath = path.join(refDir, "scene", "manifest.json");
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        version: "1.0",
        generated_at: nowIso(),
        ply_path: toShotsAssetPath(plyAbsPath)
      },
      null,
      2
    )
  );
  return toShotsAssetPath(manifestPath);
}

function runMlSharp(
  referencePath: string,
  sceneDir: string,
  jobId: string,
  onLogLine: (line: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "predict",
      "-i",
      referencePath,
      "-o",
      sceneDir,
      "-c",
      config.mlSharpCheckpointPath,
      "--device",
      config.mlSharpDevice
    ];
    const child = spawn(config.mlSharpBin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        OMP_NUM_THREADS: process.env.OMP_NUM_THREADS ?? "1",
        MKL_NUM_THREADS: process.env.MKL_NUM_THREADS ?? "1"
      }
    });
    activeGenerationProcesses.set(jobId, child);

    let stdoutBuffer = "";
    let stderrBuffer = "";
    let stderr = "";

    function emitLines(chunkText: string, isStderr: boolean) {
      if (isStderr) {
        stderr += chunkText;
        stderrBuffer += chunkText;
        const lines = stderrBuffer.split(/\r?\n/);
        stderrBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) onLogLine(`[stderr] ${line}`);
        }
      } else {
        stdoutBuffer += chunkText;
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) onLogLine(line);
        }
      }
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      emitLines(chunk.toString(), false);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      emitLines(chunk.toString(), true);
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("ML_SHARP_TIMEOUT"));
    }, config.mlSharpTimeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      activeGenerationProcesses.delete(jobId);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ml-sharp exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      activeGenerationProcesses.delete(jobId);
      reject(err);
    });
  });
}

export async function startGeneration(input: unknown): Promise<{
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
  session_id: string;
  created_at: string;
}> {
  const body = generateRequestSchema.parse(input ?? {});
  const sessionId = parseSessionId(body.session_id);
  const sessionBucket = parseSessionBucket(body.session_bucket ?? "");
  const sessionRoot = resolveWithin(config.shotsRoot, sessionBaseRelativePath(sessionId, sessionBucket));
  const referencePath = resolveReferenceImagePath(body.reference_image_path);
  if (!referencePath.startsWith(sessionRoot + path.sep)) {
    throw new Error("INVALID_SESSION_PATH");
  }

  await fs.access(referencePath);

  if (!body.force_regenerate) {
    const refDir = path.dirname(referencePath);
    const manifestPath = path.join(refDir, "scene", "manifest.json");
    try {
      await fs.access(manifestPath);
      const completed = await findCompletedJob(sessionId, sessionBucket);
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

    const existing = await findInFlightJob(sessionId, sessionBucket);
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
    session_bucket: sessionBucket ?? undefined,
    status: "queued",
    stage: "queued",
    progress_percent: 0,
    created_at: createdAt,
    updated_at: createdAt
  };

  await upsertJob(sessionId, sessionBucket, job);

  setImmediate(async () => {
    let writeChain = Promise.resolve();
    const persistJob = () => {
      const snapshot: GenerateJob = {
        ...job,
        logs_tail: job.logs_tail ? [...job.logs_tail] : undefined
      };
      writeChain = writeChain.then(() => upsertJob(sessionId, sessionBucket, snapshot)).catch(() => undefined);
      return writeChain;
    };

    try {
      if (cancelRequestedJobs.has(jobId)) {
        throw new Error("JOB_CANCELLED");
      }
      job = { ...job, status: "running", stage: "running_ml_sharp", progress_percent: 10, updated_at: nowIso() };
      await persistJob();

      const refDir = path.dirname(referencePath);
      const sceneDir = path.join(refDir, "scene");
      await fs.mkdir(sceneDir, { recursive: true });

      await runMlSharp(referencePath, sceneDir, jobId, (line) => {
        job.logs_tail = appendLogTail(job.logs_tail, line);
        job.progress_percent = inferProgressFromLog(line, job.progress_percent);
        job.updated_at = nowIso();
        void persistJob();
      });
      await writeChain;

      if (cancelRequestedJobs.has(jobId)) {
        throw new Error("JOB_CANCELLED");
      }

      job = { ...job, stage: "writing_outputs", progress_percent: 90, updated_at: nowIso() };
      await persistJob();

      const refStem = path.basename(referencePath, path.extname(referencePath));
      const plyAbsPath = path.join(sceneDir, `${refStem}.ply`);
      const manifestPath = await writeRealManifest(referencePath, plyAbsPath);

      job = {
        ...job,
        status: "completed",
        stage: "completed",
        progress_percent: 100,
        scene_manifest_path: manifestPath,
        updated_at: nowIso()
      };
      await persistJob();
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === "ML_SHARP_TIMEOUT";
      const isCancelled =
        (error instanceof Error && error.message === "JOB_CANCELLED") || cancelRequestedJobs.has(jobId);
      job = {
        ...job,
        status: "failed",
        stage: "failed",
        progress_percent: 100,
        cancelled_at: isCancelled ? nowIso() : job.cancelled_at,
        updated_at: nowIso(),
        error: {
          code: isCancelled ? "JOB_CANCELLED" : isTimeout ? "ML_SHARP_TIMEOUT" : "ML_SHARP_EXEC_FAILED",
          message: isCancelled ? "Generation cancelled by user." : error instanceof Error ? error.message : "Unknown error"
        }
      };
      await persistJob();
    } finally {
      cancelRequestedJobs.delete(jobId);
      activeGenerationProcesses.delete(jobId);
    }
  });

  return {
    job_id: job.job_id,
    status: job.status,
    session_id: job.session_id,
    created_at: job.created_at
  };
}

export async function getGenerationStatus(
  sessionIdRaw: string,
  sessionBucketRaw: string,
  jobId: string
): Promise<GenerateJob | null> {
  const sessionId = parseSessionId(sessionIdRaw);
  const sessionBucket = parseSessionBucket(sessionBucketRaw);
  return loadJob(sessionId, sessionBucket, jobId);
}

export async function cancelGeneration(
  sessionIdRaw: string,
  sessionBucketRaw: string,
  jobId: string
): Promise<GenerateJob | null> {
  const sessionId = parseSessionId(sessionIdRaw);
  const sessionBucket = parseSessionBucket(sessionBucketRaw);
  const existing = await loadJob(sessionId, sessionBucket, jobId);
  if (!existing) return null;

  if (existing.status === "completed" || existing.status === "failed") {
    return existing;
  }

  const cancelledAt = nowIso();
  const updated: GenerateJob = {
    ...existing,
    status: "failed",
    stage: "failed",
    progress_percent: 100,
    cancel_requested_at: existing.cancel_requested_at ?? cancelledAt,
    cancelled_at: cancelledAt,
    updated_at: cancelledAt,
    error: {
      code: "JOB_CANCELLED",
      message: "Generation cancelled by user."
    }
  };

  cancelRequestedJobs.add(jobId);
  await upsertJob(sessionId, sessionBucket, updated);

  const child = activeGenerationProcesses.get(jobId);
  if (child) {
    try {
      child.kill("SIGTERM");
      setTimeout(() => {
        try {
          if (!child.killed) child.kill("SIGKILL");
        } catch {
          // ignore force-kill failures
        }
      }, 2000).unref();
    } catch {
      // ignore process-kill failures; state is already persisted as cancelled.
    }
  }

  return updated;
}
