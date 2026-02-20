const SESSION_FILE = 'istanbul3d_session.json';

let sessionDirHandle = null;
let sessionData = null;
let activeSourceId = null;
let captures = [];        // [{ capId, targetFile, targetUrl, cameraFile, deltaPoseFile }]
let sourceThumbUrl = null;
let selected = new Set(); // capId strings
let lastSelectedCapId = null;
let isRunning = false;

// ── Lightbox ────────────────────────────────────────────────

function openLightbox(url) {
  document.getElementById('lightboxImg').src = url;
  document.getElementById('lightboxOverlay').style.display = 'flex';
}

function closeLightbox() {
  document.getElementById('lightboxOverlay').style.display = 'none';
  document.getElementById('lightboxImg').src = '';
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
  selected.clear();
  lastSelectedCapId = null;
  document.getElementById('promptPreview').style.display = 'none';
  document.getElementById('previousRepairs').style.display = 'none';
  if (!sourceId || !sessionDirHandle) {
    renderCapturesGrid();
    return;
  }
  try {
    const sourceDir = await sessionDirHandle.getDirectoryHandle('source');
    const srcDir = await sourceDir.getDirectoryHandle(sourceId);
    const capturesDir = await srcDir.getDirectoryHandle('captures');
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
    card.className = 'capture-card' + (selected.has(cap.capId) ? ' selected' : '');
    card.dataset.capId = cap.capId;
    card.innerHTML = `
      <img src="${cap.targetUrl}" alt="${cap.capId}" style="cursor:zoom-in;" />
      <div class="capture-card-label">
        <span>${cap.capId}</span>
        <div class="capture-check"></div>
      </div>
    `;
    card.querySelector('img').onclick = (e) => {
      e.stopPropagation();
      openLightbox(cap.targetUrl);
    };
    card.onclick = () => toggleCapture(cap.capId);
    grid.appendChild(card);
  }
  updateActionBar();
}

function toggleCapture(capId) {
  if (isRunning) return;
  if (selected.has(capId)) {
    selected.delete(capId);
  } else {
    selected.add(capId);
    lastSelectedCapId = capId;
  }
  // Update card classes without full re-render
  const grid = document.getElementById('capturesGrid');
  for (const card of grid.children) {
    if (card.dataset.capId === capId) {
      card.classList.toggle('selected', selected.has(capId));
    }
  }
  updateActionBar();
  updatePromptPreview();
  updatePreviousRepairs();
}

function updateActionBar() {
  const count = selected.size;
  document.getElementById('selectionCount').textContent =
    count === 1 ? '1 capture selected' : `${count} captures selected`;
  updateRunButton();
}

function updateRunButton() {
  const btn = document.getElementById('runRepairBtn');
  const paid = document.getElementById('paidConfirm').checked;
  const canRun = selected.size > 0 && paid && !isRunning;
  btn.disabled = !canRun;
  btn.textContent = isRunning
    ? 'Running...'
    : selected.size > 0
      ? `Run Repair (${selected.size})`
      : 'Run Repair';
}

async function updatePreviousRepairs() {
  const panel = document.getElementById('previousRepairs');
  if (selected.size === 0) { panel.style.display = 'none'; return; }
  const capId = lastSelectedCapId && selected.has(lastSelectedCapId)
    ? lastSelectedCapId
    : [...selected][selected.size - 1];
  const cap = captures.find(c => c.capId === capId);
  document.getElementById('prevRepairsCapId').textContent = capId;
  panel.style.display = '';
  const grid = document.getElementById('prevRepairsGrid');
  grid.innerHTML = '<div class="captures-empty">Loading...</div>';
  try {
    // Read this capture's delta pose for legacy matching (repairs before cap_id was stored)
    let capPose = null;
    if (cap) {
      try { capPose = JSON.parse(await cap.deltaPoseFile.text()); } catch { /* ignore */ }
    }

    const res = await fetch(`/api/repairs/list?session_id=${encodeURIComponent(sessionData.session_id)}`);
    const data = await res.json();
    const allRepairs = data.repairs ?? [];

    const repairs = allRepairs.filter(r => {
      if (r.cap_id) return r.cap_id === capId;
      // Legacy: no cap_id — match by delta_pose_values
      if (!capPose || !r.prompt?.delta_pose_values) return false;
      const p = r.prompt.delta_pose_values;
      return p.x === capPose.x && p.y === capPose.y && p.z === capPose.z
          && p.pitch === capPose.pitch && p.yaw === capPose.yaw && p.roll === capPose.roll;
    });

    if (repairs.length === 0) {
      grid.innerHTML = '<div class="captures-empty">No previous repairs for this capture.</div>';
      return;
    }
    grid.innerHTML = '';
    for (const repair of repairs) {
      const card = document.createElement('div');
      card.className = 'capture-card';
      const imgUrl = repair.output
        ? `/shots/${repair.session_id}/repairs/${repair.repair_id}/output/repaired.png`
        : null;
      const dt = new Date(repair.created_at);
      const dateStr = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        + ' ' + dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      card.innerHTML = `
        <img src="${imgUrl ?? ''}" alt="${repair.repair_id}"
          style="cursor:${imgUrl ? 'zoom-in' : 'default'};${!imgUrl ? 'opacity:0.3;' : ''}" />
        <div class="capture-card-label">
          <span>${dateStr}</span>
          <span class="result-status result-status--${repair.status}" style="font-size:9px;text-transform:uppercase;">${repair.status}</span>
        </div>
      `;
      if (imgUrl) {
        card.querySelector('img').onclick = (e) => { e.stopPropagation(); openLightbox(imgUrl); };
      }
      grid.appendChild(card);
    }
  } catch {
    grid.innerHTML = '<div class="captures-empty">Failed to load previous repairs.</div>';
  }
}

async function updatePromptPreview() {
  const panel = document.getElementById('promptPreview');
  if (selected.size === 0) {
    panel.style.display = 'none';
    return;
  }
  const capId = lastSelectedCapId && selected.has(lastSelectedCapId)
    ? lastSelectedCapId
    : [...selected][selected.size - 1];
  const cap = captures.find(c => c.capId === capId);
  if (!cap) { panel.style.display = 'none'; return; }
  try {
    const deltaPoseText = await cap.deltaPoseFile.text();
    const pose = JSON.parse(deltaPoseText);
    const fmt = v => (typeof v === 'number' ? v.toFixed(4) : v);
    const poseStr = `${fmt(pose.x)},${fmt(pose.y)},${fmt(pose.z)},${fmt(pose.pitch)},${fmt(pose.yaw)},${fmt(pose.roll)}`;
    let prompt = `Referring to the scene in image 1, restore the perspective of the scene in image 2. Repair missing regions and perspective artifacts. The camera has moved by: ${poseStr}`;
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
  if (isRunning || selected.size === 0) return;
  isRunning = true;
  updateRunButton();

  const panel = document.getElementById('resultsPanel');
  const list = document.getElementById('resultsList');
  panel.style.display = '';

  const notes = document.getElementById('notesField').value.trim();
  const source = sessionData.sources.find(s => s.id === activeSourceId);
  if (!source) { log('No active source.'); isRunning = false; updateRunButton(); return; }

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

  const selectedCaptures = captures.filter(c => selected.has(c.capId));

  for (const cap of selectedCaptures) {
    const repairId = `repair_${Date.now()}`;
    const cardId = `result-${cap.capId}-${repairId}`;

    // Add result card as running
    const card = document.createElement('div');
    card.className = 'result-card';
    card.id = cardId;
    card.innerHTML = `
      <div class="result-images">
        <img src="${cap.targetUrl}" alt="target" />
        <img src="" alt="repaired" style="display:none" />
      </div>
      <div class="result-info">
        <span class="result-cap-id">${cap.capId}</span>
        <span class="result-status result-status--running">Running</span>
        <span class="result-meta">${repairId}</span>
      </div>
    `;
    list.prepend(card);

    try {
      const cameraText = await cap.cameraFile.text();
      const deltaPoseText = await cap.deltaPoseFile.text();

      const fd = new FormData();
      fd.append('session_id', sessionData.session_id);
      fd.append('repair_id', repairId);
      fd.append('cap_id', cap.capId);
      fd.append('paid_confirm', 'true');
      fd.append('reference', referenceFile, source.filename);
      fd.append('target', cap.targetFile, 'target.png');
      fd.append('delta_pose', new Blob([deltaPoseText], { type: 'application/json' }), 'delta_pose.json');
      fd.append('camera', new Blob([cameraText], { type: 'application/json' }), 'camera.json');
      if (notes) {
        fd.append('notes', new Blob([notes], { type: 'text/plain' }), 'notes.txt');
      }

      const res = await fetch('/api/repair', { method: 'POST', body: fd });

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          detail = errJson.detail || errJson.error || detail;
        } catch { /* ignore */ }
        throw new Error(detail);
      }

      const blob = await res.blob();
      const repairedUrl = URL.createObjectURL(blob);

      // Update card to succeeded
      const statusEl = card.querySelector('.result-status');
      statusEl.className = 'result-status result-status--succeeded';
      statusEl.textContent = 'Succeeded';
      const [targetImg, repairedImg] = card.querySelectorAll('.result-images img');
      targetImg.style.cursor = 'zoom-in';
      targetImg.onclick = (e) => { e.stopPropagation(); openLightbox(cap.targetUrl); };
      repairedImg.src = repairedUrl;
      repairedImg.style.display = '';
      repairedImg.style.cursor = 'zoom-in';
      repairedImg.onclick = (e) => { e.stopPropagation(); openLightbox(repairedUrl); };
      const meta = card.querySelector('.result-meta');
      const sizeMb = (blob.size / 1024 / 1024).toFixed(2);
      const folderPath = `${sessionData.session_id}/repairs/${repairId}/output`;
      meta.innerHTML = `${repairId} — ${sizeMb} MB &nbsp;<button class="icon-btn" style="font-size:11px;padding:2px 6px;" data-open-folder="${folderPath}" title="Open in Finder"><i class="ph ph-folder-open" aria-hidden="true"></i></button>`;

      log(`${cap.capId} repaired successfully.`);
    } catch (err) {
      // Update card to failed
      const statusEl = card.querySelector('.result-status');
      statusEl.className = 'result-status result-status--failed';
      statusEl.textContent = 'Failed';
      const errorEl = document.createElement('span');
      errorEl.className = 'result-error';
      errorEl.textContent = String(err.message || err);
      card.querySelector('.result-info').appendChild(errorEl);

      log({ error: `${cap.capId} failed: ${err.message || err}` });
    }
  }

  isRunning = false;
  updateRunButton();
  log('Repair batch complete.');
}

// ── Folder picking ──────────────────────────────────────────

async function pickFolder() {
  if (!window.showDirectoryPicker) {
    log('File System Access API is not available in this browser.');
    return;
  }
  try {
    const dirHandle = await window.showDirectoryPicker();
    const existing = await readSessionFile(dirHandle);
    if (!existing) {
      log('No istanbul3d_session.json found in this folder. Pick a session folder created by the Viewer.');
      return;
    }
    sessionDirHandle = dirHandle;
    sessionData = existing;
    activeSourceId = null;
    activateSession();
  } catch (err) {
    if (err.name !== 'AbortError') log({ error: String(err) });
  }
}

function activateSession() {
  document.getElementById('sessionDisplay').textContent = sessionData.session_id;
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

document.getElementById('pickDirBtn').onclick = pickFolder;
document.getElementById('switchDirBtn').onclick = pickFolder;

document.getElementById('sourceSelect').onchange = () => {
  const val = document.getElementById('sourceSelect').value;
  activeSourceId = val || null;
  loadSourceThumbnail(activeSourceId);
  enumerateCaptures(activeSourceId);
};

document.getElementById('selectAllBtn').onclick = () => {
  if (isRunning) return;
  captures.forEach(c => selected.add(c.capId));
  renderCapturesGrid();
};

document.getElementById('clearSelBtn').onclick = () => {
  if (isRunning) return;
  selected.clear();
  renderCapturesGrid();
};

document.getElementById('paidConfirm').onchange = updateRunButton;
document.getElementById('runRepairBtn').onclick = runRepairs;
document.getElementById('notesField').oninput = updatePromptPreview;

document.getElementById('lightboxOverlay').onclick = (e) => {
  if (e.target === e.currentTarget) closeLightbox();
};
document.getElementById('lightboxClose').onclick = closeLightbox;

document.getElementById('resultsList').onclick = async (event) => {
  const btn = event.target.closest('[data-open-folder]');
  if (!btn) return;
  const relPath = btn.getAttribute('data-open-folder');
  try {
    await fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rel_path: relPath })
    });
  } catch (err) {
    log({ error: `Failed to open folder: ${err}` });
  }
};

// Start in pick state
setUIState('pick');
