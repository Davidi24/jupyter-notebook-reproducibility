#!/usr/bin/env python3

"""Run the pipeline SPARQL examples and structural KG assertions."""

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from rdflib import Graph, Namespace, RDF


FAIRJUPYTER_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = FAIRJUPYTER_DIR.parent.parent
DEFAULT_GRAPH = PROJECT_ROOT / "output" / "kg" / "notebookfair-pipeline.nt"
DEFAULT_RESULTS_DIR = PROJECT_ROOT / "output" / "kg" / "query_results"
QUERY_DIR = FAIRJUPYTER_DIR / "sparql_query" / "pipeline"
CSV_DIR = FAIRJUPYTER_DIR / "pipeline_data"
NF = Namespace("https://w3id.org/notebookfair#")
PLATFORM = Namespace("https://w3id.org/notebookfair/platform/")
DCTERMS = Namespace("http://purl.org/dc/terms/")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--graph", type=Path, default=DEFAULT_GRAPH)
    parser.add_argument("--results-dir", type=Path, default=DEFAULT_RESULTS_DIR)
    return parser.parse_args()


def csv_count(filename: str) -> int:
    with (CSV_DIR / filename).open(newline="", encoding="utf-8") as handle:
        return sum(1 for _ in csv.reader(handle)) - 1


def run_queries(graph: Graph, results_dir: Path) -> dict[str, int]:
    results_dir.mkdir(parents=True, exist_ok=True)
    row_counts = {}

    for query_file in sorted(QUERY_DIR.glob("*.rq")):
        result = graph.query(query_file.read_text(encoding="utf-8"))
        output_file = results_dir / f"{query_file.stem}.csv"
        variables = [str(variable) for variable in result.vars]
        rows = list(result)

        with output_file.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(variables)
            writer.writerows(
                [["" if value is None else str(value) for value in row] for row in rows]
            )

        row_counts[query_file.name] = len(rows)
        print(f"[KG QUERY] {query_file.name}: {len(rows)} rows")

    return row_counts


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def assert_graph(graph: Graph) -> dict[str, int]:
    repositories = set(graph.subjects(NF.hostedOnPlatform, None))
    notebooks = set(graph.subjects(RDF.type, NF.NotebookResource))
    runs = set(graph.subjects(RDF.type, NF.RepositoryRun))
    executions = set(graph.subjects(RDF.type, NF.NotebookExecution))
    results = set(graph.subjects(RDF.type, NF.ReproducibilityResult))
    classifications = set(graph.subjects(RDF.type, NF.NotebookClassificationActivity))

    expected = {
        "repositories": csv_count("repositories.csv"),
        "notebooks": csv_count("notebooks.csv"),
        "runs": csv_count("repository_runs.csv"),
        "executions": csv_count("notebook_executions.csv"),
        "results": csv_count("notebook_reproducibility_metrics.csv"),
        "classifications": csv_count("notebook_classifications.csv"),
    }
    actual = {
        "repositories": len(repositories),
        "notebooks": len(notebooks),
        "runs": len(runs),
        "executions": len(executions),
        "results": len(results),
        "classifications": len(classifications),
    }
    require(actual == expected, f"Entity counts differ: expected {expected}, got {actual}")

    platforms = {
        str(name)
        for platform in (PLATFORM.github, PLATFORM.codeberg, PLATFORM.zenodo)
        for name in graph.objects(platform, NF.platformName)
    }
    require(platforms == {"github", "codeberg", "zenodo"}, f"Platforms: {platforms}")

    zenodo_records = set(graph.subjects(NF.hostedOnPlatform, PLATFORM.zenodo))
    require(zenodo_records, "No Zenodo record is connected to the Zenodo platform")
    require(
        all((record, RDF.type, NF.ArchivedResearchRecord) in graph for record in zenodo_records),
        "Every Zenodo resource must be an ArchivedResearchRecord",
    )
    require(
        all((record, RDF.type, NF.GitRepositoryResource) not in graph for record in zenodo_records),
        "A Zenodo record was incorrectly typed as a GitRepositoryResource",
    )

    require(
        len(set(graph.triples((None, NF.containsNotebook, None)))) == expected["notebooks"],
        "Repository-to-notebook relations are incomplete",
    )
    require(
        len(set(graph.triples((None, NF.hasRun, None)))) == expected["runs"],
        "Repository-to-run relations are incomplete",
    )
    require(
        len(set(graph.triples((None, NF.hasExecution, None)))) == expected["executions"],
        "Run-to-execution relations are incomplete",
    )
    require(
        len(set(graph.triples((None, NF.hasReproducibilityResult, None)))) == expected["results"],
        "Execution-to-result relations are incomplete",
    )
    require(
        len(set(graph.triples((None, NF.hasClassification, None))))
        == expected["classifications"],
        "Notebook-to-classification relations are incomplete",
    )

    zenodo_dois = {
        str(value)
        for record in zenodo_records
        for value in graph.objects(record, DCTERMS.identifier)
        if str(value).startswith("10.")
    }
    require(zenodo_dois, "The Zenodo DOI is missing from the graph")
    return actual


def main() -> int:
    arguments = parse_arguments()
    try:
        graph_file = arguments.graph.resolve()
        if not graph_file.is_file():
            raise FileNotFoundError(f"Graph not found: {graph_file}")

        graph = Graph()
        graph.parse(graph_file, format="nt")
        print(f"[KG TEST] Loaded {len(graph)} unique triples")

        query_rows = run_queries(graph, arguments.results_dir.resolve())
        classification_rows = csv_count("notebook_classifications.csv")
        required_query_rows = {
            name: count
            for name, count in query_rows.items()
            if name != "07_notebook_classifications.rq" or classification_rows > 0
        }
        require(
            all(count > 0 for count in required_query_rows.values()),
            "A required SPARQL query returned no rows",
        )
        entity_counts = assert_graph(graph)

        summary = {
            "tested_at": datetime.now(timezone.utc).isoformat(),
            "graph": str(graph_file),
            "triples": len(graph),
            "entities": entity_counts,
            "query_rows": query_rows,
            "status": "PASSED",
        }
        summary_file = arguments.results_dir.resolve() / "test-summary.json"
        summary_file.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(f"[KG TEST] Structural and SPARQL tests PASSED: {summary_file}")
    except (OSError, ValueError, AssertionError) as error:
        print(f"[KG TEST] FAILED: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
