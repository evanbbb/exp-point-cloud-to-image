# Istanbul3D V0 Implementation Plan

## Goal
Build a local-first two-app workflow that:
1. Views a SHARP Gaussian splat scene and captures camera-relative target frames.
2. Queues selected captures for paid FLUX repair through a localhost server.
3. Preserves immutable source captures and writes repaired outputs separately.

## Scope (V0)
- `/viewer` web app
- `/repair` web app
- single localhost backend with generation + repair APIs
- session folder lifecycle under `shots/SESSION_YYYYMMDD_HHMMSS/`

## Locked Decisions
- Backend stack: Node.js + TypeScript (single-language runtime for V0).
- Splat generation mode: backend-on-demand `ml-sharp` job after user drops a reference image.
- fal staging strategy: server-side upload of local `reference.png` and `target.png` via `fal.storage.upload`, then pass returned URLs as `image_urls` to the FLUX edit endpoint.
- Pose convention: canonical prompt-space deltas use right-handed coordinates with `x right`, `y up`, `z forward`; translation in meters; rotation in degrees; Euler order `yaw -> pitch -> roll`; all values relative to the reference camera.
- Repair mode: single repair per action (no batch mode in V0).
- Spend policy: no daily spend cap in V0; explicit paid-confirm checkbox is required before `/api/repair`.
- Failure policy: fail-fast per repair request (no multi-item continuation logic needed in V0).
- Input validation policy: allow `png|jpg`, max file size 20 MB per image, max dimension 4096 px.
- Timeout/retry policy: 90s request timeout, 0 automatic retries in V0.
- Generation API contract: `POST /api/generate` + `GET /api/generate/:job_id` with statuses `queued|running|completed|failed`; viewer polls every 1s; canonical spec in `docs/structure/server/generation-api.md`.
- Repair metadata contract: V0 schema locked in `docs/structure/schemas/repair-meta-schema.md`.

## User Flow Overview
1. Create/open session and select `reference.png`.
2. Viewer requests backend generation job (`ml-sharp`) from the reference image.
3. Backend completes generation and stores scene assets for the session.
4. Viewer loads generated splat scene and stores reference camera basis.
5. User navigates with orbit + dolly; chooses lens preset.
6. Capture writes `target.png`, `delta_pose.json`, `camera.json` (plus optional `thumb.jpg`).
7. Repair app reads captures and user multi-selects targets.
8. Queue step copies required inputs into `repairs/repair_####/input/`.
9. Run step uploads/stages images server-side, calls fal FLUX edit/lora endpoint.
10. Output writes `repairs/repair_####/output/repaired.png` + `repair_meta.json`.
11. Viewer can load repaired images for comparison/overlay.

## Flow Permutations Matrix
| Flow | First-time | Returning | Error recovery |
|---|---|---|---|
| Session select | Create folder + reference import | Re-open existing session | Invalid path or permissions |
| Generate splat | Start first `ml-sharp` job | Reuse existing generated scene | generation timeout/failure |
| Capture | No baseline camera yet (must store once) | Increment cap index from existing | Write failure / filename collision |
| Queue repair | First queue creates repairs root | Append new repair index | Missing input file in source/captures |
| Run repair | Single request | Repeated single requests | fal timeout, 4xx/5xx |
| View repaired | none available yet | show latest or selected output | corrupt/missing repaired image |

## Missing Elements & Gaps
- **Category**: Data Contract
- **Gap**: `repair_meta.json` schema undefined.
- **Impact**: Inconsistent observability and troubleshooting.
- **Resolution**: Defined in `docs/structure/schemas/repair-meta-schema.md`.

- **Category**: Coordinate Systems
- **Gap**: `ml-sharp` OpenCV convention vs viewer/world coordinate mapping not explicitly normalized.
- **Impact**: Incorrect delta pose values can degrade repair quality.
- **Resolution**: Implement explicit conversion from viewer (three.js) camera space into canonical prompt-space before writing `delta_pose.json`.

- **Category**: Generation Pipeline
- **Gap**: `ml-sharp` job API contract, progress model, and output path contract are unspecified.
- **Impact**: Viewer cannot reliably wait for and load generated splat assets.
- **Resolution**: Defined in `docs/structure/server/generation-api.md`.

- **Category**: Security
- **Gap**: Server-side path constraints and traversal protections unspecified.
- **Impact**: Risk of reading/writing outside selected session.

- **Category**: Testing
- **Gap**: No acceptance test matrix for capture, queue, and repair lifecycle.
- **Impact**: High regression risk.

## Critical Questions Requiring Clarification
1. **Nice-to-have**: Should viewer overlay mode include opacity slider and before/after scrub?
Why it matters: quality triage speed.
Default assumption: simple side-by-side in V0.

## Implementation Approach
1. **Scaffold runtime**
- Create monorepo-ish layout: `apps/viewer`, `apps/repair`, `apps/server`, `shared/schemas`.
- Use TypeScript across all apps for shared contracts.

2. **Define contracts first**
- Add JSON schemas/types for `camera.json`, `delta_pose.json`, and `repair_meta.json`.
- Add generation job schema (`generate-request`, `generate-status`, `scene-manifest`).
- Add runtime validation with clear errors.
- Add tested transform utility: three.js camera delta -> canonical prompt-space delta.

3. **Implement filesystem session service**
- Deterministic index generation (`cap_####`, `repair_####`).
- Immutable capture behavior and copy-only queue behavior.

4. **Implement generation endpoints**
- `POST /api/generate` to start `ml-sharp` for a session reference image.
- `GET /api/generate/:job_id` for progress/status and output manifest path.
- Persist job metadata for restart-safe recovery.

5. **Build viewer MVP**
- Load splat + controls + lens presets.
- Add generate/start + status UI before scene load.
- Capture bundle writer and reference camera storage.

6. **Build repair MVP**
- Capture grid + multi-select + notes.
- Queue copy flow + paid-confirm checkbox.
- Single-item repair execution flow (no batch orchestration).

7. **Implement `/api/repair`**
- Multipart input validation.
- Prompt construction from template and delta pose.
- Upload `reference.png` and `target.png` server-side via `fal.storage.upload` and use returned URLs in `image_urls`.
- fal call with configured model/LoRA/params.
- Return png bytes; write `repair_meta.json`.

8. **Add guardrails and observability**
- Enforce paid-confirm flag in request payload.
- Enforce file size/type/dimension validation.
- Apply 90s timeout with no automatic retries.
- Structured logs for request lifecycle.

9. **Acceptance testing**
- E2E happy path (generate -> capture -> queue -> repair -> load repaired).
- Unhappy paths (generation failure, missing files, invalid json, fal error, network timeout).

## Files To Create or Modify (Planned)
- `apps/viewer/*`
- `apps/repair/*`
- `apps/server/*`
- `shared/schemas/camera.ts`
- `shared/schemas/delta-pose.ts`
- `shared/schemas/repair-meta.ts`
- `shared/schemas/generate-job.ts`
- `docs/structure/schemas/repair-meta-schema.md`
- `docs/structure/schemas/pose-conventions.md`
- `docs/structure/server/generation-api.md`
- `docs/structure/architecture.md`
- `docs/to-do.md`

## Acceptance Criteria
- Viewer can trigger a backend `ml-sharp` generation job and load generated scene assets when complete.
- Viewer captures write valid files under `source/captures/cap_####/` with immutable semantics.
- `delta_pose.json` values follow the canonical prompt-space convention and are deterministic for repeated camera states.
- Repair queue copies inputs to `repairs/repair_####/input/` with no mutation to source.
- Repair execution is single-item, fail-fast, and gated by explicit paid-confirm consent.
- `/api/repair` accepts required multipart fields, executes FLUX edit/lora call, returns PNG.
- Successful run writes `repairs/repair_####/output/repaired.png` and valid `repair_meta.json`.
- Failure paths produce actionable user-facing errors and non-zero status metadata.
- `FAL_KEY` never exposed to browser-side code.

## Risks
- Coordinate mismatch between renderer and prompt semantics reduces repair quality.
- External API latency/cost variability impacts UX.
- License constraints (non-commercial) limit deployment usage.

## Recommended Next Steps
1. Run Work phase to scaffold generation + capture + repair in that order.
2. Add a generation job fixture for a deterministic happy-path integration test.
3. Add a repair metadata fixture for succeeded and failed runs.
