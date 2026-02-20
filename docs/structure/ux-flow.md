# UX Flow

This is the implemented user flow across Viewer, Server, and Repair.

## End-to-end map

1. User opens `/viewer`.
2. User picks a session folder.
3. User either initializes a new session or loads an existing one.
4. User uploads/selects a source image (`src_####`).
5. User starts generation (`/api/generate/sync-reference` then `/api/generate`).
6. Viewer polls generation status (`/api/generate/:jobId`) and auto-loads completed output.
7. User frames shot camera and captures views (`cap_####` with `target.png`, `camera.json`, `delta_pose.json`).
8. Capture files are also synced to server (`/api/capture/sync`).
9. User opens `/repair` (currently informational page only).
10. If repair is invoked via API/tooling, server runs `/api/repair` and writes `repaired.png` + `repair_meta.json`.

## Viewer UI states

`apps/viewer/viewer-app.js` manages a 3-state UI:

1. `pick`: landing screen, `Pick Session Folder`.
2. `confirm`: shown when selected folder lacks `istanbul3d_session.json`; user can initialize.
3. `ready`: main workspace with source selector, 3D viewport, camera controls, generation jobs, capture.

## Core interactions in Viewer

1. Session setup:
   - `showDirectoryPicker()` selects folder.
   - Existing session file loads and migrates old single-source layout if needed.
2. Source management:
   - `+ New Image` creates `source/src_####/`, copies selected file, and creates `captures/`.
   - Active source drives image plane overlay and aspect guide.
3. Generation:
   - Start button uploads reference image to server session path.
   - Viewer starts generation job and tracks it in local session JSON.
   - Poll loop updates progress, status, logs tail, and supports cancel.
   - Completed jobs expose `Load Output`; completed jobs can auto-load.
4. Camera workflow:
   - Orbit camera for scene navigation.
   - Shot camera for output framing and lens presets (24/35/50/85mm).
   - `Set Original View` and `Reset To Original View` define delta baseline.
5. Capture workflow:
   - `Capture New View` writes `target.png`, `camera.json`, `delta_pose.json` into next `cap_####`.
   - Same payload syncs to server and optionally opens Finder.

## Repair UX status

- `apps/repair/index.html` is currently a static guidance page.
- Queueing/running repairs is not implemented in browser UI yet.
- Repair capability exists server-side at `POST /api/repair` and requires:
  - multipart files: `reference`, `target`, `delta_pose`, `camera`, optional `notes`
  - `paid_confirm=true`
  - valid `FAL_KEY` in environment

## Primary handoffs between UX steps

1. Viewer -> Generation:
   - `reference_image_path` points to `shots/.../source/src_####/<filename>`.
2. Generation -> Viewer:
   - `scene_manifest_path` returned in job status; viewer loads PLY from this manifest.
3. Viewer Capture -> Repair:
   - Repair expects capture triplet (`target.png`, `camera.json`, `delta_pose.json`) plus original reference image.
