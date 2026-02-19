# Offline Phase Completed (Summary)

The offline-first V0 implementation phase is complete for the following scope:

- TypeScript workspace scaffolded (`apps/viewer`, `apps/repair`, `apps/server`, `shared/schemas`)
- Generation API implemented in mock mode (`POST /api/generate`, `GET /api/generate/:jobId`)
- Session/path safety and job persistence implemented
- Repair API implemented with single-item flow and fal staging via `fal.storage.upload`
- Viewer shell implemented with:
  - session folder picker
  - reference image initialization
  - lens/dolly controls
  - capture export (`target.png`, `camera.json`, `delta_pose.json`)
- Schema + contract tests added and passing

Validation snapshot:
- `npm run typecheck` passes
- `npm test` passes

Next work is tracked in `docs/to-do.md` and the network resume runbook:
- `docs/solutions/network-resume-and-mlsharp.md`
