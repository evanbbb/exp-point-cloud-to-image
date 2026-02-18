import path from "node:path";

export const config = {
  port: Number(process.env.PORT ?? 8787),
  repoRoot: process.cwd(),
  shotsRoot: path.join(process.cwd(), "shots"),
  generationMode: process.env.GENERATION_MODE ?? "mock",
  falModel: "fal-ai/flux-2/klein/9b/base/edit/lora",
  falLoraPath: "cyrildiagne/flux2-klein9b-lora-mlsharp-3d-repair"
};
