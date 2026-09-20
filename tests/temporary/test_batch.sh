#!/bin/bash
set -e
cd "$(dirname "$0")/../.."

REAL_DB="data/output/db/db.sqlite"
BACKUP="data/output/db/db.sqlite.bak"

# --- EDIT THESE: your test targets ---
CODEBERG_REPO="tplasdio/ipynb-py-convert"
CODEBERG_NB="examples/plot.ipynb"
ZENODO_RECORD="3362625"
ZENODO_NB="Tutorial1.ipynb"
# -------------------------------------

# 1. Backup real DB, auto-restore on exit
cp "$REAL_DB" "$BACKUP"
trap 'mv "$BACKUP" "$REAL_DB"; echo "[TEST] Real DB restored."' EXIT

# 2. Fresh test DB: same schema, only test rows
rm -f "$REAL_DB"
sqlite3 "$BACKUP" ".schema" | grep -v "sqlite_sequence" | sqlite3 "$REAL_DB"
sqlite3 "$REAL_DB" <<SQL
INSERT INTO repositories (repository, platform, notebooks, setups, requirements, notebooks_count, setups_count, requirements_count)
VALUES ('$CODEBERG_REPO', 'codeberg', '$CODEBERG_NB', '', '', 1, 0, 0);
INSERT INTO repositories (repository, platform, notebooks, setups, requirements, notebooks_count, setups_count, requirements_count)
VALUES ('$ZENODO_RECORD', 'zenodo', '$ZENODO_NB', '', '', 1, 0, 0);
SQL
echo "[TEST] Test DB ready:"
sqlite3 "$REAL_DB" "SELECT id, repository, platform FROM repositories;"

# 3. Run batch
TARGET_COUNT=2 ./run.sh

# 4. Verify
echo "[TEST] === repository_runs ==="
sqlite3 "$REAL_DB" "SELECT repository_id, url, run_status FROM repository_runs;"
echo "[TEST] === notebook_executions ==="
sqlite3 "$REAL_DB" "SELECT repository_id, notebook_name, execution_status, executed_cells FROM notebook_executions;"
echo "[TEST] === reproducibility ==="
sqlite3 "$REAL_DB" "SELECT repository_id, reproducibility_score FROM notebook_reproducibility_metrics;"

# 5. Keep results for inspection
cp "$REAL_DB" "data/db.test.sqlite"
echo "[TEST] Results saved to data/db.test.sqlite"