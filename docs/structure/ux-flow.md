# UX Flow

Current implemented user flow across Workspace, Viewer, Repair, Settings, and the local server.

## End-to-end map

1. User opens `/`.
2. Server redirects to `/workspace`.
3. User selects a working folder with File System Access API (`showDirectoryPicker`).
4. Folder handle is saved in IndexedDB (`istanbul3d-working-folder`, key `session_dir_handle`).
5. User opens `/viewer` or `/repair`.
6. Viewer/Repair load the saved handle and request read/write permission.
7. If handle is missing or permission denied, Viewer/Repair redirect back to `/workspace?next=...`.

## Workspace flow (`/workspace`)

- Primary action: `Select Working Folder`.
- Secondary action: `Clear Saved Folder`.
- Continue actions become enabled only when a valid folder handle is available:
  - `Open Viewer`
  - `Open Repair`
  - `Open Settings`
- If `next` query param is valid (`/viewer` or `/repair`), workspace auto-navigates there after a successful selection.

## Viewer flow (`/viewer`)

1. Load working folder handle from IndexedDB.
2. Load `istanbul3d_session.json` from the selected folder, or initialize one if missing.
3. Source workflow:
   - Select an existing source (`src_####`) or upload a new image.
   - New uploads are copied to `source/src_####/<filename>`.
4. Generation workflow:
   - Upload reference via `POST /api/generate/sync-reference`.
   - Start job via `POST /api/generate` using returned `memory://...` reference path.
   - Poll status via `GET /api/generate/:jobId`.
   - On completion, copy generation artifacts to disk in local source folder:
     - `source/src_####/generations/gen_<jobId>/scene_manifest.json`
     - `source/src_####/generations/gen_<jobId>/scene.ply`
   - Load output from local generation files.
5. Camera/capture workflow:
   - Set original shot view.
   - Capture new view writes local files to `source/src_####/captures/cap_####/`.
   - Capture writes only to the working folder; no server capture sync route is used.

## Repair flow (`/repair`)

1. Load working folder handle and session file.
2. Choose source from session sources.
3. Enumerate local captures from `source/src_####/captures/`.
4. Select capture, optionally add notes, confirm paid usage, choose run count.
5. For each run, call `POST /api/repair` with:
   - reference image
   - target capture image
   - delta pose JSON
   - camera JSON
   - prompt text
6. Persist each repair run to disk in local source folder:
   - `source/src_####/repairs/repair_<id>/repair_meta.json`
   - `source/src_####/repairs/repair_<id>/repaired.png` (success only)
7. Previous repairs panel reads history from local `repairs/` folders.
8. Previous repair export action downloads one ZIP per repair (`<repair_id>_files.zip`) to the browser's download location, containing:
   - `repair_meta.json`
   - `repaired.png` when available (successful runs)

## Settings flow (`/settings`)

- Read settings status via `GET /api/settings`.
- Save FAL key via `POST /api/settings`.
- Settings persist to `settings.json` at repository root.

## Persistence boundaries

- Browser-persistent:
  - Working folder content (user-selected path)
  - IndexedDB folder handle reference
- Server-persistent:
  - `settings.json` only
- Server-transient (in-memory):
  - Generation jobs, generated assets, uploaded generation references
  - Repair metadata and repair image payloads for immediate request/response lifecycle

Retention expectations:

- Server-transient data is lost when the server restarts.
- Persisted viewer/repair history remains in the selected working folder across server restarts.
- Some server data may disappear during runtime due to eviction limits:
  - generation references and assets use TTL + max-count limits
  - generation jobs and repair history use per-session max-count limits
