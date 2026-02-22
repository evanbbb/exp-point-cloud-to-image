# Repair Meta Schema

This document describes the metadata object validated by `shared/schemas/repair-meta.ts`.

## Where It Is Used

- Produced by `POST /api/repair` in `apps/server/src/routes/repair.ts`.
- Optionally fetched immediately after run via `GET /api/repairs/:repairId/meta`.
- Persisted by the browser to disk in local working folder at:
  - `source/src_####/repairs/repair_<id>/repair_meta.json`

## Purpose

- Capture reproducibility inputs for each repair run.
- Record timing, status, and failure detail.
- Provide image lookup path for prior repairs in the UI.

## Schema (V1 current)

```json
{
  "schema_version": "1.0",
  "repair_id": "repair_0001",
  "session_id": "SESSION_20260222_101010",
  "source_id": "src_0001",
  "cap_id": "cap_0003",
  "created_at": "2026-02-22T10:20:10.443Z",
  "completed_at": "2026-02-22T10:20:42.110Z",
  "duration_ms": 31667,
  "status": "succeeded",
  "input": {
    "reference_image_path": "source/src_0001/reference.png",
    "target_image_path": "source/src_0001/captures/cap_0003/target.png",
    "delta_pose_path": "source/src_0001/captures/cap_0003/delta_pose.json",
    "camera_path": "source/src_0001/captures/cap_0003/camera.json"
  },
  "fal": {
    "model": "fal-ai/flux-2/klein/9b/base/edit/lora",
    "loras": [
      {
        "path": "cyrildiagne/flux2-klein9b-lora-mlsharp-3d-repair",
        "scale": 1.0
      }
    ],
    "parameters": {
      "num_inference_steps": 28,
      "guidance_scale": 5,
      "output_format": "png",
      "num_images": 1,
      "seed": null
    },
    "uploaded_reference_url": "optional_staging_url",
    "uploaded_target_url": "optional_staging_url"
  },
  "prompt": {
    "template_version": "1.0",
    "text": "Rendered repair prompt text...",
    "delta_pose_values": {
      "x": 0.32,
      "y": -0.05,
      "z": 0.48,
      "pitch": -4.2,
      "yaw": 18.7,
      "roll": 0.0
    }
  },
  "output": {
    "repaired_image_path": "source/src_0001/repairs/repair_0001/repaired.png",
    "width": 1920,
    "height": 1080,
    "bytes": 1823401
  },
  "error": null
}
```

## Field Rules

- `schema_version`: literal `"1.0"`.
- `status`: one of `succeeded | failed`.
- `source_id` and `cap_id`: optional, used for source/capture-scoped UI filtering.
- `created_at` / `completed_at`: ISO timestamps.
- `duration_ms`: non-negative integer.
- `input.*_path`: string fields used as logical provenance paths.
- `fal.parameters.output_format`: literal `"png"`.
- `fal.parameters.num_images`: literal `1`.
- `output`: present on success, omitted on failure.
- `error`: `null` on success, object on failure.

## Error Object (when `status=failed`)

```json
{
  "code": "FAL_TIMEOUT",
  "message": "timeout details...",
  "retryable": true
}
```

Required fields:

- `code` (string)
- `message` (string)
- `retryable` (boolean)

## Retention Note

Server-side metadata is transient, but persisted local `repair_meta.json` files are the long-term history source.
