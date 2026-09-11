# Pipeline pilot run — 2026-09-06

## Scope
10 GitHub repositories from the 252-sample evaluation dataset, one per category (plus 3 extra
for data_analysis, machine_learning and tutorial), run end-to-end through the actual
reproducibility pipeline (`run.sh` → batch mode) on the Windows laptop's Linux environment.

Codeberg and Zenodo entries were **not** attempted this round — see "Environment limitation"
below; this pilot is GitHub-only by necessity, not by choice.

## Result: 10/10 completed, all with real reproducibility signal

| # | Repository | Category (intended) | Notebook execution | Reproducibility score | Root cause when not clean |
|---|---|---|---|---:|---|
| 1 | vishnukanduri/Credit-Risk-Modeling-in-Python | data_preparation | SUCCESS_WITH_ERRORS | 0.068 | `loan.csv` not in repo (missing data file) |
| 2 | chiragsamal/Zomato | data_analysis | SUCCESS_WITH_ERRORS | 0.03 | `No module named 'sklearn'` (pip name mismatch) |
| 3 | KeithGalli/matplotlib_tutorial | visualization | SUCCESS (clean) | 0.111 | — |
| 4 | anujvyas/Machine-Learning-Projects (Diabetes Classification) | machine_learning | SUCCESS_WITH_ERRORS | 0.086 | `kaggle_diabetes.csv` not in repo |
| 5 | Tanishq7361/Euler-Cromer-Oscillator-Simulation | simulation | SUCCESS (clean) | 0.167 | — |
| 6 | KeithGalli/NumPy | tutorial | SUCCESS_WITH_ERRORS | 0.309 | numpy is now stricter about ragged arrays (`ValueError: inhomogeneous shape`) |
| 7 | milan6rt/Python-Packages | software_development | SUCCESS (clean) | 0.057 | — |
| 8 | mrdbourke/your-first-kaggle-submission | data_analysis (2nd) | SUCCESS_WITH_ERRORS | 0.448 | matplotlib removed the `seaborn-whitegrid` style name |
| 9 | mhuzaifadev/machine-learning_zero-to-hero | machine_learning (2nd) | SUCCESS_WITH_ERRORS | 0.0 | `No module named 'sklearn'` (pip name mismatch) |
| 10 | justmarkham/pandas-videos | tutorial (2nd) | SUCCESS_WITH_ERRORS | 0.016 | `No module named 'pandas'` — see bug #3 below |

"Reproducibility score" = identical-output-cells / total-code-cells, computed by the pipeline's
own `nbdime`-based cell comparison (original notebook vs. freshly executed one).

## Genuine findings worth keeping for the thesis

1. **`sklearn` vs `scikit-learn` is a systemic false negative.** The pipeline infers
   requirements straight from `import` statements found in the notebook. Any notebook that does
   `import sklearn` gets `sklearn` written into the synthesized `requirements.txt`, but
   `pip install sklearn` has been a hard error for years (PyPI's `sklearn` package now just
   refuses to install and tells you to use `scikit-learn`). This alone caused 3 of the 10 pilot
   repos to fail on the very first executed cell that touches sklearn. This is likely to affect a
   large fraction of the full 252-sample run, since `sklearn` is one of the most common imports
   in the target population.
2. **Missing data files are the single most common real reproducibility gap** in this sample
   (2 of 10: `loan.csv`, `kaggle_diabetes.csv`) — notebooks that assume a dataset the author had
   locally but never committed or linked.
3. **A real bug in the pipeline's own dependency-inference step** (`src/requirements.sh`,
   `is_local_module`): for repo #10 (`justmarkham/pandas-videos`, notebook `pandas.ipynb`), the
   import-extraction step converts the notebook to `pandas.py` as a temporary file *inside the
   repo directory* before scanning it for imports. That temporary file is still on disk when the
   script checks whether `pandas` is a "local module" (`find $REPO_DIR -name pandas.py`) — it
   matches its own scratch file and wrongly concludes `pandas` is a local, not external, package,
   so it never gets installed. The notebook then fails at cell 1 with
   `ModuleNotFoundError: No module named 'pandas'`, on a notebook whose entire purpose is
   demonstrating pandas. Worth a one-line fix (clean up the temp `.py` file, or exclude it from
   the local-module scan) before the full run, or every repo whose notebook happens to be named
   after one of its own imports will silently fail the same way.
4. **API/behavior drift across library versions is a second common gap** (repos #6 and #8):
   `numpy` tightened its handling of ragged (inhomogeneous) arrays, and `matplotlib` removed the
   bundled `seaborn-whitegrid` style name — both notebooks were correct when written and broke
   purely from running against current library versions with no version pin.
5. **Unpinned imports can pull enormous, unnecessary transitive dependencies.** One candidate
   repo's notebook imported `xgboost`, which on PyPI pulls in `nvidia-nccl-cu12` (a 342 MB
   CUDA library) even for plain CPU use — a single notebook's implicit dependency closet turned a
   ~1 minute job into a 5+ minute one. Repos importing `tensorflow` (572 MB wheel) showed the same
   pattern. These are legitimate reproducibility-gap data points, but they make quick pilot/smoke
   runs impractical — worth flagging if the full run has a time budget.

## Environment limitation (needs a decision before the full 252-repo run)

Both execution environments available to this session — the Windows laptop's Linux bridge *and*
the cloud container — sit behind a network allowlist that blocks `codeberg.org` and `zenodo.org`
outright (confirmed via the proxy's own status endpoint: `blocked-by-allowlist`). `python.org`
and `sqlite.org` are blocked too, but those were worked around locally (see below). Codeberg and
Zenodo cannot be worked around the same way, because the pipeline needs to `git clone` /
`curl` them directly at run time, not just download a one-off installer.

This means **90 Codeberg entries + 57 Zenodo entries (147 of 252, ~58% of the full sample)
cannot be fetched from either environment as currently configured.** Only the 105 GitHub entries
are reachable. Before the full run, this needs one of:
- widening the network allowlist to include `codeberg.org` and `zenodo.org` (an org-level setting,
  if available), or
- running the Codeberg/Zenodo portion from a machine outside this proxied setup, or
- accepting a GitHub-only run for now and revisiting Codeberg/Zenodo separately.

## What was set up on the laptop's Linux environment (now persisted, reusable for the full run)

- `sqlite3`, and the `-dev` headers/libraries `pyenv` needs to build Python (`libssl`,
  `libsqlite3`, `libreadline`, `libbz2`, `liblzma`, `libncurses`) — none of these are installable
  via `apt-get install` (no root), so they were fetched with `apt-get download` (permitted) and
  extracted by hand into `~/localpkgs`.
- `pyenv`, with Python 3.10 aliased to the system's existing Python 3.10.12 (building a real
  Python from source via pyenv is blocked by the same `python.org` allowlist restriction, so this
  alias lets any repo that resolves to "3.10" proceed without needing a real compile — every repo
  in this pilot defaulted to 3.10, since none pinned a version). A repo pinning a genuinely
  different major.minor (3.8/3.9/3.11/3.12) will still fail to install until that's addressed.
- `jupyter`/`nbconvert` on PATH (required by `run.sh`'s own dependency check) and `nbdime`
  (needed by the pipeline's own `analysis/compare_notebook.py` — without it every comparison step
  silently crashes with `ModuleNotFoundError: No module named 'nbdime'` and no reproducibility
  score gets recorded at all; this bit the very first pilot repo before it was installed).
- All of this lives under the session's home directory on the laptop (`~/pipeline_env.sh`,
  `~/.pyenv`, `~/localpkgs`, `~/bin`), not inside the repo, so it doesn't add anything to git.

## Where everything is

All paths below are inside the repo (`C:\David\Work\ma-david-keci`), nothing was committed:

- `output/pilot-run-2026-09-06/pilot-db.sqlite` — a **separate** SQLite database containing just
  this pilot's 10 repositories, their runs, notebook executions and reproducibility metrics
  (tables: `repositories`, `repository_runs`, `notebooks`, `notebook_executions`,
  `notebook_reproducibility_metrics`, `repository_metadata`).
- `output/pilot-run-2026-09-06/logs/` — the full per-repo execution logs (15 files: the 10 that
  finished plus 5 from candidates that were swapped out mid-run for the reasons in the findings
  above — kept because they document real, reportable issues).
- `output/pilot-run-2026-09-06/comparisons/` — the 10 cell-by-cell comparison JSON files
  (original vs. executed notebook).
- `output/cloned_repos/<n>_<repo>/` — the actual cloned repos, including each notebook's executed
  copy (`..._output.ipynb`) with real cell outputs, for all 10.

**Note on `output/db/db.sqlite`:** this file already held pre-existing state from earlier work —
5,244 repositories (Sheeba's original corpus) and 116 prior runs, dated 2026-08-28. To avoid
mixing the pilot into that unrelated history (and to avoid accidentally kicking off processing of
that whole 5,244-repo corpus, since batch mode always picks the lowest unprocessed ID first), the
pilot was run against a separate, freshly-schema'd database, and `output/db/db.sqlite` was
restored to its original pre-pilot state afterward. It is untouched — still 5,244 repositories /
116 runs, verified after restore.

## Suggested next step

Fix finding #3 (the `pandas.py` self-collision bug) and decide on the sklearn-name and
Codeberg/Zenodo-network questions above, then either widen the pilot (more GitHub repos, to get a
statistically firmer read before spending the network-access conversation) or resolve network
access and move to the full 252-repo run.
