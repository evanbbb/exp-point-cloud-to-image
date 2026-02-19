# Click-to-Inspect Generation Job Logs

## Summary
Add job-row click behavior in Viewer so you can select any job and inspect its logs. On click, Viewer will fetch the authoritative job record from server and render details in the existing output panel (`#out`). For older jobs without `logs_tail`, show a clear “no logs available” message plus metadata.

## Public API / Interface Changes
- No new endpoints required.
- Reuse existing endpoint:
  - `GET /api/generate/:jobId?session_id=<SESSION_ID>`
- No schema changes required (uses existing optional `logs_tail`).

## Implementation Plan

1. **Viewer: make job rows selectable**
- File: `apps/viewer/index.html`
- Update `renderJobList()` to add click target metadata:
  - Add `data-job-id="<job_id>"` on each `.job-row`.
  - Keep existing cancel button behavior intact.
- Add visual affordance:
  - Cursor pointer on `.job-row`.
  - Optional selected-state class for active row.

2. **Viewer: add dedicated job-detail renderer**
- Add function `renderJobDetailsToOut(job)`:
  - Writes structured details to `#out`:
    - `job_id`, `status`, `stage`, `progress_percent`, timestamps, error code/message.
  - If `logs_tail` exists and has lines:
    - Render full available tail (or bounded display like last 200 lines) as plain text block.
  - If `logs_tail` missing/empty:
    - Show explicit message: “No logs available for this job run.”
- Keep this separate from generic `log(...)` JSON dumping for clarity.

3. **Viewer: click handler for job rows**
- Attach delegated click on `#jobList`:
  - Ignore clicks on `.cancel-job-btn` (existing cancel flow must keep priority).
  - Resolve `jobId` from nearest `.job-row`.
  - Call `GET /api/generate/${jobId}?session_id=...`.
  - Parse via existing `readJsonResponse`.
  - Update matching local `sessionData.jobs` entry with fetched job payload (`status`, `stage`, `progress_percent`, `logs_tail`, `error`, timestamps).
  - Persist with `writeSessionFile()`.
  - Re-render list and call `renderJobDetailsToOut(fetchedJob)`.

4. **Viewer: preserve current auto-poll behavior**
- Auto-poll remains focused on latest active job.
- When selected historical job is clicked, show its details once; do not stop auto-poll.
- If selected job is currently active and later polled updates arrive, refresh details in `#out` only if that job is still selected.

5. **Viewer: selected job state (small state addition)**
- Add `let selectedJobId = null`.
- Set on row click.
- In `renderJobList()`, mark selected row for visual feedback.
- If selected job disappears (rare), clear selection.

6. **Error/empty handling**
- If job fetch returns 404:
  - Show clear message in `#out`: job not found on server.
- If API returns non-JSON/500:
  - Reuse existing `readJsonResponse` error.
- For jobs without logs:
  - Show metadata + explicit “No logs available for this job run.”

## Test Cases and Scenarios

1. **Click completed job with logs**
- Click row.
- Output panel shows metadata + log lines.

2. **Click failed job with error and logs**
- Output panel shows failure metadata + logs + error details.

3. **Click older job without logs_tail**
- Output panel shows metadata and explicit no-logs message.

4. **Click active running job**
- Output panel shows current state.
- As auto-poll updates that same job, details refresh.

5. **Cancel button still works**
- Clicking cancel icon does not trigger row-detail click action.
- Job transitions to `JOB_CANCELLED`.

6. **Server stale/local stale divergence**
- If sessionData has stale info, click fetch updates local state from server and re-renders.

## Assumptions and Defaults
- Chosen UI behavior: reuse existing output panel (no modal/new panel).
- Chosen data source: always fetch job details from server on click.
- Chosen empty behavior: explicit “No logs available for this job run.”
- No backend changes needed unless later you want full historical logs beyond `logs_tail`.
