# To Do

## P1 (Critical)
- ~~Finish downloading SHARP checkpoint to `assets/models/sharp_2572gikvuh.pt` (resumable)~~ DONE (2.6GB)
- ~~Install and validate `ml-sharp` runtime environment per upstream README~~ DONE (.venv-mlsharp-311, Python 3.11 + torch 2.2.2)
- ~~Replace mock generation internals with real `ml-sharp` worker in `apps/server/src/lib/generation-service.ts` (keep API contract unchanged)~~ DONE
- ~~Write real scene manifest mapping to `shots/<SESSION_ID>/source/scene/manifest.json`~~ DONE (includes ply_path)
- ~~Add failure-path metadata writing for `/api/repair` (`status=failed`, structured `error`)~~ DONE
- ~~Add output image dimensions in `repair_meta.json` from actual decoded image (not request input)~~ DONE

## P2 (Important)
- Add error-path tests for `/api/repair` (invalid input, fal failure, timeout, invalid session id)
- Add generation tests for completed-job reuse behavior when manifest already exists
- Add basic side-by-side repaired-image loading in viewer

## P3 (Nice to Have)
- Overlay opacity/scrub comparison mode in viewer
- Add recovery UI for failed generation jobs
- Add fixture dataset for stable local integration tests

## Notes
- Completed offline-first implementation summary: `docs/solutions/offline-phase-completed.md`
- Resume checklist and exact commands: `docs/solutions/network-resume-and-mlsharp.md`
