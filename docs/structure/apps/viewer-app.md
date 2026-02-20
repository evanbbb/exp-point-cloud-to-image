# Viewer App (/viewer)

Purpose:
Interactive navigation of SHARP Gaussian splats with camera controls and capture.

Responsibilities:

- Load splat scene
- Orbit + dolly camera
- Lens switching
- Export capture bundles
- Read repaired images back

Tech:

- three.js
- Gaussian splat renderer (e.g. GaussianSplats3D)
- File System Access API

UI:

- Pick Session Folder
- Load Splats
- Orbit Controls
- Mouse wheel = dolly zoom
- Lens Preset Dropdown:
  - 24mm
  - 35mm
  - 50mm
  - 85mm

Buttons:

- Capture View
- Load Repaired
- Capture PNG (raw screenshot)

Capture View creates:

source/captures/cap_####/

Files written:

target.png
delta_pose.json
camera.json
thumb.jpg (optional)

reference.png is copied once into source/

Lens behavior:

- Lens preset = focal length / FOV change
- Zoom = camera dolly

Never mix these.

delta_pose.json:

Pose of current camera relative to original reference camera.

Units:
- meters
- degrees

Camera origin must be saved at time of first load.

Capture PNG:

Exports current canvas directly (no repair).

Load Repaired:

Reads repairs/*/output/repaired.png and displays side-by-side or overlay.

Scene Helpers (grid, axes, camera):

- GridHelper and AxesHelper are repositioned and rescaled on every scene load to match the
  loaded point cloud's bounding sphere radius. Grid is placed at box.min.y - 0.02 to avoid
  Z-fighting with ground-level points.
- Shot camera near/far clip planes are also updated on load (near = radius * 0.01,
  far = radius * 20) because the default far=20 clips helpers for larger scenes.
- All three helpers (grid, axes, cameraHelper) are hidden during canvas capture (captureCurrentViewPng)
  and restored in a finally block so they never appear in exported PNGs.
