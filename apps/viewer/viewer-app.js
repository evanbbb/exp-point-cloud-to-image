import { createGenerationController } from './viewer-generation.js';
import { createSceneController } from './viewer-scene.js';
import {
  browserSupportsWorkingFolder,
  ensureWorkingFolderPermission,
  loadWorkingFolderHandle
} from '/shared/workspace-handle.js';

const SESSION_FILE = 'istanbul3d_session.json';
const lensFov = { '24mm': 84, '35mm': 63, '50mm': 47, '85mm': 28 };
const WORKSPACE_SETUP_URL = '/workspace?next=/viewer';

let sessionDirHandle = null;
let sessionData = null;
// ── UI state ──────────────────────────────────────────────

function setUIState(state) {
  document.getElementById('state-pick').style.display    = state === 'pick'    ? '' : 'none';
  document.getElementById('state-ready').style.display   = state === 'ready'   ? '' : 'none';
}

function log(value) {
  const out = document.getElementById('out');
  if (out) out.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

// ── Session file helpers ───────────────────────────────────

function generateSessionId() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  return `SESSION_${date}_${time}`;
}

function inferSessionBucketFromDirName(dirName) {
  const name = String(dirName || '').trim();
  if (!name || /^SESSION_\d{8}_\d{6}$/.test(name)) return null;
  return name;
}

async function readSessionFile(dirHandle) {
  try {
    const fh = await dirHandle.getFileHandle(SESSION_FILE);
    const file = await fh.getFile();
    return JSON.parse(await file.text());
  } catch {
    return null;
  }
}

async function writeSessionFile() {
  const fh = await sessionDirHandle.getFileHandle(SESSION_FILE, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(sessionData, null, 2));
  await writable.close();
}

// ── Source helpers ─────────────────────────────────────────

function getActiveSource() {
  if (!sessionData?.sources?.length || !sessionData.active_source) return null;
  return sessionData.sources.find(s => s.id === sessionData.active_source) || null;
}

async function nextSourceId(sourceDir) {
  let max = 0;
  for await (const [name, handle] of sourceDir.entries()) {
    if (handle.kind !== 'directory') continue;
    const m = /^src_(\d{4})$/.exec(name);
    if (m && Number(m[1]) > max) max = Number(m[1]);
  }
  return `src_${String(max + 1).padStart(4, '0')}`;
}

function renderSourceSelect() {
  const sel = document.getElementById('sourceSelect');
  const nameEl = document.getElementById('refFileName');
  const dimsEl = document.getElementById('refFileDims');
  sel.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select image';
  if (!sessionData?.active_source) placeholder.selected = true;
  sel.appendChild(placeholder);
  if (sessionData?.sources?.length) {
    sessionData.sources.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.id}: ${s.filename}`;
      if (s.id === sessionData.active_source) opt.selected = true;
      sel.appendChild(opt);
    });
  }
  // "New Image" always last
  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '+ New Image';
  sel.appendChild(newOpt);
  const active = getActiveSource();
  nameEl.textContent = active ? active.filename : '';
  dimsEl.style.display = 'none';
}

async function loadSourceImageById(sourceId) {
  const source = sessionData?.sources?.find(s => s.id === sourceId);
  if (!source || !sessionDirHandle) return null;
  const sourceDir = await sessionDirHandle.getDirectoryHandle('source');
  const srcDir = await sourceDir.getDirectoryHandle(source.id);
  const fileHandle = await srcDir.getFileHandle(source.filename);
  return fileHandle.getFile();
}

async function migrateLegacySession() {
  if (sessionData.sources || !sessionData.reference_filename) return;
  const sourceDir = await sessionDirHandle.getDirectoryHandle('source', { create: true });
  const srcId = 'src_0001';
  const srcDir = await sourceDir.getDirectoryHandle(srcId, { create: true });
  // Move reference file into src_0001/
  try {
    const fh = await sourceDir.getFileHandle(sessionData.reference_filename);
    const file = await fh.getFile();
    await writeBlobFile(srcDir, sessionData.reference_filename, file);
    await sourceDir.removeEntry(sessionData.reference_filename);
  } catch { /* file may not exist */ }
  // Move captures/ into src_0001/captures/
  try {
    const oldCaps = await sourceDir.getDirectoryHandle('captures');
    const newCaps = await srcDir.getDirectoryHandle('captures', { create: true });
    for await (const [name, handle] of oldCaps.entries()) {
      if (handle.kind === 'directory') {
        const capDir = await newCaps.getDirectoryHandle(name, { create: true });
        for await (const [fname, fhandle] of handle.entries()) {
          if (fhandle.kind === 'file') {
            const f = await fhandle.getFile();
            await writeBlobFile(capDir, fname, f);
          }
        }
      }
    }
    await sourceDir.removeEntry('captures', { recursive: true });
  } catch { /* no captures dir */ }
  // Move scene/ into src_0001/scene/
  try {
    const oldScene = await sourceDir.getDirectoryHandle('scene');
    const newScene = await srcDir.getDirectoryHandle('scene', { create: true });
    for await (const [fname, fhandle] of oldScene.entries()) {
      if (fhandle.kind === 'file') {
        const f = await fhandle.getFile();
        await writeBlobFile(newScene, fname, f);
      }
    }
    await sourceDir.removeEntry('scene', { recursive: true });
  } catch { /* no scene dir */ }
  sessionData.sources = [{ id: srcId, filename: sessionData.reference_filename }];
  sessionData.active_source = srcId;
  delete sessionData.reference_initialized;
  delete sessionData.reference_filename;
  await writeSessionFile();
}

// ── Connected folder bootstrap ────────────────────────────

async function bootstrapFromConnectedFolder() {
  if (!browserSupportsWorkingFolder()) {
    setUIState('pick');
    log('Browser does not support required file APIs.');
    return;
  }
  try {
    const dirHandle = await loadWorkingFolderHandle();
    if (!dirHandle) {
      window.location.assign(WORKSPACE_SETUP_URL);
      return;
    }
    const granted = await ensureWorkingFolderPermission(dirHandle);
    if (!granted) {
      window.location.assign(WORKSPACE_SETUP_URL);
      return;
    }
    sessionDirHandle = dirHandle;
    const existing = await readSessionFile(dirHandle);
    if (existing) {
      sessionData = existing;
      if (!Object.prototype.hasOwnProperty.call(sessionData, 'session_bucket')) {
        sessionData.session_bucket = inferSessionBucketFromDirName(dirHandle.name);
        await writeSessionFile();
      }
      await migrateLegacySession();
      sessionData.active_source = null;
      await writeSessionFile();
      activateSession('Loaded existing session.');
      return;
    }
    await initializeSession();
  } catch (err) {
    setUIState('pick');
    log({ error: String(err) });
  }
}

async function initializeSession() {
  try {
    sessionData = {
      session_id: generateSessionId(),
      session_bucket: inferSessionBucketFromDirName(sessionDirHandle?.name),
      created_at: new Date().toISOString(),
      sources: [],
      active_source: null,
      jobs: []
    };

    // Create folder structure
    await sessionDirHandle.getDirectoryHandle('source', { create: true });

    await writeSessionFile();
    activateSession('Session initialized.');
  } catch (err) {
    log({ error: String(err) });
  }
}

function activateSession(message) {
  document.getElementById('sessionDisplay').textContent = sessionData.session_bucket || sessionData.session_id;
  const imageToggle = document.getElementById('toggleImage');
  if (imageToggle) imageToggle.checked = true;
  renderSourceSelect();
  renderJobList();
  setUIState('ready');
  initScene();
  clearGeneratedScene();
  setImagePlaneVisible(true);
  setImagePlane(null);
  setAspectGuideAspect(null);
  if (sessionData.jobs?.some(j => j.status !== 'failed' && j.status !== 'completed' && j.status !== 'complete')) {
    startAutoPoll();
  }
  log(message || 'Session ready.');
}

// ── Job / Scene Controllers ───────────────────────────────

function isCompletedStatus(status) {
  return status === 'completed' || status === 'complete';
}

const sceneController = createSceneController({
  lensFov,
  log,
  isCompletedStatus
});

const generationController = createGenerationController({
  getSessionData: () => sessionData,
  writeSessionFile,
  log,
  readJsonResponse,
  isCompletedStatus,
  sceneController,
  sourceIdFromManifestPath,
  ensureActiveSourceAspect: async (job) => {
    if (!getActiveSource()) {
      const sourceId = sourceIdFromManifestPath(job?.scene_manifest_path);
      if (sourceId && sessionData?.sources?.some(s => s.id === sourceId)) {
        sessionData.active_source = sourceId;
        await writeSessionFile();
        renderSourceSelect();
      }
    }
    const activeSource = getActiveSource();
    const imageToggle = document.getElementById('toggleImage');
    const shouldShowImage = !(imageToggle instanceof HTMLInputElement) || imageToggle.checked;
    if (activeSource) {
      const sourceFile = await loadSourceImageById(activeSource.id);
      setImagePlane(sourceFile);
      setImagePlaneVisible(shouldShowImage);
    } else {
      setImagePlane(null);
    }
    const aspect = await getActiveSourceAspect();
    setAspectGuideAspect(aspect);
  }
});

const {
  upsertLocalJob,
  renderJobList,
  stopAutoPoll,
  startAutoPoll,
  pollLatestJob,
  loadJobOutput
} = generationController;

const {
  initScene,
  clearGeneratedScene,
  setImagePlane,
  setImagePlaneVisible,
  ensureCompletionAudioContext,
  updateShotCamera,
  setControlsCamera,
  getActiveCameraMode,
  updateCameraPanel,
  resetActiveCamera,
  fitShotCameraToGeneratedScene,
  getCameraJsonWithAspect,
  getDeltaPoseJson,
  captureCurrentViewPng,
  getLoadedGeneratedJobId,
  setOriginalPose,
  goToOriginalPose,
  setAspectGuideAspect,
  setShotTilt,
  getShotTilt
} = sceneController;

function sourceIdFromManifestPath(manifestPath) {
  const match = String(manifestPath || '').match(/\/source\/(src_\d{4})\//);
  return match?.[1] || null;
}

function getLoadedSourceId() {
  const loadedJobId = getLoadedGeneratedJobId();
  if (!loadedJobId || !sessionData?.jobs?.length) return null;
  const loadedJob = sessionData.jobs.find(j => j.job_id === loadedJobId);
  if (!loadedJob?.scene_manifest_path) return null;
  return sourceIdFromManifestPath(loadedJob.scene_manifest_path);
}

async function clearLoadedGeneratedScene({ notify = true } = {}) {
  clearGeneratedScene();
  sessionData.active_loaded_job_id = null;
  if (notify) log('Cleared generated scene from canvas.');
}

// ── File helpers ──────────────────────────────────────────

async function writeTextFile(dirHandle, name, content) {
  const fh = await dirHandle.getFileHandle(name, { create: true });
  const writable = await fh.createWritable();
  await writable.write(content);
  await writable.close();
}

async function writeBlobFile(dirHandle, name, blob) {
  const fh = await dirHandle.getFileHandle(name, { create: true });
  const writable = await fh.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function nextCaptureName(capturesDirHandle) {
  let max = 0;
  for await (const [name, handle] of capturesDirHandle.entries()) {
    if (handle.kind !== 'directory') continue;
    const m = /^cap_(\d{4})$/.exec(name);
    if (m && Number(m[1]) > max) max = Number(m[1]);
  }
  return `cap_${String(max + 1).padStart(4, '0')}`;
}

async function readImageDims(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to read image dimensions.'));
    };
    img.src = url;
  });
}

async function showSelectedImageMetadata(file) {
  const nameEl = document.getElementById('refFileName');
  const dimsEl = document.getElementById('refFileDims');
  nameEl.textContent = file?.name ?? '';
  if (!file) {
    dimsEl.style.display = 'none';
    setAspectGuideAspect(null);
    return null;
  }
  try {
    const dims = await readImageDims(file);
    dimsEl.textContent = `${dims.width} × ${dims.height}`;
    dimsEl.style.display = '';
    const active = getActiveSource();
    if (active) {
      active.width = dims.width;
      active.height = dims.height;
    }
    setAspectGuideAspect(dims.width / dims.height);
    return dims;
  } catch {
    dimsEl.style.display = 'none';
    return null;
  }
}

async function getActiveSourceAspect() {
  const active = getActiveSource();
  if (!active) return null;
  if (Number.isFinite(active.width) && Number.isFinite(active.height) && active.width > 0 && active.height > 0) {
    return active.width / active.height;
  }
  const file = await loadSourceImageById(active.id);
  if (!file) return null;
  const dims = await showSelectedImageMetadata(file);
  if (!dims) return null;
  await writeSessionFile();
  return dims.width / dims.height;
}

async function readJsonResponse(res, label) {
  const raw = await res.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    const snippet = raw.slice(0, 180).replace(/\s+/g, ' ').trim();
    throw new Error(`${label} returned non-JSON (${res.status}): ${snippet || '(empty response)'}`);
  }
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `${label} failed with status ${res.status}`);
  }
  return data;
}

// ── Event handlers ────────────────────────────────────────

document.getElementById('start').onclick = async () => {
  try {
    await ensureCompletionAudioContext();
    const activeSource = getActiveSource();
    if (!activeSource) { log('No source selected. Upload an image first.'); return; }

    const sourceFile = await loadSourceImageById(activeSource.id);
    if (!sourceFile) { log('Selected source file is missing. Re-select or upload the image again.'); return; }

    const syncForm = new FormData();
    syncForm.append('session_id', sessionData.session_id);
    if (sessionData.session_bucket) syncForm.append('session_bucket', sessionData.session_bucket);
    syncForm.append('source_id', activeSource.id);
    syncForm.append('filename', activeSource.filename);
    syncForm.append('reference', sourceFile, activeSource.filename);
    const syncRes = await fetch('/api/generate/sync-reference', {
      method: 'POST',
      body: syncForm
    });
    const syncData = await readJsonResponse(syncRes, 'Sync reference');
    if (!syncData.reference_image_path) {
      throw new Error('Sync reference response missing reference_image_path.');
    }

    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionData.session_id,
        session_bucket: sessionData.session_bucket || undefined,
        reference_image_path: syncData.reference_image_path,
        force_regenerate: false
      })
    });
    const data = await readJsonResponse(res, 'Start generation');
    if (data.job_id) {
      const job = upsertLocalJob({
        job_id: data.job_id,
        source_id: sessionData.active_source || null,
        status: data.status || 'pending',
        stage: data.stage || 'queued',
        progress_percent: typeof data.progress_percent === 'number' ? data.progress_percent : 0,
        logs_tail: Array.isArray(data.logs_tail) ? data.logs_tail : [],
        started_at: new Date().toISOString(),
        polled_at: null
      });
      await writeSessionFile();
      renderJobList();
      if (job?.status && isCompletedStatus(job.status)) {
        await loadJobOutput(job.job_id, { quiet: true });
      } else {
        startAutoPoll();
      }
    }
    log(data);
  } catch (err) {
    log({ error: String(err) });
  }
};

document.getElementById('jobList').onclick = async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const loadBtn = target.closest('.load-job-btn');
  if (loadBtn) {
    const jobId = loadBtn.getAttribute('data-job-id');
    if (!jobId) return;
    try {
      await loadJobOutput(jobId);
    } catch (err) {
      log({ error: String(err) });
    }
    return;
  }

  const cancelBtn = target.closest('.cancel-job-btn');
  if (!cancelBtn) return;
  const jobId = cancelBtn.getAttribute('data-job-id');
  if (!jobId) return;
  if (!confirm(`Cancel generation job ${jobId}?`)) return;
  try {
    const query = `session_id=${encodeURIComponent(sessionData.session_id)}${
      sessionData.session_bucket ? `&session_bucket=${encodeURIComponent(sessionData.session_bucket)}` : ''
    }`;
    const res = await fetch(
      `/api/generate/${encodeURIComponent(jobId)}/cancel?${query}`,
      { method: 'POST' }
    );
    const data = await readJsonResponse(res, 'Cancel generation');
    const localJob = sessionData.jobs.find(j => j.job_id === jobId);
    if (localJob) Object.assign(localJob, data);
    await writeSessionFile();
    renderJobList();
    if (!sessionData.jobs.some(j => j.status === 'queued' || j.status === 'running')) stopAutoPoll();
    log(data);
  } catch (err) {
    log({ error: String(err) });
  }
};

document.getElementById('sourceSelect').onchange = async () => {
  const sel = document.getElementById('sourceSelect');
  const loadedSourceId = getLoadedSourceId();
  if (sel.value === '__new__') {
    document.getElementById('refFile').click();
    // Reset to previous selection while file picker is open
    sel.value = sessionData.active_source || '';
    return;
  }
  if (!sel.value) {
    sessionData.active_source = null;
    if (loadedSourceId) await clearLoadedGeneratedScene({ notify: false });
    await writeSessionFile();
    renderSourceSelect();
    renderJobList();
    setImagePlane(null);
    await showSelectedImageMetadata(null);
    return;
  }
  try {
    const file = await loadSourceImageById(sel.value);
    if (loadedSourceId && loadedSourceId !== sel.value) {
      await clearLoadedGeneratedScene({ notify: false });
    }
    sessionData.active_source = sel.value;
    renderSourceSelect();
    renderJobList();
    setImagePlane(file);
    await showSelectedImageMetadata(file);
    await writeSessionFile();
  } catch (err) {
    log({ error: String(err) });
  }
};

document.getElementById('clearGenerated').onclick = async () => {
  try {
    await clearLoadedGeneratedScene();
    await writeSessionFile();
    renderJobList();
  } catch (err) {
    log({ error: String(err) });
  }
};

document.getElementById('toggleImage').onchange = async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (!target.checked) {
    setImagePlaneVisible(false);
    return;
  }
  const activeSource = getActiveSource();
  if (!activeSource) {
    setImagePlaneVisible(false);
    return;
  }
  try {
    const sourceFile = await loadSourceImageById(activeSource.id);
    setImagePlane(sourceFile);
    setImagePlaneVisible(true);
    const aspect = await getActiveSourceAspect();
    setAspectGuideAspect(aspect);
  } catch (err) {
    log({ error: String(err) });
  }
};

document.getElementById('refFile').onchange = async () => {
  const fileInput = document.getElementById('refFile');
  const file = fileInput.files?.[0];
  if (!file) return;
  if (!confirm(`Copy "${file.name}" into a new source folder?`)) {
    fileInput.value = '';
    return;
  }
  try {
    const sourceDir = await sessionDirHandle.getDirectoryHandle('source', { create: true });
    const srcId = await nextSourceId(sourceDir);
    const srcDir = await sourceDir.getDirectoryHandle(srcId, { create: true });
    await srcDir.getDirectoryHandle('captures', { create: true });
    await writeBlobFile(srcDir, file.name, file);
    if (!sessionData.sources) sessionData.sources = [];
    sessionData.sources.push({ id: srcId, filename: file.name });
    const loadedSourceId = getLoadedSourceId();
    if (loadedSourceId && loadedSourceId !== srcId) {
      await clearLoadedGeneratedScene({ notify: false });
    }
    sessionData.active_source = srcId;
    renderSourceSelect();
    renderJobList();
    // Load into 3D scene
    setImagePlane(file);
    await showSelectedImageMetadata(file);
    await writeSessionFile();
    log(`${file.name} copied to source/${srcId}/${file.name}`);
  } catch (err) {
    log({ error: String(err) });
  }
  fileInput.value = '';
};

document.getElementById('capture').onclick = async () => {
  try {
    if (!sessionDirHandle) {
      log('Pick or re-pick the session folder first.');
      return;
    }
    log('Capturing view...');
    let activeSource = getActiveSource();
    if (!activeSource && sessionData?.sources?.length === 1) {
      sessionData.active_source = sessionData.sources[0].id;
      await writeSessionFile();
      renderSourceSelect();
      activeSource = getActiveSource();
    }
    if (!activeSource) { log('No source selected. Upload an image first.'); return; }
    const sourceDir = await sessionDirHandle.getDirectoryHandle('source', { create: true });
    const srcDir = await sourceDir.getDirectoryHandle(activeSource.id);
    const capturesDir = await srcDir.getDirectoryHandle('captures', { create: true });
    const capName = await nextCaptureName(capturesDir);
    const capDir = await capturesDir.getDirectoryHandle(capName, { create: true });
    const captureAspect = await getActiveSourceAspect();
    if (captureAspect) setAspectGuideAspect(captureAspect);
    const targetBlob = await captureCurrentViewPng(captureAspect);
    if (!targetBlob) throw new Error('Failed to encode canvas PNG.');
    const cameraJson = JSON.stringify(getCameraJsonWithAspect(captureAspect), null, 2);
    const deltaJson = JSON.stringify(getDeltaPoseJson(), null, 2);

    await writeBlobFile(capDir, 'target.png', targetBlob);
    await writeTextFile(capDir, 'camera.json', cameraJson);
    await writeTextFile(capDir, 'delta_pose.json', deltaJson);
    await capDir.getFileHandle('target.png');
    await capDir.getFileHandle('camera.json');
    await capDir.getFileHandle('delta_pose.json');

    log({
      message: 'Capture exported',
      local_path: `source/${activeSource.id}/captures/${capName}/`,
      files: ['target.png', 'camera.json', 'delta_pose.json'],
      local_saved: true
    });
  } catch (err) {
    log({ error: String(err) });
  }
};

document.getElementById('lensPreset').onchange = updateShotCamera;
document.getElementById('activeCamera').onchange = () => {
  setControlsCamera(getActiveCameraMode());
  updateCameraPanel();
};
document.getElementById('resetCamera').onclick = () => {
  resetActiveCamera();
  updateCameraPanel();
  const tiltDisp = document.getElementById('shotTiltDisplay');
  if (tiltDisp) tiltDisp.textContent = '0\u00B0';
};
document.getElementById('fitShotCamera').onclick = () => {
  if (!fitShotCameraToGeneratedScene({ resetDelta: true })) {
    log('Load output first to fit the shot camera.');
    return;
  }
  setControlsCamera('shot');
  updateCameraPanel();
};
document.getElementById('setOriginalPose').onclick = () => {
  setOriginalPose();
  updateCameraPanel();
  log('Original shot pose set from current camera position.');
};
document.getElementById('goOriginalPose').onclick = () => {
  goToOriginalPose();
  setControlsCamera('shot');
  updateCameraPanel();
};

// ── Keyboard: Q/E to tilt shot camera ─────────────────────
document.addEventListener('keydown', (e) => {
  if (getActiveCameraMode() !== 'shot') return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.key === 'q' || e.key === 'Q') setShotTilt(getShotTilt() - 1);
  else if (e.key === 'e' || e.key === 'E') setShotTilt(getShotTilt() + 1);
  else return;
  const tiltDisp = document.getElementById('shotTiltDisplay');
  if (tiltDisp) tiltDisp.textContent = `${getShotTilt()}\u00B0`;
});

// Start in pick state
setUIState('pick');
bootstrapFromConnectedFolder();
