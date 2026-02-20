# Folder Structure

This document reflects the current code path in `apps/viewer` + `apps/server`.

## Repository top level

- `apps/viewer/`: browser Viewer app (Part A: image -> scene generation -> capture).
- `apps/repair/`: browser Repair page (currently informational UI only).
- `apps/server/`: local Express server and API routes.
- `shared/schemas/`: shared Zod schemas for API payloads and metadata.
- `shots/`: persistent session data written by client and server.
- `docs/structure/`: architecture and flow docs.

## Session root layout in `shots/`

Session roots can be either:

- `shots/SESSION_YYYYMMDD_HHMMSS/`
- `shots/<session_bucket>/SESSION_YYYYMMDD_HHMMSS/` (if `session_bucket` is set)

Within each session:

```text
SESSION_.../
  istanbul3d_session.json
  source/
    src_0001/
      <reference-image-filename>.png|jpg|...
      captures/
        cap_0001/
          target.png
          camera.json
          delta_pose.json
      scene/
        manifest.json
        <reference-image-stem>.ply
    src_0002/
      ...
  generation/
    jobs/
      gen_<id>.json
  repairs/
    repair_<id>/
      output/
        repaired.png           (success path)
        repair_meta.json       (success and failure paths)
```

## Ownership and write paths

- Viewer local writes (File System Access API):
  - `istanbul3d_session.json`
  - `source/src_####/<reference>`
  - `source/src_####/captures/cap_####/{target.png,camera.json,delta_pose.json}`
- Viewer server sync writes:
  - `/api/generate/sync-reference` writes the reference into `shots/.../source/src_####/`
  - `/api/capture/sync` writes capture files into `shots/.../source/src_####/captures/cap_####/`
- Generation server writes:
  - scene assets under `source/src_####/scene/`
  - job state JSON under `generation/jobs/`
- Repair server writes:
  - `repairs/repair_<id>/output/repaired.png` on success
  - `repairs/repair_<id>/output/repair_meta.json` on both success and failure

## Notes

- Current implementation stores source images in per-source folders (`src_####`), not directly under `source/`.
- Repair input copies (`repairs/.../input`) are described in legacy docs, but are not currently written by server routes.
