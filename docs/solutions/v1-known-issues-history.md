# V1 Known Issues History

This file is the consolidated history of non-trivial issues resolved during V1 stabilization.

## 1) Viewer Helpers Invisible After Scene Load

- Date: 2026-02-20
- Area: `apps/viewer/viewer-scene.js`
- Symptom:
  - Grid/Axes disappeared after loading generated point cloud.
  - Grid appeared in orbit camera but not in shot camera.
- Root cause:
  - Grid sat on the same plane as dense ground points (depth fighting).
  - Helper sizes were fixed and too small for loaded scene scale.
  - Shot camera far clip was too small for scaled helper geometry.
- Fix:
  - Reposition grid to `box.min.y - 0.02`.
  - Scale grid/axes from scene bounding sphere radius.
  - Update shot camera near/far based on scene radius.
- Prevention:
  - Always recompute helper placement/scale and shot camera clip planes after loading normalized geometry.

## 2) Repair History Cross-Source Leakage

- Date: 2026-02-20
- Area: `apps/repair/repair-app.js`, `apps/server/src/routes/repair.ts`, `shared/schemas/repair-meta.ts`
- Symptom:
  - Previous Repairs panel showed items from a different source after source switch.
- Root cause:
  - `cap_id` values repeat across sources (`cap_0001`, etc.).
  - Filter logic let legacy/no-`source_id` repairs pass through when active source changed.
- Fix:
  - Ensure repairs carry optional `source_id`.
  - Tighten client filter to require source match when `activeSourceId` is set.
  - Keep async generation guard to avoid stale UI updates.
- Prevention:
  - Scope repair history by both source and capture context.
  - Treat missing provenance fields as non-match when a specific source context is active.

## 3) Workspace Path Ownership and Git Noise

- Initial date: 2026-02-20
- Follow-up: 2026-02-22
- Area: workspace/viewer/repair flow + server storage behavior
- Symptoms:
  - Browser and server path assumptions diverged.
  - Users expected all writes to use selected local working folder.
  - Folders selected inside a git repo appeared in `git status`, causing confusion.
- Root causes:
  - Legacy server storage-root assumptions (`/shots`, `/api/open-folder`, filesystem-coupled flows).
  - Missing explicit workspace gate before viewer/repair.
- Fixes:
  - Added workspace-first UX gate (`/workspace`) with required folder selection before `/viewer` and `/repair`.
  - Added shared folder-handle module (`/shared/workspace-handle.js`).
  - Removed `/shots` static mount, `/api/open-folder`, and `/api/capture/sync`.
  - Moved generation/repair server artifacts to in-memory stores with retention controls.
- Prevention:
  - Keep persistence ownership explicit: local working folder (browser) + limited server settings.
  - Avoid reintroducing implicit server default storage roots.
  - Keep docs explicit that server in-memory artifacts are ephemeral.

## 4) Previous Repairs File Access Action Regression

- Date: 2026-02-22
- Area: `apps/repair/repair-app.js`
- Symptoms:
  - Previous Repairs cards no longer had a file-access action.
  - Users expected a direct folder-open affordance from each repair card.
- Root causes:
  - Legacy folder-open behavior depended on server-coupled filesystem routes that were removed during local-first cleanup.
  - Browser `FileSystemDirectoryHandle` does not provide a portable way to open OS Finder directly from a web app.
- Fixes:
  - Restored a per-repair action button in Previous Repairs.
  - Switched action to explicit save/export semantics with a download icon.
  - Export now produces one archive per repair: `<repair_id>_files.zip` (browser download location, not workspace write-back).
  - Archive includes `repair_meta.json` and, when present, `repaired.png`.
- Prevention:
  - Keep UI affordances aligned with browser capability limits for local filesystem handles.
  - When removing server filesystem routes, explicitly replace dependent UI actions with local-first equivalents.
  - Prefer single-artifact export for repair handoff to avoid multi-download friction.

## Notes for V1 Operations

- Local-only single-user workflow.
- Server transient data may disappear due to restart or retention eviction.
- Working folders inside git repos will naturally appear in git status; choose an external folder to avoid that.
