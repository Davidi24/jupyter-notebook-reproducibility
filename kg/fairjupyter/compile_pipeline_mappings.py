#!/usr/bin/env python3

"""Compile the pipeline YARRRML files into executable RML Turtle files."""

import argparse
import filecmp
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


FAIRJUPYTER_DIR = Path(__file__).resolve().parent
SOURCE_DIR = FAIRJUPYTER_DIR / "mapping" / "yarrml_mapping"
OUTPUT_DIR = FAIRJUPYTER_DIR / "mapping" / "rml_mapping" / "pipeline"
PARSER_PACKAGE = "@rmlio/yarrrml-parser@1.12.2"


def parser_command() -> str:
    executable = "npx.cmd" if sys.platform == "win32" else "npx"
    resolved = shutil.which(executable)
    if not resolved:
        raise RuntimeError("Node.js npx was not found. Install Node.js to compile YARRRML.")
    return resolved


def source_files() -> list[Path]:
    files = sorted(SOURCE_DIR.glob("pipeline_*.yaml"))
    if not files:
        raise FileNotFoundError(f"No pipeline YARRRML files found in {SOURCE_DIR}")
    return files


def compile_files(destination: Path) -> list[Path]:
    destination.mkdir(parents=True, exist_ok=True)
    npx = parser_command()
    outputs = []

    for source in source_files():
        output = destination / f"{source.stem}.rml.ttl"
        command = [
            npx,
            "--yes",
            PARSER_PACKAGE,
            "-i",
            str(source),
            "-o",
            str(output),
            "-p",
            "-m",
        ]
        subprocess.run(command, cwd=FAIRJUPYTER_DIR, check=True)
        outputs.append(output)
        print(f"[KG MAPPING] Compiled {source.name} -> {output.name}")

    return outputs


def check_compiled_files() -> None:
    with tempfile.TemporaryDirectory(prefix="notebookfair-rml-") as temp_dir:
        generated_files = compile_files(Path(temp_dir))
        differences = []

        for generated in generated_files:
            committed = OUTPUT_DIR / generated.name
            if not committed.is_file() or not filecmp.cmp(generated, committed, shallow=False):
                differences.append(committed)

        if differences:
            names = ", ".join(path.name for path in differences)
            raise RuntimeError(
                f"Compiled mappings are out of date: {names}. "
                "Run compile_pipeline_mappings.py without --check."
            )

    print("[KG MAPPING] All compiled RML mappings are up to date")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Compile into a temporary folder and compare with the committed RML files.",
    )
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    try:
        if arguments.check:
            check_compiled_files()
        else:
            compile_files(OUTPUT_DIR)
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"[KG MAPPING] FAILED: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


