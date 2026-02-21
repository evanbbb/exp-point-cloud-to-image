import { Router } from "express";
import multer from "multer";
import { fal } from "@fal-ai/client";
import { deltaPoseSchema } from "../../../../shared/schemas/delta-pose";
import { cameraSchema } from "../../../../shared/schemas/camera";
import { type RepairMeta } from "../../../../shared/schemas/repair-meta";
import { config } from "../lib/config";
import { getFalKey } from "../lib/app-settings";
import { parseSessionBucket, parseSessionId, sessionBaseRelativePath } from "../lib/paths";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

type StoredRepair = {
  meta: RepairMeta;
  imageBuffer?: Buffer;
};

const repairsBySession = new Map<string, Map<string, StoredRepair>>();

function sessionKey(sessionId: string, sessionBucket: string | null): string {
  return `${sessionBucket ?? ""}::${sessionId}`;
}

function putRepair(sessionId: string, sessionBucket: string | null, repairId: string, entry: StoredRepair): void {
  const key = sessionKey(sessionId, sessionBucket);
  let sessionRepairs = repairsBySession.get(key);
  if (!sessionRepairs) {
    sessionRepairs = new Map<string, StoredRepair>();
    repairsBySession.set(key, sessionRepairs);
  }
  sessionRepairs.set(repairId, {
    meta: { ...entry.meta },
    imageBuffer: entry.imageBuffer ? Buffer.from(entry.imageBuffer) : undefined
  });
}

function listRepairs(sessionId: string, sessionBucket: string | null): RepairMeta[] {
  const key = sessionKey(sessionId, sessionBucket);
  const entries = repairsBySession.get(key);
  if (!entries) return [];
  const repairs = [...entries.values()].map(entry => ({ ...entry.meta }));
  repairs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return repairs;
}

function getRepairImage(sessionId: string, sessionBucket: string | null, repairId: string): Buffer | null {
  const key = sessionKey(sessionId, sessionBucket);
  const entry = repairsBySession.get(key)?.get(repairId);
  if (!entry?.imageBuffer) return null;
  return Buffer.from(entry.imageBuffer);
}

export const repairRouter = Router();

function invalidSessionMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  return ["INVALID_SESSION_ID", "INVALID_SESSION_PATH"].includes(error.message) ? error.message : null;
}

function repairInputPaths(sessionRel: string, repairId: string) {
  return {
    reference_image_path: `${sessionRel}/repairs/${repairId}/input/reference.png`,
    target_image_path: `${sessionRel}/repairs/${repairId}/input/target.png`,
    delta_pose_path: `${sessionRel}/repairs/${repairId}/input/delta_pose.json`,
    camera_path: `${sessionRel}/repairs/${repairId}/input/camera.json`
  };
}

repairRouter.get("/api/repairs/list", async (req, res) => {
  try {
    const sessionId = parseSessionId(String(req.query.session_id ?? ""));
    const sessionBucket = parseSessionBucket(String(req.query.session_bucket ?? ""));
    return res.json({ repairs: listRepairs(sessionId, sessionBucket) });
  } catch (error) {
    const invalidSession = invalidSessionMessage(error);
    if (invalidSession) return res.status(400).json({ error: invalidSession });
    return res.status(500).json({ error: "LIST_REPAIRS_FAILED" });
  }
});

repairRouter.get("/api/repairs/:repairId/image", async (req, res) => {
  try {
    const sessionId = parseSessionId(String(req.query.session_id ?? ""));
    const sessionBucket = parseSessionBucket(String(req.query.session_bucket ?? ""));
    const repairId = String(req.params.repairId ?? "");
    const image = getRepairImage(sessionId, sessionBucket, repairId);
    if (!image) {
      return res.status(404).json({ error: "REPAIR_IMAGE_NOT_FOUND" });
    }
    return res.type("image/png").send(image);
  } catch (error) {
    const invalidSession = invalidSessionMessage(error);
    if (invalidSession) return res.status(400).json({ error: invalidSession });
    return res.status(500).json({ error: "REPAIR_IMAGE_FAILED" });
  }
});

repairRouter.post(
  "/api/repair",
  upload.fields([
    { name: "reference", maxCount: 1 },
    { name: "target", maxCount: 1 },
    { name: "delta_pose", maxCount: 1 },
    { name: "camera", maxCount: 1 }
  ]),
  async (req, res) => {
    const start = Date.now();
    let sessionId: string | undefined;
    let sessionBucket: string | null = null;
    let sessionRel: string | undefined;
    let repairId: string | undefined;
    let sourceId: string | undefined;
    let capId: string | undefined;
    let uploadedReferenceUrl: string | undefined;
    let uploadedTargetUrl: string | undefined;
    let deltaPose: { x: number; y: number; z: number; pitch: number; yaw: number; roll: number } | undefined;
    let withNotes: string | undefined;

    try {
      const falKey = await getFalKey();
      if (!falKey) {
        return res.status(400).json({ error: "FAL_KEY_NOT_CONFIGURED" });
      }
      fal.config({ credentials: falKey });

      if (req.body.paid_confirm !== "true") {
        return res.status(400).json({ error: "PAID_CONFIRM_REQUIRED" });
      }

      const fields = req.files as Record<string, Express.Multer.File[]>;
      const reference = fields?.reference?.[0];
      const target = fields?.target?.[0];
      const deltaPoseRaw = fields?.delta_pose?.[0];
      const cameraRaw = fields?.camera?.[0];

      if (!reference || !target || !deltaPoseRaw || !cameraRaw) {
        return res.status(400).json({ error: "MISSING_REQUIRED_FILES" });
      }

      sessionId = parseSessionId(String(req.body.session_id || ""));
      sessionBucket = parseSessionBucket(String(req.body.session_bucket || ""));
      sessionRel = sessionBaseRelativePath(sessionId, sessionBucket);
      repairId = String(req.body.repair_id || `repair_${Date.now()}`);
      const rawSourceId = String(req.body.source_id || "").trim();
      sourceId = rawSourceId || undefined;
      const rawCapId = String(req.body.cap_id || "").trim();
      capId = /^cap_\d{4}$/.test(rawCapId) ? rawCapId : undefined;

      deltaPose = deltaPoseSchema.parse(JSON.parse(deltaPoseRaw.buffer.toString("utf8")));
      cameraSchema.parse(JSON.parse(cameraRaw.buffer.toString("utf8")));

      uploadedReferenceUrl = await fal.storage.upload(
        new Blob([Uint8Array.from(reference.buffer)], { type: reference.mimetype })
      );
      uploadedTargetUrl = await fal.storage.upload(
        new Blob([Uint8Array.from(target.buffer)], { type: target.mimetype })
      );

      withNotes = String(req.body.prompt || "").trim();
      if (!withNotes) {
        return res.status(400).json({ error: "MISSING_PROMPT" });
      }

      const result = await Promise.race([
        fal.subscribe(config.falModel, {
          input: {
            prompt: withNotes,
            image_urls: [uploadedReferenceUrl, uploadedTargetUrl],
            loras: [{ path: config.falLoraPath, scale: 1.0 }],
            num_inference_steps: 28,
            guidance_scale: 5,
            output_format: "png",
            num_images: 1
          }
        }),
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error("FAL_TIMEOUT")), 90_000);
        })
      ]);

      const imageUrl = (result.data as { images?: Array<{ url: string }> }).images?.[0]?.url;
      if (!imageUrl) {
        return res.status(502).json({ error: "FAL_NO_IMAGE" });
      }

      const response = await fetch(imageUrl);
      const imageBuffer = Buffer.from(await response.arrayBuffer());

      const width = imageBuffer.readUInt32BE(16);
      const height = imageBuffer.readUInt32BE(20);
      const bucketParam = sessionBucket ? `&session_bucket=${encodeURIComponent(sessionBucket)}` : "";
      const repairedPath = `/api/repairs/${encodeURIComponent(repairId)}/image?session_id=${encodeURIComponent(sessionId)}${bucketParam}`;

      const meta: RepairMeta = {
        schema_version: "1.0",
        repair_id: repairId,
        session_id: sessionId,
        source_id: sourceId,
        cap_id: capId,
        created_at: new Date(start).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - start,
        status: "succeeded",
        input: repairInputPaths(sessionRel!, repairId),
        fal: {
          model: config.falModel,
          loras: [{ path: config.falLoraPath, scale: 1.0 }],
          parameters: {
            num_inference_steps: 28,
            guidance_scale: 5,
            output_format: "png",
            num_images: 1,
            seed: null
          },
          uploaded_reference_url: uploadedReferenceUrl,
          uploaded_target_url: uploadedTargetUrl
        },
        prompt: {
          template_version: "1.0",
          text: withNotes,
          delta_pose_values: {
            x: deltaPose.x,
            y: deltaPose.y,
            z: deltaPose.z,
            pitch: deltaPose.pitch,
            yaw: deltaPose.yaw,
            roll: deltaPose.roll
          }
        },
        output: {
          repaired_image_path: repairedPath,
          width,
          height,
          bytes: imageBuffer.byteLength
        },
        error: null
      };

      putRepair(sessionId, sessionBucket, repairId, { meta, imageBuffer });
      return res.type("image/png").send(imageBuffer);
    } catch (error) {
      const invalidSession = invalidSessionMessage(error);
      if (invalidSession) {
        return res.status(400).json({ error: invalidSession });
      }

      if (sessionId && repairId && deltaPose && withNotes) {
        const isTimeout = error instanceof Error && error.message === "FAL_TIMEOUT";
        const failureMeta: RepairMeta = {
          schema_version: "1.0",
          repair_id: repairId,
          session_id: sessionId,
          source_id: sourceId,
          cap_id: capId,
          created_at: new Date(start).toISOString(),
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - start,
          status: "failed",
          input: repairInputPaths(sessionRel!, repairId),
          fal: {
            model: config.falModel,
            loras: [{ path: config.falLoraPath, scale: 1.0 }],
            parameters: {
              num_inference_steps: 28,
              guidance_scale: 5,
              output_format: "png",
              num_images: 1,
              seed: null
            },
            uploaded_reference_url: uploadedReferenceUrl,
            uploaded_target_url: uploadedTargetUrl
          },
          prompt: {
            template_version: "1.0",
            text: withNotes,
            delta_pose_values: {
              x: deltaPose.x,
              y: deltaPose.y,
              z: deltaPose.z,
              pitch: deltaPose.pitch,
              yaw: deltaPose.yaw,
              roll: deltaPose.roll
            }
          },
          output: undefined,
          error: {
            code: isTimeout ? "FAL_TIMEOUT" : "FAL_ERROR",
            message: error instanceof Error ? error.message : "Unknown error",
            retryable: isTimeout
          }
        };
        putRepair(sessionId, sessionBucket, repairId, { meta: failureMeta });
      }

      return res.status(500).json({ error: "REPAIR_FAILED", detail: error instanceof Error ? error.message : "Unknown error" });
    }
  }
);
