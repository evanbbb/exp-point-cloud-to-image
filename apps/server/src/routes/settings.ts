import { Router } from "express";
import { readAppSettings, writeAppSettings } from "../lib/app-settings";

export const settingsRouter = Router();

settingsRouter.get("/api/settings", async (_req, res) => {
  try {
    const settings = await readAppSettings();
    return res.json({ fal_key_set: Boolean(settings.fal_key) });
  } catch {
    return res.status(500).json({ error: "READ_SETTINGS_FAILED" });
  }
});

settingsRouter.post("/api/settings", async (req, res) => {
  try {
    const { fal_key } = req.body as { fal_key?: string };
    const existing = await readAppSettings();
    await writeAppSettings({ ...existing, fal_key: fal_key ?? existing.fal_key });
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "WRITE_SETTINGS_FAILED" });
  }
});
