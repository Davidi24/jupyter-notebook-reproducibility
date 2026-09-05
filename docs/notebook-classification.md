# Notebook classification

The project classifies a notebook's main purpose with two independent methods:

1. A transparent weighted rule-based classifier.
2. A free local language model served by Ollama.

The methods use the same fixed categories. Their raw results are preserved and
compared. A disagreement, uncertain result, unavailable local model, or low
confidence creates a human-review warning instead of silently selecting a label.

## Categories

- `data_preparation`
- `data_analysis`
- `visualization`
- `machine_learning`
- `simulation`
- `tutorial`
- `software_development`
- `mixed_purpose`
- `uncertain`

## Processing route

```text
Notebook
  -> collect markdown, code, imports, metadata, and output types
  -> weighted rule-based classification
  -> structured local-LLM classification
  -> compare primary and secondary categories
  -> accept confident agreement provisionally
  -> request human clarification otherwise
  -> store raw results, review status, and final human category
```

The collector parses Python imports with the standard-library `ast` module. It
does not execute notebook code. The Ollama request contains compact text and code
excerpts and runs on the local machine.

## Local model

The default model is `gemma3:4b`. It is already configurable through either the
`--model` argument or the `OLLAMA_MODEL` environment variable.

```bash
ollama list
ollama pull gemma3:4b
```

Ollama and the local model do not require a paid API. Runtime, memory use, and
electricity are local costs. The model can be skipped with `--rule-only`, but a
rule-only result remains marked for human clarification.

## Classify notebooks

Classify one notebook:

```bash
python -B -m analysis.notebook_classification classify path/to/notebook.ipynb
```

Classify every notebook below a directory and store results in the pipeline DB:

```bash
python -B -m analysis.notebook_classification classify \
  output/cloned_repos/example-repository \
  --db-file output/db/db.sqlite \
  --output output/classification-results.json
```

The command returns the rule result, local-LLM result, agreement status,
warning, provisional category, content hash, model, and prompt version.

## Agreement statuses

- `AGREED`: both methods select the same category with sufficient confidence.
- `AGREED_LOW_CONFIDENCE`: the category matches, but human review is required.
- `PARTIAL_AGREEMENT`: one primary category appears only as the other secondary category.
- `CLASSIFIER_DISAGREEMENT`: confident primary categories differ.
- `RULE_LOW_CONFIDENCE`, `LLM_LOW_CONFIDENCE`, `BOTH_LOW_CONFIDENCE`: confidence warning.
- `BOTH_UNCERTAIN`: neither method has sufficient evidence.
- `LLM_UNAVAILABLE`: Ollama or the configured model could not be used.
- `LLM_NOT_REQUESTED`: rule-only mode was selected.
- `HUMAN_REVIEWED`: a person supplied the final category.

## Human clarification

Export rows requiring review:

```bash
python -B -m analysis.notebook_classification review-queue \
  --db-file output/db/db.sqlite \
  --output output/classification-review.csv
```

For an unbiased random annotation sample that hides both automated predictions:

```bash
python -B -m analysis.notebook_classification review-queue \
  --db-file output/db/db.sqlite \
  --output output/classification-blind-sample.csv \
  --include-all --blind --sample-size 100 --seed 2026
```

Save one human decision:

```bash
python -B -m analysis.notebook_classification review \
  --db-file output/db/db.sqlite \
  --classification-id 1 \
  --category visualization \
  --reviewer David \
  --note "Plots are the notebook's main result."
```

The human decision does not delete either automated result.

After filling the `human_category`, `reviewer`, and optional `note` columns, apply
the CSV decisions in one batch:

```bash
python -B -m analysis.notebook_classification apply-reviews \
  --db-file output/db/db.sqlite \
  --input output/classification-blind-sample.csv
```

## Evaluation

After a sample has been reviewed, calculate method coverage, accuracy, precision,
recall, macro F1, per-category support, and rule/LLM disagreement rate:

```bash
python -B -m analysis.notebook_classification evaluate \
  --db-file output/db/db.sqlite \
  --output output/classification-evaluation.json
```

Agreement is not proof of correctness. The final experiment should therefore
include a random sample of agreed classifications in the human-reviewed set.

## Persistence and knowledge graph

SQLite stores each attempt in `notebook_classifications`, including confidence,
model, prompt version, warning, raw JSON, and human decision. A seventh pipeline
CSV/RML mapping publishes linked classification activities in the knowledge graph.
Only classifications connected to a registered notebook ID are exported to RDF.

## Verification

```bash
python -B -m unittest tests.test_notebook_classification -v
python -B code/fairjupyter/compile_pipeline_mappings.py --check
```

The automated tests mock the model response for speed and determinism. A separate
manual integration run verifies the installed local model.
