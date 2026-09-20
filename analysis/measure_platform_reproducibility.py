import argparse
import csv
import json
import sqlite3
from pathlib import Path

from analysis.nbprocess.diff import diff_notebooks_safe, extract_cell_ops, get_ops
from analysis.nbprocess.loader import load_notebook
from analysis.nbprocess.nondeterminism import detect_nondeterminism


IGNORE_FIELDS = {"execution_count", "metadata"}


def repo_dir_name(repository_id: int, repository: str) -> str:
    suffix = repository.rstrip("/").split("/")[-1]
    return f"{repository_id}_{suffix}"


def find_repo_dir(cloned_repos_dir: Path, repository_id: int, repository: str) -> Path | None:
    expected = cloned_repos_dir / repo_dir_name(repository_id, repository)
    if expected.exists():
        return expected

    matches = sorted(cloned_repos_dir.glob(f"{repository_id}_*"))
    return matches[0] if matches else None


def output_path_for_notebook(repo_dir: Path, notebook_path: str) -> Path:
    original = repo_dir / notebook_path
    return original.with_name(f"{original.stem}_output.ipynb")


def summarize_diff(original_path: Path, output_path: Path, notebook_path: str, repository_id: int):
    original = load_notebook(original_path)
    executed = load_notebook(output_path)
    diff = diff_notebooks_safe(original, executed)

    code_cell_indices = [
        index
        for index, cell in enumerate(executed.cells)
        if cell.cell_type == "code"
    ]
    different_cell_indices = set()
    nondeterministic_cells = [
        index
        for index in code_cell_indices
        if detect_nondeterminism(executed.cells[index].source)
    ]

    for cell_op in extract_cell_ops(diff):
        if cell_op.get("op") != "patch":
            continue

        cell_index = cell_op.get("key")
        if cell_index not in code_cell_indices:
            continue

        for field_op in get_ops(cell_op.get("diff")):
            field = field_op.get("key")
            if field in IGNORE_FIELDS:
                continue
            if field in {"source", "outputs"}:
                different_cell_indices.add(cell_index)

    total_code_cells = len(code_cell_indices)
    identical_cells = sorted(set(code_cell_indices) - different_cell_indices)

    return {
        "repository_id": repository_id,
        "notebook": notebook_path,
        "total_code_cells": total_code_cells,
        "identical_cells_count": len(identical_cells),
        "different_cells_count": len(different_cell_indices),
        "nondeterministic_cells_count": len(nondeterministic_cells),
        "reproducibility_score": round(
            len(identical_cells) / total_code_cells if total_code_cells else 1.0,
            3,
        ),
        "measurement_status": "measured",
        "missing_reason": "",
    }


def fetch_success_notebooks(connection: sqlite3.Connection, platforms: list[str]):
    placeholders = ",".join("?" for _ in platforms)
    query = f"""
        SELECT
            rr.id AS repository_run_id,
            rr.url AS run_url,
            r.id AS repository_id,
            r.repository,
            r.platform,
            n.id AS notebook_id,
            n.name AS notebook_path
        FROM repository_runs rr
        JOIN repositories r ON r.id = rr.repository_id
        JOIN notebooks n ON n.repository_id = r.id
        WHERE rr.run_status = 'SUCCESS'
          AND lower(r.platform) IN ({placeholders})
        ORDER BY r.platform, rr.id, n.id
    """
    return connection.execute(query, [platform.lower() for platform in platforms]).fetchall()


def aggregate(rows: list[dict]):
    measured = [row for row in rows if row["measurement_status"] == "measured"]
    by_platform = {}

    for row in rows:
        platform = row["platform"]
        stats = by_platform.setdefault(
            platform,
            {
                "platform": platform,
                "successful_repositories": set(),
                "candidate_notebooks": 0,
                "measured_notebooks": 0,
                "missing_notebooks": 0,
                "total_code_cells": 0,
                "identical_cells": 0,
                "different_cells": 0,
                "nondeterministic_cells": 0,
                "score_sum": 0.0,
            },
        )
        stats["successful_repositories"].add(row["repository_id"])
        stats["candidate_notebooks"] += 1

        if row["measurement_status"] != "measured":
            stats["missing_notebooks"] += 1
            continue

        stats["measured_notebooks"] += 1
        stats["total_code_cells"] += int(row["total_code_cells"])
        stats["identical_cells"] += int(row["identical_cells_count"])
        stats["different_cells"] += int(row["different_cells_count"])
        stats["nondeterministic_cells"] += int(row["nondeterministic_cells_count"])
        stats["score_sum"] += float(row["reproducibility_score"])

    summary = []
    for platform, stats in sorted(by_platform.items()):
        measured_notebooks = stats["measured_notebooks"]
        total_code_cells = stats["total_code_cells"]
        average = stats["score_sum"] / measured_notebooks if measured_notebooks else None
        weighted = (
            stats["identical_cells"] / total_code_cells
            if total_code_cells
            else None
        )
        summary.append(
            {
                "platform": platform,
                "successful_repositories": len(stats["successful_repositories"]),
                "candidate_notebooks": stats["candidate_notebooks"],
                "measured_notebooks": measured_notebooks,
                "missing_notebooks": stats["missing_notebooks"],
                "average_reproducibility_percent": (
                    round(average * 100, 2) if average is not None else None
                ),
                "cell_weighted_reproducibility_percent": (
                    round(weighted * 100, 2) if weighted is not None else None
                ),
                "identical_cells": stats["identical_cells"],
                "different_cells": stats["different_cells"],
                "nondeterministic_cells": stats["nondeterministic_cells"],
                "total_code_cells": total_code_cells,
            }
        )

    return summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="data/output/db/db.sqlite")
    parser.add_argument("--cloned-repos", default="data/output/cloned_repos")
    parser.add_argument("--platform", action="append", default=["codeberg", "zenodo"])
    parser.add_argument("--output-dir", default="output")
    args = parser.parse_args()

    db_path = Path(args.db)
    cloned_repos_dir = Path(args.cloned_repos)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    rows = []

    for row in fetch_success_notebooks(connection, args.platform):
        repo_dir = find_repo_dir(cloned_repos_dir, row["repository_id"], row["repository"])
        result = {
            "platform": row["platform"],
            "repository_run_id": row["repository_run_id"],
            "repository_id": row["repository_id"],
            "repository": row["repository"],
            "run_url": row["run_url"],
            "notebook_id": row["notebook_id"],
            "notebook": row["notebook_path"],
        }

        if repo_dir is None:
            result.update(
                {
                    "total_code_cells": 0,
                    "identical_cells_count": 0,
                    "different_cells_count": 0,
                    "nondeterministic_cells_count": 0,
                    "reproducibility_score": "",
                    "measurement_status": "missing",
                    "missing_reason": "repository_directory_missing",
                }
            )
            rows.append(result)
            continue

        original_path = repo_dir / row["notebook_path"]
        output_path = output_path_for_notebook(repo_dir, row["notebook_path"])

        if not original_path.exists():
            result.update(
                {
                    "total_code_cells": 0,
                    "identical_cells_count": 0,
                    "different_cells_count": 0,
                    "nondeterministic_cells_count": 0,
                    "reproducibility_score": "",
                    "measurement_status": "missing",
                    "missing_reason": "original_notebook_missing",
                }
            )
            rows.append(result)
            continue

        if not output_path.exists():
            result.update(
                {
                    "total_code_cells": 0,
                    "identical_cells_count": 0,
                    "different_cells_count": 0,
                    "nondeterministic_cells_count": 0,
                    "reproducibility_score": "",
                    "measurement_status": "missing",
                    "missing_reason": "output_notebook_missing",
                }
            )
            rows.append(result)
            continue

        try:
            result.update(
                summarize_diff(
                    original_path,
                    output_path,
                    row["notebook_path"],
                    row["repository_id"],
                )
            )
        except Exception as error:
            result.update(
                {
                    "total_code_cells": 0,
                    "identical_cells_count": 0,
                    "different_cells_count": 0,
                    "nondeterministic_cells_count": 0,
                    "reproducibility_score": "",
                    "measurement_status": "error",
                    "missing_reason": f"{type(error).__name__}: {error}",
                }
            )
        rows.append(result)

    summary = aggregate(rows)

    detail_path = output_dir / "platform_reproducibility_codeberg_zenodo_details.csv"
    summary_path = output_dir / "platform_reproducibility_codeberg_zenodo_summary.json"

    with detail_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()) if rows else [])
        writer.writeheader()
        writer.writerows(rows)

    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print(f"details={detail_path}")
    print(f"summary={summary_path}")


if __name__ == "__main__":
    main()
