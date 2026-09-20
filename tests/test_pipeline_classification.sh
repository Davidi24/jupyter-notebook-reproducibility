#!/bin/bash

set -euo pipefail

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT

DB_FILE="$TEST_DIR/classification-test.sqlite"
REPOSITORY_DIR="$TEST_DIR/repository"
NOTEBOOK_PATH="notebooks/visualization.ipynb"
NOTEBOOK_FILE="$REPOSITORY_DIR/$NOTEBOOK_PATH"
LOG_FILE=""

CLASSIFICATION_ENABLED=true
CLASSIFICATION_RULE_ONLY=true
CLASSIFICATION_MODEL="gemma3:4b"
CLASSIFICATION_OLLAMA_URL="http://localhost:11434"
CLASSIFICATION_TIMEOUT=10
CLASSIFICATION_CONFIDENCE_THRESHOLD=0.55

export PROJECT_ROOT DB_FILE LOG_FILE
export CLASSIFICATION_ENABLED CLASSIFICATION_RULE_ONLY
export CLASSIFICATION_MODEL CLASSIFICATION_OLLAMA_URL
export CLASSIFICATION_TIMEOUT CLASSIFICATION_CONFIDENCE_THRESHOLD
export PYTHONPATH="$PROJECT_ROOT"

source "$PROJECT_ROOT/src/logging.sh"
source "$PROJECT_ROOT/src/db.sh"
source "$PROJECT_ROOT/src/classification.sh"
source "$PROJECT_ROOT/src/repo.sh"

mkdir -p "$(dirname "$NOTEBOOK_FILE")"
ensure_pipeline_tables

python3 - "$NOTEBOOK_FILE" <<'PY'
import json
import sys
from pathlib import Path

notebook = {
    "cells": [
        {
            "cell_type": "markdown",
            "metadata": {},
            "source": ["# Data visualization example"]
        },
        {
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "outputs": [],
            "source": [
                "import matplotlib.pyplot as plt\n",
                "plt.plot([1, 2, 3], [2, 4, 6])"
            ]
        }
    ],
    "metadata": {
        "kernelspec": {
            "display_name": "Python 3",
            "language": "python",
            "name": "python3"
        }
    },
    "nbformat": 4,
    "nbformat_minor": 5
}

Path(sys.argv[1]).write_text(
    json.dumps(notebook),
    encoding="utf-8"
)
PY

sqlite3 "$DB_FILE" <<SQL
INSERT INTO repositories (
    repository,
    platform,
    notebooks_count,
    setups_count,
    requirements_count
)
VALUES ('example/classification-test', 'github', 1, 0, 0);

INSERT INTO notebooks (
    repository_id,
    name,
    language
)
VALUES (
    (SELECT id FROM repositories
     WHERE repository='example/classification-test'
       AND platform='github'),
    '$NOTEBOOK_PATH',
    'python'
);
SQL

REPOSITORY_ID=$(sqlite3 "$DB_FILE" \
    "SELECT id FROM repositories
     WHERE repository='example/classification-test'
       AND platform='github';")

NOTEBOOK_ID=$(get_notebook_id_from_db \
    "$REPOSITORY_ID" \
    "$NOTEBOOK_PATH")

classify_repository_notebooks \
    "$REPOSITORY_ID" \
    "$REPOSITORY_DIR" \
    "$NOTEBOOK_PATH"

SAVED_RESULT=$(sqlite3 -separator '|' "$DB_FILE" \
    "SELECT notebook_id,
            rule_category,
            agreement_status,
            needs_human_review,
            provisional_category
     FROM notebook_classifications
     WHERE notebook_id=$NOTEBOOK_ID;")

EXPECTED_RESULT="$NOTEBOOK_ID|visualization|LLM_NOT_REQUESTED|1|visualization"

if [ "$SAVED_RESULT" != "$EXPECTED_RESULT" ]; then
    echo "[TEST] FAILED: unexpected classification row"
    echo "[TEST] Expected: $EXPECTED_RESULT"
    echo "[TEST] Received: $SAVED_RESULT"
    exit 1
fi

echo "[TEST] Automatic pipeline classification PASSED"