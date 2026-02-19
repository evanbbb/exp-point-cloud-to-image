import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config, validateMlSharpRuntimeOrThrow } from "../apps/server/src/lib/config";

async function withTempRuntimeFiles(fn: (binPath: string, checkpointPath: string, tmpDir: string) => Promise<void>) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mlsharp-runtime-"));
  const binPath = path.join(tmpDir, "sharp");
  const checkpointPath = path.join(tmpDir, "sharp.pt");
  try {
    await fs.writeFile(binPath, "#!/bin/sh\nexit 0\n");
    await fs.chmod(binPath, 0o755);
    await fs.writeFile(checkpointPath, "checkpoint");
    await fn(binPath, checkpointPath, tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

test("validateMlSharpRuntimeOrThrow passes when binary is executable and checkpoint is readable", async () => {
  await withTempRuntimeFiles(async (binPath, checkpointPath) => {
    const prevBin = config.mlSharpBin;
    const prevCheckpoint = config.mlSharpCheckpointPath;
    try {
      config.mlSharpBin = binPath;
      config.mlSharpCheckpointPath = checkpointPath;
      assert.doesNotThrow(() => validateMlSharpRuntimeOrThrow());
    } finally {
      config.mlSharpBin = prevBin;
      config.mlSharpCheckpointPath = prevCheckpoint;
    }
  });
});

test("validateMlSharpRuntimeOrThrow throws if binary is not executable", async () => {
  await withTempRuntimeFiles(async (binPath, checkpointPath) => {
    const prevBin = config.mlSharpBin;
    const prevCheckpoint = config.mlSharpCheckpointPath;
    try {
      await fs.chmod(binPath, 0o644);
      config.mlSharpBin = binPath;
      config.mlSharpCheckpointPath = checkpointPath;
      assert.throws(() => validateMlSharpRuntimeOrThrow(), /ML_SHARP_BIN_NOT_EXECUTABLE/);
    } finally {
      config.mlSharpBin = prevBin;
      config.mlSharpCheckpointPath = prevCheckpoint;
    }
  });
});

test("validateMlSharpRuntimeOrThrow throws if checkpoint is missing", async () => {
  await withTempRuntimeFiles(async (binPath, checkpointPath) => {
    const prevBin = config.mlSharpBin;
    const prevCheckpoint = config.mlSharpCheckpointPath;
    try {
      await fs.rm(checkpointPath, { force: true });
      config.mlSharpBin = binPath;
      config.mlSharpCheckpointPath = checkpointPath;
      assert.throws(() => validateMlSharpRuntimeOrThrow(), /ML_SHARP_CHECKPOINT_NOT_READABLE/);
    } finally {
      config.mlSharpBin = prevBin;
      config.mlSharpCheckpointPath = prevCheckpoint;
    }
  });
});
