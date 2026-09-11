#!/bin/bash
###############################################################################
# repo.sh — Per-repository orchestration and batch SQLite flow
###############################################################################

export REPO_URL

detect_platform() {
    case "$1" in
        *github.com*) echo "github" ;;
        *codeberg.org*) echo "codeberg" ;;
        *zenodo.org*) echo "zenodo" ;;
        *) echo "unknown" ;;
    esac
}

trim_whitespace() {
    local value="$1"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    printf '%s' "$value"
}

create_repository_run() {
    local repository_id="$1"
    local repository_url_sql

    [[ "$repository_id" =~ ^[0-9]+$ ]] || return 1
    repository_url_sql=$(sql_escape "$2")

    RUN_ID=$(
        sqlite3 "$DB_FILE" <<EOF
INSERT INTO repository_runs (repository_id, url, run_status, started_at)
VALUES ($repository_id, '$repository_url_sql', 'RUNNING', datetime('now'));
SELECT last_insert_rowid();
EOF
    )
    [ -n "$RUN_ID" ] || return 1
    export RUN_ID
}

finalize_repository_run() {
    local run_id="$1"
    local status_sql
    local error_message_sql
    local duration="$4"

    [[ "$run_id" =~ ^[0-9]+$ ]] || return 1
    [[ "$duration" =~ ^[0-9]+([.][0-9]+)?$ ]] || duration=0
    status_sql=$(sql_escape "$2")
    error_message_sql=$(sql_escape "$3")

    log "[REPO] Finalizing run $run_id — status: $2"
    sqlite3 "$DB_FILE" <<EOF
UPDATE repository_runs
SET run_status='$status_sql', error_message='$error_message_sql', finished_at=datetime('now'), duration_seconds=$duration
WHERE id=$run_id;
EOF
}

finalize_active_run_on_exit() {
    local exit_code="$?"
    local current_status=""
    local duration=0

    if [ -n "${RUN_ID:-}" ] &&
       [[ "$RUN_ID" =~ ^[0-9]+$ ]] &&
       [ -f "${DB_FILE:-}" ]; then

        current_status=$(sqlite3 "$DB_FILE" \
            "SELECT run_status FROM repository_runs WHERE id=$RUN_ID;")

        if [ "$current_status" = "RUNNING" ]; then
            if [ -n "${REPO_START_TIME:-}" ]; then
                duration=$(elapsed_sec "$REPO_START_TIME")
            fi

            finalize_repository_run \
                "$RUN_ID" \
                "PIPELINE_INTERRUPTED" \
                "Pipeline stopped unexpectedly with exit code $exit_code" \
                "$duration" || true
        fi
    fi

    trap - EXIT
    exit "$exit_code"
}

get_notebook_language_stats() {
    [[ "$1" =~ ^[0-9]+$ ]] || return 1
    sqlite3 "$DB_FILE" <<EOF
SELECT COUNT(*), SUM(CASE WHEN LOWER(language)='python' THEN 1 ELSE 0 END)
FROM notebooks WHERE repository_id=$1;
EOF
}

# Find a repository in the DB by its path, or insert it if it's new.
# Also detects and stores which platform the URL came from.
# Outputs the repository's row id.
get_or_create_repo_id() {
    local repo_path
    repo_path=$(echo "$1" | sed -E 's#^https?://[^/]+/##; s#records?/##; s#\.git$##')
    local platform
    platform=$(detect_platform "$1")
    local repo_path_sql
    local platform_sql
    repo_path_sql=$(sql_escape "$repo_path")
    platform_sql=$(sql_escape "$platform")
    local notebook_paths_sql
    local setup_paths_sql
    local requirement_paths_sql

    notebook_paths_sql=$(sql_escape "${NOTEBOOK_PATHS:-}")
    setup_paths_sql=$(sql_escape "${SETUP_PATHS:-}")
    requirement_paths_sql=$(sql_escape "${REQUIREMENT_PATHS:-}")
    local existing_id
    existing_id=$(sqlite3 "$DB_FILE" \
        "SELECT id FROM repositories
         WHERE repository='$repo_path_sql'
           AND platform='$platform_sql'
         LIMIT 1;")
    if [ -n "$existing_id" ]; then
        echo "$existing_id"
        return 0
    fi
    sqlite3 "$DB_FILE" <<EOF
INSERT INTO repositories (repository, platform, notebooks, setups, requirements, notebooks_count, setups_count, requirements_count)
VALUES ('$repo_path_sql', '$platform_sql', '$notebook_paths_sql', '$setup_paths_sql', '$requirement_paths_sql', 0, 0, 0);
SELECT last_insert_rowid();
EOF
}

# Populates the notebooks table from user-supplied paths (single-repo mode).
# Accepts platform notebook URLs or plain relative paths.
# In batch mode the notebooks are already in the DB, so this is a safe no-op.
insert_notebooks_from_paths() {
    local repo_id="$1"
    local notebook_paths="$2"

    [[ "$repo_id" =~ ^[0-9]+$ ]] || return 1
    [ -z "$notebook_paths" ] && return 0

    IFS=';' read -ra nb_array <<<"$notebook_paths"
    for nb_path in "${nb_array[@]}"; do
        # Trim whitespace
        nb_path=$(trim_whitespace "$nb_path")
        [ -z "$nb_path" ] && continue

        # Strip platform notebook URLs down to relative paths
        # handles GitHub /blob/ URLs and Codeberg /src/ URLs
        if [[ "$nb_path" == https://github.com/* || "$nb_path" == https://codeberg.org/* ]]; then
            nb_path=$(echo "$nb_path" | sed -E 's|https?://[^/]+/[^/]+/[^/]+/(blob|src)/[^/]+/||')
        fi
        # Only register .ipynb files
        [[ "$nb_path" != *.ipynb ]] && continue

        local nb_path_sql
        nb_path_sql=$(sql_escape "$nb_path")

        local existing
        existing=$(sqlite3 "$DB_FILE" \
            "SELECT id FROM notebooks WHERE repository_id=$repo_id AND name='$nb_path_sql' LIMIT 1;")
        if [ -z "$existing" ]; then
            sqlite3 "$DB_FILE" \
                "INSERT INTO notebooks (repository_id, name, language) VALUES ($repo_id, '$nb_path_sql', 'python');"
            log "[REPO] Registered notebook: $nb_path" >&2
        fi
    done

    sqlite3 "$DB_FILE" \
        "UPDATE repositories
         SET notebooks_count=(
             SELECT COUNT(*)
             FROM notebooks
             WHERE repository_id=$repo_id
         )
         WHERE id=$repo_id;"
}

cleanup_repository_directory() {
    local candidate="$1"
    local repos_root
    local resolved_candidate

    [ -n "$candidate" ] || return 1
    repos_root=$(realpath -m "$REPOS_DIR") || return 1
    resolved_candidate=$(realpath -m "$candidate") || return 1

    case "$resolved_candidate" in
        "$repos_root"/*) ;;
        *)
            log "[CLEANUP] Refusing path outside repository workspace: $candidate"
            return 1
            ;;
    esac

    if [ -e "$resolved_candidate" ] || [ -L "$resolved_candidate" ]; then
        rm -rf -- "$resolved_candidate"
        log "[CLEANUP] Removed incomplete repository folder: $resolved_candidate"
    fi
}

process_repo() {
    if ! [[ "${REPO_ID:-}" =~ ^[0-9]+$ ]]; then
        log "[REPO] Invalid or missing repository ID"
        return 1
    fi

    REPO_START_TIME=$(now_sec)
    REPO_URL="$1"
    NOTEBOOK_PATHS="$2"
    SETUP_PATHS="$3"
    REQUIREMENT_PATHS="$4"
    export REPO_URL
    local repo_basename
    repo_basename=$(basename "${REPO_URL%/}" .git)
    REPO_NAME="${REPO_ID}_${repo_basename}"
    REPO_DIR="$REPOS_DIR/$REPO_NAME"
    log "[REPO] ── Starting: $REPO_NAME ──────────────────────────────"
    LOG_FILE="${LOG_DIR}/${REPO_NAME}.log"
    >"$LOG_FILE"
    export LOG_FILE
    create_repository_run "$REPO_ID" "$REPO_URL"

    # Single-repo mode: populate notebooks table from user-supplied URLs/paths.
    # Batch mode: notebooks already in DB — this becomes a no-op.
    insert_notebooks_from_paths "$REPO_ID" "$NOTEBOOK_PATHS"

    # Normalize NOTEBOOK_PATHS: strip platform notebook URLs to relative paths
    # so all downstream code (notebooks.sh etc.) gets plain relative paths
    local normalized=""
    IFS=';' read -ra _nb_array <<<"$NOTEBOOK_PATHS"
    for _nb in "${_nb_array[@]}"; do
        _nb=$(trim_whitespace "$_nb")
        [[ "$_nb" == https://github.com/* || "$_nb" == https://codeberg.org/* ]] && _nb=$(echo "$_nb" | sed -E 's|https?://[^/]+/[^/]+/[^/]+/(blob|src)/[^/]+/||')
        [ -n "$normalized" ] && normalized="${normalized};${_nb}" || normalized="$_nb"
    done
    NOTEBOOK_PATHS="$normalized"

    PLATFORM=$(detect_platform "$REPO_URL")

    if [ "$PLATFORM" = "unknown" ]; then
        finalize_repository_run \
            "$RUN_ID" \
            "UNSUPPORTED_PLATFORM" \
            "Only GitHub, Codeberg, and Zenodo are supported" \
            "$(elapsed_sec "$REPO_START_TIME")"
        return 0
    fi

    # Validate every source before requesting and saving its metadata.
    if [ "$PLATFORM" = "zenodo" ]; then
        if ! validate_zenodo "$REPO_URL"; then
            finalize_repository_run "$RUN_ID" "INVALID_ZENODO_RECORD" "Zenodo API validation failed" "$(elapsed_sec "$REPO_START_TIME")"
            return 0
        fi
    elif ! validate_repo "$REPO_URL"; then
        finalize_repository_run "$RUN_ID" "INVALID_REPOSITORY_URL" "git ls-remote failed" "$(elapsed_sec "$REPO_START_TIME")"
        return 0
    fi

    if ! fetch_and_save_repo_metadata \
        "$REPO_ID" \
        "$REPO_URL" \
        "$PLATFORM"; then

        finalize_repository_run \
            "$RUN_ID" \
            "METADATA_FETCH_FAILED" \
            "Could not fetch and save normalized repository metadata" \
            "$(elapsed_sec "$REPO_START_TIME")"
        return 0
    fi

    # Clone into REPOS_DIR first, before any file operations
    if [ "$PLATFORM" != "zenodo" ] && [ -d "$REPO_DIR" ]; then
        log "[REPO] Repo already exists, pulling latest..."

        if ! git -C "$REPO_DIR" pull >>"$LOG_FILE" 2>&1; then
            finalize_repository_run \
                "$RUN_ID" \
                "GIT_PULL_FAILED" \
                "Could not update the existing repository" \
                "$(elapsed_sec "$REPO_START_TIME")"
            return 0
        fi
    elif [ "$PLATFORM" = "zenodo" ]; then
        log "[REPO] Downloading Zenodo record into $REPO_DIR..."

        if ! fetch_zenodo "$REPO_URL" "$REPO_DIR" >>"$LOG_FILE" 2>&1; then
            finalize_repository_run \
                "$RUN_ID" \
                "ZENODO_DOWNLOAD_FAILED" \
                "Could not download or extract the Zenodo record" \
                "$(elapsed_sec "$REPO_START_TIME")"
            return 0
        fi
    else
        log "[REPO] Cloning into $REPO_DIR..."

        if ! git clone --depth 1 "$REPO_URL" "$REPO_DIR" >>"$LOG_FILE" 2>&1; then
            finalize_repository_run \
                "$RUN_ID" \
                "GIT_CLONE_FAILED" \
                "Could not clone the repository" \
                "$(elapsed_sec "$REPO_START_TIME")"
            return 0
        fi
    fi

    if [ ! -d "$REPO_DIR" ]; then
        finalize_repository_run "$RUN_ID" "REPO_DIR_MISSING" "Directory not found after clone" "$(elapsed_sec "$REPO_START_TIME")"
        return 0
    fi

    # Auto-discover notebooks if none provided
    if [ -z "$NOTEBOOK_PATHS" ]; then
        log "[REPO] No notebook paths provided — auto-discovering .ipynb files..."
        discovered=""
        while IFS= read -r nb; do
            rel="${nb#$REPO_DIR/}"
            [ -n "$discovered" ] && discovered="${discovered};${rel}" || discovered="$rel"
        done < <(find "$REPO_DIR" \
            -name "*.ipynb" \
            -not -path "*/.ipynb_checkpoints/*" \
            -not -name "*_output.ipynb" \
            -not -name "*_output_output.ipynb" \
            | sort)

        if [ -z "$discovered" ]; then
            finalize_repository_run "$RUN_ID" "NO_NOTEBOOKS" "No .ipynb files found in repo" "$(elapsed_sec "$REPO_START_TIME")"
            return 0
        fi

        log "[REPO] Discovered notebooks: $discovered"
        NOTEBOOK_PATHS="$discovered"
        insert_notebooks_from_paths "$REPO_ID" "$NOTEBOOK_PATHS"
    fi

    # Check notebook availability only after supplied paths were registered or
    # missing paths were discovered from the acquired repository content.
    stats=$(get_notebook_language_stats "$REPO_ID")
    total_notebooks=$(echo "$stats" | cut -d'|' -f1)
    python_notebooks=$(echo "$stats" | cut -d'|' -f2)
    log "[REPO] Notebooks: total=$total_notebooks python=$python_notebooks"

    if [ "$total_notebooks" -eq 0 ]; then
        finalize_repository_run "$RUN_ID" "NO_NOTEBOOKS" "No notebooks found" "$(elapsed_sec "$REPO_START_TIME")"
        return 0
    fi
    if [ "$python_notebooks" -eq 0 ]; then
        finalize_repository_run "$RUN_ID" "NO_PYTHON_NOTEBOOKS" "No Python notebooks found" "$(elapsed_sec "$REPO_START_TIME")"
        return 0
    fi

    if [ "${FAST_FIRST:-false}" = "true" ] &&
       [[ "${FAST_FIRST_MAX_NOTEBOOKS:-0}" =~ ^[0-9]+$ ]] &&
       [ "${FAST_FIRST_MAX_NOTEBOOKS:-0}" -gt 0 ] &&
       [ "$python_notebooks" -gt "$FAST_FIRST_MAX_NOTEBOOKS" ]; then
        finalize_repository_run \
            "$RUN_ID" \
            "DEFERRED_LONG_REPO" \
            "Deferred during fast-first pass because it has $python_notebooks Python notebooks (limit: $FAST_FIRST_MAX_NOTEBOOKS)" \
            "$(elapsed_sec "$REPO_START_TIME")"
        return 0
    fi

    if ! classify_repository_notebooks "$REPO_ID" "$REPO_DIR" "$NOTEBOOK_PATHS"; then
        finalize_repository_run \
            "$RUN_ID" \
            "CLASSIFICATION_FAILED" \
            "Notebook classification failed" \
            "$(elapsed_sec "$REPO_START_TIME")"
        return 0
    fi

    process_requirements

    REQUIREMENTS_FILE="$REPO_DIR/requirements.txt"
    if ! setup_pyenv_env "$REPO_DIR" "$REQUIREMENTS_FILE" "$SETUP_PATHS"; then
        finalize_repository_run "$RUN_ID" "$ENV_ERROR_TYPE" "$ENV_ERROR_MESSAGE" "$(elapsed_sec "$REPO_START_TIME")"
        cleanup_pyenv_env
        return 0
    fi

    if ! run_in_pyenv_env "$REPO_DIR"; then
        analyze_env_error "$LOG_FILE"
        finalize_repository_run "$RUN_ID" "$ENV_ERROR_TYPE" "$ENV_ERROR_MESSAGE" "$(elapsed_sec "$REPO_START_TIME")"
        cleanup_pyenv_env
        return 0
    fi

    NOTEBOOKS_COUNT=$(echo "$NOTEBOOK_PATHS" | awk -F';' '{print NF}')
    export NOTEBOOKS_COUNT
    compare_notebook_outputs
    cleanup_pyenv_env

    local total_time
    total_time=$(elapsed_sec "$REPO_START_TIME")
    finalize_repository_run "$RUN_ID" "SUCCESS" "Repository executed successfully" "$total_time"
    log "[REPO] ── Done: $REPO_NAME (${total_time}s) ──────────────────────"
    isExecutedSuccessfully="true"
    export RUN_ID NOTEBOOKS_COUNT
}

process_sqlite_flow() {
    processed_repo_ids=()
    local processed_count=0
    log "[BATCH] Processing next $TARGET_COUNT unexecuted repositories."

    while [ $processed_count -lt "$TARGET_COUNT" ]; do
        local not_in_clause=""
        if [ ${#processed_repo_ids[@]} -gt 0 ]; then
            not_in_clause="AND r.id NOT IN ($(
                IFS=,
                echo "${processed_repo_ids[*]}"
            ))"
        fi

        repo_data=$(
            sqlite3 "$DB_FILE" <<EOF
.mode csv
.headers off
SELECT r.id, r.repository, r.platform, r.notebooks, r.setups, r.requirements
FROM repositories r
WHERE r.notebooks IS NOT NULL AND TRIM(r.notebooks) != ''
AND r.notebooks_count != 0
AND r.id NOT IN (SELECT DISTINCT repository_id FROM repository_runs)
$not_in_clause
ORDER BY r.id LIMIT 1;
EOF
        )
        if [ -z "$repo_data" ]; then
            log "[BATCH] No more repositories."
            break
        fi

        IFS=',' read -r REPO_ID REPO_PATH PLATFORM NOTEBOOK_PATHS SETUP_PATHS REQUIREMENT_PATHS <<<"$repo_data"
        # if an old platform has not platform value, default to github
        PLATFORM=$(echo "$PLATFORM" | tr -d '\r\n"')
        [ -z "$PLATFORM" ] && PLATFORM="github"
        REPO_PATH=$(echo "$REPO_PATH" | tr -d '\r\n"')
        case "$PLATFORM" in
            github)
                REPO_URL="https://github.com/${REPO_PATH}"
                ;;
            codeberg)
                REPO_URL="https://codeberg.org/${REPO_PATH}"
                ;;
            zenodo)
                REPO_URL="https://zenodo.org/records/${REPO_PATH}"
                ;;
            *)
                log "[BATCH] Unknown platform '$PLATFORM' for repo $REPO_ID, skipping"
                processed_repo_ids+=("$REPO_ID")
                continue
                ;;
        esac
        NOTEBOOK_PATHS=$(echo "$NOTEBOOK_PATHS" | tr -d '\r\n"')
        REQUIREMENT_PATHS=$(echo "$REQUIREMENT_PATHS" | tr -d '\r\n"')
        SETUP_PATHS=$(echo "$SETUP_PATHS" | tr -d '\r\n"')
        log "[BATCH] Repo $REPO_ID: $REPO_URL"

        processed_repo_ids+=("$REPO_ID")
        isExecutedSuccessfully="false"

        if ! process_repo "$REPO_URL" "$NOTEBOOK_PATHS" "$SETUP_PATHS" "$REQUIREMENT_PATHS"; then
            cleanup_repository_directory "${REPO_DIR:-}" || true
            processed_count=$((processed_count + 1))
            continue
        fi
        [[ "$isExecutedSuccessfully" == "true" ]] && processed_count=$((processed_count + 1))
    done
    log "[BATCH] Finished. Processed $processed_count repositories."
}

# --- Zenodo helpers ---

# Get the record ID number from a Zenodo URL
zenodo_record_id() {
    echo "$1" | sed -E 's#.*/records?/([0-9]+).*#\1#'
}

# Get the file download link for a Zenodo record ID
zenodo_download_url() {
    local id="$1"
    local response

    if ! response=$(curl -fsS \
        --retry 2 \
        --retry-all-errors \
        --retry-delay 1 \
        --connect-timeout 10 \
        --max-time 30 \
        -H "Accept: application/json" \
        "https://zenodo.org/api/records/$id"); then
        if [ -n "${ZENODO_TOKEN:-}" ]; then
            response=$(curl -fsS \
                --retry 2 \
                --retry-all-errors \
                --retry-delay 1 \
                --connect-timeout 10 \
                --max-time 30 \
                -H "Accept: application/json" \
                -H "Authorization: Bearer $ZENODO_TOKEN" \
                "https://zenodo.org/api/records/$id") || return 1
        else
            return 1
        fi
    fi

    echo "$response" | python3 -c '
import json
import sys

files = json.load(sys.stdin).get("files", [])
zip_files = [
    file for file in files
    if file.get("key", "").lower().endswith(".zip")
]

if not zip_files:
    print("[ZENODO] No ZIP archive found in this record", file=sys.stderr)
    raise SystemExit(1)

download_url = zip_files[0].get("links", {}).get("self", "")
if not download_url:
    print("[ZENODO] ZIP download URL is missing", file=sys.stderr)
    raise SystemExit(1)

print(download_url)
'
}

# Download standalone Zenodo files safely. The website importer discovers
# directly attached .ipynb files, so the runner must use the same file set.
# Exit 3 means the record has no standalone notebook and the ZIP fallback may run.
fetch_zenodo_direct_files() {
    local id="$1" dest="$2"
    local metadata_file="$dest/_zenodo_record.json"

    mkdir -p "$dest"
    if ! curl -fsS \
        --retry 2 \
        --retry-all-errors \
        --retry-delay 1 \
        --connect-timeout 10 \
        --max-time 60 \
        -H "Accept: application/json" \
        -o "$metadata_file" \
        "https://zenodo.org/api/records/$id"; then
        if [ -n "${ZENODO_TOKEN:-}" ]; then
            if ! curl -fsS \
                --retry 2 \
                --retry-all-errors \
                --retry-delay 1 \
                --connect-timeout 10 \
                --max-time 60 \
                -H "Accept: application/json" \
                -H "Authorization: Bearer $ZENODO_TOKEN" \
                -o "$metadata_file" \
                "https://zenodo.org/api/records/$id"; then
                rm -f "$metadata_file"
                log "[ZENODO] Record metadata download failed"
                return 1
            fi
        else
            rm -f "$metadata_file"
            log "[ZENODO] Record metadata download failed"
            return 1
        fi
    fi

    if python3 - "$metadata_file" "$dest" <<'PY'
import json
import os
from pathlib import Path, PurePosixPath
import sys
import time
from urllib.request import Request, urlopen

metadata_path = Path(sys.argv[1])
destination = Path(sys.argv[2]).resolve()
record = json.loads(metadata_path.read_text(encoding="utf-8"))
files = record.get("files", [])
notebooks = [item for item in files if str(item.get("key", "")).lower().endswith(".ipynb")]
if not notebooks:
    raise SystemExit(3)

downloadable = [
    item for item in files
    if not str(item.get("key", "")).lower().endswith((".zip", ".tar", ".tar.gz", ".tgz"))
]
limit = int(os.environ.get("ZENODO_MAX_DOWNLOAD_BYTES", str(256 * 1024 * 1024)))
declared_total = sum(int(item.get("size") or 0) for item in downloadable)
if declared_total > limit:
    print(f"[ZENODO] Direct files exceed the {limit // (1024 * 1024)} MB safety limit", file=sys.stderr)
    raise SystemExit(1)

headers = {"User-Agent": "NotebookFair"}
auth_headers = dict(headers)
token = os.environ.get("ZENODO_TOKEN", "").strip()
if token:
    auth_headers["Authorization"] = f"Bearer {token}"

downloaded = 0
for item in downloadable:
    key = str(item.get("key", "")).replace("\\", "/").strip()
    path = PurePosixPath(key)
    if not key or path.is_absolute() or ".." in path.parts:
        print(f"[ZENODO] Unsafe file path rejected: {key}", file=sys.stderr)
        raise SystemExit(1)
    target = (destination / Path(*path.parts)).resolve()
    try:
        target.relative_to(destination)
    except ValueError:
        print(f"[ZENODO] Unsafe file path rejected: {key}", file=sys.stderr)
        raise SystemExit(1)
    links = item.get("links") or {}
    url = links.get("content") or links.get("self")
    if not isinstance(url, str) or not url.startswith("https://zenodo.org/"):
        print(f"[ZENODO] Missing safe download URL for: {key}", file=sys.stderr)
        raise SystemExit(1)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".part")
    last_error = None
    for attempt in range(3):
        downloaded_before_attempt = downloaded
        temporary.unlink(missing_ok=True)
        try:
            try:
                response = urlopen(Request(url, headers=headers), timeout=60)
            except OSError:
                if not token:
                    raise
                response = urlopen(Request(url, headers=auth_headers), timeout=60)
            with response, temporary.open("wb") as output:
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        downloaded += len(chunk)
                        if downloaded > limit:
                            print(f"[ZENODO] Downloads exceeded the {limit // (1024 * 1024)} MB safety limit", file=sys.stderr)
                            raise SystemExit(1)
                        output.write(chunk)
            temporary.replace(target)
            break
        except (OSError, TimeoutError) as error:
            downloaded = downloaded_before_attempt
            temporary.unlink(missing_ok=True)
            last_error = error
            if attempt < 2:
                time.sleep(attempt + 1)
    else:
        print(f"[ZENODO] File download failed after 3 attempts: {key}: {last_error}", file=sys.stderr)
        raise SystemExit(1)
PY
    then
        rm -f "$metadata_file"
        log "[ZENODO] Downloaded standalone record files"
        return 0
    else
        local status=$?
        rm -f "$metadata_file"
        return "$status"
    fi
}

# Download and unzip a Zenodo record into a folder (Zenodo isn't a Git host)
fetch_zenodo() {
    local url="$1" dest="$2"
    local id dl
    id=$(zenodo_record_id "$url")

    if fetch_zenodo_direct_files "$id" "$dest"; then
        return 0
    else
        local direct_status=$?
        if [ "$direct_status" -ne 3 ]; then
            log "[ZENODO] Standalone file download failed"
            return 1
        fi
    fi

    if ! dl=$(zenodo_download_url "$id"); then
        log "[ZENODO] Could not select a ZIP archive"
        return 1
    fi

    if [ -z "$dl" ]; then
        log "[ZENODO] The ZIP download URL is empty"
        return 1
    fi
    if ! mkdir -p "$dest"; then
        log "[ZENODO] Could not create destination: $dest"
        return 1
    fi

    if ! curl -fsSL \
        --connect-timeout 10 \
        --max-time 300 \
        -o "$dest/_zenodo_archive.zip" \
        "$dl"; then
        if [ -n "${ZENODO_TOKEN:-}" ]; then
            if ! curl -fsSL \
                --connect-timeout 10 \
                --max-time 300 \
                -H "Authorization: Bearer $ZENODO_TOKEN" \
                -o "$dest/_zenodo_archive.zip" \
                "$dl"; then
                rm -f "$dest/_zenodo_archive.zip"
                log "[ZENODO] ZIP download failed"
                return 1
            fi
        else
            rm -f "$dest/_zenodo_archive.zip"
            log "[ZENODO] ZIP download failed"
            return 1
        fi
    fi
    if ! python3 - "$dest/_zenodo_archive.zip" "$dest" <<'PY'
from pathlib import Path
import stat
import sys
import zipfile

archive = Path(sys.argv[1])
destination = Path(sys.argv[2]).resolve()

try:
    with zipfile.ZipFile(archive) as zip_file:
        for member in zip_file.infolist():
            mode = member.external_attr >> 16
            if stat.S_ISLNK(mode):
                raise ValueError(f"Symbolic link is not allowed: {member.filename}")

            target = (destination / member.filename).resolve()
            try:
                target.relative_to(destination)
            except ValueError:
                raise ValueError(f"Unsafe archive path: {member.filename}")

        zip_file.extractall(destination)
except (OSError, ValueError, zipfile.BadZipFile) as error:
    print(f"[ZENODO] ZIP extraction failed: {error}", file=sys.stderr)
    raise SystemExit(1)
PY
    then
        rm -f "$dest/_zenodo_archive.zip"
        return 1
    fi

    rm -f "$dest/_zenodo_archive.zip"

    # If everything unzipped into one sub-folder, move its contents up
    local entries
    entries=$(find "$dest" -mindepth 1 -maxdepth 1)
    if [ "$(echo "$entries" | wc -l)" -eq 1 ] && [ -d "$entries" ]; then
        (
            shopt -s dotglob
            mv "$entries"/* "$dest"/
        )
        rmdir "$entries"
    fi
}

# Fetch metadata for a GitHub repo. Usage: fetch_github_metadata <owner/repo>
# Prints 8 lines: title, description, authors, license, keywords, doi, created_at, updated_at
fetch_github_metadata() {
    local repo_path="$1"
    local response
    local -a headers=(-H "Accept: application/vnd.github+json")

    if [ -n "${GITHUB_TOKEN:-}" ]; then
        headers+=(-H "Authorization: Bearer $GITHUB_TOKEN")
    fi

    if ! response=$(curl -fsS \
        --retry 2 \
        --retry-all-errors \
        --retry-delay 1 \
        --connect-timeout 10 \
        --max-time 30 \
        "${headers[@]}" \
        "https://api.github.com/repos/$repo_path"); then
        echo "[METADATA] GitHub API request failed for $repo_path" >&2
        return 1
    fi

    if [ -z "$response" ] ||
       echo "$response" | jq -e '.message? != null' >/dev/null 2>&1; then
        echo "[METADATA] GitHub API returned no usable data for $repo_path" >&2
        return 1
    fi

    echo "$response" | jq -r '
        [
            (.name // ""),
            (.description // ""),
            (.owner.login // ""),
            (.license.spdx_id // "" | if . == "NOASSERTION" then "" else . end),
            ((.topics // []) | join("; ")),
            "",
            (.created_at // ""),
            (.updated_at // "")
        ] | .[]
    '
}

# Fetch metadata for a Codeberg repository.
# Usage: fetch_codeberg_metadata <owner/repo>
# Prints: title, description, authors, license, keywords, DOI,
# created_at, updated_at
fetch_codeberg_metadata() {
    local repo_path="$1"
    local response
    local -a headers=(-H "Accept: application/json")

    if [ -n "${CODEBERG_TOKEN:-}" ]; then
        headers+=(-H "Authorization: token $CODEBERG_TOKEN")
    fi

    if ! response=$(curl -fsS \
        --retry 2 \
        --retry-all-errors \
        --retry-delay 1 \
        --connect-timeout 10 \
        --max-time 30 \
        "${headers[@]}" \
        "https://codeberg.org/api/v1/repos/$repo_path"); then
        echo "[METADATA] Codeberg API: no data for $repo_path" >&2
        return 1
    fi

    echo "$response" | jq -r '
        [
            (.name // ""),
            (.description // ""),
            (
                if (.owner.full_name // "") != ""
                then .owner.full_name
                else (.owner.login // .owner.username // "")
                end
            ),
            (
                if .license == null then ""
                elif (.license | type) == "object"
                then (.license.spdx_id // .license.key // .license.name // "")
                else (.license | tostring)
                end
            ),
            ((.topics // []) | join("; ")),
            "",
            (.created_at // ""),
            (.updated_at // "")
        ] | .[]
    '
}

# Fetch normalized metadata for a Zenodo record.
fetch_zenodo_metadata() {
    local record_id
    local response

    record_id=$(zenodo_record_id "$1")

    if ! response=$(curl -fsS \
        --retry 2 \
        --retry-all-errors \
        --retry-delay 1 \
        --connect-timeout 10 \
        --max-time 30 \
        -H "Accept: application/json" \
        "https://zenodo.org/api/records/$record_id"); then
        if [ -n "${ZENODO_TOKEN:-}" ]; then
            response=$(curl -fsS \
                --retry 2 \
                --retry-all-errors \
                --retry-delay 1 \
                --connect-timeout 10 \
                --max-time 30 \
                -H "Accept: application/json" \
                -H "Authorization: Bearer $ZENODO_TOKEN" \
                "https://zenodo.org/api/records/$record_id") || {
                echo "[METADATA] Zenodo API: no data for record $record_id" >&2
                return 1
            }
        else
            echo "[METADATA] Zenodo API: no data for record $record_id" >&2
            return 1
        fi
    fi

    echo "$response" | jq -r '
        [
            (.metadata.title // .title // ""),
            (.metadata.description // ""),
            (
                (.metadata.creators // [])
                | map(.name // .person_or_org.name // "")
                | join("; ")
            ),
            (
                if .metadata.license == null then ""
                elif (.metadata.license | type) == "object"
                then (.metadata.license.id // .metadata.license.title // "")
                else (.metadata.license | tostring)
                end
            ),
            ((.metadata.keywords // []) | join("; ")),
            (.doi // .metadata.doi // .pids.doi.identifier // ""),
            (.created // .metadata.publication_date // ""),
            (.modified // .updated // "")
        ]
        | map(tostring | gsub("[\r\n]+"; " "))
        | .[]
    '
}

fetch_and_save_repo_metadata() {
    local repo_id="$1"
    local repo_url="$2"
    local platform="$3"
    local repo_path
    local -a metadata

    repo_path=$(echo "$repo_url" |
        sed -E 's#^https?://[^/]+/##; s#records?/##; s#\.git$##')

    case "$platform" in
        github)
            mapfile -t metadata < <(fetch_github_metadata "$repo_path")
            ;;
        codeberg)
            mapfile -t metadata < <(fetch_codeberg_metadata "$repo_path")
            ;;
        zenodo)
            mapfile -t metadata < <(fetch_zenodo_metadata "$repo_path")
            ;;
        *)
            log "[METADATA] Unsupported platform: $platform"
            return 1
            ;;
    esac

    if [ "${#metadata[@]}" -ne 8 ]; then
        log "[METADATA] Expected 8 fields for $repo_url, received ${#metadata[@]}"
        return 1
    fi

    save_repo_metadata \
        "$repo_id" \
        "${metadata[0]}" \
        "${metadata[1]}" \
        "${metadata[2]}" \
        "${metadata[3]}" \
        "${metadata[4]}" \
        "${metadata[5]}" \
        "${metadata[6]}" \
        "${metadata[7]}"

    log "[METADATA] Saved normalized metadata for $repo_url"
}
