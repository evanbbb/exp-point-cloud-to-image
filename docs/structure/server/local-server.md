# Local Server Responsibilities

Single local Express server (default `http://localhost:8787`).

## Static routes

- `/workspace`
- `/viewer`
- `/repair`
- `/settings`
- `/shared`

`/` redirects to `/workspace`.

## API routes

- `GET /api/health`
- `GET /api/settings`
- `POST /api/settings`
- `POST /api/generate/sync-reference`
- `POST /api/generate`
- `GET /api/generate/:jobId`
- `POST /api/generate/:jobId/cancel`
- `GET /api/generate/:jobId/asset/:assetName`
- `GET /api/repairs/list`
- `GET /api/repairs/:repairId/meta`
- `GET /api/repairs/:repairId/image`
- `POST /api/repair`

## Storage model

- No `/shots` static mount.
- No server-side default storage root.
- No `/api/open-folder` endpoint.
- No `/api/capture/sync` endpoint.

Persistence behavior:

- Persisted: `settings.json` (repo root).
- Persisted on disk by browser in selected working folder (not by server):
  - generation artifacts (`source/src_####/generations/...`)
  - repair artifacts (`source/src_####/repairs/...`)
- In-memory only:
  - generation jobs/status
  - generation manifest/PLY assets
  - uploaded generation references
  - repair list and repair image payloads

Durability note:

- Generation and repair history is durable in the selected working folder across server restarts.
- Server in-memory copies are transient runtime state only.

Retention/eviction behavior:

- All in-memory data is lost on server restart.
- Generation references: 10-minute TTL, capped at 200 entries.
- Generation assets (manifest/PLY): 60-minute TTL, capped at 200 entries.
- Generation jobs: capped at 200 entries per session; terminal jobs expire after 6 hours.
- Repair history/images: capped at 200 entries per session; entries expire after 24 hours.

Health endpoint note:

- `GET /api/health` reports `ml_sharp_ready` and `ml_sharp_issues` so clean clones can diagnose missing generation runtime dependencies.

## Security and deployment assumptions

- Localhost development tool, no auth layer.
- Intended for single-user local operation.
- FAL API key is stored server-side only and never exposed directly from server config in browser code.

## Platform assumptions

- Current validated baseline: macOS Intel (non-Apple Silicon).
- For Apple Silicon and Windows override guidance (`ML_SHARP_BIN`, `ML_SHARP_DEVICE`), see `docs/structure/platform-support.md`.
