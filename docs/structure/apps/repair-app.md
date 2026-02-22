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
- Persist repair results to local source folder on disk:
  - `source/src_####/repairs/repair_<id>/repair_meta.json`
  - `source/src_####/repairs/repair_<id>/repaired.png` (success only)
- Render previous repairs by scanning local `repairs/` folders.

## UI capabilities

- Source selector.
- Capture selection (single selection at a time).
- Prompt preview.
- Paid confirmation checkbox.
- Run count selector (1-4).
- Previous repairs panel scoped by source/capture.
- Previous repair export action downloads one ZIP per repair (`<repair_id>_files.zip`) to the browser's download location; ZIP contains `repair_meta.json` and optional `repaired.png`.
- Lightbox and compare overlay (source vs capture vs repair).

## Inputs and outputs

### Local inputs (working folder)

- source reference image
- selected capture `target.png`
- selected capture `camera.json`
- selected capture `delta_pose.json`

### Server outputs

- Immediate repaired PNG response from `/api/repair`.
- Optional metadata lookup via `GET /api/repairs/:repairId/meta` during local persistence.

## Data boundaries

- Local persistent on-disk data includes source/capture/repair files in selected working folder.
- Server in-memory repair metadata remains transient and is not the long-term history source.
