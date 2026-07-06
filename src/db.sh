#!/bin/bash
# db.sh — All SQLite database interactions
# DB_FILE = data/db.sqlite
# Current pipeline reads and writes this database.

ensure_pipeline_tables() {
    mkdir -p "$(dirname "$DB_FILE")"
    sqlite3 "$DB_FILE" << SQLEOF
CREATE TABLE IF NOT EXISTS repositories (id INTEGER PRIMARY KEY AUTOINCREMENT, repository TEXT, notebooks TEXT, setups TEXT, requirements TEXT, notebooks_count INTEGER, setups_count INTEGER, requirements_count INTEGER);
CREATE TABLE IF NOT EXISTS notebooks (id INTEGER PRIMARY KEY AUTOINCREMENT, repository_id INTEGER, name TEXT, language TEXT, FOREIGN KEY (repository_id) REFERENCES repositories(id));
CREATE TABLE IF NOT EXISTS repository_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, repository_id INTEGER NOT NULL, url TEXT, run_status TEXT NOT NULL, error_message TEXT, started_at TEXT, finished_at TEXT, duration_seconds FLOAT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (repository_id) REFERENCES repositories(id));
CREATE TABLE IF NOT EXISTS notebook_executions (id INTEGER PRIMARY KEY AUTOINCREMENT, repository_run_id INTEGER NOT NULL, repository_id INTEGER NOT NULL, notebook_id INTEGER NOT NULL, notebook_name TEXT, url TEXT, execution_status TEXT, execution_duration FLOAT, total_code_cells INTEGER, executed_cells INTEGER, error_type TEXT, error_category TEXT, error_message TEXT, error_cell_index INTEGER, error_count INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(repository_run_id, notebook_id), FOREIGN KEY (repository_run_id) REFERENCES repository_runs(id), FOREIGN KEY (repository_id) REFERENCES repositories(id), FOREIGN KEY (notebook_id) REFERENCES notebooks(id));
CREATE TABLE IF NOT EXISTS notebook_reproducibility_metrics (id INTEGER PRIMARY KEY AUTOINCREMENT, repository_run_id INTEGER NOT NULL, notebook_execution_id INTEGER NOT NULL, repository_id INTEGER NOT NULL, notebook_id INTEGER NOT NULL, total_code_cells INTEGER, identical_cells_count INTEGER, different_cells_count INTEGER, nondeterministic_cells_count INTEGER, identical_cells TEXT, different_cells TEXT, nondeterministic_cells TEXT, reproducibility_score REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(repository_run_id, notebook_id), FOREIGN KEY (repository_run_id) REFERENCES repository_runs(id), FOREIGN KEY (notebook_execution_id) REFERENCES notebook_executions(id), FOREIGN KEY (repository_id) REFERENCES repositories(id), FOREIGN KEY (notebook_id) REFERENCES notebooks(id));
SQLEOF
    
    # Migration: add 'platform' column to repositories if missing
    if ! sqlite3 "$DB_FILE" "PRAGMA table_info(repositories);" | awk -F'|' '{print $2}' | grep -q '^platform$'; then
        sqlite3 "$DB_FILE" "ALTER TABLE repositories ADD COLUMN platform TEXT DEFAULT 'github';"
        echo "[DB] Migration: added 'platform' column to repositories"
    fi
}

get_notebook_id_from_db() {
    sqlite3 "$DB_FILE" "SELECT id FROM notebooks WHERE name = '$1';"
}

get_repo_id_from_db() {
    local repo_path
    local platform
    
    repo_path=$(echo "$1" | sed -E 's#^https?://[^/]+/##; s#records?/##; s#\.git$##')
    platform=$(detect_platform "$1")
    
    sqlite3 "$DB_FILE" "SELECT id FROM repositories WHERE repository = '$repo_path' AND platform = '$platform' LIMIT 1;"
}

column_exists() {
    sqlite3 "$DB_FILE" "PRAGMA table_info($1);" | awk -F'|' '{print $2}' | grep -q "^$2$"
}
