import test from "node:test";
import assert from "node:assert/strict";
import { repairMetaSchema } from "../shared/schemas/repair-meta";

const sample = {
  schema_version: "1.0",
  repair_id: "repair_0001",
  session_id: "SESSION_20260218_130501",
  created_at: "2026-02-18T13:20:10.443Z",
  completed_at: "2026-02-18T13:20:42.110Z",
  duration_ms: 31667,
  status: "succeeded",
  input: {
    reference_image_path: "shots/SESSION_20260218_130501/repairs/repair_0001/input/reference.png",
    target_image_path: "shots/SESSION_20260218_130501/repairs/repair_0001/input/target.png",
    delta_pose_path: "shots/SESSION_20260218_130501/repairs/repair_0001/input/delta_pose.json",
    camera_path: "shots/SESSION_20260218_130501/repairs/repair_0001/input/camera.json"
  },
  fal: {
    model: "fal-ai/flux-2/klein/9b/base/edit/lora",
    loras: [{ path: "cyrildiagne/flux2-klein9b-lora-mlsharp-3d-repair", scale: 1.0 }],
    parameters: {
      num_inference_steps: 28,
      guidance_scale: 5,
      output_format: "png",
      num_images: 1,
      seed: null
    }
  },
  prompt: {
    template_version: "1.0",
    text: "prompt",
    delta_pose_values: { x: 0.1, y: 0.2, z: 0.3, pitch: 1, yaw: 2, roll: 3 }
  },
  output: {
    repaired_image_path: "shots/SESSION_20260218_130501/repairs/repair_0001/output/repaired.png",
    width: 1920,
    height: 1080,
    bytes: 12345
  },
  error: null
};

test("repair metadata schema accepts valid success object", () => {
  const parsed = repairMetaSchema.parse(sample);
  assert.equal(parsed.status, "succeeded");
  assert.equal(parsed.fal.loras.length, 1);
});

test("repair metadata schema requires error object for failed status", () => {
  const failed = { ...sample, status: "failed", error: null };
  const parsed = repairMetaSchema.parse(failed);
  assert.equal(parsed.status, "failed");
});
