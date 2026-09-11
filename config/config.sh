#!/bin/bash
###############################################################################
# config.sh — Central configuration for the CPRPMC pipeline
###############################################################################
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INPUT_DIR="$PROJECT_ROOT/data/input"
OUTPUT_DIR="$PROJECT_ROOT/data/output"
REPOS_DIR="$OUTPUT_DIR/cloned_repos"
COMP_DIR="$OUTPUT_DIR/comparisons"
LOG_DIR="$OUTPUT_DIR/logs"

# Input DB — Sheeba's original repo list, READ ONLY
DB_DIR="$PROJECT_ROOT/data"
SOURCE_DB_FILE="$DB_DIR/db.sqlite"

# Output DB — created fresh by pipeline, stores all execution results
OUTPUT_DB_DIR="$PROJECT_ROOT/data/output/db"
OUTPUT_DB_FILE="$OUTPUT_DB_DIR/db.sqlite"
DB_FILE="$OUTPUT_DB_FILE"

TARGET_COUNT="${TARGET_COUNT:-10}"

CLASSIFICATION_ENABLED="${CLASSIFICATION_ENABLED:-true}"
CLASSIFICATION_RULE_ONLY="${CLASSIFICATION_RULE_ONLY:-false}"
CLASSIFICATION_MODEL="${CLASSIFICATION_MODEL:-gemma3:4b}"
CLASSIFICATION_OLLAMA_URL="${CLASSIFICATION_OLLAMA_URL:-http://localhost:11434}"
CLASSIFICATION_TIMEOUT="${CLASSIFICATION_TIMEOUT:-600}"
CLASSIFICATION_CONFIDENCE_THRESHOLD="${CLASSIFICATION_CONFIDENCE_THRESHOLD:-0.55}"

export GIT_TERMINAL_PROMPT=0

initialize_directories() {
    mkdir -p "$INPUT_DIR"
    mkdir -p "$REPOS_DIR" "$COMP_DIR" "$LOG_DIR"
    mkdir -p "$OUTPUT_DB_DIR"
    log "[INIT] Initialized directory structure"
}

ensure_working_db() {
    if [ ! -f "$DB_FILE" ]; then
        if [ -f "$SOURCE_DB_FILE" ]; then
            cp "$SOURCE_DB_FILE" "$DB_FILE"
            log "[INIT] Working DB created from $SOURCE_DB_FILE"
        else
            log "[INIT] No source DB found; starting with empty working DB"
        fi
    fi
}

export PROJECT_ROOT INPUT_DIR OUTPUT_DIR REPOS_DIR COMP_DIR LOG_DIR \
       DB_DIR SOURCE_DB_FILE OUTPUT_DB_DIR OUTPUT_DB_FILE DB_FILE TARGET_COUNT \
       CLASSIFICATION_ENABLED CLASSIFICATION_RULE_ONLY CLASSIFICATION_MODEL \
       CLASSIFICATION_OLLAMA_URL CLASSIFICATION_TIMEOUT \
       CLASSIFICATION_CONFIDENCE_THRESHOLD
