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

## Endpoint: `POST /api/generate/sync-reference`

Uploads a browser-selected source image into server-managed session storage before generation.

### Request (`multipart/form-data`)
- `session_id` (string)
- `source_id` (string, format: `src_####`)
- `filename` (string)
- `reference` (file)

### Response (200)

```json
{
  "session_id": "SESSION_20260218_130501",
  "source_id": "src_0001",
  "filename": "image 7.png",
  "reference_image_path": "shots/SESSION_20260218_130501/source/src_0001/image 7.png"
}
```

## Endpoint: `GET /api/generate/:job_id`

Returns status for a generation job.

## Endpoint: `POST /api/generate/:job_id/cancel`

Cancels a queued/running generation job.

### Request
- Query param: `session_id=<SESSION_ID>`

### Response (200)

```json
{
  "job_id": "gen_0001",
  "session_id": "SESSION_20260218_130501",
  "status": "failed",
  "stage": "failed",
  "progress_percent": 100,
  "cancel_requested_at": "2026-02-18T13:05:40.100Z",
  "cancelled_at": "2026-02-18T13:05:40.410Z",
  "error": {
    "code": "JOB_CANCELLED",
    "message": "Generation cancelled by user."
  }
}
```

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
  "logs_tail": [
    "Running preprocessing.",
    "Running inference.",
    "Running postprocessing.",
    "Saving 3DGS to ..."
  ],
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
  "cancel_requested_at": "2026-02-18T13:05:40.100Z",
  "cancelled_at": "2026-02-18T13:05:40.410Z",
  "error": {
    "code": "JOB_CANCELLED",
    "message": "Generation cancelled by user."
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
- Cancelled job code: `JOB_CANCELLED`.
- Invalid path traversal attempt: `INVALID_SESSION_PATH`.
- Missing reference image: `REFERENCE_NOT_FOUND`.
- Server startup validation errors:
  - `ML_SHARP_BIN_NOT_EXECUTABLE`
  - `ML_SHARP_CHECKPOINT_NOT_READABLE`

## Viewer Polling Guidance
- Poll `GET /api/generate/:job_id` every 1 second while `queued|running`.
- Stop polling on `completed|failed`.
- On `completed`, load scene from `scene_manifest_path`.
