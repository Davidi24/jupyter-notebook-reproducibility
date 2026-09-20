#!/bin/bash

set -euo pipefail

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FAIRJUPYTER_DIR="$PROJECT_ROOT/kg/fairjupyter"

if [ -x "$FAIRJUPYTER_DIR/.venv/bin/python" ]; then
    PYTHON_BIN="$FAIRJUPYTER_DIR/.venv/bin/python"
elif [ -x "$FAIRJUPYTER_DIR/.venv/Scripts/python.exe" ]; then
    PYTHON_BIN="$FAIRJUPYTER_DIR/.venv/Scripts/python.exe"
else
    PYTHON_BIN="${PYTHON_BIN:-python3}"
fi

"$PYTHON_BIN" "$FAIRJUPYTER_DIR/build_pipeline_kg.py"
"$PYTHON_BIN" "$FAIRJUPYTER_DIR/run_pipeline_sparql_tests.py"

echo "[TEST] Knowledge graph build and SPARQL validation PASSED"
