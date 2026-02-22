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

Ask your AI to look at PROJECT.md

Open: `http://localhost:8787`

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
