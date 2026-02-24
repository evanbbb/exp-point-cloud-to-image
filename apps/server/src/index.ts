import express from "express";
import path from "node:path";
import { config, getMlSharpRuntimeIssues } from "./lib/config";
import { generateRouter } from "./routes/generate";
import { repairRouter } from "./routes/repair";
import { settingsRouter } from "./routes/settings";

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/", (_req, res) => {
    res.redirect("/workspace");
  });

  app.get("/api/health", (_req, res) => {
    const runtimeIssues = getMlSharpRuntimeIssues();
    res.json({
      ok: true,
      generation_mode: "real",
      ml_sharp_ready: runtimeIssues.length === 0,
      ml_sharp_issues: runtimeIssues
    });
  });

  app.get("/favicon.ico", (_req, res) => {
    res.status(204).end();
  });

  app.use(generateRouter);
  app.use(repairRouter);
  app.use(settingsRouter);

  app.use("/workspace", express.static(path.join(config.repoRoot, "apps/workspace")));
  app.use("/shared", express.static(path.join(config.repoRoot, "apps/shared")));
  app.use("/viewer", express.static(path.join(config.repoRoot, "apps/viewer")));
  app.use("/repair", express.static(path.join(config.repoRoot, "apps/repair")));
  app.use("/settings", express.static(path.join(config.repoRoot, "apps/settings")));

  return app;
}

if (require.main === module) {
  const runtimeIssues = getMlSharpRuntimeIssues();
  if (runtimeIssues.length > 0) {
    console.warn("ml-sharp runtime is not ready. Generation endpoints will fail until setup is complete.");
    for (const issue of runtimeIssues) {
      console.warn(`- ${issue}`);
    }
  }
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Server listening on http://localhost:${config.port}`);
  });
}
