---
module: Viewer Scene
date: 2026-02-20
problem_type: ui_bug
component: frontend
symptoms:
  - "GridHelper and AxesHelper invisible when 3D point cloud is loaded"
  - "Grid visible in orbit camera viewport but not in shot camera viewport"
root_cause: logic_error
framework_version: "three.js r167"
resolution_type: code_fix
severity: medium
tags: [three-js, grid-helper, z-fighting, clip-plane, shot-camera]
---

# Troubleshooting: Grid and Axes Helpers Invisible When 3D Data Is Loaded

## Problem

After loading a generated 3D point cloud in the viewer, the `GridHelper` and `AxesHelper` disappear entirely. Additionally, even after fixing Z-fighting, the grid remains invisible in the shot camera viewport while appearing in the orbit camera viewport.

## Environment

- Module: Viewer Scene
- Framework/Version: three.js r167
- Affected Component: `apps/viewer/viewer-scene.js` — `loadGeneratedSceneFromJob()`, scene init
- Date: 2026-02-20

## Symptoms

- `GridHelper` is at `y=0` and becomes buried inside the dense ground-level point cloud (Z-fighting)
- `AxesHelper` is fixed at 1 unit tall — tiny relative to a scene with bounding radius of several units
- Both helpers render correctly before any 3D data is loaded, then vanish once a PLY is loaded
- Grid shows in orbit camera but not in shot camera even after repositioning

## What Didn't Work

**Direct solution:** Both issues were identified and fixed on the first attempt once root causes were clear.

## Solution

**Two separate fixes were required:**

### Fix 1 — Z-fighting and scale (both cameras)

After computing the bounding box and sphere in `loadGeneratedSceneFromJob`, reposition and rescale helpers to match the loaded scene:

```js
// Before (broken): helpers never repositioned after load
// GridHelper stays at y=0, same plane as ground-level points
// AxesHelper stays at fixed scale=1, lost inside the cloud

// After (fixed): in loadGeneratedSceneFromJob, after fitShotCameraToGeneratedScene()
if (gridHelper) {
  gridHelper.position.y = box.min.y - 0.02;   // just below ground, avoids Z-fight
  const gridSize = Math.max(2, sphere.radius * 4);
  gridHelper.scale.setScalar(gridSize / 10);   // GridHelper default size is 10 units
}
if (axesHelper) {
  axesHelper.scale.setScalar(sphere.radius * 0.4);
}
```

### Fix 2 — Shot camera far clip plane

The shot camera is initialized with `far = 20`. When a scene larger than ~5 units radius is loaded, the grid (now scaled to 4× radius) extends past the far clip and is culled. The orbit camera has `far = 1000` so it always renders the grid.

```js
// Before (broken): shotCamera initialized with hard-coded near/far
shotCamera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 20);

// After (fixed): update clip planes proportionally after load
shotCamera.near = sphere.radius * 0.01;
shotCamera.far  = sphere.radius * 20;
shotCamera.updateProjectionMatrix();
```

Both changes go in the same `if (Number.isFinite(sphere.radius) && sphere.radius > 0)` block, right after `fitShotCameraToGeneratedScene()`.

## Why This Works

1. **Z-fighting:** `GridHelper` and ground-level points occupy exactly the same Y plane. Moving the grid 0.02 units below `box.min.y` puts it just underneath the lowest point, eliminating depth buffer conflicts.

2. **Scale mismatch:** Both helpers have fixed default sizes (10 units for grid, 1 unit for axes). After `normalizeGeneratedGeometry` centers the cloud with ground at `y=0`, scene radii can be 3–10+ units, making 1-unit axes invisible. Scaling proportionally to `sphere.radius` keeps helpers visually appropriate.

3. **Far clip culling:** Three.js clips fragments beyond `camera.far`. The shot camera's `far=20` was chosen for the default empty scene. A grid scaled to `radius*4` on a large scene can easily exceed 20 units from the camera. Setting `far = radius * 20` gives generous headroom while staying proportional.

## Prevention

- When scene geometry is normalized/scaled at load time, always update any fixed-size helpers to match.
- The shot camera near/far are set at init for the empty default scene — remember to update them when real scene bounds are known.
- Use `box.min.y - epsilon` for grid placement, never `y=0`, whenever geometry can touch the zero plane.
- If a helper is visible in one camera but not another, check clip planes first (far clipping is silent — no error, just invisible geometry).

## Related Issues

No related issues documented yet.
