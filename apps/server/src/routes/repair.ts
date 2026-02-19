import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { fal } from "@fal-ai/client";
import { deltaPoseSchema } from "../../../../shared/schemas/delta-pose";
import { cameraSchema } from "../../../../shared/schemas/camera";
import type { RepairMeta } from "../../../../shared/schemas/repair-meta";
import { config } from "../lib/config";
import { parseSessionId, resolveWithin } from "../lib/paths";
import { writeRepairMeta } from "../lib/repair-meta";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

export const repairRouter = Router();

fal.config({
  credentials: process.env.FAL_KEY
});

const PROMPT_TEMPLATE =
  "Referring to the scene in image 1, restore the perspective of the scene in image 2. Repair missing regions and perspective artifacts. The camera has moved by: {x,y,z,pitch,yaw,roll}";

repairRouter.post(
  "/api/repair",
  upload.fields([
    { name: "reference", maxCount: 1 },
    { name: "target", maxCount: 1 },
    { name: "delta_pose", maxCount: 1 },
    { name: "camera", maxCount: 1 },
    { name: "notes", maxCount: 1 }
  ]),
  async (req, res) => {
    const start = Date.now();
    let sessionId: string | undefined;
    let repairId: string | undefined;
    let uploadedReferenceUrl: string | undefined;
    let uploadedTargetUrl: string | undefined;
    let deltaPose: { x: number; y: number; z: number; pitch: number; yaw: number; roll: number } | undefined;
    let withNotes: string | undefined;

    try {
      if (req.body.paid_confirm !== "true") {
        return res.status(400).json({ error: "PAID_CONFIRM_REQUIRED" });
      }

      const fields = req.files as Record<string, Express.Multer.File[]>;
      const reference = fields?.reference?.[0];
      const target = fields?.target?.[0];
      const deltaPoseRaw = fields?.delta_pose?.[0];
      const cameraRaw = fields?.camera?.[0];
      const notes = fields?.notes?.[0];

      if (!reference || !target || !deltaPoseRaw || !cameraRaw) {
        return res.status(400).json({ error: "MISSING_REQUIRED_FILES" });
      }

      sessionId = parseSessionId(String(req.body.session_id || ""));
      repairId = String(req.body.repair_id || `repair_${Date.now()}`);

      deltaPose = deltaPoseSchema.parse(JSON.parse(deltaPoseRaw.buffer.toString("utf8")));
      cameraSchema.parse(JSON.parse(cameraRaw.buffer.toString("utf8")));

      uploadedReferenceUrl = await fal.storage.upload(
        new Blob([Uint8Array.from(reference.buffer)], { type: reference.mimetype })
      );
      uploadedTargetUrl = await fal.storage.upload(
        new Blob([Uint8Array.from(target.buffer)], { type: target.mimetype })
      );

      const prompt = PROMPT_TEMPLATE.replace(
        "{x,y,z,pitch,yaw,roll}",
        `${deltaPose.x},${deltaPose.y},${deltaPose.z},${deltaPose.pitch},${deltaPose.yaw},${deltaPose.roll}`
      );

      withNotes = notes ? `${prompt}\n${notes.buffer.toString("utf8")}` : prompt;

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

      const width = imageBuffer.readUInt32BE(16);   // PNG IHDR bytes 16-19
      const height = imageBuffer.readUInt32BE(20);  // PNG IHDR bytes 20-23

      const outputDir = resolveWithin(config.shotsRoot, `${sessionId}/repairs/${repairId}/output`);
      await fs.mkdir(outputDir, { recursive: true });
      const imagePath = path.join(outputDir, "repaired.png");
      await fs.writeFile(imagePath, imageBuffer);

      const meta: RepairMeta = {
        schema_version: "1.0",
        repair_id: repairId,
        session_id: sessionId,
        created_at: new Date(start).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - start,
        status: "succeeded",
        input: {
          reference_image_path: `shots/${sessionId}/repairs/${repairId}/input/reference.png`,
          target_image_path: `shots/${sessionId}/repairs/${repairId}/input/target.png`,
          delta_pose_path: `shots/${sessionId}/repairs/${repairId}/input/delta_pose.json`,
          camera_path: `shots/${sessionId}/repairs/${repairId}/input/camera.json`
        },
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
          repaired_image_path: `shots/${sessionId}/repairs/${repairId}/output/repaired.png`,
          width,
          height,
          bytes: imageBuffer.byteLength
        },
        error: null
      };

      await writeRepairMeta(path.join(outputDir, "repair_meta.json"), meta);

      return res.type("image/png").send(imageBuffer);
    } catch (error) {
      if (error instanceof Error && ["INVALID_SESSION_ID", "INVALID_SESSION_PATH"].includes(error.message)) {
        return res.status(400).json({ error: error.message });
      }

      if (sessionId && repairId && deltaPose && withNotes) {
        try {
          const failedOutputDir = resolveWithin(config.shotsRoot, `${sessionId}/repairs/${repairId}/output`);
          await fs.mkdir(failedOutputDir, { recursive: true });
          const isTimeout = error instanceof Error && error.message === "FAL_TIMEOUT";
          const failureMeta: RepairMeta = {
            schema_version: "1.0",
            repair_id: repairId,
            session_id: sessionId,
            created_at: new Date(start).toISOString(),
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - start,
            status: "failed",
            input: {
              reference_image_path: `shots/${sessionId}/repairs/${repairId}/input/reference.png`,
              target_image_path: `shots/${sessionId}/repairs/${repairId}/input/target.png`,
              delta_pose_path: `shots/${sessionId}/repairs/${repairId}/input/delta_pose.json`,
              camera_path: `shots/${sessionId}/repairs/${repairId}/input/camera.json`
            },
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
          await writeRepairMeta(path.join(failedOutputDir, "repair_meta.json"), failureMeta);
        } catch {
          // ignore meta write errors on failure path
        }
      }

      return res.status(500).json({ error: "REPAIR_FAILED", detail: error instanceof Error ? error.message : "Unknown error" });
    }
  }
);
