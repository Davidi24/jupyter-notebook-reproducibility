"""Command-line interface for free hybrid notebook classification."""

import argparse
import json
import sys
from pathlib import Path

from .categories import ALL_CATEGORIES
from .evaluation import (
    evaluate_reviewed_classifications,
    export_review_queue,
    write_evaluation,
)
from .hybrid import classify_notebook
from .local_llm import DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_TIMEOUT
from .storage import (
    apply_review_file,
    get_classification,
    open_database,
    review_classification,
    save_classification,
)


def _notebook_paths(inputs):
    notebooks = []
    for value in inputs:
        path = Path(value)
        if path.is_dir():
            notebooks.extend(sorted(path.rglob("*.ipynb")))
        elif path.suffix.lower() == ".ipynb":
            notebooks.append(path)
        else:
            raise ValueError(f"Expected a notebook or directory: {path}")
    return list(dict.fromkeys(path.resolve() for path in notebooks))


def _classification_parser(subparsers):
    parser = subparsers.add_parser("classify", help="Classify notebooks or directories.")
    parser.add_argument("paths", nargs="+", help="Notebook files or directories.")
    parser.add_argument("--rule-only", action="store_true", help="Skip the local LLM.")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Installed Ollama model name.")
    parser.add_argument("--ollama-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    parser.add_argument("--confidence-threshold", type=float, default=0.55)
    parser.add_argument("--db-file", type=Path, help="Optional SQLite database to store results.")
    parser.add_argument(
        "--notebook-id",
        type=int,
        help="Database ID of the notebook being classified.",
    )
    parser.add_argument("--output", type=Path, help="Optional JSON output file.")
    return parser


def _review_parser(subparsers):
    parser = subparsers.add_parser("review", help="Save a human clarification.")
    parser.add_argument("--db-file", type=Path, required=True)
    parser.add_argument("--classification-id", type=int, required=True)
    parser.add_argument("--category", choices=ALL_CATEGORIES, required=True)
    parser.add_argument("--reviewer", required=True)
    parser.add_argument("--note", default="")
    return parser


def _queue_parser(subparsers):
    parser = subparsers.add_parser("review-queue", help="Export classifications for review.")
    parser.add_argument("--db-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--include-all", action="store_true")
    parser.add_argument("--blind", action="store_true", help="Hide automated predictions.")
    parser.add_argument("--sample-size", type=int)
    parser.add_argument("--seed", type=int, default=2026)
    return parser


def _apply_reviews_parser(subparsers):
    parser = subparsers.add_parser("apply-reviews", help="Import human decisions from CSV.")
    parser.add_argument("--db-file", type=Path, required=True)
    parser.add_argument("--input", type=Path, required=True)
    return parser


def _evaluation_parser(subparsers):
    parser = subparsers.add_parser("evaluate", help="Evaluate methods against human decisions.")
    parser.add_argument("--db-file", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    return parser


def parse_arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    _classification_parser(subparsers)
    _review_parser(subparsers)
    _queue_parser(subparsers)
    _apply_reviews_parser(subparsers)
    _evaluation_parser(subparsers)
    return parser.parse_args(argv)


def _run_classify(arguments):
    paths = _notebook_paths(arguments.paths)
    if not paths:
        raise ValueError("No .ipynb files were found")
    if arguments.notebook_id is not None and len(paths) != 1:
        raise ValueError(
            "--notebook-id can only be used when classifying one notebook"
        )
    connection = open_database(arguments.db_file) if arguments.db_file else None
    outputs = []

    try:
        for path in paths:
            result = classify_notebook(
                path,
                use_llm=not arguments.rule_only,
                model=arguments.model,
                base_url=arguments.ollama_url,
                timeout=arguments.timeout,
                confidence_threshold=arguments.confidence_threshold,
            )
            output = result.to_dict()
            if connection:
                output["database_id"] = save_classification(
                    connection,
                    result,
                    notebook_id=arguments.notebook_id,
                )
            outputs.append(output)
    finally:
        if connection:
            connection.close()

    document = outputs[0] if len(outputs) == 1 else outputs
    serialized = json.dumps(document, indent=2, ensure_ascii=False)
    if arguments.output:
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        arguments.output.write_text(serialized + "\n", encoding="utf-8")
        print(f"Classification results written to {arguments.output}")
    else:
        print(serialized)
    return 0


def _run_review(arguments):
    connection = open_database(arguments.db_file)
    try:
        review_classification(
            connection,
            arguments.classification_id,
            arguments.category,
            arguments.reviewer,
            arguments.note,
        )
        print(json.dumps(get_classification(connection, arguments.classification_id), indent=2))
    finally:
        connection.close()
    return 0


def _run_review_queue(arguments):
    connection = open_database(arguments.db_file)
    try:
        count = export_review_queue(
            connection,
            arguments.output,
            arguments.include_all,
            arguments.blind,
            arguments.sample_size,
            arguments.seed,
        )
    finally:
        connection.close()
    print(f"{count} classifications written to {arguments.output}")
    return 0


def _run_apply_reviews(arguments):
    connection = open_database(arguments.db_file)
    try:
        count = apply_review_file(connection, arguments.input)
    finally:
        connection.close()
    print(f"{count} human reviews applied from {arguments.input}")
    return 0


def _run_evaluate(arguments):
    connection = open_database(arguments.db_file)
    try:
        report = evaluate_reviewed_classifications(connection)
    finally:
        connection.close()
    if arguments.output:
        write_evaluation(report, arguments.output)
        print(f"Evaluation written to {arguments.output}")
    else:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


def main(argv=None):
    arguments = parse_arguments(argv)
    try:
        if arguments.command == "classify":
            return _run_classify(arguments)
        if arguments.command == "review":
            return _run_review(arguments)
        if arguments.command == "review-queue":
            return _run_review_queue(arguments)
        if arguments.command == "apply-reviews":
            return _run_apply_reviews(arguments)
        return _run_evaluate(arguments)
    except (OSError, ValueError) as error:
        print(f"[CLASSIFICATION] FAILED: {error}", file=sys.stderr)
        return 1
