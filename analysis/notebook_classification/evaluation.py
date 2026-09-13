"""Evaluate rule, local-LLM, and hybrid predictions against human decisions."""

import csv
import json
import random
from pathlib import Path


def _method_metrics(rows, prediction_field):
    pairs = [
        (row["final_category"], row[prediction_field])
        for row in rows
        if row[prediction_field]
    ]
    if not pairs:
        return {
            "evaluated": 0,
            "coverage": 0.0,
            "accuracy": None,
            "macro_precision": None,
            "macro_recall": None,
            "macro_f1": None,
            "per_category": {},
        }

    categories = sorted({value for pair in pairs for value in pair})
    per_category = {}
    for category in categories:
        true_positive = sum(truth == category and prediction == category for truth, prediction in pairs)
        false_positive = sum(truth != category and prediction == category for truth, prediction in pairs)
        false_negative = sum(truth == category and prediction != category for truth, prediction in pairs)
        support = sum(truth == category for truth, _ in pairs)
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
        recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per_category[category] = {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "support": support,
        }

    accuracy = sum(truth == prediction for truth, prediction in pairs) / len(pairs)
    return {
        "evaluated": len(pairs),
        "coverage": round(len(pairs) / len(rows), 4),
        "accuracy": round(accuracy, 4),
        "macro_precision": round(
            sum(item["precision"] for item in per_category.values()) / len(per_category), 4
        ),
        "macro_recall": round(
            sum(item["recall"] for item in per_category.values()) / len(per_category), 4
        ),
        "macro_f1": round(
            sum(item["f1"] for item in per_category.values()) / len(per_category), 4
        ),
        "per_category": per_category,
    }


def evaluate_reviewed_classifications(connection):
    rows = connection.execute(
        """
        SELECT rule_category, llm_category, provisional_category, final_category
        FROM notebook_classifications
        WHERE final_category IS NOT NULL
        ORDER BY id
        """
    ).fetchall()
    comparable = [row for row in rows if row["llm_category"] and row["rule_category"]]
    disagreements = sum(
        row["rule_category"] != row["llm_category"] for row in comparable
    )
    return {
        "human_reviewed_items": len(rows),
        "rule_llm_comparable_items": len(comparable),
        "rule_llm_disagreement_rate": (
            round(disagreements / len(comparable), 4) if comparable else None
        ),
        "rule_based": _method_metrics(rows, "rule_category"),
        "local_llm": _method_metrics(rows, "llm_category"),
        "hybrid_provisional": _method_metrics(rows, "provisional_category"),
    }


def write_evaluation(report, output_file):
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def export_review_queue(
    connection,
    output_file,
    include_all=False,
    blind=False,
    sample_size=None,
    seed=2026,
):
    query = """
        SELECT id, notebook_path, rule_category, rule_confidence,
               llm_category, llm_confidence, agreement_status, warning,
               '' AS human_category, '' AS reviewer, '' AS note
        FROM notebook_classifications
    """
    if not include_all:
        query += " WHERE needs_human_review = 1"
    query += " ORDER BY id"
    rows = list(connection.execute(query).fetchall())
    if sample_size is not None:
        if sample_size < 1:
            raise ValueError("Sample size must be at least 1")
        rows = random.Random(seed).sample(rows, min(sample_size, len(rows)))
        rows.sort(key=lambda row: row["id"])
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        if blind:
            writer.writerow(("id", "notebook_path", "human_category", "reviewer", "note"))
            writer.writerows(
                (row["id"], row["notebook_path"], "", "", "") for row in rows
            )
        else:
            writer.writerow(rows[0].keys() if rows else (
                "id", "notebook_path", "rule_category", "rule_confidence",
                "llm_category", "llm_confidence", "agreement_status", "warning",
                "human_category", "reviewer", "note",
            ))
            writer.writerows(rows)
    return len(rows)
