"""Transparent weighted rules for notebook-purpose classification."""

import re
from collections import defaultdict

from .categories import CORE_CATEGORIES
from .models import ClassifierResult

RULE_VERSION = "1.1.0"

PACKAGE_SIGNALS = {
    "data_preparation": {"pandas", "polars", "dask", "petl", "openpyxl"},
    "data_analysis": {"numpy", "scipy", "statsmodels", "pingouin", "sympy"},
    "visualization": {"matplotlib", "seaborn", "plotly", "altair", "bokeh"},
    "machine_learning": {
        "sklearn", "tensorflow", "keras", "torch", "xgboost", "lightgbm",
        "transformers", "catboost",
    },
    "simulation": {"simpy", "pymc", "mesa", "simpeg", "fenics"},
    "software_development": {"pytest", "unittest", "click", "typer", "flask", "fastapi"},
}

TEXT_SIGNALS = {
    "data_preparation": (
        r"\b(data clean(?:ing)?|preprocess(?:ing)?|feature engineering)\b",
        r"\b(dropna|fillna|merge|join|pivot|melt|rename|astype)\s*\(",
    ),
    "data_analysis": (
        r"\b(exploratory data analysis|statistical analysis|hypothesis test|correlation)\b",
        r"\b(describe|corr|mean|median|std|anova|ttest)\s*\(",
    ),
    "visualization": (
        r"\b(data visuali[sz]ation|plotting|chart|dashboard)\b",
        r"\b(plt\.|sns\.|px\.|go\.|alt\.|\.plot\s*\()",
    ),
    "machine_learning": (
        r"\b(machine learning|deep learning|neural network|classification|regression model)\b",
        r"\b(train_test_split|\.fit\s*\(|\.predict\s*\(|cross_val_score)",
    ),
    "simulation": (
        r"\b(simulation|monte carlo|agent-based model|numerical experiment)\b",
        r"\b(odeint|solve_ivp|random\.normal|random\.uniform)\b",
    ),
    "tutorial": (
        r"\b(tutorial|walkthrough|step[- ]by[- ]step|getting started|how to)\b",
        r"\b(this notebook demonstrates|in this example|learning objectives?)\b",
    ),
    "software_development": (
        r"\b(unit test|integration test|software package|command[- ]line|api endpoint)\b",
        r"\b(pytest\.|unittest\.|argparse\.|click\.|FastAPI\s*\()",
    ),
}


def _add_signal(scores, evidence, category, points, description):
    scores[category] += points
    evidence[category].append(description)


def classify_with_rules(collected):
    scores = defaultdict(float, {category: 0.0 for category in CORE_CATEGORIES})
    evidence = defaultdict(list)
    signal_statistics = defaultdict(list)

    for package in collected.get("imports", []):
        for category, packages in PACKAGE_SIGNALS.items():
            if package.lower() in packages:
                _add_signal(scores, evidence, category, 3.0, f"import:{package}")

    markdown_cells = collected.get("markdown_cells", [])
    code_cells = collected.get("code_cells", [])
    searchable_cells = [*markdown_cells, *code_cells]
    markdown = "\n".join(markdown_cells).lower()
    code = "\n".join(code_cells).lower()
    searchable_text = f"{markdown}\n{code}"

    for category, patterns in TEXT_SIGNALS.items():
        for pattern in patterns:
            matches = re.findall(pattern, searchable_text, flags=re.IGNORECASE)
            if matches:
                match_count = len(matches)
                counted_matches = min(match_count, 3)
                points = counted_matches * 1.5
                matching_cells = sum(
                    bool(re.search(pattern, cell, flags=re.IGNORECASE))
                    for cell in searchable_cells
                )
                total_cells = len(searchable_cells)
                cell_coverage = matching_cells / total_cells if total_cells else 0.0
                signal_statistics[category].append(
                    {
                        "pattern": pattern,
                        "match_count": match_count,
                        "counted_matches": counted_matches,
                        "matching_cells": matching_cells,
                        "total_cells": total_cells,
                        "cell_coverage": round(cell_coverage, 3),
                        "awarded_points": round(points, 3),
                    }
                )
                _add_signal(scores, evidence, category, points, f"pattern:{pattern}")

    image_outputs = sum(
        any(mime.startswith("image/") for mime in output.get("mime_types", []))
        for output in collected.get("outputs", [])
    )
    if image_outputs:
        _add_signal(
            scores,
            evidence,
            "visualization",
            min(image_outputs, 3) * 1.0,
            f"image outputs:{image_outputs}",
        )

    ordered = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    top_category, top_score = ordered[0]
    second_category, second_score = ordered[1]
    total_score = sum(scores.values())

    # Case 1: The best score is too low, so there is not enough evidence.
    if top_score < 2.0:
        return ClassifierResult(
            method="rule_based",
            primary_category="uncertain",
            secondary_categories=[],
            confidence=0.0,
            reason="The notebook did not contain enough recognized evidence.",
            scores={key: round(value, 3) for key, value in scores.items()},
            signal_statistics=dict(signal_statistics),
            version=RULE_VERSION,
        )

    # Case 2: Use the highest score as primary and keep other strong scores as secondary.
    secondary = [
        category
        for category, score in ordered[1:]
        if score >= 2.0 and score >= top_score * 0.65
    ]
    strength = min(1.0, top_score / 6.0)
    confidence = round((top_score / total_score) * strength, 3)
    primary = top_category

    # Case 3: The two best scores are almost equal, so the notebook has mixed purposes.
    if second_score >= 3.0 and second_score >= top_score * 0.9:
        primary = "mixed_purpose"
        secondary = [top_category, second_category]
        combined = top_score + second_score
        confidence = round(min(0.95, combined / total_score * min(1.0, combined / 8.0)), 3)

    leading_categories = secondary if primary == "mixed_purpose" else [primary]
    leading_evidence = []
    for category in leading_categories:
        leading_evidence.extend(evidence[category])

    reason = (
        f"Highest weighted evidence: {top_category}={top_score:g}; "
        f"next: {second_category}={second_score:g}."
    )
    return ClassifierResult(
        method="rule_based",
        primary_category=primary,
        secondary_categories=secondary,
        confidence=confidence,
        reason=reason,
        evidence=leading_evidence,
        scores={key: round(value, 3) for key, value in scores.items()},
        signal_statistics=dict(signal_statistics),
        version=RULE_VERSION,
    )
