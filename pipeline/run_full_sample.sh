#!/bin/bash
###############################################################################
# run_full_sample.sh
#
# Drives the REAL pipeline (the same functions run.sh's own "single repo"
# mode uses) over every repo in the 252-entry evaluation sample
# (data/evaluation-sample-dataset.csv), instead of one repo at a time by
# hand. Notebook paths are NOT pre-pinned — each repo is cloned once and its
# notebooks are auto-discovered by the pipeline's own process_repo(), exactly
# like choosing option 1 in run.sh's menu and leaving the notebook-paths
# prompt empty.
#
# Put this file in the pipeline/ directory (next to run.sh and main.sh) and
# run it from the repo root:
#
#   bash pipeline/setup_full_run_env.sh    # once, first time (see that file)
#   source ~/pipeline_env.sh               # if setup created it
#   bash pipeline/run_full_sample.sh
#
# It writes into the SAME working database run.sh normally uses
# (output/db/db.sqlite) — a timestamped backup is taken automatically before
# anything is written. Existing rows (e.g. from an earlier pilot or from
# Sheeba's original corpus) are left alone; this only adds/updates rows for
# the 252 sample repos.
#
# Safe to re-run / Ctrl+C and resume: any repo that already has a recorded
# run is skipped. A run can take hours for the full 252 (jupyter/nbconvert +
# per-repo dependencies get installed fresh into an isolated venv for every
# repo, by design), so this is meant to be left running, not watched.
#
# Optional filters (set as environment variables before running):
#   FILTER_PLATFORM=github        # github | codeberg | zenodo
#   FILTER_CATEGORY=simulation    # any of the 7 category names in the CSV
#   LIMIT=10                      # stop after this many repos (0 = no limit)
#   CLASSIFICATION_ENABLED=true   # only if you have a local Ollama server
#                                 # with gemma3:4b running (see config.sh) —
#                                 # defaults to false, matching the pilot run
#
# Example — just the Codeberg simulation repos:
#   FILTER_PLATFORM=codeberg FILTER_CATEGORY=simulation bash pipeline/run_full_sample.sh
#
# ── Running several repos at once (WORKER_COUNT / WORKER_INDEX) ────────────
# To run N copies in parallel, each handling a non-overlapping slice of the
# CSV, start N terminals (or background jobs) with the SAME WORKER_COUNT and
# a different WORKER_INDEX (0-based) in each:
#
#   WORKER_COUNT=4 WORKER_INDEX=0 bash pipeline/run_full_sample.sh &
#   WORKER_COUNT=4 WORKER_INDEX=1 bash pipeline/run_full_sample.sh &
#   WORKER_COUNT=4 WORKER_INDEX=2 bash pipeline/run_full_sample.sh &
#   WORKER_COUNT=4 WORKER_INDEX=3 bash pipeline/run_full_sample.sh &
#   wait
#
# This is safe for the shared database (WAL mode + a busy-timeout retry are
# enabled below instead of failing on "database is locked") and safe for
# shared pyenv Python installs (serialized with a file lock so two workers
# never build the same interpreter at once). Each worker gets its own
# progress file: output/full_run_progress_worker<N>.txt. Pick WORKER_COUNT
# based on your machine — more workers only help until you run out of CPU
# cores / RAM / disk I/O; 3-4 is a reasonable starting point on a laptop.
###############################################################################
set -o pipefail
# NOTE: deliberately NOT using `set -u` (unbound-variable strictness) — the
# pipeline's own main.sh only uses `set -e`, and its sourced files (logging.sh,
# repo.sh, etc.) reference variables like $LOG_FILE without a default,
# assuming that looser mode. Turning -u on here crashed immediately on
# "LOG_FILE: unbound variable" before a single repo could run.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load the PATH/env setup setup_full_run_env.sh wrote (puts ~/bin — where
# sqlite3/jq get extracted to when there's no root to apt-install them — on
# PATH, plus pyenv's shims). Done here, unconditionally, so this script works
# correctly no matter how it's launched (a single run, WORKER_COUNT>1 in the
# background, a fresh terminal that never manually sourced it, etc). Without
# this, "sqlite3"/"jq" silently resolve to nothing and every DB call fails
# with "command not found" — which is exactly what happened when this was
# launched via WORKER_COUNT=... in the background without sourcing it first.
if [ -f "$HOME/pipeline_env.sh" ]; then
    # shellcheck disable=SC1091
    source "$HOME/pipeline_env.sh"
fi

# Load .env (GITHUB_TOKEN / CODEBERG_TOKEN / ZENODO_TOKEN / GITLAB_TOKEN) —
# only Docker Compose does this automatically; running this script directly
# on the host does not, so without this every GitHub metadata lookup runs
# unauthenticated and hits GitHub's 60-requests/hour limit almost instantly
# (this is what made every repo fail with METADATA_FETCH_FAILED).
if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$PROJECT_ROOT/.env"
    set +a
    if [ -n "${GITHUB_TOKEN:-}" ]; then
        echo "[SETUP] Loaded .env — GITHUB_TOKEN is set (authenticated GitHub API access)"
    else
        echo "[WARN] .env loaded but GITHUB_TOKEN is not set — GitHub metadata lookups"
        echo "       will be unauthenticated and capped at 60/hour. Add GITHUB_TOKEN=..."
        echo "       to .env (see https://github.com/settings/tokens, no scopes needed)."
    fi
else
    echo "[WARN] No .env file found at $PROJECT_ROOT/.env"
fi

# Hard stop, loudly, if sqlite3 still isn't reachable — better than silently
# "failing" all 252+ repos in a few seconds with no real work done, which is
# what happens otherwise (get_or_create_repo_id's sqlite3 call errors,
# returns nothing, every repo gets skipped as "could not get a repository id").
if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "[ERROR] sqlite3 is not on PATH. Run: bash pipeline/setup_full_run_env.sh"
    echo "        then either 'source ~/pipeline_env.sh' or just re-run this script"
    echo "        (it now sources that file itself automatically, so this should"
    echo "        only happen on a machine where setup was never run at all)."
    exit 1
fi

WORKER_COUNT="${WORKER_COUNT:-1}"
WORKER_INDEX="${WORKER_INDEX:-0}"
if ! [[ "$WORKER_COUNT" =~ ^[0-9]+$ ]] || [ "$WORKER_COUNT" -lt 1 ]; then
    echo "[ERROR] WORKER_COUNT must be a positive integer (got: $WORKER_COUNT)"
    exit 1
fi
if ! [[ "$WORKER_INDEX" =~ ^[0-9]+$ ]] || [ "$WORKER_INDEX" -ge "$WORKER_COUNT" ]; then
    echo "[ERROR] WORKER_INDEX must be an integer from 0 to WORKER_COUNT-1 (got: $WORKER_INDEX, WORKER_COUNT=$WORKER_COUNT)"
    exit 1
fi
IS_PRIMARY_WORKER=true
[ "$WORKER_COUNT" -gt 1 ] && [ "$WORKER_INDEX" -ne 0 ] && IS_PRIMARY_WORKER=false

source "$PROJECT_ROOT/config/config.sh"
source "$PROJECT_ROOT/src/logging.sh"
source "$PROJECT_ROOT/src/checks.sh"
source "$PROJECT_ROOT/src/db.sh"
source "$PROJECT_ROOT/src/pyenv.sh"
source "$PROJECT_ROOT/src/requirements.sh"
source "$PROJECT_ROOT/src/notebooks.sh"
source "$PROJECT_ROOT/src/classification.sh"
source "$PROJECT_ROOT/src/repo.sh"

# -----------------------------------------------------------------------------
# Safety for running several of these at once (WORKER_COUNT > 1), added
# because the pipeline's own code was written assuming a single process:
#
# 1) sqlite3 is wrapped so every call waits up to 30s on a locked database
#    instead of failing immediately — needed because many workers write to
#    the SAME db file. journal_mode=WAL lets one writer + many readers work
#    concurrently instead of blocking on every read.
# 2) ensure_pyenv_version() (src/pyenv.sh) is wrapped with a file lock so two
#    workers can never both run `pyenv install` for the same missing Python
#    version at the same time (that would corrupt the shared ~/.pyenv install).
# Both are no-ops (effectively) when WORKER_COUNT=1, aside from the harmless
# WAL/busy_timeout pragmas.
# -----------------------------------------------------------------------------
sqlite3() {
    command sqlite3 -cmd "PRAGMA busy_timeout=30000;" "$@"
}
# NOTE: journal_mode=WAL is enabled further down, AFTER ensure_working_db —
# calling sqlite3 on $DB_FILE this early would create an empty database file
# before ensure_working_db gets a chance to check "does it exist yet?" and
# copy the real corpus over, silently leaving you with an empty DB.

if [ "$WORKER_COUNT" -gt 1 ]; then
    if command -v flock >/dev/null 2>&1; then
        eval "$(declare -f ensure_pyenv_version | sed '1s/^ensure_pyenv_version/_unlocked_ensure_pyenv_version/')"
        PYENV_INSTALL_LOCK="$HOME/.pyenv_install.lock"
        # ensure_pyenv_version is always called via $(...) by its callers in
        # repo.sh, which already forks a subshell for us — so it's safe for
        # this wrapper to exec its own fd redirection directly, no nested
        # subshell needed. flock holds fd 200 (backed by the lock file) for
        # the lifetime of this function call, serializing real `pyenv install`
        # runs across workers; the fd closes automatically when the
        # command-substitution subshell this function is running in exits.
        ensure_pyenv_version() {
            local requested="$1"
            exec 200>"$PYENV_INSTALL_LOCK"
            flock -w 900 200
            _unlocked_ensure_pyenv_version "$requested"
        }
    else
        echo "[WARN] 'flock' not found — concurrent pyenv Python installs are not"
        echo "       serialized. Low risk (most repos reuse an already-installed"
        echo "       version), but if two workers need to build a NEW version at"
        echo "       the exact same moment, one of them can fail. Safe to ignore"
        echo "       unless you see pyenv install errors on multiple workers at once."
    fi
fi

# -----------------------------------------------------------------------------
# Bugfix override, scoped to this script only — src/requirements.sh itself is
# left untouched.
#
# process_requirements() (src/requirements.sh) converts each notebook to a
# temporary "<name>.py" file, inside the repo directory, to scan it for
# import statements. is_local_module() then does `find $REPO_DIR -name
# "<module>.py"` to decide whether an import is a real external package or
# just a local file in the repo — but that temporary file is still on disk
# at that point, so a notebook named e.g. "pandas.ipynb" matches its own
# scratch file and its real `import pandas` gets wrongly classified as
# local, so pandas is never installed and the notebook fails on the exact
# library it's demonstrating. Confirmed hitting justmarkham/pandas-videos in
# the 2026-09-06 pilot run. This redefines the function to also skip that
# one temp file (available as $PYTHON_FILE at the point it's called).
# -----------------------------------------------------------------------------
is_local_module() {
    local module_name="$1"
    local repo_path="$2"
    local self_file="${PYTHON_FILE:-}"
    local match
    while IFS= read -r match; do
        [ -n "$self_file" ] && [ "$match" = "$self_file" ] && continue
        return 0
    done < <(find "$repo_path" -type f -name "${module_name}.py" 2>/dev/null)
    return 1
}

SAMPLE_CSV="${SAMPLE_CSV:-$PROJECT_ROOT/data/evaluation-sample-dataset.csv}"
FILTER_PLATFORM="${FILTER_PLATFORM:-}"
FILTER_CATEGORY="${FILTER_CATEGORY:-}"
LIMIT="${LIMIT:-0}"
export CLASSIFICATION_ENABLED="${CLASSIFICATION_ENABLED:-false}"

if [ ! -f "$SAMPLE_CSV" ]; then
    echo "[ERROR] Sample CSV not found: $SAMPLE_CSV"
    echo "        (pass a different path with SAMPLE_CSV=/path/to/file.csv)"
    exit 1
fi

initialize_directories
ensure_working_db
ensure_pipeline_tables

# Safe to enable now — the working DB definitely exists at this point
# (ensure_working_db just ran). WAL lets readers and the single active
# writer proceed concurrently instead of blocking on every statement;
# combined with the busy_timeout wrapper above, concurrent workers wait
# briefly on a write instead of erroring out with "database is locked".
command sqlite3 "$DB_FILE" "PRAGMA journal_mode=WAL;" >/dev/null 2>&1 || true

if $IS_PRIMARY_WORKER; then
    BACKUP="${DB_FILE}.pre-full-run-$(date +%Y%m%d-%H%M%S).bak"
    cp "$DB_FILE" "$BACKUP" 2>/dev/null && echo "[SETUP] Backed up working DB to: $BACKUP"

    # Clear out runs that only failed because the (unauthenticated) GitHub API
    # metadata lookup got rate-limited, not because of a real reproducibility
    # problem — otherwise the "already has a run" skip below would permanently
    # skip these repos even after the rate-limit issue is fixed.
    STALE_FAILED=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM repository_runs WHERE run_status='METADATA_FETCH_FAILED';" 2>/dev/null || echo 0)
    if [ "${STALE_FAILED:-0}" -gt 0 ]; then
        sqlite3 "$DB_FILE" "DELETE FROM repository_runs WHERE run_status='METADATA_FETCH_FAILED';"
        echo "[SETUP] Cleared $STALE_FAILED run(s) that previously failed only on the metadata"
        echo "        lookup (rate-limit related) — those repos will be retried this pass."
    fi
else
    BACKUP="(taken by worker 0)"
    # Give worker 0 a head start on the one-time backup/cleanup above so
    # other workers don't also try to back up or clean mid-write.
    sleep 3
fi

echo "[SETUP] Sample file : $SAMPLE_CSV"
echo "[SETUP] Filters     : platform=${FILTER_PLATFORM:-<all>} category=${FILTER_CATEGORY:-<all>} limit=${LIMIT:-<none>}"
echo "[SETUP] Classify    : $CLASSIFICATION_ENABLED"
echo "[SETUP] Database    : $DB_FILE"
echo "[SETUP] Logs        : $LOG_DIR"
if [ "$WORKER_COUNT" -gt 1 ]; then
    echo "[SETUP] Worker      : $WORKER_INDEX of $WORKER_COUNT (this process only handles its own slice)"
fi

# Robust CSV parsing (Python's csv module, not a naive comma-split — the CSV
# has commas inside quoted fields) -> "category<TAB>platform<TAB>url" lines.
# When WORKER_COUNT>1, each row's position (after platform/category
# filtering) is taken modulo WORKER_COUNT so every worker gets a distinct,
# non-overlapping slice with no coordination needed between them.
mapfile -t ROWS < <(python3 - "$SAMPLE_CSV" "$FILTER_PLATFORM" "$FILTER_CATEGORY" "$LIMIT" "$WORKER_COUNT" "$WORKER_INDEX" <<'PYEOF'
import csv, sys
path, plat_filter, cat_filter, limit, worker_count, worker_index = (
    sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])
)
count = 0
seen = 0
with open(path, encoding='utf-8') as f:
    for row in csv.DictReader(f):
        if plat_filter and row['platform'].strip().lower() != plat_filter.strip().lower():
            continue
        if cat_filter and row['category'].strip().lower() != cat_filter.strip().lower():
            continue
        url = row['url'].strip()
        if not url:
            continue
        if seen % worker_count != worker_index:
            seen += 1
            continue
        seen += 1
        print(f"{row['category']}\t{row['platform']}\t{url}")
        count += 1
        if limit and count >= limit:
            break
PYEOF
)

TOTAL=${#ROWS[@]}
echo "[SETUP] ${TOTAL} repositories to consider (after filters$([ "$WORKER_COUNT" -gt 1 ] && echo " + this worker's slice"))"
echo ""

# Progress file — a plain text file you can check from ANY OTHER terminal at
# any time while this is running (it can take hours), e.g.:
#   cat output/full_run_progress.txt
#   watch -n 30 cat output/full_run_progress*.txt
WORKER_SUFFIX=""
[ "$WORKER_COUNT" -gt 1 ] && WORKER_SUFFIX="_worker${WORKER_INDEX}"
PROGRESS_FILE="$PROJECT_ROOT/output/full_run_progress${WORKER_SUFFIX}.txt"
mkdir -p "$(dirname "$PROGRESS_FILE")"

DONE=0
OK=0
FAIL=0
SKIPPED_ALREADY_RUN=0
START_TS=$(date +%s)

write_progress() {
    # $1 = current repo url being worked on right now ("" once finished)
    local current="${1:-}"
    local pct=0
    if [ "$TOTAL" -gt 0 ]; then
        pct=$(( DONE * 100 / TOTAL ))
    fi
    local elapsed=$(( $(date +%s) - START_TS ))
    {
        echo "FULL SAMPLE RUN PROGRESS"
        echo "  Progress    : $DONE / $TOTAL  (${pct}%)"
        echo "  Succeeded   : $OK"
        echo "  Failed      : $FAIL"
        echo "  Skipped     : $SKIPPED_ALREADY_RUN"
        echo "  Elapsed     : $(printf '%dh %dm %ds' $((elapsed/3600)) $((elapsed%3600/60)) $((elapsed%60)))"
        echo "  Updated at  : $(date '+%Y-%m-%d %H:%M:%S')"
        if [ -n "$current" ]; then
            echo "  Now running : $current"
        else
            echo "  Status      : FINISHED"
        fi
    } > "$PROGRESS_FILE"
}

write_progress ""

for row in "${ROWS[@]}"; do
    IFS=$'\t' read -r CATEGORY PLATFORM REPO_URL <<< "$row"
    DONE=$((DONE + 1))
    PCT=$(( (DONE - 1) * 100 / TOTAL ))
    write_progress "$REPO_URL"
    echo "==================================================================="
    echo "[$DONE/$TOTAL  ~${PCT}%] category=$CATEGORY platform=$PLATFORM"
    echo "  $REPO_URL"
    echo "==================================================================="

    REPO_ID=$(get_or_create_repo_id "$REPO_URL")
    if ! [[ "$REPO_ID" =~ ^[0-9]+$ ]]; then
        echo "[SKIP] Could not get/create a repository id for $REPO_URL"
        FAIL=$((FAIL + 1))
        continue
    fi
    export REPO_ID

    ALREADY=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM repository_runs WHERE repository_id=$REPO_ID;" 2>/dev/null)
    if [ "${ALREADY:-0}" -gt 0 ]; then
        echo "[SKIP] Repo id $REPO_ID already has a recorded run — skipping."
        echo "       (delete its row(s) from repository_runs to force a re-run)"
        SKIPPED_ALREADY_RUN=$((SKIPPED_ALREADY_RUN + 1))
        continue
    fi

    isExecutedSuccessfully="false"
    if ! process_repo "$REPO_URL" "" "" ""; then
        cleanup_repository_directory "${REPO_DIR:-}" || true
        FAIL=$((FAIL + 1))
        continue
    fi
    if [ "$isExecutedSuccessfully" = "true" ]; then
        OK=$((OK + 1))
    else
        FAIL=$((FAIL + 1))
    fi
done

write_progress ""

FINAL_PCT=100
[ "$TOTAL" -gt 0 ] || FINAL_PCT=0
echo ""
echo "════════════════════════════════════════"
echo "   FULL SAMPLE RUN SUMMARY — ${FINAL_PCT}% done"
echo "════════════════════════════════════════"
echo "  Considered (after filters) : $TOTAL"
echo "  Already had a run (skipped): $SKIPPED_ALREADY_RUN"
echo "  Attempted this pass        : $((TOTAL - SKIPPED_ALREADY_RUN))"
echo "  Succeeded                  : $OK"
echo "  Failed / no notebooks etc. : $FAIL"
echo "  Database                   : $DB_FILE"
echo "  Backup taken at            : $BACKUP"
echo "  Logs                       : $LOG_DIR"
echo "  Progress file              : $PROGRESS_FILE"
echo "════════════════════════════════════════"
echo ""
echo "Query results any time with, e.g.:"
echo "  sqlite3 -header -column \"$DB_FILE\" \"SELECT r.repository, rr.run_status, rr.duration_seconds FROM repository_runs rr JOIN repositories r ON r.id=rr.repository_id ORDER BY rr.id DESC LIMIT 20;\""
echo ""
echo "Check progress from another terminal at any time while this runs with:"
echo "  cat \"$PROGRESS_FILE\""
