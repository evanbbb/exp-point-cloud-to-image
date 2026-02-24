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
- Anaconda3
- Python 3.13 (for ml-sharp generation backend)
- Chromium-based browser (Chrome, Edge, Arc) for File System Access API support

From a clean clone:


```bash
git submodule update --init --recursive
cd vendor/ml-sharp
```
Then follow the instructions in [ml-sharp's README](https://github.com/apple/ml-sharp) to prepare the runtime.
```bash
conda create -n sharp python=3.13
pip install -r requirements.txt
sharp --help
```
At this point, you should see the help screen for ml-sharp. Then go back up to the root and run the web app. The npm install will install dependencies and automatically download the ml-sharp checkpoint to assets/models.

```bash
cd ../..
npm install
cp .env.example .env
npm run dev
```

Open: `http://localhost:8787`

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

## References

- ml-sharp: https://github.com/apple/ml-sharp
- FLUX repair LoRA: https://huggingface.co/cyrildiagne/flux2-klein9b-lora-mlsharp-3d-repair
