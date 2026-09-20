"""Coordinate collection, rules, local LLM classification, and human review."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from analysis.nbprocess.collector import COLLECTOR_VERSION, collect_notebook

from .categories import validate_category
from .local_llm import (
    DEFAULT_BASE_URL,
    DEFAULT_MODEL,
    DEFAULT_TIMEOUT,
    LocalLLMError,
    classify_with_local_llm,
)
from .models import ClassificationResult
from .rules import classify_with_rules


def _notebook_hash(path, collected):
    notebook_path = Path(path)
    if notebook_path.is_file():
        return hashlib.sha256(notebook_path.read_bytes()).hexdigest()
    serialized = json.dumps(collected, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()


def _reconcile(rule_result, llm_result, llm_error, confidence_threshold):
    if rule_result is None and llm_result is None:
        warning = (
            "Neither classifier produced a result; human clarification is required."
            if llm_error is None
            else (
                "The local LLM was unavailable and the rule-based classifier was not "
                f"requested; human clarification is required: {llm_error}"
            )
        )
        return "LLM_UNAVAILABLE", True, warning, None

    if rule_result is None:
        return (
            "RULE_NOT_REQUESTED",
            True,
            "The rule-based classifier was not requested; human clarification is required.",
            llm_result.primary_category,
        )

    if llm_result is None:
        status = "LLM_NOT_REQUESTED" if llm_error is None else "LLM_UNAVAILABLE"
        warning = (
            "The local LLM was not requested; human clarification is required."
            if llm_error is None
            else f"The local LLM was unavailable; human clarification is required: {llm_error}"
        )
        return status, True, warning, rule_result.primary_category

    rule_low = rule_result.confidence < confidence_threshold
    llm_low = llm_result.confidence < confidence_threshold
    same_primary = rule_result.primary_category == llm_result.primary_category
    partial = (
        rule_result.primary_category in llm_result.secondary_categories
        or llm_result.primary_category in rule_result.secondary_categories
    )

    if rule_result.primary_category == "uncertain" and llm_result.primary_category == "uncertain":
        return (
            "BOTH_UNCERTAIN",
            True,
            "Both classifiers are uncertain; human clarification is required.",
            None,
        )
    if same_primary and not rule_low and not llm_low:
        return "AGREED", False, None, rule_result.primary_category
    if same_primary:
        return (
            "AGREED_LOW_CONFIDENCE",
            True,
            "The classifiers agree, but at least one confidence value is low.",
            rule_result.primary_category,
        )
    if partial:
        return (
            "PARTIAL_AGREEMENT",
            True,
            "A primary category appears only as the other classifier's secondary category.",
            None,
        )
    if rule_low and llm_low:
        status = "BOTH_LOW_CONFIDENCE"
    elif rule_low:
        status = "RULE_LOW_CONFIDENCE"
    elif llm_low:
        status = "LLM_LOW_CONFIDENCE"
    else:
        status = "CLASSIFIER_DISAGREEMENT"
    return (
        status,
        True,
        "Rule-based and local-LLM classifications require human clarification.",
        None,
    )


def classify_notebook(
    path,
    use_rules=True,
    use_llm=True,
    model=DEFAULT_MODEL,
    base_url=DEFAULT_BASE_URL,
    timeout=DEFAULT_TIMEOUT,
    confidence_threshold=0.55,
    llm_requester=None,
):
    if not use_rules and not use_llm:
        raise ValueError(
            "At least one classification method must be enabled: choose the "
            "rule-based classifier, the AI-based classifier, or both."
        )

    collected = collect_notebook(path)
    rule_result = classify_with_rules(collected) if use_rules else None
    llm_result = None
    llm_error = None

    if use_llm:
        try:
            arguments = {
                "model": model,
                "base_url": base_url,
                "timeout": timeout,
            }
            if llm_requester is not None:
                arguments["requester"] = llm_requester
            llm_result = classify_with_local_llm(collected, **arguments)
        except LocalLLMError as error:
            llm_error = str(error)

    status, needs_review, warning, provisional = _reconcile(
        rule_result,
        llm_result,
        llm_error,
        confidence_threshold,
    )
    return ClassificationResult(
        notebook_path=str(Path(path)),
        notebook_sha256=_notebook_hash(path, collected),
        collector_version=COLLECTOR_VERSION,
        collection_stats={
            "cell_counts": collected.get("cell_counts", {}),
            "import_count": len(collected.get("imports", [])),
            "output_count": len(collected.get("outputs", [])),
        },
        rule_result=rule_result,
        llm_result=llm_result,
        agreement_status=status,
        needs_human_review=needs_review,
        warning=warning,
        provisional_category=provisional,
        llm_error=llm_error,
    )


def apply_human_review(result, category, reviewer, note=""):
    validate_category(category)
    if not reviewer or not reviewer.strip():
        raise ValueError("A human reviewer name is required")
    result.final_category = category
    result.human_reviewer = reviewer.strip()
    result.human_note = note.strip() or None
    result.human_reviewed_at = datetime.now(timezone.utc).isoformat()
    result.agreement_status = "HUMAN_REVIEWED"
    result.needs_human_review = False
    result.warning = None
    return result
