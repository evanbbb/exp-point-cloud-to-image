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
