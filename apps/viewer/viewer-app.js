import { createGenerationController } from './viewer-generation.js';
import { createSceneController } from './viewer-scene.js';

const SESSION_FILE = 'istanbul3d_session.json';
const lensFov = { '24mm': 84, '35mm': 63, '50mm': 47, '85mm': 28 };

let sessionDirHandle = null;
let sessionData = null;
// ── UI state ──────────────────────────────────────────────

function setUIState(state) {
  document.getElementById('state-pick').style.display    = state === 'pick'    ? '' : 'none';
  document.getElementById('state-confirm').style.display = state === 'confirm' ? '' : 'none';
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

// ── Folder picking ────────────────────────────────────────

async function pickFolder() {
  if (!window.showDirectoryPicker) {
    log('File System Access API is not available in this browser.');
    return;
  }
  try {
    const dirHandle = await window.showDirectoryPicker();
    sessionDirHandle = dirHandle;
    const existing = await readSessionFile(dirHandle);
    if (existing) {
      sessionData = existing;
      await migrateLegacySession();
      activateSession('Loaded existing session.');
    } else {
      document.getElementById('confirmFolderName').textContent = dirHandle.name;
      setUIState('confirm');
    }
  } catch (err) {
    if (err.name !== 'AbortError') log({ error: String(err) });
  }
}

async function initializeSession() {
  try {
    sessionData = {
      session_id: generateSessionId(),
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
  sessionData.active_source = null;
  document.getElementById('sessionDisplay').textContent = sessionData.session_id;
  renderSourceSelect();
  renderJobList();
  setUIState('ready');
  initScene();
  clearGeneratedScene();
  setImagePlane(null);
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
  sceneController
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
  ensureCompletionAudioContext,
  updateShotCamera,
  setControlsCamera,
  getActiveCameraMode,
  updateCameraPanel,
  resetActiveCamera,
  fitShotCameraToGeneratedScene,
  getCameraJson,
  getDeltaPoseJson
} = sceneController;

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

document.getElementById('pickDirInit').onclick = pickFolder;
document.getElementById('pickDirSwitch').onclick = pickFolder;
// Note: File System Access API does not expose the full filesystem path,
// so we can't open Finder directly. Show folder name as best fallback.
document.getElementById('btnOpenFolder').onclick = () => {
  if (sessionDirHandle) log('Session folder: ' + sessionDirHandle.name);
};
document.getElementById('btnCancel').onclick = () => setUIState('pick');
document.getElementById('btnInit').onclick = initializeSession;

document.getElementById('start').onclick = async () => {
  try {
    await ensureCompletionAudioContext();
    const activeSource = getActiveSource();
    if (!activeSource) { log('No source selected. Upload an image first.'); return; }

    const sourceFile = await loadSourceImageById(activeSource.id);
    if (!sourceFile) { log('Selected source file is missing. Re-select or upload the image again.'); return; }

    const syncForm = new FormData();
    syncForm.append('session_id', sessionData.session_id);
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
        reference_image_path: syncData.reference_image_path,
        force_regenerate: false
      })
    });
    const data = await readJsonResponse(res, 'Start generation');
    if (data.job_id) {
      const job = upsertLocalJob({
        job_id: data.job_id,
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

document.getElementById('poll').onclick = async () => {
  try {
    const data = await pollLatestJob();
    if (!data) return;
    if (data.status !== 'completed' && data.status !== 'failed') startAutoPoll();
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
    const res = await fetch(
      `/api/generate/${encodeURIComponent(jobId)}/cancel?session_id=${encodeURIComponent(sessionData.session_id)}`,
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
  if (sel.value === '__new__') {
    document.getElementById('refFile').click();
    // Reset to previous selection while file picker is open
    sel.value = sessionData.active_source || '';
    return;
  }
  if (!sel.value) {
    sessionData.active_source = null;
    await writeSessionFile();
    renderSourceSelect();
    setImagePlane(null);
    await showSelectedImageMetadata(null);
    return;
  }
  try {
    const file = await loadSourceImageById(sel.value);
    sessionData.active_source = sel.value;
    await writeSessionFile();
    renderSourceSelect();
    setImagePlane(file);
    await showSelectedImageMetadata(file);
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
    sessionData.active_source = srcId;
    await writeSessionFile();
    renderSourceSelect();
    // Load into 3D scene
    setImagePlane(file);
    await showSelectedImageMetadata(file);
    log(`${file.name} copied to source/${srcId}/${file.name}`);
  } catch (err) {
    log({ error: String(err) });
  }
  fileInput.value = '';
};

document.getElementById('capture').onclick = async () => {
  try {
    const activeSource = getActiveSource();
    if (!activeSource) { log('No source selected. Upload an image first.'); return; }
    const canvas = document.getElementById('scene');
    const sourceDir = await sessionDirHandle.getDirectoryHandle('source', { create: true });
    const srcDir = await sourceDir.getDirectoryHandle(activeSource.id);
    const capturesDir = await srcDir.getDirectoryHandle('captures', { create: true });
    const capName = await nextCaptureName(capturesDir);
    const capDir = await capturesDir.getDirectoryHandle(capName, { create: true });

    const targetBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!targetBlob) throw new Error('Failed to encode canvas PNG.');

    await writeBlobFile(capDir, 'target.png', targetBlob);
    await writeTextFile(capDir, 'camera.json', JSON.stringify(getCameraJson(), null, 2));
    await writeTextFile(capDir, 'delta_pose.json', JSON.stringify(getDeltaPoseJson(), null, 2));

    log({ message: 'Capture exported', path: `source/${activeSource.id}/captures/${capName}/`, files: ['target.png', 'camera.json', 'delta_pose.json'] });
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
};
document.getElementById('fitShotCamera').onclick = () => {
  if (!fitShotCameraToGeneratedScene({ resetDelta: true })) {
    log('Load output first to fit the shot camera.');
    return;
  }
  setControlsCamera('shot');
  updateCameraPanel();
};

// Start in pick state
setUIState('pick');
