# Platform Support

This document makes runtime assumptions explicit and lists required overrides for other platforms.

## Current validated baseline

- OS: macOS
- CPU: Intel (non-Apple Silicon)
- Generation backend: `ml-sharp` via local executable
- Default server config source: `apps/server/src/lib/config.ts`

## Runtime knobs you may need to override

- `ML_SHARP_BIN`
  - Path to the `sharp` executable used by generation.
  - Default in code: `<repo>/.venv-mlsharp-311/bin/sharp` (POSIX path).
- `ML_SHARP_DEVICE`
  - Compute device passed to `ml-sharp` (`cpu` by default).

## Apple Silicon (M1/M2/M3) updates

If you run on Apple Silicon, update:

1. `X = ML_SHARP_BIN`
   - Point to an Apple Silicon-compatible `sharp` executable in your local venv.
   - Typical path:
     - `<repo>/.venv-mlsharp-311/bin/sharp`
2. `ML_SHARP_DEVICE`
   - Try `mps` if your `ml-sharp`/PyTorch stack supports it.
   - Fall back to `cpu` if `mps` is unavailable or unstable.

Recommended checks:

- Ensure Python/venv architecture matches Apple Silicon (avoid mixed Rosetta/native environments).
- Start server and verify generation completes without device/runtime errors.

## Windows updates

If you run on Windows, update:

1. `Y = ML_SHARP_BIN`
   - Point to the Windows venv executable.
   - Typical paths:
     - `<repo>\\.venv-mlsharp-311\\Scripts\\sharp.exe`
     - `<repo>\\.venv-mlsharp-311\\Scripts\\sharp.bat`
2. `ML_SHARP_DEVICE`
   - Use `cpu` unless you have a confirmed compatible accelerator setup.

Recommended checks:

- Verify the configured executable exists and is runnable from the server process.
- Start server and run one generation to confirm end-to-end output persistence.

## Example env settings

macOS Intel (current baseline):

```bash
ML_SHARP_BIN=/absolute/path/to/repo/.venv-mlsharp-311/bin/sharp
ML_SHARP_DEVICE=cpu
```

Apple Silicon:

```bash
ML_SHARP_BIN=/absolute/path/to/repo/.venv-mlsharp-311/bin/sharp
ML_SHARP_DEVICE=mps
```

Windows (PowerShell):

```powershell
$env:ML_SHARP_BIN="C:\\absolute\\path\\to\\repo\\.venv-mlsharp-311\\Scripts\\sharp.exe"
$env:ML_SHARP_DEVICE="cpu"
```
