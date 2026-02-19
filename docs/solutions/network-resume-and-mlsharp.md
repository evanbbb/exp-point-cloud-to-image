# Network Resume Runbook (Including ml-sharp)

## What Is Already Done

### Implemented code
- TypeScript workspace scaffold with apps + shared schemas.
- Local server with:
  - `POST /api/generate` (real ml-sharp mode + mock mode)
  - `GET /api/generate/:jobId`
  - `POST /api/repair` (single-item, paid-confirm required, fal staging via `fal.storage.upload`)
- Viewer shell with:
  - session folder selection
  - reference image initialization (`source/reference.png`)
  - lens preset + dolly controls
  - capture export (`target.png`, `camera.json`, `delta_pose.json`)
- Repair shell placeholder page.
- Tests and typecheck passing.

### Current validation state
- `npm run typecheck` passes.
- `npm test` passes.

### Download/install state
- SHARP checkpoint: **complete** at `assets/models/sharp_2572gikvuh.pt` (2.6GB)
- ml-sharp repo: cloned at `vendor/ml-sharp/`
- Python venv: `.venv-mlsharp-311/` (Python 3.11 + torch 2.2.2 + gsplat 1.5.3)
- `sharp --help` verified working

### Generation mode
- Set `GENERATION_MODE=mlsharp` (any value other than `mock`) to run real `sharp predict`.
- Default remains `mock` for development without the checkpoint loaded.
- Config keys: `mlSharpBin` (`.venv-mlsharp-311/bin/sharp`), `mlSharpCheckpointPath` (`assets/models/sharp_2572gikvuh.pt`).
- Override via env: `ML_SHARP_BIN`, `ML_SHARP_CHECKPOINT`.

## Resume Checklist (When Back on Better Network)

## 1. Sync and verify repo state
```bash
cd /Users/evanboehm/code/istanbul3d
git status
npm install
npm run typecheck
npm test
```

## 2. Finish downloading SHARP checkpoint (resumable)
```bash
mkdir -p assets/models
cd assets/models
curl -L --continue-at - -o sharp_2572gikvuh.pt \
  https://ml-site.cdn-apple.com/models/sharp/sharp_2572gikvuh.pt
ls -lh sharp_2572gikvuh.pt
```

Expected final size is about 2.8GB.

## 3. Install ml-sharp environment (prep)
Use upstream instructions from:
- `https://github.com/apple/ml-sharp`

Recommended safe pattern:
```bash
cd /Users/evanboehm/code/istanbul3d
python3 -m venv .venv-mlsharp
source .venv-mlsharp/bin/activate
python -m pip install --upgrade pip
```

If network is still unreliable, install cached wheels first:
```bash
python -m pip install --no-index --find-links .cache/pip-wheels numpy pillow tqdm requests
```

Then install remaining `ml-sharp` requirements per upstream README.

## 4. Add runtime env for server
Create `.env` (or export vars in shell):
```bash
export FAL_KEY="<your_fal_key>"
export GENERATION_MODE="mock"
```

Keep `GENERATION_MODE=mock` until real `ml-sharp` worker is implemented.

## 5. Run server and open local links
```bash
cd /Users/evanboehm/code/istanbul3d
npm run build
node dist/apps/server/src/index.js
```

Open:
- `http://localhost:8787/viewer`
- `http://localhost:8787/repair`
- `http://localhost:8787/api/health`

## 6. Quick smoke test
1. In Viewer, pick a session folder.
2. Initialize `reference.png`.
3. Start generation and poll until completed.
4. Capture one view.
5. Confirm files exist under:
   - `source/captures/cap_####/target.png`
   - `source/captures/cap_####/camera.json`
   - `source/captures/cap_####/delta_pose.json`

## 7. Next implementation step (after network)
To actually use `ml-sharp` during generation, implement in server:
- Replace mock generation internals in `apps/server/src/lib/generation-service.ts`
- Keep API contract unchanged (`POST/GET /api/generate`)
- Write real manifest to `shots/<SESSION_ID>/source/scene/manifest.json`

## Troubleshooting
- If `npm install` fails: retry on stable network and rerun `npm install`.
- If model download stalls: rerun the same `curl --continue-at -` command.
- If `FAL_KEY` issues occur: validate with `GET /api/health` and first repair call.
