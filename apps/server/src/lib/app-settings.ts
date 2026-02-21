import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

type AppSettings = { fal_key?: string };

const SETTINGS_PATH = path.join(config.repoRoot, "settings.json");

export async function readAppSettings(): Promise<AppSettings> {
  try {
    const text = await fs.readFile(SETTINGS_PATH, "utf8");
    return JSON.parse(text) as AppSettings;
  } catch {
    return {};
  }
}

export async function writeAppSettings(data: AppSettings): Promise<void> {
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(data, null, 2));
}

export async function getFalKey(): Promise<string | undefined> {
  const settings = await readAppSettings();
  return settings.fal_key || process.env.FAL_KEY;
}
