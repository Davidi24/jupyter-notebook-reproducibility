"""Shared categories used by rules, the local LLM, and human review."""

CATEGORY_DEFINITIONS = {
    "data_preparation": "Cleans, transforms, combines, or prepares data.",
    "data_analysis": "Explores data, computes statistics, or answers research questions.",
    "visualization": "Primarily creates plots, charts, dashboards, or visual reports.",
    "machine_learning": "Trains, evaluates, or applies predictive or learned models.",
    "simulation": "Models systems, runs simulations, or performs numerical experiments.",
    "tutorial": "Teaches a method or demonstrates how to use a tool or dataset.",
    "software_development": "Develops, tests, or demonstrates reusable software components.",
    "mixed_purpose": "Has two or more equally important purposes.",
    "uncertain": "Does not contain enough evidence for a reliable category.",
}

CORE_CATEGORIES = tuple(
    category
    for category in CATEGORY_DEFINITIONS
    if category not in {"mixed_purpose", "uncertain"}
)
ALL_CATEGORIES = tuple(CATEGORY_DEFINITIONS)


def validate_category(category):
    if category not in CATEGORY_DEFINITIONS:
        choices = ", ".join(ALL_CATEGORIES)
        raise ValueError(f"Unknown category {category!r}. Expected one of: {choices}")
    return category
