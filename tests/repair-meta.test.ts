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

test("repair metadata output field with width/height/bytes validates", () => {
  const parsed = repairMetaSchema.parse(sample);
  assert.ok(parsed.output !== undefined, "output should be defined");
  assert.ok(Number.isInteger(parsed.output!.width) && parsed.output!.width > 0, "width should be a positive integer");
  assert.ok(Number.isInteger(parsed.output!.height) && parsed.output!.height > 0, "height should be a positive integer");
  assert.ok(Number.isInteger(parsed.output!.bytes) && parsed.output!.bytes > 0, "bytes should be a positive integer");
});

test("repair metadata schema accepts failed status with populated error object", () => {
  const failed = {
    ...sample,
    status: "failed",
    output: undefined,
    error: {
      code: "FAL_TIMEOUT",
      message: "FAL_TIMEOUT",
      retryable: true
    }
  };
  const parsed = repairMetaSchema.parse(failed);
  assert.equal(parsed.status, "failed");
  assert.ok(parsed.error !== null, "error should not be null");
  assert.equal(parsed.error!.code, "FAL_TIMEOUT");
  assert.equal(parsed.error!.retryable, true);
});

test("repair metadata schema accepts FAL_ERROR code with retryable false", () => {
  const failed = {
    ...sample,
    status: "failed",
    output: undefined,
    error: {
      code: "FAL_ERROR",
      message: "upstream API returned 503",
      retryable: false
    }
  };
  const parsed = repairMetaSchema.parse(failed);
  assert.equal(parsed.status, "failed");
  assert.ok(parsed.error !== null, "error should not be null");
  assert.equal(parsed.error!.code, "FAL_ERROR");
  assert.equal(parsed.error!.retryable, false);
});

test("repair metadata schema rejects invalid schema_version", () => {
  const bad = { ...sample, schema_version: "2.0" };
  assert.throws(() => repairMetaSchema.parse(bad));
});

test("repair metadata schema rejects invalid status enum value", () => {
  const bad = { ...sample, status: "pending" };
  assert.throws(() => repairMetaSchema.parse(bad));
});

test("repair metadata schema rejects negative duration_ms", () => {
  const bad = { ...sample, duration_ms: -1 };
  assert.throws(() => repairMetaSchema.parse(bad));
});

test("repair metadata schema rejects zero width in output", () => {
  const bad = { ...sample, output: { ...sample.output, width: 0 } };
  assert.throws(() => repairMetaSchema.parse(bad));
});

test("repair metadata schema rejects zero height in output", () => {
  const bad = { ...sample, output: { ...sample.output, height: 0 } };
  assert.throws(() => repairMetaSchema.parse(bad));
});

test("repair metadata schema rejects zero bytes in output", () => {
  const bad = { ...sample, output: { ...sample.output, bytes: 0 } };
  assert.throws(() => repairMetaSchema.parse(bad));
});

test("repair metadata schema accepts optional fal request_id and upload URLs", () => {
  const withFalExtras = {
    ...sample,
    fal: {
      ...sample.fal,
      request_id: "req_abc123",
      uploaded_reference_url: "https://cdn.fal.ai/ref.png",
      uploaded_target_url: "https://cdn.fal.ai/tgt.png"
    }
  };
  const parsed = repairMetaSchema.parse(withFalExtras);
  assert.equal(parsed.fal.request_id, "req_abc123");
  assert.equal(parsed.fal.uploaded_reference_url, "https://cdn.fal.ai/ref.png");
  assert.equal(parsed.fal.uploaded_target_url, "https://cdn.fal.ai/tgt.png");
});

test("repair metadata schema accepts optional notes_path in input", () => {
  const withNotes = {
    ...sample,
    input: {
      ...sample.input,
      notes_path: "shots/SESSION_20260218_130501/repairs/repair_0001/input/notes.txt"
    }
  };
  const parsed = repairMetaSchema.parse(withNotes);
  assert.equal(parsed.input.notes_path, "shots/SESSION_20260218_130501/repairs/repair_0001/input/notes.txt");
});
