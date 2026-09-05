#!/bin/bash

set -euo pipefail

FAIRJUPYTER_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$FAIRJUPYTER_DIR/../.." && pwd)

if [ -n "${PYTHON_BIN:-}" ]; then
    :
elif [ -x "$FAIRJUPYTER_DIR/.venv/bin/python" ]; then
    PYTHON_BIN="$FAIRJUPYTER_DIR/.venv/bin/python"
elif [ -x "$FAIRJUPYTER_DIR/.venv/Scripts/python.exe" ]; then
    PYTHON_BIN="$FAIRJUPYTER_DIR/.venv/Scripts/python.exe"
else
    PYTHON_BIN="python3"
fi

"$PYTHON_BIN" "$FAIRJUPYTER_DIR/build_pipeline_kg.py" \
    --db-file "$PROJECT_ROOT/output/db/db.sqlite" \
    --output-dir "$PROJECT_ROOT/output/kg" \
    "$@"