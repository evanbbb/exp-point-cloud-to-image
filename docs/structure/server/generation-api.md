# Generation API

Current backend contract for on-demand `ml-sharp` generation.

Upstream project: https://github.com/apple/ml-sharp

## Purpose

- Accept a browser-uploaded reference image.
- Start and track asynchronous generation jobs.
- Serve generated manifest/PLY assets from temporary in-memory storage so the browser can persist them to disk.

## Endpoint: `POST /api/generate/sync-reference`

Uploads a reference image and stores it in memory for the next generation request.

### Request (`multipart/form-data`)

- `session_id` (required)
- `session_bucket` (optional)
- `source_id` (required, `src_####`)
- `filename` (optional)
- `reference` (required file)

### Response (200)

```json
{
  "session_id": "SESSION_20260222_101010",
  "session_bucket": "WorkA",
  "source_id": "src_0001",
  "filename": "reference.png",
  "reference_image_path": "memory://ref_ab12cd34"
}
```

## Endpoint: `POST /api/generate`

Starts a generation job.

### Request (JSON)

```json
{
  "session_id": "SESSION_20260222_101010",
  "session_bucket": "WorkA",
  "reference_image_path": "memory://ref_ab12cd34",
  "force_regenerate": false
}
```

### Notes

- `reference_image_path` must be a `memory://` token returned by `sync-reference`.
- Job state is stored in memory.
- Reuses existing queued/running/completed jobs when `force_regenerate` is false.
- Viewer persists completed generation outputs to disk under `source/src_####/generations/gen_<jobId>/` in the selected working folder.

### Retention semantics

- In-memory generation state is ephemeral and is lost when server restarts.
- Generation references uploaded by `sync-reference` are short-lived:
  - TTL: 10 minutes
  - Max entries: 200
- Generated manifest/PLY assets are in-memory only:
  - TTL: 60 minutes
  - Max entries: 200
- Per-session generation jobs are in-memory only:
  - Max entries per session: 200
  - Terminal-job TTL: 6 hours

### Response (202)

```json
{
  "job_id": "gen_1234abcd",
  "status": "queued",
  "session_id": "SESSION_20260222_101010",
  "created_at": "2026-02-22T10:10:11.000Z"
}
```

## Endpoint: `GET /api/generate/:jobId`

Returns current job status.

### Status values

- `queued`
- `running`
- `completed`
- `failed`

### Stage values

- `queued`
- `running_ml_sharp`
- `writing_outputs`
- `completed`
- `failed`

## Endpoint: `POST /api/generate/:jobId/cancel`

Cancels a queued/running job.

### Query params

- `session_id` (required)
- `session_bucket` (optional)

## Endpoint: `GET /api/generate/:jobId/asset/:assetName`

Serves in-memory generation assets for completed jobs.
These asset endpoints are transient transport paths, not durable storage.

Supported `assetName` values:

- `manifest.json`
- `scene.ply`

`scene_manifest_path` returned by job status points at this endpoint:

- `/api/generate/<jobId>/asset/manifest.json`

Manifest includes:

- `version`
- `generated_at`
- `ply_path` (for example `/api/generate/<jobId>/asset/scene.ply`)

## Timeouts and common errors

- Timeout: `ML_SHARP_TIMEOUT`
- Execution failure: `ML_SHARP_EXEC_FAILED`
- Cancelled: `JOB_CANCELLED`
- Invalid reference token/path: `INVALID_REFERENCE_IMAGE_PATH`
- Missing uploaded reference token: `MISSING_REFERENCE_FILE`

## Viewer polling guidance

- Poll `GET /api/generate/:jobId` every 1 second while status is `queued` or `running`.
- Stop polling when status is `completed` or `failed`.
- On completion, load `scene_manifest_path` then `ply_path` from manifest, then persist both files to disk in the selected working folder.
