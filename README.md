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

## Requirements

This project runs on **Linux**. It has been tested on **Debian/Ubuntu** (including **Ubuntu on WSL**). Any system with `apt-get` should work; macOS and non-Debian Linux (Fedora, Arch, etc.) are not supported by the setup script.

**On Windows, you need WSL** — see Step 2 below.

---

## Quick Start (first run)

Follow these steps in order. They take you from a fresh clone to a completed pipeline run.

### 1. Clone the project

    git clone <repo-url>
    cd ma-david-keci

### 2. Windows only: make sure WSL is installed

Open **PowerShell** and check:

    wsl --status

- **If that fails or says WSL isn't installed**, install it:

      wsl --install

  Then **restart your computer**. On first boot, an Ubuntu window opens and asks you to create a Linux username and password — do that once.

- **If WSL is already installed**, just open it (search **"Ubuntu"** in the Start menu, or run `wsl` in PowerShell).

Already on Linux? Skip straight to Step 3 using your normal terminal.

### 3. Open the project inside your Linux/WSL terminal

Windows drives are reachable from WSL under `/mnt/c/...`. For example, if you cloned to `C:\Users\you\ma-david-keci`:

    cd /mnt/c/Users/you/ma-david-keci

(Adjust the path to wherever you actually cloned the project. Everything from here on runs **inside this Linux/WSL terminal**, not PowerShell.)

### 4. Run the setup script

    bash setup.sh

This installs everything the pipeline needs: `git`, `curl`, `jq`, `unzip`, `zstd`, `sqlite3`, `pyenv`, Jupyter, the packages in `requirements.txt`, and the Knowledge Graph dependencies in `kg/fairjupyter/.venv`. It will ask for your `sudo` password to install system packages. It only needs to be run once.

### 5. Reload your shell

    source ~/.bashrc

(or just close and reopen your terminal)

### 6. Start the pipeline

    bash run.sh

### 7. Choose how to run it

You'll see this first:

    How would you like to run the pipeline?
      1. Single repo  — enter a repo URL interactively
      2. Batch mode   — process repos from the SQLite database

    Enter your choice (1 or 2):

**Choose `1` for your first run.** Option 2 processes repositories that are *already listed* in the SQLite database — a fresh clone starts with none, so there's nothing for it to do yet. See [Batch Mode](#batch-mode-option-2) below once you've built up some data.

Next, choose how notebooks should be classified:

    How should notebooks be classified?
      1. Rule-based only
      2. Rule-based + local LLM if available
      3. Local LLM only
      4. Disable classification

    Enter your choice (1, 2, 3, or 4):

**Choose `1`.** It's fast, works out of the box, and still runs real classification. (Options 2 and 3 use a local [Ollama](#optional-set-up-ollama) model — set that up first if you want them.)

Finally, you're asked for the repository details. To try the pipeline right now, paste in this small, known-working example:

    Enter repo URL: https://github.com/binder-examples/requirements.git
    Enter notebook paths (semicolon-separated): index.ipynb
    Enter setup paths (semicolon-separated, optional): [press Enter]
    Enter requirements paths (semicolon-separated, optional): requirements.txt

For your **own** notebooks later, the same four prompts accept:

| Prompt | What to enter |
|---|---|
| Repo URL | A GitHub, Codeberg, or Zenodo URL (see [Supported Platforms](#supported-platforms)) |
| Notebook paths | One or more `.ipynb` paths relative to the repo, separated by `;`. Leave empty to auto-discover every notebook in the repo. |
| Setup paths | Optional setup/install scripts to run first, separated by `;` |
| Requirements paths | Optional `requirements.txt`-style files, separated by `;`. Leave empty to auto-infer packages from the notebook's imports. |

### 8. What happens next

The pipeline will, in order:

1. validate the URL
2. fetch and save repository metadata
3. clone (or download, for Zenodo) the repository
4. classify the notebook(s)
5. install dependencies into an isolated `pyenv` environment
6. execute the notebook(s) and compare outputs for reproducibility
7. save everything to SQLite

...and finish with a summary:

    ════════════════════════════════════════
            PIPELINE RUN SUMMARY
    ════════════════════════════════════════
      Total runs in DB  : 1
      Successful        : 1
      Failed/Skipped    : 0
      Classification    : Rule-based only
      Reproducibility   : 50.0% avg (1 notebook)
      Elapsed time      : 162s
      Results stored in : data/output/db/db.sqlite
      Logs directory    : data/output/logs
    ════════════════════════════════════════

`Classification` shows the mode you chose for this run. `Reproducibility` is the average reproducibility score (the share of code cells whose output matched a repeat run) across every notebook execution recorded in the database so far. This exact example was verified end to end from a brand-new clone; expect roughly 2-4 minutes for the first run of any new notebook, since it builds a fresh Python environment just for it. Run `bash run.sh` again with your own repository URL whenever you're ready.

---

## Supported Platforms

Only these three are recognized — any other URL is rejected with `UNSUPPORTED_PLATFORM`:

| Platform | Example URL |
|---|---|
| GitHub | `https://github.com/<owner>/<repo>` |
| Codeberg | `https://codeberg.org/<owner>/<repo>` |
| Zenodo | `https://zenodo.org/records/<id>` |

A syntactically valid but non-existent repository or record is also rejected cleanly (`INVALID_REPOSITORY_URL` / `INVALID_ZENODO_RECORD`) — nothing is cloned or downloaded until the source is confirmed to exist.

Verified small examples:

| Platform | URL | Notebook path | Notes |
|---|---|---|---|
| GitHub | `https://github.com/binder-examples/requirements.git` | `index.ipynb` | Successful execution in the first-run test |
| Codeberg | `https://codeberg.org/sc0v0ne/article_apply_test_in_jupyter_notebook.git` | `notebook_replace_query_with_parameter.ipynb` | Successful execution and rule-based classification |
| Zenodo | `https://zenodo.org/records/8102908` | `Anscombe.ipynb` | Zenodo validation/download works; this notebook records a dependency error for a custom `macti` package |

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

### Generated Output

| Path | Contains |
|---|---|
| `data/output/db/db.sqlite` | Processed repository, notebook, classification, and reproducibility results |
| `data/output/logs/` | Pipeline execution logs |
| `data/output/comparisons/` | Notebook output and reproducibility comparisons |
| `data/output/cloned_repos/` | Repositories cloned during execution |

---

## Inspect Results

After a run, results are stored in:

    data/output/db/db.sqlite

Show the latest reproducibility results:

    sqlite3 -header -column data/output/db/db.sqlite "SELECT r.id AS run_id, n.name AS notebook, e.execution_status, e.execution_duration, m.total_code_cells, m.identical_cells_count, m.different_cells_count, m.reproducibility_score FROM notebook_reproducibility_metrics m JOIN notebook_executions e ON e.id = m.notebook_execution_id JOIN notebooks n ON n.id = m.notebook_id JOIN repository_runs r ON r.id = m.repository_run_id ORDER BY m.id DESC LIMIT 5;"

Show the latest classification results:

    sqlite3 -header -column data/output/db/db.sqlite "SELECT id, notebook_path, rule_category, rule_confidence, llm_category, llm_confidence, agreement_status, needs_human_review, provisional_category, final_category FROM notebook_classifications ORDER BY id DESC LIMIT 5;"

Show the latest repository runs:

    sqlite3 -header -column data/output/db/db.sqlite "SELECT rr.id, r.platform, r.repository, rr.run_status, ne.execution_status, ne.error_type, ne.error_message FROM repository_runs rr JOIN repositories r ON r.id=rr.repository_id LEFT JOIN notebook_executions ne ON ne.repository_run_id=rr.id ORDER BY rr.id DESC LIMIT 10;"

---

## Batch Mode (option 2)

Batch mode processes repositories that are **already registered** in `data/output/db/db.sqlite`, picking up entries that have notebook paths but no run yet. It's meant for working through a larger, pre-populated dataset (e.g. one imported via the website dashboard, or built up from earlier single-repo runs) — not for a first run on a fresh clone, which has nothing queued.

Each invocation processes up to `TARGET_COUNT` repositories (default `10`). Override it with an environment variable:

    TARGET_COUNT=1 bash run.sh

Run the full evaluation sample with one worker:

    bash pipeline/run_full_sample.sh

Run the sample with multiple workers:

    bash pipeline/start_parallel_full_sample.sh

Both read from the same `TARGET_COUNT`-controlled queue.

---

## Classification

Classification runs **automatically** for every notebook processed by the pipeline. Two methods are available:

### Rule-Based Classification

Always available, no extra setup. Implemented in:

    analysis/notebook_classification/rules.py

It classifies notebooks using imports and notebook text.

### Local LLM Classification

An optional second opinion from a local **Ollama** model. If Ollama is unavailable, the pipeline continues normally using only the rule-based result.

Default model: `gemma3:4b`

### Classification Options (for scripted/batch runs)

Disable classification completely:

    CLASSIFICATION_ENABLED=false bash pipeline/run_full_sample.sh

Use only rule-based classification:

    CLASSIFICATION_RULE_ONLY=true bash pipeline/run_full_sample.sh

### Optional: Set Up Ollama

    curl -fsSL https://ollama.com/install.sh | sh
    ollama pull gemma3:4b
    ollama serve &
    curl http://localhost:11434/api/tags   # verify it's running

### Manual Classification

    python3 -m analysis.notebook_classification classify <notebook.ipynb> --db-file data/output/db/db.sqlite --notebook-id <id>
    python3 -m analysis.notebook_classification review-queue --db-file data/output/db/db.sqlite --output review.csv
    python3 -m analysis.notebook_classification apply-reviews --db-file data/output/db/db.sqlite --input review.csv
    python3 -m analysis.notebook_classification evaluate --db-file data/output/db/db.sqlite

---

## Build the Knowledge Graph

The Knowledge Graph is **not built automatically**. After the pipeline has produced results, run:

    bash kg/fairjupyter/run_fairjupyter_kg.sh

This reads the current SQLite database and rebuilds the FAIR Jupyter Knowledge Graph from all stored results. It does not rerun notebooks or classification.

Main outputs:

| Path | Contains |
|---|---|
| `data/output/kg/notebookfair-pipeline.nt` | Combined RDF graph in N-Triples format |
| `data/output/kg/build-summary.json` | JSON summary of the KG build |
| `data/output/kg/split_graph/` | One RDF file per mapping |

The command ends with a terminal summary:

    ════════════════════════════════════════
            KNOWLEDGE GRAPH SUMMARY
    ════════════════════════════════════════
      Source database      : data/output/db/db.sqlite
      Combined graph       : data/output/kg/notebookfair-pipeline.nt
      Build summary JSON   : data/output/kg/build-summary.json
      Total unique triples : ...
    ════════════════════════════════════════

---

## Running the Test Suite

The pipeline ships with its own tests. All of them use an isolated temporary database and don't touch your real `data/output/db/db.sqlite` — **except `test_kg.sh`**, which builds the Knowledge Graph from whatever is in `output/db/db.sqlite` (a separate, legacy default path — see below):

    bash tests/test_pipeline.sh              # real end-to-end run against a small GitHub repo
    bash tests/test_pipeline_hardening.sh    # SQL escaping / cleanup safety
    bash tests/test_repo_discovery.sh        # automatic notebook discovery
    bash tests/test_pipeline_classification.sh
    bash tests/test_metadata.sh              # real GitHub/Codeberg/Zenodo metadata fetch
    bash tests/test_kg.sh                    # Knowledge Graph build + SPARQL checks (see note above)
    python3 -m pytest tests/                 # notebook classification unit tests

To actually build the Knowledge Graph from your real pipeline results, use the documented command instead — see [Build the Knowledge Graph](#build-the-knowledge-graph).

---

## Troubleshooting

- **`This setup script must run in Linux`** — you're running `setup.sh` from PowerShell/cmd instead of WSL. Open a WSL/Ubuntu terminal and re-run it there (see Step 2/3 above).
- **`UNSUPPORTED_PLATFORM`** in the run summary — the URL isn't GitHub, Codeberg, or Zenodo. See [Supported Platforms](#supported-platforms).
- **`INVALID_REPOSITORY_URL` / `INVALID_ZENODO_RECORD`** — the repo or record doesn't exist, or is unreachable. Double-check the URL.
- **`database is locked`** — you have more than one `run.sh` (or test script) writing to the same `data/output/db/db.sqlite` at the same time. Run pipeline instances one at a time.
- If Python dependencies need to be reinstalled later:

      python3 -m pip install --user -r requirements.txt
