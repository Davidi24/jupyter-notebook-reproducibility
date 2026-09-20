#!/usr/bin/env python3

import argparse
import csv
import sqlite3
from pathlib import Path

FAIRJUPYTER_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = FAIRJUPYTER_DIR.parent.parent
DEFAULT_DB_FILE = PROJECT_ROOT / "output" / "db" / "db.sqlite"
DEFAULT_CSV_DIR = FAIRJUPYTER_DIR / "pipeline_data"

# Export repositories with normalized URLs and KG resource types.
# Example output columns:
# id: 10
# repository: octocat/Hello-World
# platform: github
# repository_url: https://github.com/octocat/Hello-World
# resource_type: https://w3id.org/notebookfair#GitRepositoryResource
# notebooks_count: 2
# setups_count: 1
# requirements_count: 1
REPOSITORIES_QUERY = """
SELECT
    id,
    repository,
    COALESCE(platform, 'github') AS platform,
    CASE LOWER(COALESCE(platform, 'github'))
        WHEN 'github' THEN 'https://github.com/' || repository
        WHEN 'codeberg' THEN 'https://codeberg.org/' || repository
        WHEN 'zenodo' THEN 'https://zenodo.org/records/' || repository
        ELSE 'https://w3id.org/notebookfair/repository/' || id
    END AS repository_url,
    CASE LOWER(COALESCE(platform, 'github'))
        WHEN 'github' THEN 'https://w3id.org/notebookfair#GitRepositoryResource'
        WHEN 'codeberg' THEN 'https://w3id.org/notebookfair#GitRepositoryResource'
        WHEN 'zenodo' THEN 'https://w3id.org/notebookfair#ArchivedResearchRecord'
        ELSE 'https://w3id.org/notebookfair#RepositoryResource'
    END AS resource_type,
    notebooks_count,
    setups_count,
    requirements_count
FROM repositories
ORDER BY id;
"""

REPOSITORY_METADATA_QUERY = """
SELECT
    repo_id,
    title,
    description,
    authors,
    license,
    keywords,
    doi,
    created_at,
    updated_at,
    fetched_at
FROM repository_metadata
ORDER BY repo_id;
"""

NOTEBOOKS_QUERY = """
SELECT
    id,
    repository_id,
    name,
    language
FROM notebooks
ORDER BY id;
"""


REPOSITORY_RUNS_QUERY = """
SELECT
    id,
    repository_id,
    url,
    run_status,
    error_message,
    started_at,
    finished_at,
    duration_seconds,
    created_at
FROM repository_runs
ORDER BY id;
"""

NOTEBOOK_EXECUTIONS_QUERY = """
SELECT
    id,
    repository_run_id,
    repository_id,
    notebook_id,
    notebook_name,
    url,
    execution_status,
    execution_duration,
    total_code_cells,
    executed_cells,
    error_type,
    error_category,
    error_message,
    error_cell_index,
    error_count,
    created_at
FROM notebook_executions
ORDER BY id;
"""

REPRODUCIBILITY_METRICS_QUERY = """
SELECT
    id,
    repository_run_id,
    notebook_execution_id,
    repository_id,
    notebook_id,
    total_code_cells,
    identical_cells_count,
    different_cells_count,
    nondeterministic_cells_count,
    reproducibility_score,
    created_at
FROM notebook_reproducibility_metrics
ORDER BY id;
"""

NOTEBOOK_CLASSIFICATIONS_COLUMNS = (
    "id", "notebook_id", "notebook_path", "notebook_sha256",
    "rule_category", "rule_confidence", "llm_category", "llm_confidence",
    "llm_model", "llm_prompt_version", "agreement_status",
    "needs_human_review", "warning", "provisional_category",
    "final_category", "effective_category", "human_reviewer", "human_note",
    "human_reviewed_at", "created_at",
)

NOTEBOOK_CLASSIFICATIONS_QUERY = """
SELECT
    id,
    notebook_id,
    notebook_path,
    notebook_sha256,
    rule_category,
    rule_confidence,
    llm_category,
    llm_confidence,
    llm_model,
    llm_prompt_version,
    agreement_status,
    needs_human_review,
    warning,
    provisional_category,
    final_category,
    COALESCE(final_category, provisional_category) AS effective_category,
    human_reviewer,
    human_note,
    human_reviewed_at,
    created_at
FROM notebook_classifications
WHERE notebook_id IS NOT NULL
ORDER BY id;
"""


EXPORT_QUERIES = {
    "repositories.csv": REPOSITORIES_QUERY,
    "repository_metadata.csv": REPOSITORY_METADATA_QUERY,
    "notebooks.csv": NOTEBOOKS_QUERY,
    "repository_runs.csv": REPOSITORY_RUNS_QUERY,
    "notebook_executions.csv": NOTEBOOK_EXECUTIONS_QUERY,
    "notebook_reproducibility_metrics.csv": REPRODUCIBILITY_METRICS_QUERY,
    "notebook_classifications.csv": NOTEBOOK_CLASSIFICATIONS_QUERY,
}


# Run one database query and save its results in one CSV file.
# Process 1,000 rows at a time to keep the export fast and memory usage low.
# Return the total number of rows written to the CSV file.
def export_query(connection, query, output_file, batch_size=1000):
    cursor = connection.execute(query)
    column_names = [column[0] for column in cursor.description]
    row_count = 0

    with output_file.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(column_names)

        while True:
            rows = cursor.fetchmany(batch_size)
            if not rows:
                break

            writer.writerows(rows)
            row_count += len(rows)

    return row_count


def table_exists(connection, table_name):
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def export_empty_classifications(output_file):
    with output_file.open("w", newline="", encoding="utf-8") as csv_file:
        csv.writer(csv_file).writerow(NOTEBOOK_CLASSIFICATIONS_COLUMNS)
    return 0


# Validate the database path, create the output folder, and open SQLite in
# read-only mode. Then run every query in EXPORT_QUERIES, write each result
# into its own CSV file, print the exported row count, and close the database.
def export_all_tables(db_file, output_dir):
    db_file = db_file.resolve()
    output_dir = output_dir.resolve()

    if not db_file.is_file():
        raise FileNotFoundError(f"Database not found: {db_file}")

    output_dir.mkdir(parents=True, exist_ok=True)

    database_uri = db_file.as_uri() + "?mode=ro"
    connection = sqlite3.connect(database_uri, uri=True)

    try:
        for filename, query in EXPORT_QUERIES.items():
            output_file = output_dir / filename
            if (
                filename == "notebook_classifications.csv"
                and not table_exists(connection, "notebook_classifications")
            ):
                row_count = export_empty_classifications(output_file)
            else:
                row_count = export_query(connection, query, output_file)

            print(
                f"[KG EXPORT] {row_count} rows written to {output_file}"
            )
    finally:
        connection.close()


# Read optional database and CSV output paths from the terminal.
def parse_arguments():
    parser = argparse.ArgumentParser(
        description="Export pipeline SQLite data for the FAIR Jupyter KG."
    )

    parser.add_argument(
        "--db-file",
        type=Path,
        default=DEFAULT_DB_FILE,
        help="Path to the pipeline SQLite database.",
    )

    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_CSV_DIR,
        help="Folder where the CSV files will be created.",
    )

    return parser.parse_args()

def main():
    arguments = parse_arguments()

    try:
        export_all_tables(
            arguments.db_file,
            arguments.output_dir,
        )
    except (OSError, sqlite3.Error) as error:
        print(f"[KG EXPORT] FAILED: {error}")
        return 1

    print("[KG EXPORT] All CSV files created successfully")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
