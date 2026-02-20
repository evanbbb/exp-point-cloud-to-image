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

export function parseSessionBucket(value: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(raw)) {
    throw new Error("INVALID_SESSION_BUCKET");
  }
  return raw;
}

export function sessionBaseRelativePath(sessionId: string, sessionBucket: string | null): string {
  return sessionBucket || sessionId;
}
