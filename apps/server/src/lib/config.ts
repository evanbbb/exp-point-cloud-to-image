import fs from "node:fs";
import path from "node:path";

export const config = {
  port: Number(process.env.PORT ?? 8787),
  repoRoot: process.cwd(),
  falModel: "fal-ai/flux-2/klein/9b/base/edit/lora",
  falLoraPath: "cyrildiagne/flux2-klein9b-lora-mlsharp-3d-repair",
  mlSharpBin: process.env.ML_SHARP_BIN ?? path.join(process.cwd(), ".venv-mlsharp-311/bin/sharp"),
  mlSharpCheckpointPath:
    process.env.ML_SHARP_CHECKPOINT ??
    path.join(process.cwd(), "assets/models/sharp_2572gikvuh.pt"),
  mlSharpDevice: process.env.ML_SHARP_DEVICE ?? "cpu",
  mlSharpTimeoutMs: 15 * 60 * 1000
};

export function getMlSharpRuntimeIssues(): string[] {
  const issues: string[] = [];

  try {
    fs.accessSync(config.mlSharpBin, fs.constants.X_OK);
  } catch {
    issues.push(`ML_SHARP_BIN_NOT_EXECUTABLE: ${config.mlSharpBin}`);
  }

  try {
    fs.accessSync(config.mlSharpCheckpointPath, fs.constants.R_OK);
  } catch {
    issues.push(`ML_SHARP_CHECKPOINT_NOT_READABLE: ${config.mlSharpCheckpointPath}`);
  }

  return issues;
}

export function validateMlSharpRuntimeOrThrow(): void {
  const issues = getMlSharpRuntimeIssues();
  if (issues.length > 0) {
    throw new Error(issues[0]);
  }
}
