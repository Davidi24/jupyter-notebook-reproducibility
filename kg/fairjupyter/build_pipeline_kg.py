#!/usr/bin/env python3

"""Build the Notebook FAIR pipeline knowledge graph from the working SQLite DB."""

import argparse
import configparser
import csv
import importlib.util
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from rdflib import Graph


FAIRJUPYTER_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = FAIRJUPYTER_DIR.parent.parent
DEFAULT_DB_FILE = PROJECT_ROOT / "output" / "db" / "db.sqlite"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "output" / "kg"
CSV_DIR = FAIRJUPYTER_DIR / "pipeline_data"
MAPPING_DIR = FAIRJUPYTER_DIR / "mapping" / "rml_mapping" / "pipeline"
ONTOLOGY_FILE = FAIRJUPYTER_DIR / "ontology" / "notebookfair-extension.owl"
EXPORTER = FAIRJUPYTER_DIR / "export_pipeline_csv.py"


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db-file", type=Path, default=DEFAULT_DB_FILE)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument(
        "--skip-export",
        action="store_true",
        help="Use the existing CSV files instead of exporting the database again.",
    )
    return parser.parse_args()


def mapping_files() -> list[Path]:
    files = sorted(MAPPING_DIR.glob("pipeline_*.rml.ttl"))
    if len(files) != 7:
        raise RuntimeError(f"Expected 7 pipeline mappings in {MAPPING_DIR}, found {len(files)}")
    return files


def validate_rdf_inputs(files: list[Path]) -> None:
    ontology = Graph()
    ontology.parse(ONTOLOGY_FILE, format="xml")
    print(f"[KG BUILD] Valid ontology: {len(ontology)} triples")

    for mapping in files:
        graph = Graph()
        graph.parse(mapping, format="turtle")
        print(f"[KG BUILD] Valid mapping: {mapping.name}")


def export_database(db_file: Path) -> None:
    subprocess.run(
        [
            sys.executable,
            str(EXPORTER),
            "--db-file",
            str(db_file.resolve()),
            "--output-dir",
            str(CSV_DIR.resolve()),
        ],
        cwd=FAIRJUPYTER_DIR,
        check=True,
    )


def prepare_output(output_dir: Path) -> tuple[Path, Path, Path]:
    config_dir = output_dir / "config"
    logs_dir = output_dir / "logs"
    graph_dir = output_dir / "split_graph"

    for directory in (config_dir, logs_dir, graph_dir):
        directory.mkdir(parents=True, exist_ok=True)

    for pattern, directory in (
        ("*.ini", config_dir),
        ("*.log", logs_dir),
        ("*.nt", graph_dir),
    ):
        for old_file in directory.glob(pattern):
            old_file.unlink()

    return config_dir, logs_dir, graph_dir


def write_config(mapping: Path, output_file: Path, log_file: Path, config_file: Path) -> None:
    config = configparser.ConfigParser()
    config["CONFIGURATION"] = {
        "output_file": str(output_file.resolve()),
        "output_format": "N-TRIPLES",
        "number_of_processes": "1",
        "logging_level": "INFO",
        "logs_file": str(log_file.resolve()),
    }
    config["DataSourceCSV"] = {"mappings": str(mapping.resolve())}

    with config_file.open("w", encoding="utf-8") as handle:
        config.write(handle)


def run_mapping(mapping: Path, config_dir: Path, logs_dir: Path, graph_dir: Path) -> dict:
    stem = mapping.name.removesuffix(".rml.ttl")
    config_file = config_dir / f"{stem}.ini"
    output_file = graph_dir / f"{stem}.nt"
    log_file = logs_dir / f"{stem}.log"
    write_config(mapping, output_file, log_file, config_file)

    start = time.perf_counter()
    result = subprocess.run(
        [sys.executable, "-m", "morph_kgc", str(config_file.resolve())],
        cwd=FAIRJUPYTER_DIR,
        capture_output=True,
        text=True,
    )
    elapsed = round(time.perf_counter() - start, 3)

    with log_file.open("a", encoding="utf-8") as handle:
        if result.stdout:
            handle.write("\n[STDOUT]\n" + result.stdout)
        if result.stderr:
            handle.write("\n[STDERR]\n" + result.stderr)

    if result.returncode != 0:
        raise RuntimeError(f"Morph-KGC failed for {mapping.name}; see {log_file}")
    if not output_file.is_file():
        output_file.touch()

    graph = Graph()
    graph.parse(output_file, format="nt")
    print(f"[KG BUILD] {mapping.name}: {len(graph)} triples in {elapsed}s")
    return {
        "mapping": mapping.name,
        "output": str(output_file),
        "triples": len(graph),
        "seconds": elapsed,
    }


def combine_graphs(graph_files: list[Path], output_file: Path) -> int:
    combined = Graph()
    combined.parse(ONTOLOGY_FILE, format="xml")
    for graph_file in graph_files:
        combined.parse(graph_file, format="nt")
    combined.serialize(output_file, format="nt", encoding="utf-8")
    return len(combined)


def csv_row_counts() -> dict[str, int]:
    counts = {}
    for csv_file in sorted(CSV_DIR.glob("*.csv")):
        with csv_file.open(newline="", encoding="utf-8") as handle:
            counts[csv_file.name] = sum(1 for _ in csv.reader(handle)) - 1
    return counts


def main() -> int:
    arguments = parse_arguments()
    output_dir = arguments.output_dir.resolve()
    db_file = arguments.db_file.resolve()

    try:
        if importlib.util.find_spec("morph_kgc") is None:
            raise RuntimeError(
                "Morph-KGC is not installed. Create kg/fairjupyter/.venv and "
                "install requirements-kg.txt."
            )

        files = mapping_files()
        validate_rdf_inputs(files)
        if not arguments.skip_export:
            export_database(db_file)

        config_dir, logs_dir, graph_dir = prepare_output(output_dir)
        mapping_results = [
            run_mapping(mapping, config_dir, logs_dir, graph_dir) for mapping in files
        ]

        combined_file = output_dir / "notebookfair-pipeline.nt"
        total_triples = combine_graphs(
            sorted(graph_dir.glob("pipeline_*.nt")), combined_file
        )
        summary = {
            "built_at": datetime.now(timezone.utc).isoformat(),
            "source_database": str(db_file),
            "ontology": str(ONTOLOGY_FILE),
            "combined_graph": str(combined_file),
            "total_unique_triples": total_triples,
            "csv_rows": csv_row_counts(),
            "mappings": mapping_results,
        }
        summary_file = output_dir / "build-summary.json"
        summary_file.write_text(json.dumps(summary, indent=2), encoding="utf-8")

        print(f"[KG BUILD] Combined graph: {combined_file}")
        print(f"[KG BUILD] Total unique triples: {total_triples}")
        print(f"[KG BUILD] Summary: {summary_file}")
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"[KG BUILD] FAILED: {error}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
