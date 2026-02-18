# camera.json Schema

Purpose:
Record camera intrinsics and lens choice used for the target render.

This helps future models reason about perspective.

Example:

{
  "projection": "perspective",
  "lens_preset": "50mm",
  "fov_degrees": 47,
  "aspect": 1.7778,
  "near": 0.01,
  "far": 1000,
  "sensor_width_mm": 36
}

Lens presets:

24mm → ~84°
35mm → ~63°
50mm → ~47°
85mm → ~28°

Rules:

- Lens preset changes FOV only
- Zoom is implemented as camera dolly
- Never combine lens + zoom

projection:
- "perspective" (V0 only)
- "orthographic" (future)

sensor_width_mm:
Optional.
Defaults to 36mm (full frame equivalent).

Viewer behavior:

- Changing lens updates camera.fov or camera.setFocalLength()
- Always write final resolved fov_degrees

Repair app does NOT modify this file.
