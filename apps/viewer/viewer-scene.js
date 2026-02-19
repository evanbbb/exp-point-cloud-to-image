import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';

export function createSceneController({ lensFov, log, isCompletedStatus }) {
  const SHOT_INITIAL_POS = new THREE.Vector3(0, 1, 3);
  const SHOT_INITIAL_ROT = new THREE.Euler();

  let renderer, scene, orbitCamera, shotCamera, cameraHelper, controls;
  let imagePlane = null;
  let generatedSceneObject = null;
  let loadedGeneratedJobId = null;
  let sceneReady = false;
  const orbitTarget = new THREE.Vector3(0, 0, 0);
  const plyLoader = new PLYLoader();
  const notifiedCompletedJobs = new Set();
  let completionAudioContext = null;

  function quantile(values, p) {
    if (!values?.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
    return sorted[idx];
  }

  function toAssetUrl(assetPath) {
    const normalized = String(assetPath || '').replace(/^\/+/, '');
    return `/${normalized.split('/').map(encodeURIComponent).join('/')}`;
  }

  async function ensureCompletionAudioContext() {
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    if (!completionAudioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      completionAudioContext = new Ctx();
    }
    if (completionAudioContext.state === 'suspended') {
      try { await completionAudioContext.resume(); } catch { /* ignore */ }
    }
    return completionAudioContext;
  }

  async function playCompletionSound(jobId) {
    if (!jobId || notifiedCompletedJobs.has(jobId)) return;
    notifiedCompletedJobs.add(jobId);
    const ctx = await ensureCompletionAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  function ensureVertexColors(geometry) {
    if (geometry.hasAttribute('color')) return true;

    const dc0 = geometry.getAttribute('f_dc_0');
    const dc1 = geometry.getAttribute('f_dc_1');
    const dc2 = geometry.getAttribute('f_dc_2');
    if (!dc0 || !dc1 || !dc2) return false;

    const count = Math.min(dc0.count, dc1.count, dc2.count);
    const colors = new Float32Array(count * 3);
    const SH_C0 = 0.28209479177387814;
    for (let i = 0; i < count; i += 1) {
      const r = Math.max(0, Math.min(1, 0.5 + SH_C0 * dc0.getX(i)));
      const g = Math.max(0, Math.min(1, 0.5 + SH_C0 * dc1.getX(i)));
      const b = Math.max(0, Math.min(1, 0.5 + SH_C0 * dc2.getX(i)));
      const idx = i * 3;
      colors[idx] = r;
      colors[idx + 1] = g;
      colors[idx + 2] = b;
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return true;
  }

  function findHeaderEndIndex(bytes) {
    const end1 = [101, 110, 100, 95, 104, 101, 97, 100, 101, 114, 10];
    const end2 = [101, 110, 100, 95, 104, 101, 97, 100, 101, 114, 13, 10];
    outer1: for (let i = 0; i <= bytes.length - end1.length; i += 1) {
      for (let j = 0; j < end1.length; j += 1) if (bytes[i + j] !== end1[j]) continue outer1;
      return i + end1.length;
    }
    outer2: for (let i = 0; i <= bytes.length - end2.length; i += 1) {
      for (let j = 0; j < end2.length; j += 1) if (bytes[i + j] !== end2[j]) continue outer2;
      return i + end2.length;
    }
    return -1;
  }

  async function loadMlSharpGeometry(plyUrl) {
    const response = await fetch(plyUrl);
    if (!response.ok) throw new Error(`Failed to load PLY (${response.status})`);
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const headerEnd = findHeaderEndIndex(bytes);
    if (headerEnd < 0) return null;

    const header = new TextDecoder().decode(bytes.subarray(0, headerEnd));
    if (!header.includes('format binary_little_endian 1.0')) return null;
    if (!header.includes('property float f_dc_0') || !header.includes('property float f_dc_1') || !header.includes('property float f_dc_2')) {
      return null;
    }

    const lines = header.split(/\r?\n/);
    let vertexCount = 0;
    let inVertex = false;
    const props = [];
    for (const lineRaw of lines) {
      const line = lineRaw.trim();
      if (!line) continue;
      if (line.startsWith('element ')) {
        const parts = line.split(/\s+/);
        inVertex = parts[1] === 'vertex';
        if (inVertex) vertexCount = Number(parts[2] || 0);
        continue;
      }
      if (inVertex && line.startsWith('property ')) {
        const parts = line.split(/\s+/);
        if (parts.length >= 3) props.push({ type: parts[1], name: parts[2] });
        continue;
      }
      if (line === 'end_header') break;
    }
    if (!vertexCount || !props.length) return null;

    const typeSizes = { float: 4, double: 8, uchar: 1, uint: 4, int: 4, short: 2, ushort: 2 };
    let stride = 0;
    const offsets = new Map();
    for (const p of props) {
      offsets.set(p.name, { offset: stride, type: p.type });
      const size = typeSizes[p.type];
      if (!size) return null;
      stride += size;
    }

    const x = offsets.get('x');
    const y = offsets.get('y');
    const z = offsets.get('z');
    const f0 = offsets.get('f_dc_0');
    const f1 = offsets.get('f_dc_1');
    const f2 = offsets.get('f_dc_2');
    if (!x || !y || !z || !f0 || !f1 || !f2) return null;
    if (x.type !== 'float' || y.type !== 'float' || z.type !== 'float' || f0.type !== 'float' || f1.type !== 'float' || f2.type !== 'float') return null;

    const SH_C0 = 0.28209479177387814;
    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const dv = new DataView(buffer, headerEnd);
    for (let i = 0; i < vertexCount; i += 1) {
      const base = i * stride;
      const px = dv.getFloat32(base + x.offset, true);
      const py = dv.getFloat32(base + y.offset, true);
      const pz = dv.getFloat32(base + z.offset, true);
      const dc0 = dv.getFloat32(base + f0.offset, true);
      const dc1 = dv.getFloat32(base + f1.offset, true);
      const dc2 = dv.getFloat32(base + f2.offset, true);
      const idx = i * 3;
      positions[idx] = px;
      positions[idx + 1] = py;
      positions[idx + 2] = pz;
      colors[idx] = Math.max(0, Math.min(1, 0.5 + SH_C0 * dc0));
      colors[idx + 1] = Math.max(0, Math.min(1, 0.5 + SH_C0 * dc1));
      colors[idx + 2] = Math.max(0, Math.min(1, 0.5 + SH_C0 * dc2));
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }

  function normalizeGeneratedGeometry(geometry) {
    const pos = geometry.getAttribute('position');
    if (!pos) return;

    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = -pos.getY(i);
      const z = -pos.getZ(i);
      pos.setXYZ(i, x, y, z);
    }
    const sampleStep = Math.max(1, Math.floor(pos.count / 20000));
    const xs = [];
    const ys = [];
    const zs = [];
    for (let i = 0; i < pos.count; i += sampleStep) {
      xs.push(pos.getX(i));
      ys.push(pos.getY(i));
      zs.push(pos.getZ(i));
    }
    const centerX = (quantile(xs, 0.02) + quantile(xs, 0.98)) * 0.5;
    const centerZ = (quantile(zs, 0.02) + quantile(zs, 0.98)) * 0.5;
    const groundY = quantile(ys, 0.01);
    for (let i = 0; i < pos.count; i += 1) {
      pos.setXYZ(
        i,
        pos.getX(i) - centerX,
        pos.getY(i) - groundY,
        pos.getZ(i) - centerZ
      );
    }
    pos.needsUpdate = true;
  }

  function getActiveCameraMode() {
    return document.getElementById('activeCamera')?.value === 'shot' ? 'shot' : 'orbit';
  }

  function getActiveRenderCamera() {
    return getActiveCameraMode() === 'shot' ? shotCamera : orbitCamera;
  }

  function toDegrees(rad) {
    return THREE.MathUtils.radToDeg(rad);
  }

  function getShotDeltaPose() {
    return {
      x: shotCamera.position.x - SHOT_INITIAL_POS.x,
      y: shotCamera.position.y - SHOT_INITIAL_POS.y,
      z: shotCamera.position.z - SHOT_INITIAL_POS.z,
      pitch: toDegrees(shotCamera.rotation.x - SHOT_INITIAL_ROT.x),
      yaw: toDegrees(shotCamera.rotation.y - SHOT_INITIAL_ROT.y),
      roll: toDegrees(shotCamera.rotation.z - SHOT_INITIAL_ROT.z)
    };
  }

  function setControlsCamera(mode) {
    if (!controls) return;
    if (mode === 'shot') {
      if (controls.object === orbitCamera) orbitTarget.copy(controls.target);
      controls.object = shotCamera;
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(shotCamera.quaternion);
      controls.target.copy(shotCamera.position).add(forward);
    } else {
      controls.object = orbitCamera;
      controls.target.copy(orbitTarget);
    }
    controls.update();
  }

  function resetActiveCamera() {
    const mode = getActiveCameraMode();
    if (mode === 'shot') {
      const fov = lensFov[document.getElementById('lensPreset').value] || 47;
      shotCamera.position.copy(SHOT_INITIAL_POS);
      shotCamera.lookAt(0, 0, 0);
      shotCamera.fov = fov;
      shotCamera.updateProjectionMatrix();
      setControlsCamera('shot');
    } else {
      orbitCamera.position.set(4, 3, 6);
      orbitCamera.lookAt(0, 0, 0);
      orbitTarget.set(0, 0, 0);
      controls.target.set(0, 0, 0);
      setControlsCamera('orbit');
    }
    cameraHelper.update();
  }

  function updateCameraPanel() {
    if (!orbitCamera || !shotCamera) return;
    const mode = getActiveCameraMode();
    const activeCamera = mode === 'shot' ? shotCamera : orbitCamera;

    document.getElementById('activePoseTitle').textContent = mode === 'shot' ? 'Shot Camera Pose' : 'Orbit Camera Pose';
    document.getElementById('poseX').textContent = activeCamera.position.x.toFixed(2);
    document.getElementById('poseY').textContent = activeCamera.position.y.toFixed(2);
    document.getElementById('poseZ').textContent = activeCamera.position.z.toFixed(2);
    document.getElementById('posePitch').textContent = toDegrees(activeCamera.rotation.x).toFixed(2);
    document.getElementById('poseYaw').textContent = toDegrees(activeCamera.rotation.y).toFixed(2);
    document.getElementById('poseRoll').textContent = toDegrees(activeCamera.rotation.z).toFixed(2);

    const deltaSection = document.getElementById('deltaSection');
    const lensRow = document.getElementById('lensRow');
    const fitShotRow = document.getElementById('fitShotRow');
    const fitShotButton = document.getElementById('fitShotCamera');
    lensRow.style.display = mode === 'shot' ? '' : 'none';
    fitShotRow.style.display = mode === 'shot' ? '' : 'none';
    fitShotButton.disabled = !generatedSceneObject;
    deltaSection.style.display = mode === 'shot' ? '' : 'none';
    if (mode === 'shot') {
      const delta = getShotDeltaPose();
      document.getElementById('deltaX').textContent = delta.x.toFixed(2);
      document.getElementById('deltaY').textContent = delta.y.toFixed(2);
      document.getElementById('deltaZ').textContent = delta.z.toFixed(2);
      document.getElementById('deltaPitch').textContent = delta.pitch.toFixed(2);
      document.getElementById('deltaYaw').textContent = delta.yaw.toFixed(2);
      document.getElementById('deltaRoll').textContent = delta.roll.toFixed(2);
    }
  }

  function initScene() {
    if (sceneReady) return;
    sceneReady = true;

    const canvas = document.getElementById('scene');

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x1a1a1a);

    scene = new THREE.Scene();

    orbitCamera = new THREE.PerspectiveCamera(50, canvas.width / canvas.height, 0.01, 1000);
    orbitCamera.position.set(4, 3, 6);
    orbitCamera.lookAt(0, 0, 0);

    const fov = lensFov[document.getElementById('lensPreset').value] || 47;
    shotCamera = new THREE.PerspectiveCamera(fov, canvas.width / canvas.height, 0.1, 20);
    shotCamera.position.copy(SHOT_INITIAL_POS);
    shotCamera.lookAt(0, 0, 0);
    SHOT_INITIAL_ROT.copy(shotCamera.rotation);

    cameraHelper = new THREE.CameraHelper(shotCamera);
    scene.add(cameraHelper);

    const grid = new THREE.GridHelper(10, 20, 0x444444, 0x333333);
    scene.add(grid);

    const axes = new THREE.AxesHelper(1);
    scene.add(axes);

    controls = new OrbitControls(orbitCamera, renderer.domElement);
    controls.target.set(0, 0, 0);
    orbitTarget.copy(controls.target);
    controls.update();
    setControlsCamera(getActiveCameraMode());

    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      const activeMode = getActiveCameraMode();
      if (activeMode === 'orbit') orbitTarget.copy(controls.target);
      cameraHelper.visible = activeMode !== 'shot';
      renderer.render(scene, getActiveRenderCamera());
      updateCameraPanel();
    }
    animate();
  }

  function updateShotCamera() {
    if (!shotCamera) return;
    const fov = lensFov[document.getElementById('lensPreset').value] || 47;
    shotCamera.fov = fov;
    shotCamera.updateProjectionMatrix();
    cameraHelper.update();
  }

  function setImagePlane(file) {
    if (!scene) return;
    if (imagePlane) {
      scene.remove(imagePlane);
      imagePlane.geometry.dispose();
      imagePlane.material.map?.dispose();
      imagePlane.material.dispose();
      imagePlane = null;
    }
    if (!file) return;

    const url = URL.createObjectURL(file);
    new THREE.TextureLoader().load(url, (tex) => {
      URL.revokeObjectURL(url);
      const aspect = tex.image.width / tex.image.height;
      const h = 2;
      const w = h * aspect;
      const geo = new THREE.PlaneGeometry(w, h);
      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
      imagePlane = new THREE.Mesh(geo, mat);
      imagePlane.position.set(0, h / 2, 0);
      scene.add(imagePlane);
    });
  }

  function setShotBaselineFromCurrent() {
    if (!shotCamera) return;
    SHOT_INITIAL_POS.copy(shotCamera.position);
    SHOT_INITIAL_ROT.copy(shotCamera.rotation);
  }

  function fitShotCameraToGeneratedScene({ resetDelta = true } = {}) {
    if (!shotCamera || !generatedSceneObject) return false;
    const pos = generatedSceneObject.geometry?.getAttribute('position');
    if (!pos) return false;
    const sampleStep = Math.max(1, Math.floor(pos.count / 20000));
    const samples = [];
    for (let i = 0; i < pos.count; i += sampleStep) {
      samples.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
    }
    if (!samples.length) return false;
    const zThreshold = quantile(samples.map(s => s.z), 0.82);
    const focus = samples.filter(s => s.z >= zThreshold);
    const focusSamples = focus.length > 200 ? focus : samples;
    const xs = focusSamples.map(s => s.x);
    const ys = focusSamples.map(s => s.y);
    const zs = focusSamples.map(s => s.z);
    const min = new THREE.Vector3(quantile(xs, 0.05), quantile(ys, 0.05), quantile(zs, 0.05));
    const max = new THREE.Vector3(quantile(xs, 0.95), quantile(ys, 0.95), quantile(zs, 0.95));
    const center = min.clone().add(max).multiplyScalar(0.5);
    const size = max.clone().sub(min);
    const sphere = new THREE.Sphere(center, Math.max(size.x, size.y, size.z) * 0.6);
    if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) return false;

    const fovRad = THREE.MathUtils.degToRad(shotCamera.fov);
    const distance = Math.max(sphere.radius / Math.tan(fovRad / 2), sphere.radius * 1.5) * 1.08;
    const viewDir = new THREE.Vector3(0.58, 0.22, 1).normalize();
    shotCamera.position.copy(center).addScaledVector(viewDir, distance);
    shotCamera.lookAt(center);
    shotCamera.updateProjectionMatrix();

    if (getActiveCameraMode() === 'shot' && controls) {
      controls.object = shotCamera;
      controls.target.copy(center);
      controls.update();
    }
    cameraHelper.update();
    if (resetDelta) setShotBaselineFromCurrent();
    return true;
  }

  async function loadGeneratedSceneFromJob(job) {
    if (!scene || !job?.scene_manifest_path || loadedGeneratedJobId === job.job_id) return;

    const manifestRes = await fetch(toAssetUrl(job.scene_manifest_path));
    if (!manifestRes.ok) {
      throw new Error(`Failed to load scene manifest (${manifestRes.status})`);
    }
    const manifest = await manifestRes.json();
    if (!manifest?.ply_path) {
      throw new Error('Scene manifest missing ply_path.');
    }

    const plyUrl = toAssetUrl(manifest.ply_path);
    let geometry = await loadMlSharpGeometry(plyUrl);
    if (!geometry) {
      geometry = await plyLoader.loadAsync(plyUrl);
      ensureVertexColors(geometry);
    }
    normalizeGeneratedGeometry(geometry);
    geometry.computeBoundingSphere();
    const hasVertexColors = geometry.hasAttribute('color');

    const material = new THREE.PointsMaterial({
      size: 0.01,
      vertexColors: hasVertexColors,
      color: hasVertexColors ? 0xffffff : 0xb8d6ff
    });
    const points = new THREE.Points(geometry, material);

    if (generatedSceneObject) {
      scene.remove(generatedSceneObject);
      generatedSceneObject.geometry.dispose();
      generatedSceneObject.material.dispose();
    }
    generatedSceneObject = points;
    scene.add(generatedSceneObject);
    loadedGeneratedJobId = job.job_id;

    const box = new THREE.Box3().setFromObject(generatedSceneObject);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    if (Number.isFinite(sphere.radius) && sphere.radius > 0) {
      orbitCamera.position.set(
        center.x + sphere.radius * 2.2,
        center.y + sphere.radius * 1.2,
        center.z + sphere.radius * 2.2
      );
      orbitCamera.lookAt(center);
      orbitTarget.copy(center);
      controls.target.copy(center);
      controls.update();
      fitShotCameraToGeneratedScene({ resetDelta: true });
    }
  }

  function clearGeneratedScene() {
    if (!scene) return;
    if (generatedSceneObject) {
      scene.remove(generatedSceneObject);
      generatedSceneObject.geometry.dispose();
      generatedSceneObject.material.dispose();
      generatedSceneObject = null;
    }
    loadedGeneratedJobId = null;
  }

  function getCameraJson() {
    const canvas = document.getElementById('scene');
    const lensPreset = document.getElementById('lensPreset');
    const fov = lensFov[lensPreset.value] || 47;
    return {
      projection: 'perspective',
      lens_preset: lensPreset.value,
      fov_degrees: fov,
      aspect: canvas.width / canvas.height,
      near: 0.01,
      far: 1000,
      sensor_width_mm: 36
    };
  }

  function getDeltaPoseJson() {
    const delta = getShotDeltaPose();
    return {
      x: Number(delta.x.toFixed(4)),
      y: Number(delta.y.toFixed(4)),
      z: Number(delta.z.toFixed(4)),
      pitch: Number(delta.pitch.toFixed(4)),
      yaw: Number(delta.yaw.toFixed(4)),
      roll: Number(delta.roll.toFixed(4)),
      units: 'meters',
      angles: 'degrees'
    };
  }

  return {
    initScene,
    clearGeneratedScene,
    setImagePlane,
    loadGeneratedSceneFromJob,
    fitShotCameraToGeneratedScene,
    updateShotCamera,
    setControlsCamera,
    updateCameraPanel,
    resetActiveCamera,
    getShotDeltaPose,
    getCameraJson,
    getDeltaPoseJson,
    getLoadedGeneratedJobId: () => loadedGeneratedJobId,
    hasGeneratedScene: () => Boolean(generatedSceneObject),
    ensureCompletionAudioContext,
    playCompletionSound,
    getActiveCameraMode,
    isCompletedStatus
  };
}
