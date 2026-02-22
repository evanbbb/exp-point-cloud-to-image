# Viewer App (`/viewer`)

Part A workflow: source image selection, 3D generation, shot framing, and capture export.

## Entry behavior

- Requires a saved working folder handle.
- If handle is missing/denied, redirects to `/workspace?next=/viewer`.

## Key modules

- `apps/viewer/viewer-app.js`: UI orchestration and workflow wiring.
- `apps/viewer/viewer-generation.js`: generation jobs, polling, load output.
- `apps/viewer/viewer-scene.js`: three.js scene, cameras, overlays, capture.

## UI states

- `pick`: waiting for valid working folder handle.
- `ready`: full viewer UI.

## Main responsibilities

- Read/create `istanbul3d_session.json` in working folder.
- Manage sources (`src_####`) and active source selection.
- Upload reference via `/api/generate/sync-reference`.
- Start generation via `/api/generate`.
- Poll `/api/generate/:jobId`.
- Persist completed generation assets to local working folder:
  - `source/src_####/generations/gen_<jobId>/scene_manifest.json`
  - `source/src_####/generations/gen_<jobId>/scene.ply`
- Load generated scenes from local files when available.
- Render image plane overlay and aspect guide for active source.
- Capture camera outputs to local working folder:
  - `target.png`
  - `camera.json`
  - `delta_pose.json`

## Camera and capture behavior

- Orbit and shot cameras with lens presets (24/35/50/85mm).
- Original shot pose can be set/reset.
- `Capture New View` writes next `cap_####` directory in local source captures.
- No server capture sync route is used.

## Data boundaries

- Local persistent data: session/source/capture/generation files in selected working folder.
- Server-dependent transient data: generation job state and in-memory generation assets used only until local copy is written.
