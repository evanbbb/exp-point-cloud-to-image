# Plan: 3D Viewport & Camera Controls

## Goal

Replace the 2D mock canvas in `apps/viewer/index.html` with a real Three.js 3D viewport featuring:
- A ground-plane grid
- A CameraHelper wireframe showing the "shot" camera's frustum
- OrbitControls for standard mouse-based navigation
- A session reference image rendered as a vertical plane for visual testing

## Current State

- `apps/viewer/index.html` — single-file HTML app served statically by Express
- Canvas element `#scene` (960×540) draws a 2D mock with `drawMockScene()`
- Lens preset dropdown controls FOV, dolly slider controls Z offset
- No Three.js dependency currently; no build step for the viewer

## Approach

### Load Three.js via CDN import map (no build step needed)

Add an ES module import map to the HTML `<head>`:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.172.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.172.0/examples/jsm/"
  }
}
</script>
```

Then use `<script type="module">` for the viewer code.

### 3D Scene Setup

1. **Renderer** — `THREE.WebGLRenderer` targeting the existing `#scene` canvas, matching its dimensions
2. **Orbit camera** — a `PerspectiveCamera` used for navigation (the "user" camera that you orbit around with)
3. **Shot camera** — a second `PerspectiveCamera` representing the lens/dolly controls (the one whose frustum is visualized)
4. **CameraHelper** — `new THREE.CameraHelper(shotCamera)` added to the scene, showing the frustum wireframe (orange lines like in your reference image)
5. **GridHelper** — `new THREE.GridHelper(10, 20)` as the ground plane
6. **AxesHelper** — `new THREE.AxesHelper(1)` at origin for orientation reference (RGB = XYZ)
7. **OrbitControls** — `OrbitControls(orbitCamera, renderer.domElement)` for rotate/pan/zoom

### Image Plane

When a reference image is loaded (via `sourceSelect` or file upload):
- Create a `THREE.PlaneGeometry` sized to the image's aspect ratio
- Apply the image as a `THREE.TextureLoader` / `MeshBasicMaterial` texture
- Position the plane vertically (standing upright) at z=0, centered at origin
- This gives a tangible object in the scene to orbit around and test camera controls against

### Control Binding

- **Lens preset** dropdown → updates `shotCamera.fov` and calls `shotCamera.updateProjectionMatrix()` + `cameraHelper.update()`
- **Dolly slider** → updates `shotCamera.position.z`
- **OrbitControls** handles all mouse interaction on the canvas (rotate, pan, zoom)
- Replace `drawMockScene()` with a `requestAnimationFrame` render loop

### Capture Button

`Capture View` continues to export canvas as PNG (now a WebGL canvas snapshot), plus `camera.json` and `delta_pose.json` from the shot camera's parameters.

## Files to Modify

| File | Change |
|------|--------|
| `apps/viewer/index.html` | Replace 2D canvas code with Three.js 3D viewport (import map, module script, scene setup, render loop) |

No new files needed. No server changes. No npm dependencies (CDN only).

## Step-by-step Implementation

1. Add Three.js import map to `<head>`
2. Convert the inline `<script>` to `<script type="module">`
3. Import Three.js core, OrbitControls, and CameraHelper
4. Create scene, renderer (using existing canvas), orbit camera, shot camera
5. Add GridHelper, AxesHelper, CameraHelper to the scene
6. Set up OrbitControls on the orbit camera
7. Wire lens preset → shot camera FOV, dolly → shot camera Z
8. Add image-plane creation when a reference image is loaded
9. Replace `drawMockScene()` with `requestAnimationFrame` render loop
10. Verify capture export still works (WebGL canvas → PNG)

## Acceptance Criteria

- [ ] 3D viewport renders with dark background, grid plane, and axis helper
- [ ] Shot camera frustum is visible as orange wireframe (CameraHelper)
- [ ] Lens preset changes update the frustum shape in real time
- [ ] Dolly slider moves the shot camera along Z
- [ ] OrbitControls: left-drag rotates, right-drag pans, scroll zooms
- [ ] Loading a reference image shows it as a vertical plane in the scene
- [ ] Capture View exports a PNG of the current 3D view

## Open Questions

- Should the shot camera frustum point at the image plane, or just face along -Z from a default position? **Proposal:** Start at (0, 1, 3) looking at origin, matching the reference image layout.
- Should the image plane have a border/frame? **Proposal:** Keep it simple — just the textured plane, no frame.
