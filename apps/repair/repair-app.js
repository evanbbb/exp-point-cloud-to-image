const SESSION_FILE = 'istanbul3d_session.json';

let sessionDirHandle = null;
let sessionData = null;
let activeSourceId = null;
let captures = [];        // [{ capId, targetFile, targetUrl, cameraFile, deltaPoseFile }]
let sourceThumbUrl = null;
let selectedCapId = null;
let isRunning = false;
let prevRepairsGeneration = 0;

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

async function updatePreviousRepairs() {
  const gen = ++prevRepairsGeneration;
  const panel = document.getElementById('previousRepairs');
  if (!selectedCapId) { panel.style.display = 'none'; return; }
  const capId = selectedCapId;
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
    if (gen !== prevRepairsGeneration) return;

    const bucketParam = sessionData.session_bucket
      ? `&session_bucket=${encodeURIComponent(sessionData.session_bucket)}`
      : '';
    const res = await fetch(`/api/repairs/list?session_id=${encodeURIComponent(sessionData.session_id)}${bucketParam}`);
    const data = await res.json();
    if (gen !== prevRepairsGeneration) return;
    const allRepairs = data.repairs ?? [];

    const repairs = allRepairs.filter(r => {
      if (activeSourceId && r.source_id !== activeSourceId) return false;
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
      const base = sessionData.session_bucket || repair.session_id;
      const imgUrl = repair.output
        ? `/shots/${base}/repairs/${repair.repair_id}/output/repaired.png`
        : null;
      const dt = new Date(repair.created_at);
      const dateStr = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        + ' ' + dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const failedLabel = repair.status === 'failed'
        ? `<span class="result-status result-status--failed" style="font-size:9px;text-transform:uppercase;">Failed</span>`
        : '';
      card.innerHTML = `
        <img src="${imgUrl ?? ''}" alt="${repair.repair_id}"
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
      const folderBtn = document.createElement('button');
      folderBtn.className = 'icon-btn compare-trigger';
      folderBtn.title = 'Open in Finder';
      folderBtn.innerHTML = '<i class="ph ph-folder-open"></i>';
      folderBtn.onclick = async (e) => {
        e.stopPropagation();
        const relPath = `${base}/repairs/${repair.repair_id}/output`;
        try {
          await fetch('/api/open-folder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rel_path: relPath }) });
        } catch (err) { log({ error: `Failed to open folder: ${err}` }); }
      };
      actionsEl.appendChild(folderBtn);
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
    let prompt = `Referring to the scene in image 1, restore the perspective of the scene in image 2. Repair the perspective and missing areas. The camera has moved by: ${poseStr}`;
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
    const repairId = `repair_${Date.now()}`;

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

    try {
      const cameraText = await cap.cameraFile.text();
      const deltaPoseText = await cap.deltaPoseFile.text();

      const fd = new FormData();
      fd.append('session_id', sessionData.session_id);
      fd.append('session_bucket', sessionData.session_bucket || '');
      fd.append('repair_id', repairId);
      fd.append('source_id', activeSourceId);
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

      await res.blob(); // consume body

      log(`${cap.capId} run ${i + 1} complete.`);

      // Move card out of Jobs and into Previous Repairs
      card.remove();
      if (!list.hasChildNodes()) {
        panel.style.display = 'none';
      }
      await updatePreviousRepairs();
    } catch (err) {
      // Update card to failed
      const statusEl = card.querySelector('.result-status');
      statusEl.className = 'result-status result-status--failed';
      statusEl.textContent = 'Failed';
      const errorEl = document.createElement('span');
      errorEl.className = 'result-error';
      errorEl.textContent = String(err.message || err);
      card.querySelector('.result-info').appendChild(errorEl);

      log({ error: `${cap.capId} run ${i + 1} failed: ${err.message || err}` });
    }
  }

  isRunning = false;
  updateRunButton();
  log('Done.');
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

document.getElementById('pickDirBtn').onclick = pickFolder;
document.getElementById('switchDirBtn').onclick = pickFolder;

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
