# Repair App (`/repair`)

Part B workflow: choose a capture, preview prompt context, run FLUX-based repair, and inspect prior results.

## Entry behavior

- Requires a saved working folder handle.
- If handle is missing/denied, redirects to `/workspace?next=/repair`.

## Main responsibilities

- Load session data and sources from selected working folder.
- Enumerate captures for active source from `source/src_####/captures/`.
- Show source thumbnail, capture grid, and selected capture state.
- Build repair prompt using capture delta pose plus optional notes.
- Submit repair runs to `POST /api/repair`.
- Render previous repairs from:
  - `GET /api/repairs/list`
  - `GET /api/repairs/:repairId/image`

## UI capabilities

- Source selector.
- Capture selection (single selection at a time).
- Prompt preview.
- Paid confirmation checkbox.
- Run count selector (1-4).
- Previous repairs panel scoped by source/capture.
- Lightbox and compare overlay (source vs capture vs repair).

## Inputs and outputs

### Local inputs (working folder)

- source reference image
- selected capture `target.png`
- selected capture `camera.json`
- selected capture `delta_pose.json`

### Server outputs

- Immediate repaired PNG response from `/api/repair`.
- In-memory repair metadata and image endpoints for history browsing.

## Data boundaries

- Local persistent data remains in working folder captures/sources.
- Repair results are server-transient (in-memory), not persisted to working folder by current implementation.
