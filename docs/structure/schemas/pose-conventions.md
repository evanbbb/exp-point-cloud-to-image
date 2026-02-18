# Pose Conventions

This document defines the canonical camera delta convention used for prompt injection and `delta_pose.json`.

## Canonical Prompt-Space Frame
- Coordinate system: right-handed
- Axes:
  - `+x`: right
  - `+y`: up
  - `+z`: forward
- Translation units: meters
- Rotation units: degrees
- Rotation order: `yaw -> pitch -> roll`

All pose values are **relative to the reference camera** captured at scene load.

## Source Runtime Frame
Viewer runtime is expected to use three.js camera math. three.js camera conventions differ from canonical prompt-space and must be normalized during capture export.

Required rule:
- Compute delta in reference-camera space first, then convert to canonical prompt-space.

## Export Contract
`delta_pose.json` must contain canonical prompt-space values only.

Example:

```json
{
  "x": 0.32,
  "y": -0.05,
  "z": 0.48,
  "pitch": -4.2,
  "yaw": 18.7,
  "roll": 0.0,
  "units": "meters",
  "angles": "degrees"
}
```

## Determinism Requirement
For the same scene and camera state, repeated capture exports must produce the same `delta_pose.json` values within normal floating-point tolerance.

## Optional Debug Metadata
To simplify troubleshooting, capture metadata may include:
- `source_frame`: `threejs_camera`
- `target_frame`: `prompt_canonical`
- `rotation_order`: `yaw_pitch_roll`

