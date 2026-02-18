# delta_pose.json Schema

Purpose:
Describe the camera movement from the original reference view
to the captured target view.

This is injected directly into the FLUX LoRA prompt.

All values must be RELATIVE TO THE REFERENCE CAMERA.

Conventions:

- Right-handed coordinate system
- Units: meters
- Angles: degrees
- Rotation order: yaw → pitch → roll

Positive directions:

x: right
y: up
z: forward

yaw: rotate left/right (around Y)
pitch: rotate up/down (around X)
roll: rotate clockwise (around Z)

Example:

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

Generation:

At Viewer load:
- Store initial camera position + quaternion as reference

At Capture:
- Compute delta position in reference camera space
- Compute delta rotation as Euler (yaw/pitch/roll)
- Write JSON

Important:

Consistency matters more than accuracy.
Use the SAME convention every time.
The LoRA learns patterns from relative movement, not perfect geometry.
