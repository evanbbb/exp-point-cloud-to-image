# Dependencies

Dependency source-of-truth locations for this project.

## Node/TypeScript dependencies

- Runtime + dev dependencies: `package.json`
- Locked versions: `package-lock.json`
- Install command: `npm install`

## Python / ml-sharp dependencies

- Pinned Python dependencies: `vendor/ml-sharp/requirements.txt`
- Input spec for lock generation: `vendor/ml-sharp/requirements.in`
- `ml-sharp` upstream: `https://github.com/apple/ml-sharp`

## Runtime environment dependencies

- `ML_SHARP_BIN`: path to local `sharp` executable used by generation server.
- `ML_SHARP_DEVICE`: compute device for `ml-sharp` (current default is `cpu`).
- `ML_SHARP_CHECKPOINT`: optional override for model checkpoint path.
- `FAL_KEY`: fal.ai API key (also configurable via `settings.json` through `/settings` UI/API).

## Platform-specific notes

- Current validated baseline: macOS Intel (non-Apple Silicon).
- For Apple Silicon and Windows override guidance, see `docs/structure/platform-support.md`.

## Agent guidance

- Do not duplicate version tables in docs; keep versions in lock/manifests.
- When changing dependency versions, update manifest/lock files first, then update docs only if behavior/setup changed.
- Prefer referencing the files above rather than copying dependency lists into new docs.
