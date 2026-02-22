# Folder Structure

This document reflects the current local-first architecture.

## Repository top level

- `apps/workspace/`: workspace setup UI.
- `apps/viewer/`: Part A viewer and generation/capture workflow.
- `apps/repair/`: Part B repair workflow.
- `apps/settings/`: API key settings UI.
- `apps/shared/`: browser-shared modules (for example working-folder handle helpers).
- `apps/server/`: local Express server.
- `shared/schemas/`: shared Zod schemas.
- `docs/structure/`: structure documentation.

## Working folder model

There is no default server storage root.
The user-selected working folder is the only persistent session storage for viewer/repair artifacts.

## Working folder layout

```text
<working-folder>/
  istanbul3d_session.json
  source/
    src_0001/
      <reference-image-filename>
      captures/
        cap_0001/
          target.png
          camera.json
          delta_pose.json
      generations/
        gen_1234abcd/
          scene_manifest.json
          scene.ply
      repairs/
        repair_1234567890_abcd/
          repair_meta.json
          repaired.png
    src_0002/
      ...
```

## Ownership and writes

- Browser writes to working folder:
  - `istanbul3d_session.json`
  - source images
  - capture files (`target.png`, `camera.json`, `delta_pose.json`)
  - generation output files (`scene_manifest.json`, `scene.ply`)
  - repair files (`repair_meta.json`, `repaired.png`)
- Server does not write generation/repair artifacts to the working folder.
- Server generation and repair runtime artifacts are in-memory and temporary.
- Server settings persist to repo-root `settings.json`.

Retention note:

- In-memory server artifacts are ephemeral:
  - lost on server restart
  - subject to TTL/count eviction during runtime
- Long-term history should be read from local working-folder files (`captures`, `generations`, `repairs`), not server in-memory APIs.

## Important git note

If the chosen working folder is inside a git repository, new files in that folder will appear in `git status`.
To keep session artifacts out of a repo, choose a working folder outside the repository tree.
