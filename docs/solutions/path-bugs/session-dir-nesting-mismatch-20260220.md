---
module: Server Paths
date: 2026-02-20
problem_type: path_bug
component: backend
symptoms:
  - "Duplicate source/ tree — browser writes to shots/<bucket>/source/, server writes to shots/<bucket>/SESSION_*/source/"
  - "Repair images 404 — client requests /shots/<bucket>/repairs/... but files live under SESSION_* nesting"
  - "SESSION_* subdirectory created inside bucket folder despite one-session-per-bucket usage pattern"
root_cause: design_mismatch
resolution_type: code_fix
severity: high
tags: [paths, session-bucket, directory-structure, tsx-hot-reload]
---

# Troubleshooting: Session Directory Nesting Mismatch Between Browser and Server

## Problem

When a session bucket is present (e.g. `Feb20`), the server nested all files under `shots/<bucket>/SESSION_YYYYMMDD_HHMMSS/...` while the browser's File System Access API wrote directly to `shots/<bucket>/...`. This created duplicate `source/` trees and caused 404s for repair images.

## Environment

- Module: Server path construction
- Affected Files: `apps/server/src/lib/paths.ts`, `apps/repair/repair-app.js`
- Date: 2026-02-20

## Symptoms

- `shots/Feb20/source/` (browser-written) AND `shots/Feb20/SESSION_20260220_133233/source/` (server-written) both exist
- Repair page requests `/shots/Feb20/repairs/repair_<id>/output/repaired.png` but the file is at `/shots/Feb20/SESSION_20260220_133233/repairs/...` — 404
- Generation job logs reference the nested path in `scene_manifest_path`

## Root Cause

`sessionBaseRelativePath()` in `paths.ts` always concatenated bucket and session ID:

```ts
// OLD — always nests
return sessionBucket ? `${sessionBucket}/${sessionId}` : sessionId;
```

The browser picks a directory (e.g. `Feb20/`) and writes `source/`, `istanbul3d_session.json` directly there. But the server, receiving both `session_id=SESSION_...` and `session_bucket=Feb20`, constructed `Feb20/SESSION_.../` as the root. One session per bucket is the actual usage pattern, so the nesting served no purpose.

## Solution

### 1. Server chokepoint — `paths.ts`

```ts
// NEW — bucket alone when present
return sessionBucket || sessionId;
```

All server path construction flows through this single function — repairs, generation, capture sync, reference sync. One-line fix updates all paths.

### 2. Client — `repair-app.js`

Two places manually built `/shots/<bucket>/<session_id>/...` URLs:

```js
// OLD
const bucket = sessionData.session_bucket ? `${sessionData.session_bucket}/` : '';
const imgUrl = `/shots/${bucket}${repair.session_id}/repairs/...`;

// NEW
const base = sessionData.session_bucket || repair.session_id;
const imgUrl = `/shots/${base}/repairs/...`;
```

Same pattern for the open-folder `relPath`.

### 3. Data migration

Existing sessions need files moved from the nested directory up to bucket root:

```bash
cd shots/<bucket>/
mv SESSION_*/generation .
mv SESSION_*/repairs .
rm -rf SESSION_*/    # nested source/ is a duplicate of the browser-written one
```

Also update `scene_manifest_path` in `istanbul3d_session.json` to remove the `SESSION_*/` segment.

## Gotcha: tsx Does Not Hot-Reload

`tsx` (used by `npm run dev`) runs TypeScript directly but does **not** hot-reload on file changes. After editing `.ts` files, the server process must be killed and restarted for changes to take effect. Static JS files (repair-app.js, viewer-app.js) are picked up on browser refresh since they're served via `express.static`.

This caused confusion during verification: the client showed flattened URLs (new JS loaded on refresh) but the server was still writing to nested paths (old TS still running).

## Prevention

- The `sessionBaseRelativePath` function is the single chokepoint for all session path construction. Any future path changes should go through this function.
- When the browser and server both write to the session directory, ensure they agree on the root path. The browser uses the picked directory handle directly; the server must match.
- After editing server TypeScript, always restart the `npm run dev` process before testing.

## Related Issues

- Structure doc updated: `docs/structure/folder-structure.md`
