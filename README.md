# Cross-Platform Jupyter Notebook Reproducibility Pipeline

This repository contains the implementation and thesis materials for a reproducibility pipeline for Jupyter notebooks. The project extends the original FAIR Jupyter workflow so that notebook resources from GitHub, Codeberg, and Zenodo can be processed, classified, evaluated, and represented in a knowledge graph.

The repository contains the pipeline code, evaluation data, generated result samples, knowledge graph material, tests, a web dashboard, and the LaTeX thesis sources.

## Repository Structure

```text
analysis/   Python utilities for notebook analysis, comparison, and classification
binder/     Binder and container setup files for reproducible environments
config/     Central shell configuration used by the pipeline
data/       Evaluation data, pipeline input files, and pipeline output files
docs/       Project documentation and supporting documents
kg/         FAIR Jupyter knowledge graph extension, mappings, ontology, and SPARQL queries
pipeline/   Pipeline entry scripts, batch runners, and web-runner bridge scripts
src/        Core shell modules for repository handling, execution, logging, and classification
tests/      Shell and Python tests for pipeline behavior and knowledge graph checks
thesis/     LaTeX thesis source files and thesis template material
website/    Next.js dashboard for browsing repositories, notebooks, and results
```

Important data folders:

```text
data/input/    Input lists used by the pipeline
data/output/   Generated pipeline results, logs, comparison files, and working databases
```

## Requirements

The main pipeline is written for a Bash-like environment. On Windows, run it from WSL or another shell that supports Bash commands.

Required command-line tools:

```text
python3
sqlite3
jq
unzip
git
pyenv
jupyter
```

Python dependencies are listed in:

```text
requirements.txt
```

Install them with:

```bash
pip install -r requirements.txt
```

## Configuration

Optional environment variables are documented in:

```text
.env.example
```

To use local overrides, copy it to `.env` and adjust the values:

```bash
cp .env.example .env
source .env
```

Common options:

```text
TARGET_COUNT                 Number of repositories to process in batch mode
DB_FILE                      Custom SQLite database path
CLASSIFICATION_ENABLED       Enable or disable notebook classification
CLASSIFICATION_RULE_ONLY     Use rule-based classification only
CLASSIFICATION_MODEL         Local Ollama model name for AI-assisted classification
CLASSIFICATION_OLLAMA_URL    Ollama API URL
```

By default, pipeline input and output are stored under:

```text
data/input/
data/output/
```

## How to Run the Pipeline

From the repository root, run:

```bash
bash run.sh
```

The script checks required tools and then starts the main pipeline menu.

You can choose:

```text
1. Single repo mode
   Enter one repository URL and notebook path manually.

2. Batch mode
   Process repositories from the SQLite database.
```

The main results are written to:

```text
data/output/db/db.sqlite
data/output/logs/
data/output/comparisons/
data/output/cloned_repos/
```

## Batch and Long Runs

The `pipeline/` folder contains helper scripts for larger runs:

```text
pipeline/run_full_sample.sh
pipeline/run_full_sample_v6.sh
pipeline/run_full_sample_v7.sh
pipeline/run_full_sample_v8.sh
pipeline/start_parallel_full_sample_v7.sh
```

These scripts are used for larger evaluation batches and parallel execution experiments. Check the comments inside each script before running them, because some options are controlled through environment variables.

## Notebook Classification

Notebook classification code is in:

```text
analysis/notebook_classification/
```

Documentation for the classification workflow is in:

```text
docs/notebook-classification.md
```

The classifier can run with rule-based logic only or with local Ollama assistance, depending on configuration.

## Knowledge Graph

The FAIR Jupyter knowledge graph extension is stored in:

```text
kg/fairjupyter/
```

Important subfolders:

```text
kg/fairjupyter/mapping/        RML and YARRRML mappings
kg/fairjupyter/ontology/       Ontology files
kg/fairjupyter/pipeline_data/  CSV exports used for graph construction
kg/fairjupyter/sparql_query/   SPARQL queries for validation and analysis
```

Run the knowledge graph test with:

```bash
bash tests/test_kg.sh
```

## Tests

Run individual tests from the repository root:

```bash
bash tests/test_metadata.sh
bash tests/test_notebook_classification.sh
bash tests/test_pipeline_classification.sh
bash tests/test_pipeline_hardening.sh
bash tests/test_repo_discovery.sh
bash tests/test_kg.sh
```

Some tests may require WSL, Docker, pyenv, SQLite, or network access, depending on what they execute.

## Website Dashboard

The web dashboard is in:

```text
website/
```

It is a Next.js application for viewing repository, notebook, classification, reproducibility, and knowledge graph information.

Typical local setup:

```bash
cd website
pnpm install
pnpm dev
```

## Thesis

Thesis materials are stored in:

```text
thesis/
```

The main LaTeX project is:

```text
thesis/my-thesis-latex/
```

The compiled root-level PDF is:

```text
thesis.pdf
```

## License

This project uses the license provided in:

```text
LICENSE
```
