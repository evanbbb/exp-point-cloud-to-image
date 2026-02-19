import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeRepairMeta } from "../apps/server/src/lib/repair-meta";
import type { RepairMeta } from "../shared/schemas/repair-meta";

const baseMeta: RepairMeta = {
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
    text: "Referring to the scene in image 1, restore the perspective of the scene in image 2.",
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

test("writeRepairMeta writes valid JSON to disk", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "repair-meta-test-"));
  const metaPath = path.join(tmpDir, "repair_meta.json");
  try {
    await writeRepairMeta(metaPath, baseMeta);
    const raw = await fs.readFile(metaPath, "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.status, "succeeded");
    assert.equal(parsed.repair_id, "repair_0001");
    assert.equal(parsed.schema_version, "1.0");
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("writeRepairMeta writes pretty-printed JSON (indented)", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "repair-meta-test-"));
  const metaPath = path.join(tmpDir, "repair_meta.json");
  try {
    await writeRepairMeta(metaPath, baseMeta);
    const raw = await fs.readFile(metaPath, "utf8");
    // pretty-printed JSON contains newlines and spaces
    assert.ok(raw.includes("\n"), "output should be pretty-printed with newlines");
    assert.ok(raw.includes("  "), "output should be pretty-printed with indentation");
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("writeRepairMeta writes failed meta with error object to disk", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "repair-meta-test-"));
  const metaPath = path.join(tmpDir, "repair_meta.json");
  const failedMeta: RepairMeta = {
    ...baseMeta,
    status: "failed",
    output: undefined,
    error: {
      code: "FAL_TIMEOUT",
      message: "FAL_TIMEOUT",
      retryable: true
    }
  };
  try {
    await writeRepairMeta(metaPath, failedMeta);
    const raw = await fs.readFile(metaPath, "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.status, "failed");
    assert.equal(parsed.error.code, "FAL_TIMEOUT");
    assert.equal(parsed.error.retryable, true);
    assert.equal(parsed.output, undefined);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("writeRepairMeta writes FAL_ERROR meta with retryable false to disk", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "repair-meta-test-"));
  const metaPath = path.join(tmpDir, "repair_meta.json");
  const failedMeta: RepairMeta = {
    ...baseMeta,
    status: "failed",
    output: undefined,
    error: {
      code: "FAL_ERROR",
      message: "upstream API returned 503",
      retryable: false
    }
  };
  try {
    await writeRepairMeta(metaPath, failedMeta);
    const raw = await fs.readFile(metaPath, "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.error.code, "FAL_ERROR");
    assert.equal(parsed.error.retryable, false);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("writeRepairMeta rejects when schema validation fails", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "repair-meta-test-"));
  const metaPath = path.join(tmpDir, "repair_meta.json");
  // Force an invalid object past TypeScript by casting through unknown
  const badMeta = { ...baseMeta, schema_version: "9.9" } as unknown as RepairMeta;
  try {
    await assert.rejects(
      () => writeRepairMeta(metaPath, badMeta),
      "writeRepairMeta should reject when schema validation fails"
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("writeRepairMeta rejects when duration_ms is negative", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "repair-meta-test-"));
  const metaPath = path.join(tmpDir, "repair_meta.json");
  const badMeta = { ...baseMeta, duration_ms: -500 } as unknown as RepairMeta;
  try {
    await assert.rejects(
      () => writeRepairMeta(metaPath, badMeta),
      "writeRepairMeta should reject when duration_ms is negative"
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("writeRepairMeta round-trips output dimensions accurately", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "repair-meta-test-"));
  const metaPath = path.join(tmpDir, "repair_meta.json");
  const metaWithDims: RepairMeta = {
    ...baseMeta,
    output: {
      repaired_image_path: "shots/SESSION_20260218_130501/repairs/repair_0001/output/repaired.png",
      width: 3840,
      height: 2160,
      bytes: 987654
    }
  };
  try {
    await writeRepairMeta(metaPath, metaWithDims);
    const raw = await fs.readFile(metaPath, "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.output.width, 3840);
    assert.equal(parsed.output.height, 2160);
    assert.equal(parsed.output.bytes, 987654);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
