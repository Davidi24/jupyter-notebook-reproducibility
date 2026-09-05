#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT

source "$PROJECT_ROOT/config/config.sh"

OUTPUT_DIR="$TEST_DIR/output"
REPOS_DIR="$OUTPUT_DIR/cloned_repos"
COMP_DIR="$OUTPUT_DIR/comparisons"
LOG_DIR="$OUTPUT_DIR/logs"
OUTPUT_DB_DIR="$OUTPUT_DIR/db"
OUTPUT_DB_FILE="$OUTPUT_DB_DIR/test.sqlite"
DB_FILE="$OUTPUT_DB_FILE"
LOG_FILE=""
CLASSIFICATION_ENABLED=true
CLASSIFICATION_RULE_ONLY=true

export OUTPUT_DIR REPOS_DIR COMP_DIR LOG_DIR OUTPUT_DB_DIR OUTPUT_DB_FILE DB_FILE
export LOG_FILE CLASSIFICATION_ENABLED CLASSIFICATION_RULE_ONLY

source "$PROJECT_ROOT/src/logging.sh"
source "$PROJECT_ROOT/src/checks.sh"
source "$PROJECT_ROOT/src/db.sh"
source "$PROJECT_ROOT/src/pyenv.sh"
source "$PROJECT_ROOT/src/requirements.sh"
source "$PROJECT_ROOT/src/notebooks.sh"
source "$PROJECT_ROOT/src/classification.sh"
source "$PROJECT_ROOT/src/repo.sh"

initialize_directories
ensure_pipeline_tables

TEST_REPO="https://github.com/theislab/scanpy-tutorials"
TEST_NOTEBOOKS="tutorials/basics/clustering-2017.ipynb"

REPO_ID=$(get_or_create_repo_id "$TEST_REPO")
export REPO_ID
process_repo "$TEST_REPO" "$TEST_NOTEBOOKS" "" ""

RUN_COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM repository_runs;")
echo "[TEST] Run records: $RUN_COUNT"

if [ "$RUN_COUNT" -gt 0 ]; then
    echo "[TEST] PASSED"
else
    echo "[TEST] FAILED"; exit 1
fi
