export function createGenerationController({
  getSessionData,
  writeSessionFile,
  log,
  readJsonResponse,
  isCompletedStatus,
  sceneController
}) {
  let autoPollTimer = null;

  function upsertLocalJob(partialJob, fallback = {}) {
    const sessionData = getSessionData();
    if (!partialJob?.job_id || !sessionData) return null;
    const existing = sessionData.jobs.find(j => j.job_id === partialJob.job_id);
    if (existing) {
      Object.assign(existing, fallback, partialJob);
      return existing;
    }
    const created = { ...fallback, ...partialJob };
    sessionData.jobs.push(created);
    return created;
  }

  function renderJobList() {
    const sessionData = getSessionData();
    const el = document.getElementById('jobList');
    if (!el || !sessionData) return;
    if (!sessionData.jobs.length) {
      el.innerHTML = '<span class="typography-caption">No generation jobs yet.</span>';
      return;
    }
    const loadedId = sceneController.getLoadedGeneratedJobId();
    el.innerHTML = [...sessionData.jobs].reverse().map(j =>
      `<div class="job-row${loadedId === j.job_id ? ' is-loaded' : ''}">
        <span>${j.job_id}</span>
        <span class="job-status job-status--${j.status}">${j.status}</span>
        <span class="typography-caption">${typeof j.progress_percent === 'number' ? `${j.progress_percent}%` : ''}</span>
        <span class="typography-caption">${j.stage || ''}</span>
        <span class="typography-caption">${j.started_at ? new Date(j.started_at).toLocaleTimeString() : ''}</span>
        ${loadedId === j.job_id ? '<span class="job-loaded-tag">Loaded</span>' : ''}
        ${isCompletedStatus(j.status)
          ? `<button class="icon-btn load-job-btn" data-job-id="${j.job_id}" title="Load output">Load Output</button>`
          : ''}
        ${j.status === 'queued' || j.status === 'running'
          ? `<button class="icon-btn cancel-job-btn" data-job-id="${j.job_id}" title="Cancel job"><i class="ph ph-x" aria-hidden="true"></i></button>`
          : ''}
      </div>`
    ).join('');
  }

  function stopAutoPoll() {
    if (autoPollTimer) {
      clearInterval(autoPollTimer);
      autoPollTimer = null;
    }
  }

  function startAutoPoll() {
    stopAutoPoll();
    autoPollTimer = setInterval(async () => {
      try {
        const data = await pollLatestJob({ quietIfNone: true });
        if (!data) {
          stopAutoPoll();
          return;
        }
        if (data.status === 'completed' || data.status === 'failed') {
          stopAutoPoll();
          log(data);
        }
      } catch (err) {
        stopAutoPoll();
        log({ error: String(err) });
      }
    }, 1000);
  }

  async function pollLatestJob({ quietIfNone = false } = {}) {
    const sessionData = getSessionData();
    const activeJob = [...(sessionData?.jobs || [])].reverse()
      .find(j => j.status !== 'complete' && j.status !== 'failed' && j.status !== 'completed');
    if (!activeJob || !sessionData) {
      if (!quietIfNone) log('No active jobs to poll.');
      return null;
    }
    const res = await fetch(
      `/api/generate/${activeJob.job_id}?session_id=${encodeURIComponent(sessionData.session_id)}`
    );
    const data = await readJsonResponse(res, 'Poll generation');
    activeJob.status = data.status || activeJob.status;
    if (typeof data.progress_percent === 'number') activeJob.progress_percent = data.progress_percent;
    if (data.stage) activeJob.stage = data.stage;
    if (data.scene_manifest_path) activeJob.scene_manifest_path = data.scene_manifest_path;
    if (Array.isArray(data.logs_tail)) activeJob.logs_tail = data.logs_tail;
    if (data.error) activeJob.error = data.error;
    activeJob.polled_at = new Date().toISOString();
    await writeSessionFile();
    renderJobList();
    if (Array.isArray(data.logs_tail) && data.logs_tail.length) {
      const tail = data.logs_tail.slice(-20).join('\n');
      log(`[${activeJob.job_id}] ${data.stage || activeJob.stage || ''} ${typeof data.progress_percent === 'number' ? `${data.progress_percent}%` : ''}\n${tail}`);
    }
    if (isCompletedStatus(activeJob.status) && activeJob.scene_manifest_path) {
      try {
        await sceneController.playCompletionSound(activeJob.job_id);
        await loadJobOutput(activeJob.job_id, { quiet: true });
      } catch (err) {
        log({ error: String(err) });
      }
    }
    return data;
  }

  async function loadJobOutput(jobId, { quiet = false } = {}) {
    const sessionData = getSessionData();
    const localJob = (sessionData?.jobs || []).find(j => j.job_id === jobId);
    if (!localJob || !sessionData) {
      if (!quiet) log(`Job ${jobId} not found in current session.`);
      return;
    }
    if (!isCompletedStatus(localJob.status)) {
      if (!quiet) log(`Job ${jobId} is ${localJob.status}; only completed jobs can be loaded.`);
      return;
    }

    if (!localJob.scene_manifest_path) {
      const statusRes = await fetch(
        `/api/generate/${encodeURIComponent(jobId)}?session_id=${encodeURIComponent(sessionData.session_id)}`
      );
      const statusData = await readJsonResponse(statusRes, 'Load job output');
      upsertLocalJob(statusData);
    }

    if (!localJob.scene_manifest_path) {
      throw new Error(`Job ${jobId} has no scene_manifest_path.`);
    }

    if (sceneController.getLoadedGeneratedJobId() === jobId) {
      if (!quiet) log(`[${jobId}] already loaded.`);
      return;
    }

    await sceneController.loadGeneratedSceneFromJob(localJob);
    localJob.loaded_at = new Date().toISOString();
    await writeSessionFile();
    renderJobList();
    if (!quiet) log(`[${jobId}] loaded generated scene in 3D viewport.`);
  }

  return {
    upsertLocalJob,
    renderJobList,
    stopAutoPoll,
    startAutoPoll,
    pollLatestJob,
    loadJobOutput
  };
}
