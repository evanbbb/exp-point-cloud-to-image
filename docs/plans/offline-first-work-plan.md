# Offline-First Work Plan (Without ml-sharp)

## Goal
Build the maximum amount of V0 functionality before `ml-sharp` is available locally.

## Strategy
- Keep the public API contracts final.
- Implement generation with `GENERATION_MODE=mock`.
- Build viewer capture flow, repair flow, and fal integration end-to-end.
- Swap only the generation backend internals later.

## What We Can Build Now
1. Shared schemas and validation
- `camera.json`, `delta_pose.json`, `repair_meta.json`, generation job schemas.

2. Filesystem/session services
- Session discovery, deterministic IDs (`cap_####`, `repair_####`, `gen_####`), safe path guards.

3. Generation API (contract-complete)
- `POST /api/generate`
- `GET /api/generate/:job_id`
- mock mode status progression and manifest write.

4. Viewer app shell
- Session picker, generation start/polling UI, lens controls, capture export.
- Scene loader wired to manifest contract (using mock scene in development).

5. Repair app shell
- Capture grid, notes, paid-confirm checkbox, single-item repair trigger.

6. Repair API + fal staging
- Read queued inputs, `fal.storage.upload`, FLUX call, write `repaired.png` + `repair_meta.json`.

7. Tests
- Contract tests for generation API.
- Path validation tests.
- Repair metadata success/failure snapshot tests.

## Implementation Status
- [x] 1. Shared schemas and validation
- [x] 2. Filesystem/session services
- [x] 3. Generation API (contract-complete, mock mode)
- [x] 4. Viewer app shell
- [x] 5. Repair app shell
- [x] 6. Repair API + fal staging
- [x] 7. Tests

### Viewer shell note
- Implementation now includes session picker, generation start/polling, lens preset controls, mock dolly control, and `Capture View` export to `source/captures/cap_####/` (`target.png`, `camera.json`, `delta_pose.json`) via File System Access API.

## Deferred Until ml-sharp Is Ready
- Real `ml-sharp` subprocess execution.
- Real progress parsing from `ml-sharp` output.
- Real scene manifest structure mapping from generated artifacts.

## Swap-In Plan (Later)
1. Keep `POST/GET /api/generate` responses unchanged.
2. Replace mock job worker with `ml-sharp` worker.
3. Map `ml-sharp` outputs into the same `scene_manifest_path`.
4. Re-run generation contract + viewer load tests.

## Acceptance Criteria (Offline Phase)
- Viewer can complete generation flow in mock mode and reach capturable state.
- Capture writes valid bundle files under `source/captures/cap_####/`.
- Repair flow executes single-item run and writes output metadata with stable schema.
- No UI/API contract changes are required when replacing mock mode with real `ml-sharp`.
