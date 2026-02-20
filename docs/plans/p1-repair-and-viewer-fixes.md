# P1: Repair Page & Viewer Capture Fixes

## Goal

Four UI fixes across the repair page and viewer.

## Tasks

### 1. Repair Page: Single capture selection

**Current:** Multi-select with checkboxes. User can select many captures.
**Target:** Single-select. Clicking a capture selects it and deselects the previous one.

**Files:** `apps/repair/repair-app.js`, `apps/repair/index.html`

**Changes:**
- Replace `selected` Set with a single `selectedCapId` variable (or keep Set but enforce size <= 1)
- `toggleCapture()`: always clear previous selection, set new one
- Remove "Select All" / "Clear" buttons (no longer relevant)
- Update `updateActionBar()` — selection count becomes "1 capture selected" or "No capture selected"
- Update `runRepairs()` — always operates on single capture
- Grid rendering: remove checkbox indicator, use highlight border only

### 2. Repair Page: Multiple repair jobs per capture (1-4)

**Current:** One repair per selected capture.
**Target:** User chooses how many times to run repair (1-4) on the single selected capture. Each run hits fal independently, producing different results.

**Files:** `apps/repair/repair-app.js`, `apps/repair/index.html`

**Changes:**
- Add a "Runs" control (number input or radio buttons, 1-4) in the action bar
- `runRepairs()`: loop N times over the same capture, each with a unique `repair_id`
- Each run is sequential (to avoid overwhelming fal)
- Results appear in the Jobs panel as they complete, then move to Previous Repairs

### 3. Repair Page: Tidy repair thumbnail info

**Current:** Date, time, status badge ("succeeded"), and icon buttons all on one line.
**Target:** Date and time on first line. Icons on second line. Remove "succeeded" label.

**Files:** `apps/repair/repair-app.js`

**Changes:**
- In `updatePreviousRepairs()` card rendering:
  - First line: date + time only
  - Second line: compare icon + folder icon
  - Remove the `result-status--succeeded` span (keep failed status visible)

### 4. Viewer: Hide navigational objects during capture

**Current:** Grid plane, axes helper, and camera helper are visible during canvas capture, appearing in the saved PNG.
**Target:** Temporarily hide all non-3D-data objects before rendering the capture frame, then restore them.

**Files:** `apps/viewer/viewer-scene.js`

**Changes:**
- In `captureCurrentViewPng()`, before the `renderer.render()` call:
  - Set `gridHelper.visible = false`
  - Set `axesHelper.visible = false`
  - Set `cameraHelper.visible = false`
- After capturing the canvas data, restore previous visibility values
- Use try/finally to guarantee restoration

## Acceptance Criteria

1. Only one capture can be selected at a time in the repair page
2. A "Runs" control (1-4) determines how many independent repair jobs are submitted for the selected capture
3. Previous Repairs thumbnails show date/time on line 1, icons on line 2, no "succeeded" label
4. Captured PNGs from the viewer contain only the 3D scene data (no grid, axes, or camera helper)
