import { Router } from "express";
import multer from "multer";
import { generateStatusSchema } from "../../../../shared/schemas/generate-job";
import {
  cancelGeneration,
  getGenerationAsset,
  getGenerationStatus,
  startGeneration,
  storeReferenceUpload
} from "../lib/generation-service";
import { parseSessionBucket, parseSessionId, sessionBaseRelativePath } from "../lib/paths";

export const generateRouter = Router();

function invalidSessionMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  return ["INVALID_SESSION_ID", "INVALID_SESSION_BUCKET", "INVALID_SESSION_PATH"].includes(error.message)
    ? error.message
    : null;
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
    const sessionBucket = parseSessionBucket(String(req.body.session_bucket ?? ""));
    const sourceId = String(req.body.source_id ?? "");
    if (!/^src_\d{4}$/.test(sourceId)) {
      return res.status(400).json({ error: "INVALID_SOURCE_ID" });
    }

    const uploaded = req.file;
    if (!uploaded) {
      return res.status(400).json({ error: "MISSING_REFERENCE_FILE" });
    }

    const rawFilename = String(req.body.filename ?? uploaded.originalname ?? "").trim();
    const filename = rawFilename || uploaded.originalname || "reference.png";
    const referenceImagePath = storeReferenceUpload({
      sessionId,
      sessionBucket,
      sourceId,
      filename,
      mimeType: uploaded.mimetype,
      buffer: uploaded.buffer
    });

    return res.status(200).json({
      session_id: sessionId,
      session_bucket: sessionBucket ?? undefined,
      source_id: sourceId,
      filename,
      reference_image_path: referenceImagePath
    });
  } catch (error) {
    const invalidSession = invalidSessionMessage(error);
    if (invalidSession) {
      return res.status(400).json({ error: invalidSession });
    }
    return res.status(500).json({ error: "SYNC_REFERENCE_FAILED", detail: errorDetail(error) });
  }
});

generateRouter.post(
  "/api/capture/sync",
  upload.fields([
    { name: "target", maxCount: 1 },
    { name: "camera", maxCount: 1 },
    { name: "delta", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const sessionId = parseSessionId(String(req.body.session_id ?? ""));
      const sessionBucket = parseSessionBucket(String(req.body.session_bucket ?? ""));
      const sourceId = String(req.body.source_id ?? "");
      const captureId = String(req.body.capture_id ?? "");
      if (!/^src_\d{4}$/.test(sourceId)) {
        return res.status(400).json({ error: "INVALID_SOURCE_ID" });
      }
      if (!/^cap_\d{4}$/.test(captureId)) {
        return res.status(400).json({ error: "INVALID_CAPTURE_ID" });
      }

      const files = req.files as Record<string, Express.Multer.File[]>;
      const target = files?.target?.[0];
      const camera = files?.camera?.[0];
      const delta = files?.delta?.[0];
      if (!target || !camera || !delta) {
        return res.status(400).json({ error: "MISSING_CAPTURE_FILES" });
      }

      const sessionRel = sessionBaseRelativePath(sessionId, sessionBucket);
      return res.status(200).json({
        session_id: sessionId,
        session_bucket: sessionBucket ?? undefined,
        source_id: sourceId,
        capture_id: captureId,
        capture_path: `${sessionRel}/source/${sourceId}/captures/${captureId}`,
        finder_opened: false
      });
    } catch (error) {
      const invalidSession = invalidSessionMessage(error);
      if (invalidSession) {
        return res.status(400).json({ error: invalidSession });
      }
      return res.status(500).json({ error: "CAPTURE_SYNC_FAILED", detail: errorDetail(error) });
    }
  }
);

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
    const sessionBucket = String(req.query.session_bucket ?? "");
    const jobId = String(req.params.jobId ?? "");
    const cancelled = await cancelGeneration(sessionId, sessionBucket, jobId);
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
    const sessionBucket = String(req.query.session_bucket ?? "");
    const jobId = String(req.params.jobId ?? "");
    const job = await getGenerationStatus(sessionId, sessionBucket, jobId);

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

generateRouter.get("/api/generate/:jobId/asset/:assetName", async (req, res) => {
  try {
    const jobId = String(req.params.jobId ?? "");
    const assetName = String(req.params.assetName ?? "");
    const asset = await getGenerationAsset(jobId, assetName);
    if (!asset) {
      return res.status(404).json({ error: "GENERATION_ASSET_NOT_FOUND" });
    }
    res.setHeader("content-type", asset.contentType);
    return res.status(200).send(asset.body);
  } catch (error) {
    const invalidSession = invalidSessionMessage(error);
    if (invalidSession) {
      return res.status(400).json({ error: invalidSession });
    }
    return res.status(500).json({ error: "GENERATION_ASSET_FAILED", detail: errorDetail(error) });
  }
});
