# Generation API

This document defines the V0 backend contract for on-demand `ml-sharp` scene generation.

## Purpose
- Start generation from a session reference image.
- Track asynchronous job progress.
- Return a scene manifest path when generation completes.

## Endpoint: `POST /api/generate`

Starts a new generation job for a session.

### Request (JSON)

```json
{
  "session_id": "SESSION_20260218_130501",
  "reference_image_path": "shots/SESSION_20260218_130501/source/reference.png",
  "force_regenerate": false
}
```

### Validation Rules
- `session_id`: required, must match an existing session folder.
- `reference_image_path`: required, must resolve under that session root.
- `force_regenerate`: optional boolean, default `false`.

### Behavior
- If a job is already `queued` or `running` for the same session and `force_regenerate=false`, return that existing job.
- If generation output already exists and `force_regenerate=false`, return a completed job payload.
- Otherwise enqueue a new job.

### Response (202 Accepted)

```json
{
  "job_id": "gen_0001",
  "status": "queued",
  "session_id": "SESSION_20260218_130501",
  "created_at": "2026-02-18T13:05:10.443Z"
}
```

## Endpoint: `GET /api/generate/:job_id`

Returns status for a generation job.

### Response (200)

```json
{
  "job_id": "gen_0001",
  "session_id": "SESSION_20260218_130501",
  "status": "running",
  "stage": "running_ml_sharp",
  "progress_percent": 62,
  "created_at": "2026-02-18T13:05:10.443Z",
  "updated_at": "2026-02-18T13:05:48.103Z"
}
```

### Response (Completed)

```json
{
  "job_id": "gen_0001",
  "session_id": "SESSION_20260218_130501",
  "status": "completed",
  "stage": "completed",
  "progress_percent": 100,
  "scene_manifest_path": "shots/SESSION_20260218_130501/source/scene/manifest.json",
  "created_at": "2026-02-18T13:05:10.443Z",
  "updated_at": "2026-02-18T13:06:21.790Z"
}
```

### Response (Failed)

```json
{
  "job_id": "gen_0001",
  "session_id": "SESSION_20260218_130501",
  "status": "failed",
  "stage": "failed",
  "progress_percent": 100,
  "error": {
    "code": "ML_SHARP_EXEC_FAILED",
    "message": "ml-sharp process exited with code 1"
  },
  "created_at": "2026-02-18T13:05:10.443Z",
  "updated_at": "2026-02-18T13:06:00.101Z"
}
```

## Status Enum
- `queued`
- `running`
- `completed`
- `failed`

## Stage Enum (V0)
- `validating_input`
- `queued`
- `running_ml_sharp`
- `writing_outputs`
- `completed`
- `failed`

## Filesystem Conventions
- Job metadata file:
  - `shots/<SESSION_ID>/generation/jobs/<JOB_ID>.json`
- Scene output root:
  - `shots/<SESSION_ID>/source/scene/`
- Scene manifest file:
  - `shots/<SESSION_ID>/source/scene/manifest.json`

## Timeout and Errors
- Max generation duration: 15 minutes.
- Timeout error code: `ML_SHARP_TIMEOUT`.
- Invalid path traversal attempt: `INVALID_SESSION_PATH`.
- Missing reference image: `REFERENCE_NOT_FOUND`.

## Viewer Polling Guidance
- Poll `GET /api/generate/:job_id` every 1 second while `queued|running`.
- Stop polling on `completed|failed`.
- On `completed`, load scene from `scene_manifest_path`.

## Mock Mode (No ml-sharp)

V0 development may run without `ml-sharp` by enabling mock generation mode.

### Toggle
- Environment variable: `GENERATION_MODE=mock`
- Default behavior for local development until `ml-sharp` is installed.

### Mock Behavior
- `POST /api/generate` creates a normal job record.
- Job transitions to `completed` after a short delay (for example 300-800ms).
- Server writes a mock scene manifest to:
  - `shots/<SESSION_ID>/source/scene/manifest.json`
- `GET /api/generate/:job_id` returns normal status payloads, identical contract to real mode.

### Contract Guarantee
- Viewer/repair clients must not depend on implementation details of real vs mock mode.
- API response shape remains identical across both modes.
