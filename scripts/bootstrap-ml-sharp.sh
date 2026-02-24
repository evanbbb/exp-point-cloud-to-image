#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ML_SHARP_REPO="${ML_SHARP_REPO:-https://github.com/apple/ml-sharp.git}"
ML_SHARP_DIR="${ML_SHARP_DIR:-vendor/ml-sharp}"
ML_SHARP_REF="${ML_SHARP_REF:-}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
VENV_DIR="${ML_SHARP_VENV:-.venv-mlsharp-311}"
CHECKPOINT_URL="${ML_SHARP_CHECKPOINT_URL:-https://ml-site.cdn-apple.com/models/sharp/sharp_2572gikvuh.pt}"
CHECKPOINT_PATH="${ML_SHARP_CHECKPOINT:-assets/models/sharp_2572gikvuh.pt}"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Missing required Python executable: $PYTHON_BIN" >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required to download ml-sharp." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to download the SHARP checkpoint." >&2
  exit 1
fi

if [ ! -d "$ML_SHARP_DIR" ]; then
  mkdir -p "$(dirname "$ML_SHARP_DIR")"
  git clone "$ML_SHARP_REPO" "$ML_SHARP_DIR"
fi

if [ -n "$ML_SHARP_REF" ]; then
  git -C "$ML_SHARP_DIR" fetch --depth 1 origin "$ML_SHARP_REF"
  git -C "$ML_SHARP_DIR" checkout "$ML_SHARP_REF"
fi

if [ ! -d "$VENV_DIR" ]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

VENV_PYTHON="$VENV_DIR/bin/python"
if [ ! -x "$VENV_PYTHON" ]; then
  echo "Virtualenv python not found at $VENV_PYTHON" >&2
  exit 1
fi

"$VENV_PYTHON" -m pip install --upgrade pip
"$VENV_PYTHON" -m pip install -r requirements.txt

mkdir -p "$(dirname "$CHECKPOINT_PATH")"
if [ ! -f "$CHECKPOINT_PATH" ]; then
  curl -L "$CHECKPOINT_URL" -o "$CHECKPOINT_PATH"
fi

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
fi

echo ""
echo "ml-sharp bootstrap complete."
echo "ML_SHARP_BIN=$REPO_ROOT/$VENV_DIR/bin/sharp"
echo "ML_SHARP_CHECKPOINT=$REPO_ROOT/$CHECKPOINT_PATH"
