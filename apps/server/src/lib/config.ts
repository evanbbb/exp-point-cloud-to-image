import path from "node:path";

export const config = {
  port: Number(process.env.PORT ?? 8787),
  repoRoot: process.cwd(),
  shotsRoot: path.join(process.cwd(), "shots"),
  generationMode: process.env.GENERATION_MODE ?? "mock",
  falModel: "fal-ai/flux-2/klein/9b/base/edit/lora",
  falLoraPath: "cyrildiagne/flux2-klein9b-lora-mlsharp-3d-repair",
  mlSharpBin: process.env.ML_SHARP_BIN ?? path.join(process.cwd(), ".venv-mlsharp-311/bin/sharp"),
  mlSharpCheckpointPath:
    process.env.ML_SHARP_CHECKPOINT ??
    path.join(process.cwd(), "assets/models/sharp_2572gikvuh.pt"),
  mlSharpTimeoutMs: 15 * 60 * 1000
};
