import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { generateRequestSchema, type GenerateJob } from "../../../../shared/schemas/generate-job";
import { config } from "./config";
import { findCompletedJob, findInFlightJob, loadJob, upsertJob } from "./jobs";
import { parseSessionBucket, parseSessionId } from "./paths";

const MAX_LOG_TAIL = 200;
const MAX_PENDING_REFERENCES = 200;
const PENDING_REFERENCE_TTL_MS = 10 * 60 * 1000;
const MAX_GENERATION_ASSETS = 200;
const GENERATION_ASSET_TTL_MS = 60 * 60 * 1000;
const activeGenerationProcesses = new Map<string, ChildProcess>();
const cancelRequestedJobs = new Set<string>();

type PendingReference = {
  sessionId: string;
  sessionBucket: string | null;
  filename: string;
  buffer: Buffer;
  createdAt: number;
};

type GenerationAssets = {
  manifestBuffer: Buffer;
  plyBuffer: Buffer;
  createdAt: number;
};

const pendingReferences = new Map<string, PendingReference>();
const generationAssets = new Map<string, GenerationAssets>();

function nowIso(): string {
  return new Date().toISOString();
}

function redactPathToken(rawPath: string): string {
  const normalized = String(rawPath || "").replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const tail = parts[parts.length - 1] || "";
  return tail ? `<path:${tail}>` : "<path>";
}

function scrubSensitivePaths(text: string): string {
  const input = String(text ?? "");
  let sanitized = input.replace(
    /[A-Za-z]:\\(?:[^\\\s"'`<>|]+\\)*[^\\\s"'`<>|]+/g,
    (match) => redactPathToken(match)
  );
  sanitized = sanitized.replace(
    /\/(?:[^\/\s"'`<>]+\/)+[^\/\s"'`<>]+/g,
    (match, offset, source) => {
      const idx = Number(offset) || 0;
      const prefix = String(source).slice(Math.max(0, idx - 8), idx).toLowerCase();
      if (prefix.endsWith("http://") || prefix.endsWith("https://")) {
        return match;
      }
      return redactPathToken(match);
    }
  );
  return sanitized;
}

function appendLogTail(existing: string[] | undefined, line: string): string[] {
  const next = [...(existing ?? []), scrubSensitivePaths(line)];
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

function safeReferenceFilename(raw: string): string {
  const name = path.basename(String(raw ?? "").trim() || "reference.png");
  return name || "reference.png";
}

function prunePendingReferences(): void {
  const cutoff = Date.now() - PENDING_REFERENCE_TTL_MS;
  for (const [key, value] of pendingReferences.entries()) {
    if (value.createdAt < cutoff) pendingReferences.delete(key);
  }
  while (pendingReferences.size > MAX_PENDING_REFERENCES) {
    const oldestKey = pendingReferences.keys().next().value as string | undefined;
    if (!oldestKey) break;
    pendingReferences.delete(oldestKey);
  }
}

function pruneGenerationAssets(): void {
  const cutoff = Date.now() - GENERATION_ASSET_TTL_MS;
  for (const [key, value] of generationAssets.entries()) {
    if (value.createdAt < cutoff) generationAssets.delete(key);
  }
  while (generationAssets.size > MAX_GENERATION_ASSETS) {
    const oldestKey = generationAssets.keys().next().value as string | undefined;
    if (!oldestKey) break;
    generationAssets.delete(oldestKey);
  }
}

export function storeReferenceUpload(input: {
  sessionId: string;
  sessionBucket: string | null;
  filename: string;
  buffer: Buffer;
}): string {
  prunePendingReferences();
  const refId = `ref_${randomUUID().slice(0, 8)}`;
  pendingReferences.set(refId, {
    sessionId: input.sessionId,
    sessionBucket: input.sessionBucket,
    filename: safeReferenceFilename(input.filename),
    buffer: Buffer.from(input.buffer),
    createdAt: Date.now()
  });
  return `memory://${refId}`;
}

async function materializeReference(referenceImagePath: string, sessionId: string, sessionBucket: string | null): Promise<{
  referencePath: string;
  tempRoot: string;
}> {
  const raw = String(referenceImagePath ?? "").trim();
  if (!raw) throw new Error("INVALID_REFERENCE_IMAGE_PATH");
  if (!raw.startsWith("memory://")) throw new Error("INVALID_REFERENCE_IMAGE_PATH");

  prunePendingReferences();
  const refId = raw.slice("memory://".length);
  const pending = pendingReferences.get(refId);
  if (!pending) throw new Error("MISSING_REFERENCE_FILE");
  pendingReferences.delete(refId);
  if (pending.sessionId !== sessionId || (pending.sessionBucket ?? null) !== (sessionBucket ?? null)) {
    throw new Error("INVALID_SESSION_PATH");
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "istanbul3d-gen-"));
  const inputDir = path.join(tempRoot, "input");
  await fs.mkdir(inputDir, { recursive: true });
  const referencePath = path.join(inputDir, pending.filename);
  await fs.writeFile(referencePath, pending.buffer);
  return { referencePath, tempRoot };
}

async function findGeneratedPly(sceneDir: string, referencePath: string): Promise<string> {
  const refStem = path.basename(referencePath, path.extname(referencePath));
  const expected = path.join(sceneDir, `${refStem}.ply`);
  try {
    await fs.access(expected);
    return expected;
  } catch {
    const entries = await fs.readdir(sceneDir);
    const candidate = entries.find(name => name.toLowerCase().endsWith(".ply"));
    if (!candidate) {
      throw new Error("ML_SHARP_OUTPUT_MISSING_PLY");
    }
    return path.join(sceneDir, candidate);
  }
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

    child.stdout?.on("data", (chunk: Buffer) => emitLines(chunk.toString(), false));
    child.stderr?.on("data", (chunk: Buffer) => emitLines(chunk.toString(), true));

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
        reject(new Error(scrubSensitivePaths(`ml-sharp exited with code ${code}: ${stderr.slice(-500)}`)));
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

  if (!body.force_regenerate) {
    const completed = await findCompletedJob(sessionId, sessionBucket);
    if (completed) {
      return {
        job_id: completed.job_id,
        status: "completed",
        session_id: completed.session_id,
        created_at: completed.created_at
      };
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
    let tempRoot: string | null = null;
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

      const materialized = await materializeReference(body.reference_image_path, sessionId, sessionBucket);
      tempRoot = materialized.tempRoot;
      const referencePath = materialized.referencePath;
      await fs.access(referencePath);

      const sceneDir = path.join(tempRoot, "scene");
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

      const plyAbsPath = await findGeneratedPly(sceneDir, referencePath);
      const plyBuffer = await fs.readFile(plyAbsPath);
      const manifestPath = `/api/generate/${jobId}/asset/manifest.json`;
      const plyPath = `/api/generate/${jobId}/asset/scene.ply`;
      const manifestBuffer = Buffer.from(
        JSON.stringify(
          {
            version: "1.0",
            generated_at: nowIso(),
            ply_path: plyPath
          },
          null,
          2
        )
      );

      pruneGenerationAssets();
      generationAssets.set(jobId, {
        manifestBuffer,
        plyBuffer,
        createdAt: Date.now()
      });

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
          message: isCancelled
            ? "Generation cancelled by user."
            : scrubSensitivePaths(error instanceof Error ? error.message : "Unknown error")
        }
      };
      await persistJob();
    } finally {
      cancelRequestedJobs.delete(jobId);
      activeGenerationProcesses.delete(jobId);
      if (tempRoot) {
        try {
          await fs.rm(tempRoot, { recursive: true, force: true });
        } catch {
          // ignore temp cleanup failures
        }
      }
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

export async function getGenerationAsset(
  jobId: string,
  assetName: string
): Promise<{ contentType: string; body: Buffer } | null> {
  pruneGenerationAssets();
  const assets = generationAssets.get(jobId);
  if (!assets) return null;

  if (assetName === "manifest.json") {
    return { contentType: "application/json; charset=utf-8", body: assets.manifestBuffer };
  }
  if (assetName === "scene.ply") {
    return { contentType: "application/octet-stream", body: assets.plyBuffer };
  }
  return null;
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
