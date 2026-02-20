import express from "express";
import path from "node:path";
import { execFile } from "node:child_process";
import { config, validateMlSharpRuntimeOrThrow } from "./lib/config";
import { generateRouter } from "./routes/generate";
import { repairRouter } from "./routes/repair";
import { resolveWithin } from "./lib/paths";

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, generation_mode: "real", shots_root: config.shotsRoot });
  });

  app.post("/api/open-folder", (req, res) => {
    const { rel_path } = req.body as { rel_path?: string };
    if (!rel_path) return res.status(400).json({ error: "rel_path required" });
    let resolved: string;
    try {
      resolved = resolveWithin(config.shotsRoot, rel_path);
    } catch {
      return res.status(400).json({ error: "INVALID_PATH" });
    }
    execFile("open", [resolved], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    });
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
