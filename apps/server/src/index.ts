import express from "express";
import path from "node:path";
import { config, validateMlSharpRuntimeOrThrow } from "./lib/config";
import { generateRouter } from "./routes/generate";
import { repairRouter } from "./routes/repair";

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, generation_mode: "real", shots_root: config.shotsRoot });
  });

  app.use(generateRouter);
  app.use(repairRouter);

  app.use("/shots", express.static(config.shotsRoot));
  app.use("/viewer", express.static(path.join(config.repoRoot, "apps/viewer")));
  app.use("/repair", express.static(path.join(config.repoRoot, "apps/repair")));

  return app;
}

if (require.main === module) {
  validateMlSharpRuntimeOrThrow();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Server listening on http://localhost:${config.port}`);
  });
}
