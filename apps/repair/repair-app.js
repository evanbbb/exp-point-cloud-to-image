import {
  browserSupportsWorkingFolder,
  ensureWorkingFolderPermission,
  loadWorkingFolderHandle
} from '/shared/workspace-handle.js';

const SESSION_FILE = 'istanbul3d_session.json';
const WORKSPACE_SETUP_URL = '/workspace?next=/repair';
const REPAIR_META_FILE = 'repair_meta.json';
const REPAIRED_IMAGE_FILE = 'repaired.png';

let sessionDirHandle = null;
let sessionData = null;
let activeSourceId = null;
let captures = [];        // [{ capId, targetFile, targetUrl, cameraFile, deltaPoseFile }]
let sourceThumbUrl = null;
let selectedCapId = null;
let isRunning = false;
let prevRepairsGeneration = 0;
let previousRepairUrls = [];

// ── Lightbox ────────────────────────────────────────────────

function openLightbox(url) {
  document.getElementById('lightboxImg').src = url;
  document.getElementById('lightboxOverlay').style.display = 'flex';
}

function closeLightbox() {
  document.getElementById('lightboxOverlay').style.display = 'none';
  document.getElementById('lightboxImg').src = '';
}

// ── Compare overlay ─────────────────────────────────────────

function openCompare(sourceUrl, targetUrl, repairedUrl) {
  document.getElementById('compareSourceImg').src = sourceUrl;
  document.getElementById('compareCaptureImg').src = targetUrl;
  document.getElementById('compareRepairImg').src = repairedUrl;
  document.getElementById('compareOverlay').style.display = 'flex';
}

function closeCompare() {
  document.getElementById('compareOverlay').style.display = 'none';
  ['compareSourceImg', 'compareCaptureImg', 'compareRepairImg'].forEach(id => {
    document.getElementById(id).src = '';
  });
}

// ── UI helpers ──────────────────────────────────────────────

function setUIState(state) {
  document.getElementById('state-pick').style.display  = state === 'pick'  ? '' : 'none';
  document.getElementById('state-ready').style.display = state === 'ready' ? '' : 'none';
}

function log(value) {
  const out = document.getElementById('out');
  if (out) out.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

// ── Session file ────────────────────────────────────────────

async function readSessionFile(dirHandle) {
  try {
    const fh = await dirHandle.getFileHandle(SESSION_FILE);
    const file = await fh.getFile();
    return JSON.parse(await file.text());
  } catch {
    return null;
  }
}

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

async function readJsonFile(fileHandle) {
  const file = await fileHandle.getFile();
  return JSON.parse(await file.text());
}

function clearPreviousRepairUrls() {
  for (const url of previousRepairUrls) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
  previousRepairUrls = [];
}

function makeRepairId() {
  const stamp = Date.now();
  const suffix = Math.random().toString(36).slice(2, 6);
  return `repair_${stamp}_${suffix}`;
}

async function readImageDimsFromBlob(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });
}

function buildLocalRepairMeta({
  repairId,
  sourceId,
  sourceFilename,
  capId,
  promptText,
  pose,
  startedAt,
  completedAt,
  durationMs,
  status,
  imageBlob,
  imageDims,
  errorMessage,
  serverMeta
}) {
  const input = {
    reference_image_path: `source/${sourceId}/${sourceFilename}`,
    target_image_path: `source/${sourceId}/captures/${capId}/target.png`,
    delta_pose_path: `source/${sourceId}/captures/${capId}/delta_pose.json`,
    camera_path: `source/${sourceId}/captures/${capId}/camera.json`
  };
  const fallbackFal = {
    model: 'unknown',
    loras: [],
    parameters: {
      num_inference_steps: 28,
      guidance_scale: 5,
      output_format: 'png',
      num_images: 1,
      seed: null
    }
  };

  const base = {
    schema_version: '1.0',
    repair_id: repairId,
    session_id: sessionData.session_id,
    source_id: sourceId,
    cap_id: capId,
    created_at: startedAt,
    completed_at: completedAt,
    duration_ms: durationMs,
    status,
    input,
    fal: serverMeta?.fal || fallbackFal,
    prompt: {
      template_version: '1.0',
      text: promptText,
      delta_pose_values: {
        x: pose.x,
        y: pose.y,
        z: pose.z,
        pitch: pose.pitch,
        yaw: pose.yaw,
        roll: pose.roll
      }
    }
  };

  if (status === 'succeeded') {
    const dims = imageDims || { width: 0, height: 0 };
    return {
      ...base,
      output: {
        repaired_image_path: `source/${sourceId}/repairs/${repairId}/${REPAIRED_IMAGE_FILE}`,
        width: dims.width || 1,
        height: dims.height || 1,
        bytes: imageBlob?.size || 1
      },
      error: null
    };
  }

  return {
    ...base,
    output: undefined,
    error: serverMeta?.error || {
      code: 'REPAIR_FAILED',
      message: String(errorMessage || 'Repair failed'),
      retryable: false
    }
  };
}

// ── Source dropdown ──────────────────────────────────────────

function renderSourceSelect() {
  const sel = document.getElementById('sourceSelect');
  sel.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select source';
  sel.appendChild(placeholder);
  if (sessionData?.sources?.length) {
    sessionData.sources.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.id}: ${s.filename}`;
      if (s.id === activeSourceId) opt.selected = true;
      sel.appendChild(opt);
    });
  }
}

// ── Source thumbnail ─────────────────────────────────────────

async function loadSourceThumbnail(sourceId) {
  const thumb = document.getElementById('sourceThumbnail');
  const img = document.getElementById('sourceThumbImg');
  const label = document.getElementById('sourceThumbLabel');
  if (!sourceId || !sessionDirHandle) {
    thumb.style.display = 'none';
    return;
  }
  const source = sessionData?.sources?.find(s => s.id === sourceId);
  if (!source) { thumb.style.display = 'none'; return; }
  try {
    const sourceDir = await sessionDirHandle.getDirectoryHandle('source');
    const srcDir = await sourceDir.getDirectoryHandle(sourceId);
    const fh = await srcDir.getFileHandle(source.filename);
    const file = await fh.getFile();
    if (sourceThumbUrl) URL.revokeObjectURL(sourceThumbUrl);
    sourceThumbUrl = URL.createObjectURL(file);
    img.src = sourceThumbUrl;
    img.onclick = () => openLightbox(sourceThumbUrl);
    img.style.cursor = 'pointer';
    label.textContent = source.filename;
    thumb.style.display = '';
  } catch {
    thumb.style.display = 'none';
  }
}

// ── Capture enumeration ─────────────────────────────────────

async function enumerateCaptures(sourceId) {
  captures = [];
  selectedCapId = null;
  clearPreviousRepairUrls();
  document.getElementById('promptPreview').style.display = 'none';
  document.getElementById('previousRepairs').style.display = 'none';
  if (!sourceId || !sessionDirHandle) {
    renderCapturesGrid();
    return;
  }
  try {
    const sourceDir = await sessionDirHandle.getDirectoryHandle('source');
    const srcDir = await sourceDir.getDirectoryHandle(sourceId);
    await srcDir.getDirectoryHandle('generations', { create: true });
    await srcDir.getDirectoryHandle('repairs', { create: true });
    const capturesDir = await srcDir.getDirectoryHandle('captures', { create: true });
    const capEntries = [];
    for await (const [name, handle] of capturesDir.entries()) {
      if (handle.kind === 'directory' && /^cap_\d{4}$/.test(name)) {
        capEntries.push({ name, handle });
      }
    }
    capEntries.sort((a, b) => a.name.localeCompare(b.name));
    for (const { name, handle } of capEntries) {
      try {
        const targetHandle = await handle.getFileHandle('target.png');
        const targetFile = await targetHandle.getFile();
        const cameraHandle = await handle.getFileHandle('camera.json');
        const cameraFile = await cameraHandle.getFile();
        const deltaPoseHandle = await handle.getFileHandle('delta_pose.json');
        const deltaPoseFile = await deltaPoseHandle.getFile();
        captures.push({
          capId: name,
          targetFile,
          targetUrl: URL.createObjectURL(targetFile),
          cameraFile,
          deltaPoseFile
        });
      } catch {
        // skip incomplete captures
      }
    }
  } catch {
    // no captures dir
  }
  renderCapturesGrid();
}

// ── Grid rendering ──────────────────────────────────────────

function renderCapturesGrid() {
  const grid = document.getElementById('capturesGrid');
  const label = document.getElementById('capturesLabel');
  label.textContent = `Captures (${captures.length})`;
  grid.innerHTML = '';
  if (captures.length === 0) {
    grid.innerHTML = '<div class="captures-empty">No captures found for this source.</div>';
    updateActionBar();
    return;
  }
  for (const cap of captures) {
    const card = document.createElement('div');
    card.className = 'capture-card' + (cap.capId === selectedCapId ? ' selected' : '');
    card.dataset.capId = cap.capId;
    card.innerHTML = `
      <img src="${cap.targetUrl}" alt="${cap.capId}" style="cursor:zoom-in;" />
      <div class="capture-card-label" style="cursor:pointer;">
        <i class="ph ph-lightning" aria-hidden="true" style="font-size:12px;"></i>
        <span>${cap.capId}</span>
      </div>
    `;
    card.querySelector('img').onclick = (e) => {
      e.stopPropagation();
      openLightbox(cap.targetUrl);
    };
    card.querySelector('.capture-card-label').onclick = (e) => {
      e.stopPropagation();
      toggleCapture(cap.capId);
    };
    grid.appendChild(card);
  }
  updateActionBar();
}

function toggleCapture(capId) {
  if (isRunning) return;
  selectedCapId = selectedCapId === capId ? null : capId;
  // Update card classes without full re-render
  const grid = document.getElementById('capturesGrid');
  for (const card of grid.children) {
    card.classList.toggle('selected', card.dataset.capId === selectedCapId);
  }
  updateActionBar();
  updatePromptPreview();
  updatePreviousRepairs();
}

function updateActionBar() {
  document.getElementById('selectionCount').textContent =
    selectedCapId ? '1 capture selected' : 'No capture selected';
  updateRunButton();
}

function updateRunButton() {
  const btn = document.getElementById('runRepairBtn');
  const paid = document.getElementById('paidConfirm').checked;
  const runs = getRunCount();
  const canRun = !!selectedCapId && paid && !isRunning;
  btn.disabled = !canRun;
  btn.textContent = isRunning
    ? 'Running...'
    : selectedCapId
      ? `Run Repair${runs > 1 ? ` ×${runs}` : ''}`
      : 'Run Repair';
}

function getRunCount() {
  return Number(document.getElementById('runCount')?.value ?? 1);
}

async function fetchServerRepairMeta(repairId) {
  const bucketParam = sessionData.session_bucket
    ? `&session_bucket=${encodeURIComponent(sessionData.session_bucket)}`
    : '';
  const res = await fetch(`/api/repairs/${encodeURIComponent(repairId)}/meta?session_id=${encodeURIComponent(sessionData.session_id)}${bucketParam}`);
  if (!res.ok) return null;
  return res.json();
}

async function persistRepairToWorkspace({
  repairId,
  source,
  cap,
  promptText,
  pose,
  startedAt,
  completedAt,
  durationMs,
  status,
  imageBlob,
  errorMessage
}) {
  if (!sessionDirHandle || !activeSourceId) return null;
  const sourceDir = await sessionDirHandle.getDirectoryHandle('source', { create: true });
  const srcDir = await sourceDir.getDirectoryHandle(activeSourceId, { create: true });
  const repairsDir = await srcDir.getDirectoryHandle('repairs', { create: true });
  const repairDir = await repairsDir.getDirectoryHandle(repairId, { create: true });

  let imageDims = null;
  if (imageBlob) {
    imageDims = await readImageDimsFromBlob(imageBlob);
    await writeBlobFile(repairDir, REPAIRED_IMAGE_FILE, imageBlob);
  }

  let serverMeta = null;
  try {
    serverMeta = await fetchServerRepairMeta(repairId);
  } catch {
    // ignore server meta fetch failures; local fallback meta will be written.
  }

  const localMeta = buildLocalRepairMeta({
    repairId,
    sourceId: activeSourceId,
    sourceFilename: source.filename,
    capId: cap.capId,
    promptText,
    pose,
    startedAt,
    completedAt,
    durationMs,
    status,
    imageBlob,
    imageDims,
    errorMessage,
    serverMeta
  });
  await writeTextFile(repairDir, REPAIR_META_FILE, JSON.stringify(localMeta, null, 2));
  return localMeta;
}

async function listLocalRepairsForCapture(capId, capPose) {
  if (!sessionDirHandle || !activeSourceId) return [];
  try {
    const sourceDir = await sessionDirHandle.getDirectoryHandle('source');
    const srcDir = await sourceDir.getDirectoryHandle(activeSourceId);
    const repairsDir = await srcDir.getDirectoryHandle('repairs');

    const repairEntries = [];
    for await (const [name, handle] of repairsDir.entries()) {
      if (handle.kind !== 'directory' || !/^repair_/.test(name)) continue;
      try {
        const metaHandle = await handle.getFileHandle(REPAIR_META_FILE);
        const meta = await readJsonFile(metaHandle);
        const sourceMatches = !meta.source_id || meta.source_id === activeSourceId;
        if (!sourceMatches) continue;

        let captureMatches = false;
        if (meta.cap_id) {
          captureMatches = meta.cap_id === capId;
        } else if (capPose && meta.prompt?.delta_pose_values) {
          const p = meta.prompt.delta_pose_values;
          captureMatches = p.x === capPose.x
            && p.y === capPose.y
            && p.z === capPose.z
            && p.pitch === capPose.pitch
            && p.yaw === capPose.yaw
            && p.roll === capPose.roll;
        }
        if (!captureMatches) continue;

        let imgUrl = null;
        if (meta.status === 'succeeded') {
          try {
            const imgHandle = await handle.getFileHandle(REPAIRED_IMAGE_FILE);
            const imgFile = await imgHandle.getFile();
            imgUrl = URL.createObjectURL(imgFile);
            previousRepairUrls.push(imgUrl);
          } catch {
            imgUrl = null;
          }
        }
        repairEntries.push({ meta, imgUrl });
      } catch {
        // ignore malformed repair folders
      }
    }

    repairEntries.sort((a, b) => {
      const aTime = Date.parse(a.meta.created_at || '');
      const bTime = Date.parse(b.meta.created_at || '');
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
    return repairEntries;
  } catch {
    return [];
  }
}

async function updatePreviousRepairs() {
  const gen = ++prevRepairsGeneration;
  const panel = document.getElementById('previousRepairs');
  clearPreviousRepairUrls();
  if (!selectedCapId) {
    panel.style.display = 'none';
    return;
  }
  const capId = selectedCapId;
  const cap = captures.find(c => c.capId === capId);
  document.getElementById('prevRepairsCapId').textContent = capId;
  panel.style.display = '';
  const grid = document.getElementById('prevRepairsGrid');
  grid.innerHTML = '<div class="captures-empty">Loading...</div>';
  try {
    let capPose = null;
    if (cap) {
      try {
        capPose = JSON.parse(await cap.deltaPoseFile.text());
      } catch {
        // ignore missing legacy pose
      }
    }
    if (gen !== prevRepairsGeneration) return;
    const repairs = await listLocalRepairsForCapture(capId, capPose);
    if (gen !== prevRepairsGeneration) return;

    if (!repairs.length) {
      grid.innerHTML = '<div class="captures-empty">No previous repairs for this capture.</div>';
      return;
    }
    grid.innerHTML = '';
    for (const { meta, imgUrl } of repairs) {
      const card = document.createElement('div');
      card.className = 'capture-card';
      const dt = new Date(meta.created_at);
      const dateStr = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        + ' ' + dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const failedLabel = meta.status === 'failed'
        ? `<span class="result-status result-status--failed" style="font-size:9px;text-transform:uppercase;">Failed</span>`
        : '';
      card.innerHTML = `
        <img src="${imgUrl ?? ''}" alt="${meta.repair_id}"
          style="cursor:${imgUrl ? 'zoom-in' : 'default'};${!imgUrl ? 'opacity:0.3;' : ''}" />
        <div class="capture-card-label" style="flex-direction:column;align-items:flex-start;gap:3px;">
          <span style="font-size:10px;">${dateStr}${failedLabel ? ' ' : ''}${failedLabel}</span>
          <div class="repair-card-actions" style="display:flex;gap:2px;"></div>
        </div>
      `;
      if (imgUrl) {
        card.querySelector('img').onclick = (e) => { e.stopPropagation(); openLightbox(imgUrl); };
      }
      const actionsEl = card.querySelector('.repair-card-actions');
      if (imgUrl && cap) {
        const compareBtn = document.createElement('button');
        compareBtn.className = 'icon-btn compare-trigger';
        compareBtn.title = 'Compare source / capture / repair';
        compareBtn.innerHTML = '<i class="ph ph-eye"></i>';
        compareBtn.onclick = (e) => {
          e.stopPropagation();
          openCompare(sourceThumbUrl, cap.targetUrl, imgUrl);
        };
        actionsEl.appendChild(compareBtn);
      }
      grid.appendChild(card);
    }
  } catch {
    grid.innerHTML = '<div class="captures-empty">Failed to load previous repairs.</div>';
  }
}

async function updatePromptPreview() {
  const panel = document.getElementById('promptPreview');
  if (!selectedCapId) {
    panel.style.display = 'none';
    return;
  }
  const capId = selectedCapId;
  const cap = captures.find(c => c.capId === capId);
  if (!cap) { panel.style.display = 'none'; return; }
  try {
    const deltaPoseText = await cap.deltaPoseFile.text();
    const pose = JSON.parse(deltaPoseText);
    const fmt = v => (typeof v === 'number' ? parseFloat(v.toFixed(4)) : v);
    const poseStr = JSON.stringify({ x: fmt(pose.x), y: fmt(pose.y), z: fmt(pose.z), pitch: fmt(pose.pitch), yaw: fmt(pose.yaw), roll: fmt(pose.roll) });
    let prompt = `Referring to the scene in image 1, imagine the perspective of the scene in image 2. Repair the perspective and missing areas. The camera has moved by: ${poseStr}`;
    const notes = document.getElementById('notesField').value.trim();
    if (notes) prompt += `\n\n${notes}`;
    document.getElementById('promptCapId').textContent = capId;
    document.getElementById('promptText').textContent = prompt;
    panel.style.display = '';
  } catch {
    panel.style.display = 'none';
  }
}

// ── Repair execution ────────────────────────────────────────

async function runRepairs() {
  if (isRunning || !selectedCapId) return;
  isRunning = true;
  updateRunButton();

  const panel = document.getElementById('resultsPanel');
  const list = document.getElementById('resultsList');
  panel.style.display = '';

  const notes = document.getElementById('notesField').value.trim();
  const source = sessionData.sources.find(s => s.id === activeSourceId);
  if (!source) { log('No active source.'); isRunning = false; updateRunButton(); return; }

  const cap = captures.find(c => c.capId === selectedCapId);
  if (!cap) { log('Selected capture not found.'); isRunning = false; updateRunButton(); return; }

  // Load reference image once
  let referenceFile;
  try {
    const sourceDir = await sessionDirHandle.getDirectoryHandle('source');
    const srcDir = await sourceDir.getDirectoryHandle(activeSourceId);
    const refHandle = await srcDir.getFileHandle(source.filename);
    referenceFile = await refHandle.getFile();
  } catch (err) {
    log({ error: `Failed to read reference image: ${err}` });
    isRunning = false;
    updateRunButton();
    return;
  }

  const runs = getRunCount();

  for (let i = 0; i < runs; i++) {
    const repairId = makeRepairId();

    // Add result card as running
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="result-images">
        <img src="${cap.targetUrl}" alt="target" />
        <img src="" alt="repaired" style="display:none" />
      </div>
      <div class="result-info">
        <span class="result-cap-id">${cap.capId}${runs > 1 ? ` (${i + 1}/${runs})` : ''}</span>
        <span class="result-status result-status--running">Running</span>
        <span class="result-meta">${repairId}</span>
      </div>
    `;
    list.prepend(card);

    let pose = null;
    let prompt = '';
    const startedAt = new Date().toISOString();
    try {
      const cameraText = await cap.cameraFile.text();
      const deltaPoseText = await cap.deltaPoseFile.text();

      pose = JSON.parse(deltaPoseText);
      const fmt = v => (typeof v === 'number' ? parseFloat(v.toFixed(4)) : v);
      const poseStr = JSON.stringify({ x: fmt(pose.x), y: fmt(pose.y), z: fmt(pose.z), pitch: fmt(pose.pitch), yaw: fmt(pose.yaw), roll: fmt(pose.roll) });
      prompt = `Referring to the scene in image 1, restore the perspective of the scene in image 2. Repair the perspective and missing areas. The camera has moved by: ${poseStr}`;
      if (notes) prompt += `\n\n${notes}`;

      const fd = new FormData();
      fd.append('session_id', sessionData.session_id);
      fd.append('session_bucket', sessionData.session_bucket || '');
      fd.append('repair_id', repairId);
      fd.append('source_id', activeSourceId);
      fd.append('cap_id', cap.capId);
      fd.append('paid_confirm', 'true');
      fd.append('prompt', prompt);
      fd.append('reference', referenceFile, source.filename);
      fd.append('target', cap.targetFile, 'target.png');
      fd.append('delta_pose', new Blob([deltaPoseText], { type: 'application/json' }), 'delta_pose.json');
      fd.append('camera', new Blob([cameraText], { type: 'application/json' }), 'camera.json');

      const res = await fetch('/api/repair', { method: 'POST', body: fd });

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          detail = errJson.detail || errJson.error || detail;
        } catch { /* ignore */ }
        throw new Error(detail);
      }

      const repairedBlob = await res.blob();
      const completedAt = new Date().toISOString();
      const durationMs = Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
      await persistRepairToWorkspace({
        repairId,
        source,
        cap,
        promptText: prompt,
        pose,
        startedAt,
        completedAt,
        durationMs,
        status: 'succeeded',
        imageBlob: repairedBlob,
        errorMessage: null
      });

      log(`${cap.capId} run ${i + 1} complete.`);

      // Move card out of Jobs and into Previous Repairs
      card.remove();
      if (!list.hasChildNodes()) {
        panel.style.display = 'none';
      }
      await updatePreviousRepairs();
    } catch (err) {
      const completedAt = new Date().toISOString();
      const durationMs = Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
      if (pose && prompt) {
        try {
          await persistRepairToWorkspace({
            repairId,
            source,
            cap,
            promptText: prompt,
            pose,
            startedAt,
            completedAt,
            durationMs,
            status: 'failed',
            imageBlob: null,
            errorMessage: String(err?.message || err)
          });
        } catch {
          // ignore local failure persistence errors
        }
      }

      // Update card to failed
      const statusEl = card.querySelector('.result-status');
      statusEl.className = 'result-status result-status--failed';
      statusEl.textContent = 'Failed';
      const errorEl = document.createElement('span');
      errorEl.className = 'result-error';
      errorEl.textContent = String(err.message || err);
      card.querySelector('.result-info').appendChild(errorEl);

      log({ error: `${cap.capId} run ${i + 1} failed: ${err.message || err}` });
      await updatePreviousRepairs();
    }
  }

  isRunning = false;
  updateRunButton();
  log('Done.');
}

// ── Connected folder bootstrap ─────────────────────────────

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
    const existing = await readSessionFile(dirHandle);
    if (!existing) {
      setUIState('pick');
      log('Connected folder has no istanbul3d_session.json yet. Start from Viewer first.');
      return;
    }
    sessionDirHandle = dirHandle;
    sessionData = existing;
    activeSourceId = null;
    activateSession();
  } catch (err) {
    setUIState('pick');
    log({ error: String(err) });
  }
}

function activateSession() {
  document.getElementById('sessionDisplay').textContent = sessionData.session_bucket || sessionData.session_id;
  renderSourceSelect();
  // Auto-select first source if only one
  if (sessionData.sources?.length === 1) {
    activeSourceId = sessionData.sources[0].id;
    document.getElementById('sourceSelect').value = activeSourceId;
    loadSourceThumbnail(activeSourceId);
    enumerateCaptures(activeSourceId);
  } else {
    loadSourceThumbnail(null);
    enumerateCaptures(null);
  }
  // Clear previous results
  document.getElementById('resultsList').innerHTML = '';
  document.getElementById('resultsPanel').style.display = 'none';
  document.getElementById('paidConfirm').checked = false;
  document.getElementById('notesField').value = '';
  setUIState('ready');
  log('Session loaded.');
}

// ── Event wiring ────────────────────────────────────────────

document.getElementById('sourceSelect').onchange = () => {
  const val = document.getElementById('sourceSelect').value;
  activeSourceId = val || null;
  loadSourceThumbnail(activeSourceId);
  enumerateCaptures(activeSourceId);
};

document.getElementById('paidConfirm').onchange = updateRunButton;
document.getElementById('runCount').onchange = updateRunButton;
document.getElementById('runRepairBtn').onclick = runRepairs;
document.getElementById('notesField').oninput = updatePromptPreview;

document.getElementById('lightboxOverlay').onclick = (e) => {
  if (e.target === e.currentTarget) closeLightbox();
};
document.getElementById('lightboxClose').onclick = closeLightbox;

document.getElementById('compareOverlay').onclick = (e) => {
  if (e.target === e.currentTarget) closeCompare();
};
document.getElementById('compareClose').onclick = closeCompare;

window.addEventListener('beforeunload', () => {
  clearPreviousRepairUrls();
  if (sourceThumbUrl) {
    try { URL.revokeObjectURL(sourceThumbUrl); } catch { /* ignore */ }
    sourceThumbUrl = null;
  }
});

// Start in pick state
setUIState('pick');
bootstrapFromConnectedFolder();
