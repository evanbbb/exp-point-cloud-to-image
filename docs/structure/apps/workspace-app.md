# Workspace App (`/workspace`)

Workspace setup gate used before Viewer and Repair.

## Purpose

- Let the user choose a working folder on their machine.
- Persist a folder handle reference in IndexedDB for later Viewer/Repair access.
- Provide a single entry point for changing or clearing the selected folder.

## Key files

- `apps/workspace/index.html`
- `apps/shared/workspace-handle.js`

## Behavior

- Displays folder connection status.
- `Select Working Folder` opens `showDirectoryPicker()` and requests read/write permission.
- Saves handle in IndexedDB:
  - DB: `istanbul3d-working-folder`
  - store: `state`
  - key: `session_dir_handle`
- `Clear Saved Folder` removes stored handle.
- Enables `Open Viewer` and `Open Repair` only when handle exists and permission is granted.

## Navigation

- Supports optional `next` query parameter.
- Allowed values: `/viewer`, `/repair`.
- After successful selection, auto-navigates to `next` when present.

## Relationship to Viewer/Repair

- Viewer and Repair import the same shared handle utilities and enforce this gate.
- If handle is missing/invalid, they redirect back to workspace.
