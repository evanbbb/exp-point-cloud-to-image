import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function findMlSharpBin(): string {
  // 1. Explicit override from environment
  if (process.env.ML_SHARP_BIN) {
    return process.env.ML_SHARP_BIN;
  }

  // 2. Try 'which sharp' to find it in the current PATH (e.g. if conda env is active)
  try {
    const whichPath = execSync("which sharp", { encoding: "utf8" }).trim();
    if (whichPath && fs.existsSync(whichPath)) {
      return whichPath;
    }
  } catch {
    // ignore
  }

  const repoRoot = process.cwd();

  // 3. Search for common venv/conda locations relative to repo root or vendor/ml-sharp
  const searchDirs = [repoRoot, path.join(repoRoot, "vendor/ml-sharp")];
  const relativeBinaries = [
    ".venv/bin/sharp",
    ".venv-mlsharp-311/bin/sharp",
    "env/bin/sharp",
    "venv/bin/sharp",
    "bin/sharp",
  ];

  for (const dir of searchDirs) {
    for (const relBin of relativeBinaries) {
      const fullPath = path.join(dir, relBin);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  // 4. Fallback to the original default if nothing else is found
  return path.join(repoRoot, ".venv-mlsharp-311/bin/sharp");
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  repoRoot: process.cwd(),
  falModel: "fal-ai/flux-2/klein/9b/base/edit/lora",
  falLoraPath: "cyrildiagne/flux2-klein9b-lora-mlsharp-3d-repair",
  mlSharpBin: findMlSharpBin(),
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
