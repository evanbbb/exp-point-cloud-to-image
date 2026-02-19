import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { generateStatusSchema } from "../../../../shared/schemas/generate-job";
import { config } from "../lib/config";
import { cancelGeneration, getGenerationStatus, startGeneration } from "../lib/generation-service";
import { parseSessionId, resolveWithin } from "../lib/paths";

export const generateRouter = Router();
function invalidSessionMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  return ["INVALID_SESSION_ID", "INVALID_SESSION_PATH"].includes(error.message) ? error.message : null;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 40 * 1024 * 1024
  }
});

generateRouter.post("/api/generate/sync-reference", upload.single("reference"), async (req, res) => {
  try {
    const sessionId = parseSessionId(String(req.body.session_id ?? ""));
    const sourceId = String(req.body.source_id ?? "");
    if (!/^src_\d{4}$/.test(sourceId)) {
      return res.status(400).json({ error: "INVALID_SOURCE_ID" });
    }

    const uploaded = req.file;
    if (!uploaded) {
      return res.status(400).json({ error: "MISSING_REFERENCE_FILE" });
    }

    const rawFilename = String(req.body.filename ?? uploaded.originalname ?? "").trim();
    const filename = path.basename(rawFilename);
    if (!filename) {
      return res.status(400).json({ error: "INVALID_FILENAME" });
    }

    const srcDir = resolveWithin(config.shotsRoot, `${sessionId}/source/${sourceId}`);
    await fs.mkdir(srcDir, { recursive: true });
    const outPath = path.join(srcDir, filename);
    await fs.writeFile(outPath, uploaded.buffer);

    return res.status(200).json({
      session_id: sessionId,
      source_id: sourceId,
      filename,
      reference_image_path: `shots/${sessionId}/source/${sourceId}/${filename}`
    });
  } catch (error) {
    const invalidSession = invalidSessionMessage(error);
    if (invalidSession) {
      return res.status(400).json({ error: invalidSession });
    }
    return res.status(500).json({ error: "SYNC_REFERENCE_FAILED", detail: errorDetail(error) });
  }
});

generateRouter.post("/api/generate", async (req, res) => {
  try {
    const payload = await startGeneration(req.body ?? {});
    return res.status(202).json(payload);
  } catch (error) {
    const invalidSession = invalidSessionMessage(error);
    if (invalidSession) {
      return res.status(400).json({ error: invalidSession });
    }
    if (error instanceof Error && "issues" in error) {
      return res.status(400).json({ error: "INVALID_REQUEST", detail: error.message });
    }
    return res.status(500).json({ error: "GENERATION_START_FAILED", detail: errorDetail(error) });
  }
});

generateRouter.post("/api/generate/:jobId/cancel", async (req, res) => {
  try {
    const sessionId = parseSessionId(String(req.query.session_id ?? ""));
    const jobId = String(req.params.jobId ?? "");
    const cancelled = await cancelGeneration(sessionId, jobId);
    if (!cancelled) {
      return res.status(404).json({ error: "JOB_NOT_FOUND" });
    }
    return res.status(200).json(cancelled);
  } catch (error) {
    const invalidSession = invalidSessionMessage(error);
    if (invalidSession) {
      return res.status(400).json({ error: invalidSession });
    }
    return res.status(500).json({ error: "GENERATION_CANCEL_FAILED", detail: errorDetail(error) });
  }
});

generateRouter.get("/api/generate/:jobId", async (req, res) => {
  try {
    const sessionId = parseSessionId(String(req.query.session_id ?? ""));
    const jobId = String(req.params.jobId ?? "");
    const job = await getGenerationStatus(sessionId, jobId);

    if (!job) {
      return res.status(404).json({ error: "JOB_NOT_FOUND" });
    }

    const status = generateStatusSchema.parse(job.status);
    return res.status(200).json({ ...job, status });
  } catch (error) {
    const invalidSession = invalidSessionMessage(error);
    if (invalidSession) {
      return res.status(400).json({ error: invalidSession });
    }
    return res.status(500).json({ error: "GENERATION_STATUS_FAILED", detail: errorDetail(error) });
  }
});
