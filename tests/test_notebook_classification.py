import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

import nbformat

from analysis.nbprocess.collector import collect_notebook
from analysis.notebook_classification.hybrid import classify_notebook
from analysis.notebook_classification.evaluation import evaluate_reviewed_classifications
from analysis.notebook_classification.local_llm import classify_with_local_llm
from analysis.notebook_classification.rules import classify_with_rules
from analysis.notebook_classification.storage import (
    get_classification,
    open_database,
    review_classification,
    save_classification,
)


class FakeResponse:
    def __init__(self, category, confidence=0.9, secondary=None):
        content = {
            "primary_category": category,
            "secondary_categories": secondary or [],
            "confidence": confidence,
            "reason": f"Synthetic {category} evidence.",
            "evidence": [f"signal:{category}"],
        }
        self.data = {
            "model": "test-local-model",
            "message": {"content": json.dumps(content)},
        }

    def raise_for_status(self):
        return None

    def json(self):
        return self.data


def fake_request(category, confidence=0.9, secondary=None):
    def request(url, json=None, timeout=None):
        return FakeResponse(category, confidence, secondary)

    return request


class NotebookClassificationTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.notebook_path = Path(self.temporary_directory.name) / "visualization.ipynb"
        notebook = nbformat.v4.new_notebook(
            metadata={"kernelspec": {"name": "python3", "display_name": "Python 3"}},
            cells=[
                nbformat.v4.new_markdown_cell("# Visualization example"),
                nbformat.v4.new_code_cell(
                    "import numpy as np\nimport matplotlib.pyplot as plt\n"
                    "x = np.arange(5)\nplt.plot(x, x ** 2)",
                    outputs=[
                        nbformat.v4.new_output(
                            "display_data",
                            data={"image/png": "cGxhY2Vob2xkZXI="},
                            metadata={},
                        )
                    ],
                ),
            ],
        )
        nbformat.write(notebook, self.notebook_path)

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_collector_extracts_cells_imports_and_outputs(self):
        collected = collect_notebook(self.notebook_path)
        self.assertEqual(collected["imports"], ["matplotlib", "numpy"])
        self.assertEqual(collected["cell_counts"], {"markdown": 1, "code": 1, "raw": 0})
        self.assertEqual(collected["outputs"][0]["type"], "display_data")
        self.assertEqual(collected["outputs"][0]["mime_types"], ["image/png"])

    def test_collector_keeps_imports_after_line_magic(self):
        notebook = nbformat.v4.new_notebook(
            cells=[nbformat.v4.new_code_cell("%matplotlib inline\nimport pandas as pd")]
        )
        magic_path = Path(self.temporary_directory.name) / "magic.ipynb"
        nbformat.write(notebook, magic_path)
        self.assertEqual(collect_notebook(magic_path)["imports"], ["pandas"])

    def test_rule_classifier_uses_weighted_evidence(self):
        result = classify_with_rules(collect_notebook(self.notebook_path))
        self.assertEqual(result.primary_category, "visualization")
        self.assertGreaterEqual(result.confidence, 0.55)
        self.assertIn("import:matplotlib", result.evidence)
        plot_statistic = next(
            statistic
            for statistic in result.signal_statistics["visualization"]
            if "plt\\." in statistic["pattern"]
        )
        self.assertEqual(plot_statistic["match_count"], 1)
        self.assertEqual(plot_statistic["matching_cells"], 1)
        self.assertEqual(plot_statistic["total_cells"], 2)
        self.assertEqual(plot_statistic["cell_coverage"], 0.5)
        self.assertEqual(plot_statistic["awarded_points"], 1.5)

    def test_rule_classifier_records_uncapped_matches_and_capped_points(self):
        collected = {
            "imports": [],
            "markdown_cells": [" ".join(["chart"] * 50)],
            "code_cells": [],
            "outputs": [],
        }

        result = classify_with_rules(collected)
        chart_statistic = next(
            statistic
            for statistic in result.signal_statistics["visualization"]
            if "chart" in statistic["pattern"]
        )

        self.assertEqual(chart_statistic["match_count"], 50)
        self.assertEqual(chart_statistic["counted_matches"], 3)
        self.assertEqual(chart_statistic["matching_cells"], 1)
        self.assertEqual(chart_statistic["total_cells"], 1)
        self.assertEqual(chart_statistic["cell_coverage"], 1.0)
        self.assertEqual(chart_statistic["awarded_points"], 4.5)

    def test_local_llm_requires_structured_category(self):
        result = classify_with_local_llm(
            collect_notebook(self.notebook_path),
            requester=fake_request("visualization", secondary=["data_analysis"]),
        )
        self.assertEqual(result.primary_category, "visualization")
        self.assertEqual(result.model_name, "test-local-model")

    def test_hybrid_accepts_confident_agreement(self):
        result = classify_notebook(
            self.notebook_path,
            llm_requester=fake_request("visualization", 0.95),
        )
        self.assertEqual(result.agreement_status, "AGREED")
        self.assertFalse(result.needs_human_review)
        self.assertEqual(result.effective_category, "visualization")

    def test_hybrid_warns_on_disagreement(self):
        result = classify_notebook(
            self.notebook_path,
            llm_requester=fake_request("tutorial", 0.95),
        )
        self.assertEqual(result.agreement_status, "CLASSIFIER_DISAGREEMENT")
        self.assertTrue(result.needs_human_review)
        self.assertIsNone(result.effective_category)
        self.assertIn("human clarification", result.warning)

    def test_sqlite_persistence_and_human_review(self):
        database_path = Path(self.temporary_directory.name) / "classification.sqlite"
        connection = sqlite3.connect(database_path)
        connection.execute(
            "CREATE TABLE notebooks (id INTEGER PRIMARY KEY, repository_id INTEGER, "
            "name TEXT, language TEXT)"
        )
        connection.execute(
            "INSERT INTO notebooks (id, name, language) VALUES (7, ?, 'python')",
            (self.notebook_path.name,),
        )
        connection.commit()
        connection.close()

        connection = open_database(database_path)
        try:
            result = classify_notebook(
                self.notebook_path,
                llm_requester=fake_request("tutorial", 0.95),
            )
            classification_id = save_classification(connection, result)
            stored = get_classification(connection, classification_id)
            self.assertEqual(stored["notebook_id"], 7)
            self.assertEqual(stored["needs_human_review"], 1)

            review_classification(
                connection,
                classification_id,
                "visualization",
                "David",
                "Confirmed from plots and notebook description.",
            )
            reviewed = get_classification(connection, classification_id)
            self.assertEqual(reviewed["agreement_status"], "HUMAN_REVIEWED")
            self.assertEqual(reviewed["final_category"], "visualization")
            self.assertEqual(reviewed["needs_human_review"], 0)

            evaluation = evaluate_reviewed_classifications(connection)
            self.assertEqual(evaluation["human_reviewed_items"], 1)
            self.assertEqual(evaluation["rule_based"]["accuracy"], 1.0)
            self.assertEqual(evaluation["local_llm"]["accuracy"], 0.0)
            self.assertEqual(evaluation["hybrid_provisional"]["coverage"], 0.0)
        finally:
            connection.close()


if __name__ == "__main__":
    unittest.main()
