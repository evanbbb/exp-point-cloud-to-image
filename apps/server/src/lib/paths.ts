import path from "node:path";

export function resolveWithin(baseDir: string, relativePath: string): string {
  const resolved = path.resolve(baseDir, relativePath);
  const base = path.resolve(baseDir);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error("INVALID_SESSION_PATH");
  }
  return resolved;
}

export function toRepoRelative(repoRoot: string, absolutePath: string): string {
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}

export function parseSessionId(value: string): string {
  if (!/^SESSION_\d{8}_\d{6}$/.test(value)) {
    throw new Error("INVALID_SESSION_ID");
  }
  return value;
}
