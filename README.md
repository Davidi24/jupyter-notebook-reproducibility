# Cross-Platform Jupyter Notebook Reproducibility Pipeline

A reproducibility pipeline for Jupyter notebooks collected from **GitHub, Codeberg, and Zenodo**.

The pipeline can:

- execute notebooks
- evaluate reproducibility
- classify notebooks
- store results in SQLite
- generate a FAIR Jupyter Knowledge Graph
- visualize results through a web dashboard

---

## Repository Structure

| Folder | Contains |
|---|---|
| `analysis/` | Notebook analysis, comparison, and classification |
| `binder/` | Binder and container configuration |
| `config/` | Pipeline configuration |
| `data/` | Input data and generated results |
| `docs/` | Project documentation |
| `kg/` | Knowledge Graph mappings, ontology, and queries |
| `pipeline/` | Batch and parallel pipeline scripts |
| `src/` | Core pipeline modules |
| `tests/` | Pipeline and Knowledge Graph tests |
| `thesis/` | LaTeX thesis files |
| `website/` | Next.js results dashboard |

### Data

| Path | Contains |
|---|---|
| `data/input/` | Input lists used by the pipeline |
| `data/output/` | Generated pipeline results |

---

# Running the Project

The project consists of three main parts:

**1. Execute → 2. Classify → 3. Build Knowledge Graph**

Classification runs automatically during execution.  
The Knowledge Graph is built manually after execution.

---

## 1. Execute

Run all commands from the repository root.

### Install dependencies on Linux or WSL

This project is intended to run in a Linux environment. On Windows, use WSL.

Install the system and Python dependencies with:

    bash setup.sh

After setup, start a new terminal or run:

    source ~/.bashrc

### Start the pipeline

    bash run.sh

The setup script installs the Linux tools required by `run.sh`, including
`sqlite3`, `jq`, `unzip`, `pyenv`, Jupyter, and the Python packages from
`requirements.txt`.

If Python dependencies need to be reinstalled later, run:

    python3 -m pip install --user -r requirements.txt

You will be asked to choose:

    1. Single repo mode
    2. Batch mode

**If you choose `1`:**

Enter a repository URL and notebook path manually.

**If you choose `2`:**

Repositories are processed from the configured SQLite database.

### Larger Runs

Run the full evaluation sample with one worker:

    bash pipeline/run_full_sample.sh

Run the sample with multiple workers:

    bash pipeline/start_parallel_full_sample.sh

### Generated Output

| Path | Contains |
|---|---|
| `data/output/db/db.sqlite` | Processed repository, notebook, classification, and reproducibility results |
| `data/output/logs/` | Pipeline execution logs |
| `data/output/comparisons/` | Notebook output and reproducibility comparisons |
| `data/output/cloned_repos/` | Repositories cloned during execution |

---

## 2. Classify

Classification runs **automatically** for every notebook processed by the pipeline.

Two classification methods are available:

### Rule-Based Classification

Always runs by default.

Implemented in:

    analysis/notebook_classification/rules.py

It classifies notebooks using imports and notebook text.

### Local LLM Classification

An optional second classification is performed using a local **Ollama** model.

If Ollama is unavailable, the pipeline continues normally using only the rule-based result.

Default model:

    gemma3:4b

### Classification Options

Disable classification completely:

    CLASSIFICATION_ENABLED=false bash pipeline/run_full_sample.sh

Use only rule-based classification:

    CLASSIFICATION_RULE_ONLY=true bash pipeline/run_full_sample.sh

### Optional: Set Up Ollama

Install Ollama:

    curl -fsSL https://ollama.com/install.sh | sh

Pull the model:

    ollama pull gemma3:4b

Start Ollama:

    ollama serve &

Verify that it is running:

    curl http://localhost:11434/api/tags

### Manual Classification

Classify one notebook:

    python3 -m analysis.notebook_classification classify <notebook.ipynb> --db-file data/output/db/db.sqlite --notebook-id <id>

Create the review queue:

    python3 -m analysis.notebook_classification review-queue --db-file data/output/db/db.sqlite --output review.csv

Apply manual reviews:

    python3 -m analysis.notebook_classification apply-reviews --db-file data/output/db/db.sqlite --input review.csv

Evaluate classification:

    python3 -m analysis.notebook_classification evaluate --db-file data/output/db/db.sqlite

---

## 3. Build the Knowledge Graph

The Knowledge Graph is **not built automatically**.

After the execution pipeline has produced results, run:

    bash kg/fairjupyter/run_fairjupyter_kg.sh

The script reads the pipeline results and generates the FAIR Jupyter Knowledge Graph.
