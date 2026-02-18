# To Do

## P1 (Critical)
- Scaffold TypeScript workspace (`apps/viewer`, `apps/repair`, `apps/server`, `shared/schemas`)
- Implement generation API contract with `GENERATION_MODE=mock`
- Implement session/path safety service and deterministic ID generation
- Implement `/api/repair` with fal staging (`fal.storage.upload`) and single-item fail-fast flow
- Implement `repair_meta.json` writer using locked schema
- Build viewer capture exporter (`target.png`, `delta_pose.json`, `camera.json`)
- Build repair UI flow (capture select, notes, paid-confirm, run repair)

## P2 (Important)
- Add contract tests for generation API (`queued|running|completed|failed`)
- Add schema validation tests for `delta_pose.json` and `repair_meta.json`
- Add error-path tests for `/api/repair` (invalid input, fal failure, timeout)
- Add basic side-by-side repaired-image loading in viewer

## P3 (Nice to Have)
- Overlay opacity/scrub comparison mode in viewer
- Add recovery UI for failed generation jobs
- Add fixture dataset for stable local integration tests
