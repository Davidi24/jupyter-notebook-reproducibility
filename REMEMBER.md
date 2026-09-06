# Project memory

## Learning rule

- Explain only one small code block at a time.
- Explain its logic in short, clear language.
- Wait until David confirms before showing the next block.
- Do not change code during learning unless David explicitly asks.
- After each implemented feature, update the relevant checklist.

## Where we stopped understanding the pipeline

We were studying `process_repo()` in `src/repo.sh` from top to bottom.

Already understood:

1. Its four input arguments and repository paths.
2. Repository name, working directory, and log-file creation.
3. Creating a `repository_runs` row.
4. Registering supplied notebook paths and normalizing GitHub/Codeberg URLs.
5. Detecting GitHub, Codeberg, or Zenodo.
6. Validating GitHub and Codeberg using `git ls-remote` and validating Zenodo through its API.
7. Calling `fetch_and_save_repo_metadata()` to fetch and store normalized metadata.
8. Counting total and Python notebooks from the database.
9. Ending the run when no notebooks or no Python notebooks exist.
10. Pulling, cloning, or downloading the repository content.
11. Checking that the repository folder was created.
12. Automatically discovering and registering `.ipynb` files when paths were not supplied.

We corrected the order so every source is validated before its metadata is fetched or saved. Invalid Zenodo records finish with `INVALID_ZENODO_RECORD`.

We also corrected notebook discovery order: repository content is acquired and missing `.ipynb` paths are discovered before notebook totals and Python-language counts are checked.

The next block to understand starts at `src/repo.sh:197`:

```bash
process_requirements
```

## Completed knowledge graph work

- SQLite-to-CSV exporter for seven pipeline tables.
- Notebook FAIR extension ontology.
- Seven YARRRML mappings and seven compiled RML mappings.
- Repeatable Morph-KGC builder.
- Combined graph with 222,048 unique triples.
- Seven SPARQL queries and structural validation.
- GitHub, Codeberg, and Zenodo modeling tests.
- Docker KG test and metadata regression test.
- KG documentation, ShowCase pages, checklist, and demo screenshots.

Important files:

- `code/fairjupyter/KG_EXTENSION.md`
- `code/fairjupyter/build_pipeline_kg.py`
- `code/fairjupyter/run_pipeline_sparql_tests.py`
- `code/fairjupyter/ontology/notebookfair-extension.owl`
- `tests/test_kg.sh`
- `ShowCase/knowledge-graph.html`

## Pipeline learning status

The complete pipeline flow is understood: initialization, mode selection, repository/notebook collection, dependency discovery, pyenv/venv creation, notebook execution, output comparison, cleanup, final status, and run summary.

## Notebook classification status

- [x] Collect markdown, code, imports, metadata, and output types without executing notebooks.
- [x] Implement transparent weighted rule-based classification.
- [x] Implement structured classification with the free local `gemma3:4b` model through Ollama.
- [x] Compare both results and warn when they disagree or have low confidence.
- [x] Store raw results, review status, and human decisions in SQLite.
- [x] Export classification activities into the FAIR Jupyter knowledge graph.
- [x] Add review-queue and evaluation commands.
- [ ] Manually label a representative sample and report final precision, recall, and macro F1.

## Notebook classification walkthrough checkpoint

Completed and understood:

- [x] `analysis/notebook_classification/categories.py`
- [x] `analysis/nbprocess/collector.py`
- [x] `analysis/notebook_classification/models.py`
- [x] `analysis/notebook_classification/rules.py`
- [x] `analysis/notebook_classification/local_llm.py`
- [x] `analysis/notebook_classification/hybrid.py`

Still to study:

- [ ] `analysis/notebook_classification/storage.py` (currently in progress)
- [ ] `analysis/notebook_classification/evaluation.py`
- [ ] `analysis/notebook_classification/cli.py`
- [ ] `analysis/notebook_classification/__init__.py` (brief supporting-file check)
- [ ] `analysis/notebook_classification/__main__.py` (brief supporting-file check)
- [ ] `tests/test_notebook_classification.py` (brief test walkthrough)

Exact resume point: `open_database()` in `storage.py` is understood. Continue by
entering its call to `ensure_classification_table(connection)`, then follow the
storage flow in execution order.

Walkthrough preferences:

- Keep each explanation short and clear.
- Follow the real execution flow; enter a helper only when it is called.
- Always include a simple input/output example.
- Explain one small block and wait for confirmation before continuing.
- Do not change code unless David explicitly confirms the change.

Changes explicitly approved during the walkthrough:

- Rule version `1.1.0` records raw pattern matches, counted matches, matching-cell
  coverage, and awarded points without changing the capped scoring formula.
- Added three simple comments for insufficient evidence, a clear leading category,
  and nearly equal mixed-purpose scores.

## Knowledge graph rebuilding and learning checklist

- [x] Create and understand the SQLite-to-CSV exporter.
- [x] Create and understand the Notebook FAIR ontology extension.
- [x] Create and understand the YARRRML mappings.
- [x] Compile the YARRRML mappings into RML.
- [x] Build the RDF knowledge graph with Morph-KGC.
- [x] Validate the graph with SPARQL queries.
- [x] Understand the complete KG flow and prepare the HTML demo.

The previously completed KG implementation is preserved in
`C:\Users\kecid\AppData\Local\Temp\fairjupyter-kg-backup-20260817-120523`.

## Next learning action

Resume `analysis/notebook_classification/storage.py` at
`ensure_classification_table(connection)`. After the walkthrough is complete,
manually label a representative sample and run the classification evaluation report.

## Five pipeline stages

1. Initialize the pipeline environment.
2. Choose mode: single repository or batch.
3. Repository and Notebook Collection.
4. Build Environment and Execute Notebooks.
5. Compare Results and Finish.
