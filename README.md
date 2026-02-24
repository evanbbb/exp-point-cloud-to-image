# istanbul3d

Local-first viewer + repair workflow for SHARP generation and FLUX repair.
Release: `v1.0` — `2026-02-22`

## Example Output

Source | Capture | Repair comparison:

![Source, capture, and repair](docs/san%20pedro.png)

## What This Repo Does

- Select a local working folder in `/workspace`
- Generate 3D scene outputs in `/viewer`
- Capture camera views and run repair in `/repair`
- Persist artifacts on disk in the selected working folder

## Quick Start

Prerequisites:

- Node.js 20+
- npm 10+
- Python 3.11+ (for ml-sharp generation backend)
- `git` and `curl`
- Chromium-based browser (Chrome, Edge, Arc) for File System Access API support

From a clean clone:

```bash
npm install
cp .env.example .env
npm run bootstrap:ml-sharp
npm run dev
```

Open: `http://localhost:8787`

What bootstrap does:

- Clones `apple/ml-sharp` into `vendor/ml-sharp` (if missing)
- Creates `.venv-mlsharp-311`
- Installs Python dependencies from root `requirements.txt` (including ml-sharp)
- Downloads `assets/models/sharp_2572gikvuh.pt`

Notes:

- `/repair` requires `FAL_KEY` (set in `.env` or in the `/settings` page).
- If ml-sharp runtime is not prepared yet, the app still starts, but generation APIs return `ML_SHARP_RUNTIME_NOT_READY`.
- If your browser does not support `showDirectoryPicker`, `/workspace` cannot connect to a local folder.

## Storage Model

- No default server storage root
- Durable generation/repair artifacts are written to the selected working folder
- Server runtime jobs/assets are transient in memory

See:
- `docs/structure/ux-flow.md`
- `docs/structure/folder-structure.md`
- `docs/structure/server/local-server.md`

## Platform Notes

Current validated baseline: macOS Intel (non-Apple Silicon).

For Apple Silicon + Windows guidance:
- `docs/structure/platform-support.md`

## References

- ml-sharp: https://github.com/apple/ml-sharp
- FLUX repair LoRA: https://huggingface.co/cyrildiagne/flux2-klein9b-lora-mlsharp-3d-repair
