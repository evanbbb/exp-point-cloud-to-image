# repair_meta.json Schema

This document defines the V0 metadata contract written to:

`shots/<SESSION_ID>/repairs/repair_####/output/repair_meta.json`

## Purpose
- Record reproducibility inputs for each repair.
- Capture timing/status for debugging.
- Preserve error details for failed attempts.

## Schema (V0)

```json
{
  "schema_version": "1.0",
  "repair_id": "repair_0001",
  "session_id": "SESSION_20260218_130501",
  "created_at": "2026-02-18T13:20:10.443Z",
  "completed_at": "2026-02-18T13:20:42.110Z",
  "duration_ms": 31667,
  "status": "succeeded",
  "input": {
    "reference_image_path": "shots/SESSION_20260218_130501/repairs/repair_0001/input/reference.png",
    "target_image_path": "shots/SESSION_20260218_130501/repairs/repair_0001/input/target.png",
    "delta_pose_path": "shots/SESSION_20260218_130501/repairs/repair_0001/input/delta_pose.json",
    "camera_path": "shots/SESSION_20260218_130501/repairs/repair_0001/input/camera.json",
    "notes_path": "shots/SESSION_20260218_130501/repairs/repair_0001/input/notes.txt"
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
    "request_id": "optional_provider_request_id",
    "uploaded_reference_url": "optional_staging_url",
    "uploaded_target_url": "optional_staging_url"
  },
  "prompt": {
    "template_version": "1.0",
    "text": "Referring to the scene in image 1, restore the perspective of the scene in image 2. Repair missing regions and perspective artifacts. The camera has moved by: {x,y,z,pitch,yaw,roll}",
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
    "repaired_image_path": "shots/SESSION_20260218_130501/repairs/repair_0001/output/repaired.png",
    "width": 1920,
    "height": 1080,
    "bytes": 1823401
  },
  "error": null
}
```

## Field Rules
- `schema_version`: required string, start with `1.0`.
- `status`: one of `succeeded | failed`.
- `created_at`: required ISO 8601 timestamp.
- `completed_at`: required ISO 8601 timestamp when terminal.
- `duration_ms`: required non-negative integer when terminal.
- `input.*_path`: project-relative paths.
- `fal.model`: required.
- `fal.loras`: required array; at least one entry for this workflow.
- `prompt.text`: final fully-rendered prompt sent to provider.
- `error`: required; `null` on success, object on failure.

## Error Object (when `status=failed`)

```json
{
  "code": "FAL_REQUEST_FAILED",
  "message": "fal returned 403 Forbidden",
  "retryable": false
}
```

Required fields:
- `code` (string)
- `message` (string)
- `retryable` (boolean)

## Redaction Rules
- Never include `FAL_KEY` or any secret token.
- Keep staged upload URLs optional and non-sensitive.

