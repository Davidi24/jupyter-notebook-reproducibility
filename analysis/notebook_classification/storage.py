"""SQLite persistence for raw, reconciled, and human-reviewed classifications."""

import json
import sqlite3
import csv
from datetime import datetime, timezone
from pathlib import Path

from .categories import validate_category

CLASSIFICATION_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS notebook_classifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notebook_id INTEGER,
    notebook_path TEXT NOT NULL,
    notebook_sha256 TEXT NOT NULL,
    rule_category TEXT NOT NULL,
    rule_confidence REAL NOT NULL,
    llm_category TEXT,
    llm_confidence REAL,
    llm_model TEXT,
    llm_prompt_version TEXT,
    agreement_status TEXT NOT NULL,
    needs_human_review INTEGER NOT NULL DEFAULT 1,
    warning TEXT,
    provisional_category TEXT,
    final_category TEXT,
    human_reviewer TEXT,
    human_note TEXT,
    human_reviewed_at TEXT,
    result_json TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (notebook_id) REFERENCES notebooks(id)
);
CREATE INDEX IF NOT EXISTS idx_notebook_classifications_notebook
    ON notebook_classifications(notebook_id);
CREATE INDEX IF NOT EXISTS idx_notebook_classifications_review
    ON notebook_classifications(needs_human_review, agreement_status);
"""


def open_database(path):
    database_path = Path(path)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    ensure_classification_table(connection)
    return connection


def ensure_classification_table(connection):
    connection.executescript(CLASSIFICATION_TABLE_SQL)
    connection.commit()


def resolve_notebook_id(connection, notebook_path):
    notebooks_table = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'notebooks'"
    ).fetchone()
    if notebooks_table is None:
        return None
    path = Path(notebook_path)
    candidates = {str(path), path.as_posix(), path.name}
    placeholders = ",".join("?" for _ in candidates)
    rows = connection.execute(
        f"SELECT id FROM notebooks WHERE name IN ({placeholders}) ORDER BY id",
        tuple(candidates),
    ).fetchall()
    identifiers = {row["id"] for row in rows}
    return identifiers.pop() if len(identifiers) == 1 else None


def save_classification(connection, result, notebook_id=None):
    if notebook_id is None:
        notebook_id = resolve_notebook_id(connection, result.notebook_path)
    llm = result.llm_result
    cursor = connection.execute(
        """
        INSERT INTO notebook_classifications (
            notebook_id, notebook_path, notebook_sha256,
            rule_category, rule_confidence,
            llm_category, llm_confidence, llm_model, llm_prompt_version,
            agreement_status, needs_human_review, warning,
            provisional_category, final_category,
            human_reviewer, human_note, human_reviewed_at, result_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            notebook_id,
            result.notebook_path,
            result.notebook_sha256,
            result.rule_result.primary_category,
            result.rule_result.confidence,
            llm.primary_category if llm else None,
            llm.confidence if llm else None,
            llm.model_name if llm else None,
            llm.version if llm else None,
            result.agreement_status,
            int(result.needs_human_review),
            result.warning,
            result.provisional_category,
            result.final_category,
            result.human_reviewer,
            result.human_note,
            result.human_reviewed_at,
            json.dumps(result.to_dict(), ensure_ascii=False, sort_keys=True),
        ),
    )
    connection.commit()
    return cursor.lastrowid


def review_classification(connection, classification_id, category, reviewer, note=""):
    validate_category(category)
    reviewer = reviewer.strip()
    if not reviewer:
        raise ValueError("A human reviewer name is required")
    row = connection.execute(
        "SELECT result_json FROM notebook_classifications WHERE id = ?",
        (classification_id,),
    ).fetchone()
    if row is None:
        raise ValueError(f"Classification ID {classification_id} was not found")

    reviewed_at = datetime.now(timezone.utc).isoformat()
    result_data = json.loads(row["result_json"])
    result_data.setdefault("initial_agreement_status", result_data.get("agreement_status"))
    result_data.update(
        {
            "final_category": category,
            "effective_category": category,
            "agreement_status": "HUMAN_REVIEWED",
            "needs_human_review": False,
            "warning": None,
            "human_reviewer": reviewer,
            "human_note": note.strip() or None,
            "human_reviewed_at": reviewed_at,
        }
    )
    connection.execute(
        """
        UPDATE notebook_classifications
        SET final_category = ?, human_reviewer = ?, human_note = ?,
            human_reviewed_at = ?,
            agreement_status = 'HUMAN_REVIEWED', needs_human_review = 0,
            warning = NULL, result_json = ?
        WHERE id = ?
        """,
        (
            category,
            reviewer,
            note.strip() or None,
            reviewed_at,
            json.dumps(result_data, ensure_ascii=False, sort_keys=True),
            classification_id,
        ),
    )
    connection.commit()


def get_classification(connection, classification_id):
    row = connection.execute(
        "SELECT * FROM notebook_classifications WHERE id = ?",
        (classification_id,),
    ).fetchone()
    return dict(row) if row else None


def apply_review_file(connection, input_file):
    reviewed = 0
    with Path(input_file).open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        required = {"id", "human_category", "reviewer"}
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Review CSV is missing columns: {', '.join(sorted(missing))}")
        for row in reader:
            category = (row.get("human_category") or "").strip()
            reviewer = (row.get("reviewer") or "").strip()
            if not category:
                continue
            review_classification(
                connection,
                int(row["id"]),
                category,
                reviewer,
                row.get("note") or "",
            )
            reviewed += 1
    return reviewed
