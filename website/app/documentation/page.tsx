'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon, PageHeading } from '@/components/AppShell';

type DocTab = 'pipeline' | 'ai-classification' | 'evaluation' | 'knowledge-graph';

const TABS: { id: DocTab; label: string; icon: string }[] = [
  { id: 'pipeline', label: 'Pipeline', icon: 'terminal' },
  { id: 'ai-classification', label: 'Classification', icon: 'spark' },
  { id: 'evaluation', label: 'Evaluation', icon: 'chart' },
  { id: 'knowledge-graph', label: 'Knowledge graph', icon: 'nodes' },
];

const HEADINGS: Record<DocTab, { title: string; subtitle: string }> = {
  pipeline: {
    title: 'Reproducibility pipeline',
    subtitle: 'How a repository URL becomes a scored, re-executed notebook.',
  },
  'ai-classification': {
    title: 'Notebook classification',
    subtitle: 'Exactly how imports, notebook text, code patterns, and outputs become a category.',
  },
  evaluation: {
    title: 'Evaluation methodology',
    subtitle: 'How classification quality and cross-platform reproducibility are measured and reported.',
  },
  'knowledge-graph': {
    title: 'Knowledge graph',
    subtitle: 'RDF knowledge graph construction and querying.',
  },
};

function isDocTab(value: string | null): value is DocTab {
  return value === 'pipeline' || value === 'ai-classification' || value === 'evaluation' || value === 'knowledge-graph';
}

function DocsHeader() {
  return (
    <header className="topbar">
      <div className="brand" style={{ padding: 0 }}>
        <span className="brand-mark">N</span>
        <span className="brand-name">NotebookFair</span>
      </div>
      <Link href="/analysis" className="button secondary">
        ← Back to workspace
      </Link>
    </header>
  );
}

function DocumentationTabs({ active, onChange }: { active: DocTab; onChange: (tab: DocTab) => void }) {
  return (
    <div className="tab-row" role="tablist" aria-label="Documentation sections">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={`filter-chip ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <Icon name={t.icon} size={13} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

function FlowDefs({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
        <polygon points="0,0 8,4 0,8" fill="var(--fg-subtle)" />
      </marker>
    </defs>
  );
}

function FlowBox({ x, y, w, h, title, sub, accent }: { x: number; y: number; w: number; h: number; title: string; sub?: string; accent?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={accent ? 'var(--accent-soft)' : 'var(--surface-2)'} stroke={accent ? 'var(--brand-fg)' : 'var(--border)'} strokeWidth={1.2} />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 3 : h / 2 + 4)} textAnchor="middle" fontSize={12.5} fontWeight={650} fill="var(--fg)">{title}</text>
      {sub && <text x={x + w / 2} y={y + h / 2 + 15} textAnchor="middle" fontSize={9.5} fill="var(--fg-subtle)">{sub}</text>}
    </g>
  );
}

function FlowDiamond({ cx, cy, rx, ry, title }: { cx: number; cy: number; rx: number; ry: number; title: string }) {
  const points = `${cx},${cy - ry} ${cx + rx},${cy} ${cx},${cy + ry} ${cx - rx},${cy}`;
  return (
    <g>
      <polygon points={points} fill="var(--surface-2)" stroke="var(--border)" strokeWidth={1.2} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11.5} fontWeight={650} fill="var(--fg)">{title}</text>
    </g>
  );
}

function FlowEdge({ x1, y1, x2, y2, label, markerId, dx = 0, dy = 0 }: { x1: number; y1: number; x2: number; y2: number; label?: string; markerId: string; dx?: number; dy?: number }) {
  const midX = (x1 + x2) / 2 + dx;
  const midY = (y1 + y2) / 2 + dy;
  const plateW = label ? label.length * 5.4 + 10 : 0;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--fg-subtle)" strokeWidth={1.2} markerEnd={`url(#${markerId})`} />
      {label && (
        <>
          <rect x={midX - plateW / 2} y={midY - 8} width={plateW} height={14} fill="var(--surface)" />
          <text x={midX} y={midY + 3} textAnchor="middle" fontSize={9} fill="var(--fg-muted)">{label}</text>
        </>
      )}
    </g>
  );
}

function PipelineFlowDiagram() {
  const markerId = 'pipeline-arrow';
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox="0 0 920 1100" role="img" aria-label="Flowchart of the reproducibility pipeline: a repository URL is routed to a platform-specific validator and metadata fetcher, merged, then run through notebook discovery, classification, dependency resolution, a sandboxed environment, execution, and comparison." style={{ width: '100%', maxWidth: 760, height: 'auto', display: 'block', margin: '0 auto' }}>
        <FlowDefs id={markerId} />

        <FlowBox x={360} y={20} w={200} h={44} title="Repository URL" />
        <FlowDiamond cx={460} cy={118} rx={90} ry={42} title="Detect platform" />
        <FlowBox x={60} y={210} w={220} h={56} title="GitHub" sub="validate + fetch metadata" />
        <FlowBox x={350} y={210} w={220} h={56} title="Codeberg" sub="validate + fetch metadata" />
        <FlowBox x={640} y={210} w={220} h={56} title="Zenodo" sub="validate + fetch metadata" />
        <FlowBox x={360} y={330} w={200} h={50} title="Metadata saved" />
        <FlowBox x={360} y={420} w={200} h={50} title="Acquire content" sub="clone / download" />
        <FlowBox x={360} y={510} w={200} h={50} title="Discover notebooks" />
        <FlowBox x={360} y={600} w={200} h={50} title="Classify notebooks" sub="see AI classification tab" />
        <FlowBox x={360} y={690} w={200} h={50} title="Resolve dependencies" />
        <FlowBox x={310} y={780} w={300} h={110} title="" accent />
        <text x={330} y={800} fontSize={10} fontWeight={650} fill="var(--brand-fg)">Sandboxed container</text>
        <FlowBox x={380} y={810} w={160} h={50} title="Python environment" />
        <FlowBox x={360} y={930} w={200} h={50} title="Execute notebooks" sub="cell by cell" />
        <FlowBox x={360} y={1020} w={200} h={50} title="Compare and save" sub="reproducibility score" />

        <FlowEdge x1={460} y1={64} x2={460} y2={76} markerId={markerId} label="detect platform" dx={60} />
        <FlowEdge x1={460} y1={160} x2={170} y2={210} markerId={markerId} label="github.com" dx={-14} dy={-6} />
        <FlowEdge x1={460} y1={160} x2={460} y2={210} markerId={markerId} label="codeberg.org" dx={46} />
        <FlowEdge x1={460} y1={160} x2={750} y2={210} markerId={markerId} label="zenodo.org" dx={14} dy={-6} />
        <FlowEdge x1={170} y1={266} x2={460} y2={330} markerId={markerId} />
        <FlowEdge x1={460} y1={266} x2={460} y2={330} markerId={markerId} />
        <FlowEdge x1={750} y1={266} x2={460} y2={330} markerId={markerId} />
        <FlowEdge x1={460} y1={380} x2={460} y2={420} markerId={markerId} />
        <FlowEdge x1={460} y1={470} x2={460} y2={510} markerId={markerId} />
        <FlowEdge x1={460} y1={560} x2={460} y2={600} markerId={markerId} label="register each notebook" dx={70} />
        <FlowEdge x1={460} y1={650} x2={460} y2={690} markerId={markerId} />
        <FlowEdge x1={460} y1={740} x2={460} y2={780} markerId={markerId} label="requirements resolved" dx={62} />
        <FlowEdge x1={460} y1={890} x2={460} y2={930} markerId={markerId} label="run in that environment" dx={70} />
        <FlowEdge x1={460} y1={980} x2={460} y2={1020} markerId={markerId} />
      </svg>
      <figcaption style={{ marginTop: 8, color: 'var(--fg-subtle)', fontSize: 8.5, textAlign: 'center' }}>
        One repository run: platform detection branches to a validator and metadata fetcher, merges, then flows through discovery, classification, dependency resolution, a two-layer sandbox, execution, and scoring.
      </figcaption>
    </figure>
  );
}

function ProseBlock({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div style={{ padding: '4px 16px 18px' }}>
      {paragraphs.map((para, i) => (
        <p
          key={i}
          style={{ margin: i === paragraphs.length - 1 ? 0 : '0 0 12px', color: 'var(--fg-muted)', fontSize: 9.5, lineHeight: 1.6 }}
        >
          {para}
        </p>
      ))}
    </div>
  );
}

function StepPanel({ index, title, description, explanation }: { index: number; title: string; description: string; explanation: string[] }) {
  return (
    <section className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-heading">
        <div>
          <h2>{index}. {title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <ProseBlock paragraphs={explanation} />
    </section>
  );
}

function PipelineSection() {
  return (
    <>
      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading">
          <div>
            <h2>How it works</h2>
            <p>One repository run, start to finish</p>
          </div>
        </div>
        <div style={{ padding: '4px 16px 18px' }}>
          <p style={{ margin: '0 0 12px', color: 'var(--fg-muted)', fontSize: 9.5, lineHeight: 1.6 }}>
            Every import — from GitHub, Codeberg, or Zenodo — runs through the same eight steps below, in
            the same order, every time. The website&apos;s pipeline status card groups the first three into
            a single &ldquo;Acquire repository&rdquo; phase for a simpler display; this page walks through
            all eight exactly as they actually run, with no step skipped or reordered depending on the source.
          </p>
          <PipelineFlowDiagram />
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading">
          <div>
            <h2>Isolation model</h2>
            <p>Every run is sandboxed twice, so results reflect the repository — not the host</p>
          </div>
        </div>
        <ProseBlock
          paragraphs={[
            'The entire run happens inside a single-use container, built once from one shared pipeline image and started fresh for every job. That container is given a memory ceiling and a CPU ceiling by default, a cap on how many processes it may run at once, every Linux capability an unprivileged process doesn’t need stripped away outright, and a rule that blocks it from ever gaining new privileges while it runs.',
            'The pipeline’s own code is mounted into that container read-only, so the repository being tested can never modify the pipeline that is testing it — only that one job’s private working directory can be written to. If a run somehow gets stuck, a fixed safety timer stops its container automatically after a set number of hours, and cancelling a run from the website does the same thing immediately rather than waiting for it to notice.',
            'Inside that outer container sits a second, narrower layer of isolation, built for the repository itself rather than for the pipeline as a whole: the repository is given its own exact Python version and its own empty virtual environment, created fresh for this one run and deleted the moment it finishes. This second layer is what keeps one repository’s dependencies from ever leaking into another repository’s run, even though every run shares the same outer container image.',
          ]}
        />
      </section>

      <StepPanel
        index={1}
        title="Fetch repository metadata"
        description="Before anything is downloaded, the pipeline confirms the source is real and reads who owns it, its license, and — for Zenodo — its DOI, straight from the platform's own API."
        explanation={[
          'The pipeline first looks at the shape of the URL itself to decide which of the three supported platforms it points to — GitHub and Codeberg addresses look like ordinary git hosting links, while a Zenodo link identifies a permanent published record rather than a live code repository. A URL that doesn’t match any of the three is rejected immediately, before any network call is made at all.',
          'Before saving anything, the source is confirmed to actually exist: for GitHub and Codeberg, a lightweight remote handshake lists the repository’s branches without downloading a single file, and for Zenodo, the URL is checked against the exact shape of a published record and confirmed to exist through Zenodo’s own API. A source that fails this check stops the run right here, before any metadata is ever written.',
          'Once confirmed, the pipeline calls that platform’s own web API — not git — to retrieve a fixed set of normalized fields: a title, a description, the owning account or author, the license, a list of keywords or topics, a permanent identifier (populated only for Zenodo, since GitHub and Codeberg repositories don’t have one), and the dates the source was created and last updated.',
          'This metadata is written to the database immediately, before a single file is downloaded, so that a run which fails later still leaves behind a correct record of exactly what was attempted and who published it.',
        ]}
      />

      <StepPanel
        index={2}
        title="Acquire repository"
        description="Once the source is confirmed reachable, its actual content is downloaded — a shallow Git clone for GitHub and Codeberg, or a direct file or archive download for Zenodo."
        explanation={[
          'For GitHub and Codeberg, the pipeline clones only the latest state of the repository rather than its full history — a shallow, single-commit copy — since re-executing the notebooks only ever requires the code as it exists today, never its past commits.',
          'If that same repository has already been imported in an earlier run, the pipeline does not clone it again from scratch — it instead updates the existing local copy to the latest commit, which is faster and avoids redownloading unchanged history.',
          'Zenodo is handled differently, since a Zenodo record is a fixed, published snapshot rather than a live git history. The pipeline first tries to download only the individual files it actually needs — for instance a standalone notebook attached directly to the record — capped by a safety size limit so that a single oversized record can’t exhaust disk space. Only when no notebook can be found among those individually downloadable files does it fall back to downloading the record’s complete archive and extracting it, checking every extracted file path along the way to make sure nothing in the archive can write outside the folder it was extracted into.',
        ]}
      />

      <StepPanel
        index={3}
        title="Discover notebooks"
        description="With the files on disk, every notebook inside them is found and registered, so later steps know exactly what to classify and run — in a consistent, repeatable order."
        explanation={[
          'The pipeline walks the entire downloaded repository, into every subfolder, looking for any file with a notebook extension, rather than relying on the repository to declare where its notebooks live. This catches notebooks nested in example folders, tutorial directories, or anywhere else an author happened to put them, and the resulting list is always sorted the same way so results are reproducible run to run.',
          'Each notebook found this way is registered as its own independent entry, so that if one notebook later fails to execute, it does not stop the rest of the repository’s notebooks from being processed.',
          'At the same time, the pipeline records which kernel language each notebook declares. Only once notebooks are actually registered does it check that there is at least one worth continuing with — a repository with no notebooks at all, or with notebooks written only for a non-Python kernel, stops the run at this point, since every step from here on assumes Python code.',
        ]}
      />

      <StepPanel
        index={4}
        title="Classify notebooks"
        description="Every registered notebook is classified independently by a rule engine and, when enabled, a local language model, then reconciled — see the AI classification tab for the full method."
        explanation={[
          'This step hands each registered notebook to the classification system covered in full on the AI classification tab: a fast rule-based scorer decides what kind of notebook this is — data preparation, analysis, a tutorial, and so on — purely from its imports and text, with no model call required.',
          'On this website specifically, that rule-based result is what gets stored by default for a live import: the local-language-model stage and the full two-method reconciliation described on the AI classification tab are fully built and supported, but only run when that stage is explicitly turned on for a given import. When it is enabled, both results are reconciled right here in the pipeline — a confident, matching pair is accepted immediately, while anything the two methods disagree on is queued for a person to resolve, without blocking the rest of the run.',
        ]}
      />

      <StepPanel
        index={5}
        title="Resolve dependencies"
        description="One combined requirements file is built from whatever the repository already declares, plus every import the pipeline can find inside the notebook's own code."
        explanation={[
          'Many repositories ship an incomplete or outdated dependency list, so the pipeline does not trust it alone. To find out what a notebook actually uses, the pipeline first converts it into a plain Python script, then reads every import statement directly out of that script, rather than guessing from unrelated text elsewhere in the notebook.',
          'Each imported name is checked against two exclusions before it is added to the list: the several hundred modules that ship as part of the Python standard library, which never need to be installed separately, and any local file already sitting inside the repository itself. What is left over — the genuinely external packages — becomes the notebook’s own contribution to the dependency list.',
          'That list is then merged with whatever the repository already declared in its own requirements files, with duplicate entries removed and the result sorted. This combined, de-duplicated list is what gets installed in the next step, so a notebook that imports a package its author forgot to declare still has a chance of running correctly.',
        ]}
      />

      <StepPanel
        index={6}
        title="Prepare environment"
        description="A fresh, isolated Python environment is built to match what the repository actually declares, so a result reflects the repository — not whatever happens to already be installed."
        explanation={[
          'The pipeline looks for a Python version hint in a strict priority order: a Binder-style runtime declaration, a plain runtime file at the repository’s root, a dedicated version file, and finally a minimum-version requirement written into the repository’s own packaging files. The first one found wins; if none of them exist, the pipeline falls back to a recent, broadly compatible default version.',
          'That version is then installed if it is not already available. A partial version like a major-and-minor number resolves automatically to the latest matching patch release the pipeline is able to install, rather than requiring an exact patch version to already exist.',
          'A brand-new virtual environment is always created for the run — even if one already exists from an earlier attempt at the same repository, the old one is deleted first, so nothing from a previous attempt can carry over. Jupyter and its notebook-execution tool are installed into that fresh environment before anything else.',
          'Every dependency is then installed one package at a time, as its own separate step, rather than as a single batch install. If one specific package fails to install, that failure is recorded and the pipeline moves on to install the next one rather than aborting the whole environment — a single broken or unavailable dependency does not have to prevent every other one from being available when the notebook actually runs.',
        ]}
      />

      <StepPanel
        index={7}
        title="Execute notebooks"
        description="Every notebook is re-run top to bottom inside that clean environment, exactly as a human would re-run it — no cells skipped or reordered."
        explanation={[
          'Each notebook is executed cell by cell, in its original order, inside the freshly built environment from the previous step — the same thing a person would do by opening the notebook and choosing to run every cell from the top.',
          'Errors are allowed to pass through rather than stopping the run: if a cell raises an exception, that error is captured as if it were any other cell output, and execution continues on to the remaining cells — the same as letting a notebook run to the end even when one step along the way fails, instead of halting at the first problem.',
          'If a notebook fails to produce any executed output at all, the pipeline scans its own run log for known failure signatures — a missing Jupyter kernel, a Python module that was never available, a broken import, a syntax problem, the process running out of memory, exceeding its time limit, or losing network access — so a failed run comes back categorized rather than simply marked as failed.',
          'The freshly executed version of the notebook, including whatever new outputs it produced, is kept as a separate file from the original version that was downloaded, so the two can be compared in the final step without either one overwriting the other.',
        ]}
      />

      <StepPanel
        index={8}
        title="Compare and save"
        description="The freshly executed notebook is diffed cell by cell against its originally published version. The fraction of code cells that matched becomes the reproducibility score."
        explanation={[
          'Every code cell in the freshly executed notebook is compared, cell for cell, against the same cell in the originally published version — both its source code and whatever it produced when it ran. Two bookkeeping fields that always change between runs regardless of anything the author wrote — an internal execution counter and per-cell metadata — are ignored during this comparison, so they can never count as a mismatch on their own.',
          'When a cell’s output does differ, that difference is further classified as numeric, textual, or structural, depending on whether two numbers changed, two pieces of text changed, or the shape of the output itself changed — useful context for understanding why a particular cell did not reproduce, beyond just knowing that it did not.',
          'The reproducibility score for the notebook is simply the fraction of code cells that matched exactly: the number of identical cells divided by the total number of code cells in the notebook.',
          'Separately, a cell is flagged as expectedly non-deterministic if its code calls a random-number generator, reads the current time or date, reads an environment variable, or generates a unique identifier — all things that are expected to differ from one execution to the next even when the underlying code has not changed at all. A mismatch in a cell like this is reported as expected variability rather than counted the same as a genuine failure to reproduce.',
        ]}
      />

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Supported sources</h2>
            <p>Every run starts by detecting which of these three the URL points to</p>
          </div>
        </div>
        <ProseBlock
          paragraphs={[
            'A GitHub repository is confirmed reachable with a lightweight handshake before anything is cloned, then its metadata — owner, license, description, topics, and creation and update dates — is read from GitHub’s own API. The repository itself is then cloned as a shallow, single-commit copy rather than its full history.',
            'Codeberg is treated identically to GitHub: the same reachability check and shallow-clone path, just pointed at Codeberg’s own API for metadata instead.',
            'A Zenodo record’s URL is checked against the exact shape of a published record and confirmed to exist through the Zenodo API, which is also where its metadata — including its permanent DOI — comes from. Since a Zenodo record is a fixed, published snapshot rather than a live repository, the pipeline downloads the individual files it needs directly where it can, falling back to the record’s complete archive only when no notebook can be found among the files available individually.',
          ]}
        />
      </section>
    </>
  );
}

const CATEGORIES: { id: string; label: string; text: string }[] = [
  { id: 'data_preparation', label: 'Data preparation', text: 'Cleans, transforms, combines, or prepares data.' },
  { id: 'data_analysis', label: 'Data analysis', text: 'Explores data, computes statistics, or answers research questions.' },
  { id: 'visualization', label: 'Visualization', text: 'Primarily creates plots, charts, dashboards, or visual reports.' },
  { id: 'machine_learning', label: 'Machine learning', text: 'Trains, evaluates, or applies predictive or learned models.' },
  { id: 'simulation', label: 'Simulation', text: 'Models systems, runs simulations, or performs numerical experiments.' },
  { id: 'tutorial', label: 'Tutorial', text: 'Teaches a method or demonstrates how to use a tool or dataset.' },
  { id: 'software_development', label: 'Software development', text: 'Develops, tests, or demonstrates reusable software components.' },
  { id: 'mixed_purpose', label: 'Mixed purpose', text: 'Has two or more equally important purposes.' },
  { id: 'uncertain', label: 'Uncertain', text: 'Does not contain enough evidence for a reliable category.' },
];

const LIBRARY_SIGNALS = [
  { category: 'Data preparation', libraries: ['pandas', 'polars', 'dask', 'petl', 'openpyxl'], meaning: 'The notebook is mainly cleaning, reshaping, joining, or preparing data.' },
  { category: 'Data analysis', libraries: ['numpy', 'scipy', 'statsmodels', 'pingouin', 'sympy'], meaning: 'The notebook is calculating statistics or answering analytical questions.' },
  { category: 'Visualization', libraries: ['matplotlib', 'seaborn', 'plotly', 'altair', 'bokeh'], meaning: 'The notebook is mainly producing plots, charts, or visual reports.' },
  { category: 'Machine learning', libraries: ['sklearn', 'tensorflow', 'keras', 'torch', 'xgboost', 'lightgbm', 'transformers', 'catboost'], meaning: 'The notebook is training, evaluating, or applying learned models.' },
  { category: 'Simulation', libraries: ['simpy', 'pymc', 'mesa', 'simpeg', 'fenics'], meaning: 'The notebook is simulating a process, system, or numerical experiment.' },
  { category: 'Software development', libraries: ['pytest', 'unittest', 'click', 'typer', 'flask', 'fastapi'], meaning: 'The notebook is testing or demonstrating reusable software or an API.' },
];

const TEXT_SIGNALS = [
  { category: 'Data preparation', words: 'data cleaning, preprocessing, feature engineering', code: 'dropna(), fillna(), merge(), join(), pivot(), melt()' },
  { category: 'Data analysis', words: 'exploratory data analysis, statistical analysis, hypothesis test, correlation', code: 'describe(), corr(), mean(), median(), std(), anova(), ttest()' },
  { category: 'Visualization', words: 'data visualization, plotting, chart, dashboard', code: 'plt.*, sns.*, px.*, go.*, alt.*, .plot()' },
  { category: 'Machine learning', words: 'machine learning, deep learning, neural network, classification, regression model', code: 'train_test_split, .fit(), .predict(), cross_val_score' },
  { category: 'Simulation', words: 'simulation, Monte Carlo, agent-based model, numerical experiment', code: 'odeint, solve_ivp, random.normal, random.uniform' },
  { category: 'Tutorial', words: 'tutorial, walkthrough, step-by-step, getting started, how to', code: '“This notebook demonstrates…”, “In this example…”, “Learning objective…”' },
  { category: 'Software development', words: 'unit test, integration test, software package, command-line, API endpoint', code: 'pytest.*, unittest.*, argparse.*, click.*, FastAPI()' },
];

const AGREEMENT_STATUSES: { id: string; pill: string; text: string }[] = [
  { id: 'AGREED', pill: 'success', text: 'Both methods picked the same category, each with confidence at or above the threshold. Stored automatically.' },
  { id: 'AGREED_LOW_CONFIDENCE', pill: 'partial', text: 'They agree on the category, but at least one confidence value is below the threshold. Sent for review.' },
  { id: 'PARTIAL_AGREEMENT', pill: 'partial', text: 'One method’s primary category only appears as the other’s secondary category. Sent for review.' },
  { id: 'CLASSIFIER_DISAGREEMENT', pill: 'partial', text: 'The two methods picked different categories outright. Sent for review.' },
  { id: 'RULE_LOW_CONFIDENCE / LLM_LOW_CONFIDENCE / BOTH_LOW_CONFIDENCE', pill: 'partial', text: 'They disagree, and one or both confidence values are below the threshold. Sent for review.' },
  { id: 'BOTH_UNCERTAIN', pill: 'partial', text: 'Both methods independently returned uncertain. Sent for review.' },
  { id: 'LLM_NOT_REQUESTED / LLM_UNAVAILABLE', pill: 'partial', text: 'The local model was skipped or did not respond in time; only the rule result exists. Sent for review.' },
  { id: 'HUMAN_REVIEWED', pill: 'success', text: 'A person has supplied the final category by hand. Resolved.' },
];

function ClassificationFlowDiagram() {
  const markerId = 'classify-arrow';
  return (
    <figure style={{ margin: 0, padding: '10px 16px 4px' }}>
      <svg viewBox="0 0 940 700" role="img" aria-label="Flowchart of notebook classification: the rule engine always runs, the optional local language model can run in parallel, and their results are either accepted or sent for human review." style={{ width: '100%', maxWidth: 760, height: 'auto', display: 'block', margin: '0 auto' }}>
        <FlowDefs id={markerId} />

        <FlowBox x={340} y={20} w={240} h={50} title="Collect notebook data" sub="imports, markdown, code, outputs" />
        <FlowBox x={120} y={140} w={260} h={60} title="Rule engine" sub="weighted signals → category" />
        <FlowBox x={520} y={140} w={260} h={60} title="Local LLM" sub="runs on local hardware" />
        <FlowDiamond cx={460} cy={300} rx={140} ry={55} title="Same category & confident?" />
        <FlowBox x={180} y={430} w={240} h={50} title="Store — AGREED" />
        <FlowBox x={560} y={430} w={260} h={50} title="Flag for review" accent />
        <FlowBox x={560} y={520} w={260} h={50} title="Human review queue" sub="a person decides" />
        <FlowBox x={320} y={610} w={280} h={50} title="Final category saved" />

        <FlowEdge x1={460} y1={70} x2={250} y2={140} markerId={markerId} label="score by rules" dx={-30} dy={-8} />
        <FlowEdge x1={460} y1={70} x2={650} y2={140} markerId={markerId} label="classify with model" dx={30} dy={-8} />
        <FlowEdge x1={250} y1={200} x2={410} y2={264} markerId={markerId} />
        <FlowEdge x1={650} y1={200} x2={510} y2={264} markerId={markerId} />
        <FlowEdge x1={410} y1={336} x2={300} y2={430} markerId={markerId} label="yes" dx={-46} />
        <FlowEdge x1={510} y1={336} x2={690} y2={430} markerId={markerId} label="no" dx={40} />
        <FlowEdge x1={690} y1={480} x2={690} y2={520} markerId={markerId} label="needs review" dx={54} />
        <FlowEdge x1={300} y1={480} x2={460} y2={610} markerId={markerId} />
        <FlowEdge x1={690} y1={570} x2={460} y2={610} markerId={markerId} label="reviewer decides" dx={60} dy={-10} />
      </svg>
      <figcaption style={{ marginTop: 8, color: 'var(--fg-subtle)', fontSize: 8.5, textAlign: 'center' }}>
        The rule engine always runs. If the optional local model is enabled, its result is compared with the rule result; only a confident match is accepted automatically.
      </figcaption>
    </figure>
  );
}

function ClassificationStep({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <li className="classification-step">
      <span className="classification-step-number">{number}</span>
      <div><strong>{title}</strong><p>{children}</p></div>
    </li>
  );
}

function AiClassificationSection() {
  return (
    <div className="classification-docs">
      <section className="panel classification-intro" style={{ marginBottom: 18 }}>
        <div className="panel-heading">
          <div>
            <h2>The short version</h2>
            <p>NotebookFair looks for evidence, gives each category points, and explains the result</p>
          </div>
        </div>
        <div className="classification-lead">
          <p><strong>In one sentence:</strong> libraries are the strongest clues, words and code patterns add supporting clues, image outputs add a small visualization bonus, and the category with the strongest evidence wins.</p>
          <ol className="classification-steps">
            <ClassificationStep number={1} title="Read the notebook">Collect imports, markdown text, code cells, and saved output types. The classifier reads the file; it does not execute its code.</ClassificationStep>
            <ClassificationStep number={2} title="Check libraries">Recognized libraries add <b>3 points</b> to the category they usually represent.</ClassificationStep>
            <ClassificationStep number={3} title="Check words and code">Recognized phrases and code patterns add <b>1.5 points per match</b>, with a maximum of three matches for each pattern.</ClassificationStep>
            <ClassificationStep number={4} title="Check image outputs">Each saved image output adds <b>1 visualization point</b>, up to 3 points.</ClassificationStep>
            <ClassificationStep number={5} title="Choose and explain">Scores are ranked. NotebookFair returns the winning category, confidence, secondary categories, and the evidence it used.</ClassificationStep>
          </ol>
          <div className="classification-note"><Icon name="info" size={15} /><span><strong>What runs today:</strong> the rule-based method runs by default. The local language model is optional and only joins the decision when it is explicitly enabled.</span></div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading">
          <div>
            <h2>The nine categories</h2>
            <p>Both methods choose from the exact same fixed list</p>
          </div>
          <span className="count-badge">{CATEGORIES.length}</span>
        </div>
        <div className="table-wrap">
          <table className="mini-table">
            <thead><tr><th>Category</th><th>Meaning</th></tr></thead>
            <tbody>
              {CATEGORIES.map((c) => (
                <tr key={c.id}><td><strong className="category-label">{c.label}</strong><code className="category-code">{c.id}</code></td><td style={{ fontFamily: 'inherit' }}>{c.text}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading">
          <div>
            <h2>Step 1 — libraries give the strongest clues</h2>
            <p>Every recognized import adds exactly 3 points</p>
          </div>
        </div>
        <div className="classification-section-body">
          <p className="classification-explainer">NotebookFair reads Python import statements without running the notebook. For example, <code>import pandas as pd</code> is recorded as <code>pandas</code>. If the library appears below, its category receives 3 points. An unknown library adds no points.</p>
          <div className="library-signal-grid">
            {LIBRARY_SIGNALS.map((signal) => (
              <article className="library-signal-card" key={signal.category}>
                <div><strong>{signal.category}</strong><span>+3 per library</span></div>
                <p>{signal.meaning}</p>
                <div className="library-tags">{signal.libraries.map((library) => <code key={library}>{library}</code>)}</div>
              </article>
            ))}
          </div>
          <div className="classification-note"><Icon name="info" size={15} /><span><strong>No direct library list for tutorials:</strong> tutorial purpose is detected from explanatory wording such as “step-by-step” or “getting started.”</span></div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading">
          <div>
            <h2>Step 2 — words and code patterns add supporting clues</h2>
            <p>Each match adds 1.5 points; each pattern stops counting after three matches</p>
          </div>
        </div>
        <div className="classification-section-body">
          <p className="classification-explainer">Next, NotebookFair searches the notebook&apos;s markdown and code. Repetition matters, but it is capped: one match is 1.5 points, two are 3 points, and three or more are 4.5 points for that pattern.</p>
          <div className="table-wrap classification-signal-table">
            <table className="mini-table">
              <thead><tr><th>Category</th><th>Words it looks for</th><th>Code patterns it looks for</th></tr></thead>
              <tbody>{TEXT_SIGNALS.map((signal) => (
                <tr key={signal.category}><td><strong>{signal.category}</strong></td><td>{signal.words}</td><td><code>{signal.code}</code></td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="classification-note"><Icon name="info" size={15} /><span><strong>Important:</strong> repository topics and Zenodo keywords are saved as metadata, but they do not currently add rule points. The text check uses words inside the notebook&apos;s own markdown and code.</span></div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading">
          <div>
            <h2>Step 3 — add output evidence, then choose the result</h2>
            <p>The final rules are fixed, so the same notebook always gets the same rule score</p>
          </div>
        </div>
        <div className="classification-section-body">
          <div className="decision-rule-grid">
            <article><span>Image bonus</span><strong>+1 visualization point</strong><p>For each saved image output, up to a maximum of 3 points.</p></article>
            <article><span>Not enough evidence</span><strong>Top score below 2</strong><p>The result becomes <code>uncertain</code>; NotebookFair does not guess.</p></article>
            <article><span>Secondary category</span><strong>At least 2 points and 65% of the winner</strong><p>A strong runner-up is kept as a secondary purpose.</p></article>
            <article><span>Mixed purpose</span><strong>Runner-up ≥ 3 and ≥ 90% of the winner</strong><p>The two purposes are too close, so neither is forced to be the single winner.</p></article>
          </div>
          <div className="worked-example">
            <div className="worked-example-head"><span>Worked example</span><strong>A notebook that cleans data and creates one chart</strong></div>
            <div className="worked-example-grid">
              <div><b>Data preparation</b><p><code>pandas</code> +3</p><p>“data cleaning” +1.5</p><p>three cleaning calls +4.5</p><strong>Total: 9 points</strong></div>
              <div><b>Visualization</b><p><code>matplotlib</code> +3</p><p><code>plt.plot()</code> +1.5</p><p>one image output +1</p><strong>Total: 5.5 points</strong></div>
              <div className="worked-result"><b>Final rule result</b><strong>Data preparation</strong><p>Visualization is below 65% of the winner, so it is not kept as a secondary category.</p><code>confidence = (9 ÷ 14.5) × min(1, 9 ÷ 6) = 0.621</code></div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading">
          <div>
            <h2>Optional method — local language model</h2>
            <p>A second opinion that stays on the pipeline machine</p>
          </div>
        </div>
        <div className="classification-section-body">
          <ol className="llm-simple-list">
            <li><span>1</span><p><strong>Send a limited summary.</strong> The model receives imports, notebook metadata, up to 6,000 markdown characters, up to 8,000 code characters, and summaries of at most 100 outputs.</p></li>
            <li><span>2</span><p><strong>Choose from the same nine categories.</strong> It cannot invent a new label.</p></li>
            <li><span>3</span><p><strong>Return structured evidence.</strong> It must provide a main category, secondary categories, confidence, a reason, and observable evidence.</p></li>
            <li><span>4</span><p><strong>Stay deterministic and private.</strong> Temperature is zero, the model runs through local Ollama, and notebook text is treated as data—not as instructions.</p></li>
          </ol>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading">
          <div>
            <h2>When both methods run</h2>
            <p>A simple rule decides whether the result is accepted or reviewed</p>
          </div>
        </div>
        <ClassificationFlowDiagram />
        <div className="reconciliation-summary">
          <div className="accept"><Icon name="check" size={16} /><span><strong>Accept automatically</strong>Both choose the same category and both confidence values are at least 0.55.</span></div>
          <div className="review"><Icon name="alert" size={16} /><span><strong>Ask a person to review</strong>The categories differ, only partly agree, confidence is below 0.55, or the local model is unavailable.</span></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Technical status names</h2>
            <p>The labels saved in the database, translated into plain language</p>
          </div>
          <span className="count-badge">{AGREEMENT_STATUSES.length}</span>
        </div>
        <div className="table-wrap">
          <table className="mini-table">
            <thead><tr><th>Agreement status</th><th>What it means</th></tr></thead>
            <tbody>
              {AGREEMENT_STATUSES.map((s) => (
                <tr key={s.id}>
                  <td><span className={`status-pill ${s.pill}`}>{s.id}</span></td>
                  <td style={{ fontFamily: 'inherit' }}>{s.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const EVALUATION_METRICS = [
  {
    name: 'Accuracy',
    formula: 'correct predictions / all predictions',
    uses: 'The final human label and the category predicted by the classifier.',
    tells: 'The overall percentage of notebooks assigned to the correct category.',
  },
  {
    name: 'Precision',
    formula: 'true positives / all predicted positives',
    uses: 'One category at a time; for example, every notebook predicted as machine learning.',
    tells: 'When the system chooses a category, how often that choice is correct.',
  },
  {
    name: 'Recall',
    formula: 'true positives / all actual positives',
    uses: 'One category at a time; for example, every notebook humans labelled machine learning.',
    tells: 'How many notebooks belonging to a category the system successfully finds.',
  },
  {
    name: 'Macro F1',
    formula: 'mean of every category\'s F1 score',
    uses: 'F1 combines precision and recall, then gives every category equal weight.',
    tells: 'Whether the classifier performs consistently, even when some categories are less common.',
  },
  {
    name: 'Confusion matrix',
    formula: 'counts grouped by actual label × predicted label',
    uses: 'Human labels as rows and classifier predictions as columns.',
    tells: 'Exactly which categories are confused with one another. The diagonal is correct; other cells are errors.',
  },
  {
    name: 'Rule–LLM disagreement',
    formula: 'different rule/LLM labels / jointly classified notebooks',
    uses: 'Only notebooks for which both classification methods produced a result.',
    tells: 'How often the two automated methods need reconciliation or human review.',
  },
];

const EVALUATION_CATEGORIES = [
  { short: 'DP', label: 'Data preparation', precision: '69.0%', recall: '78.4%', f1: '73.4%', support: 51 },
  { short: 'DA', label: 'Data analysis', precision: '73.9%', recall: '66.7%', f1: '70.1%', support: 51 },
  { short: 'VIZ', label: 'Visualization', precision: '73.9%', recall: '73.9%', f1: '73.9%', support: 46 },
  { short: 'ML', label: 'Machine learning', precision: '76.9%', recall: '78.4%', f1: '77.7%', support: 51 },
  { short: 'SIM', label: 'Simulation', precision: '100.0%', recall: '73.9%', f1: '85.0%', support: 46 },
  { short: 'TUT', label: 'Tutorial', precision: '55.7%', recall: '66.7%', f1: '60.7%', support: 51 },
  { short: 'SD', label: 'Software development', precision: '75.6%', recall: '73.9%', f1: '74.7%', support: 46 },
];

const EXAMPLE_CLASSIFICATIONS = [
  { notebook: '00.getting_started.ipynb', repo: 'Deep-Learning-For-Hackers', rule: 'Tutorial', llm: 'Tutorial', human: 'Tutorial', agree: true },
  { notebook: 'Comparison of CBOW, SkipGram…', repo: 'nlp-in-practice', rule: 'Data analysis', llm: 'Machine learning', human: 'Machine learning', agree: false },
  { notebook: 'tutorial.ipynb', repo: 'xMIP', rule: 'Tutorial', llm: 'Tutorial', human: 'Tutorial', agree: true },
  { notebook: 'Chapter 1.ipynb', repo: 'Hands-On-Data-Preprocessing', rule: 'Data preparation', llm: 'Tutorial', human: 'Tutorial', agree: false },
  { notebook: 'tile_example.ipynb', repo: 'GEDTM30', rule: 'Machine learning', llm: 'Machine learning', human: 'Machine learning', agree: true },
  { notebook: 'co2_emissions_by_source.ipynb', repo: 'climate-notebooks', rule: 'Data analysis', llm: 'Visualization', human: 'Visualization', agree: false },
  { notebook: 'beam_steering.ipynb', repo: 'IQC-URA-Gaussian-beam-simulation', rule: 'Simulation', llm: 'Simulation', human: 'Simulation', agree: true },
  { notebook: 'minimal-pipeline.ipynb', repo: 'BoggleCV', rule: 'Software development', llm: 'Machine learning', human: 'Software development', agree: false },
];

const CONFUSION_MATRIX = [
  [40, 6, 0, 0, 0, 5, 0],
  [6, 34, 6, 0, 0, 5, 0],
  [0, 6, 34, 0, 0, 6, 0],
  [6, 0, 0, 40, 0, 5, 0],
  [0, 0, 0, 6, 34, 0, 6],
  [6, 0, 6, 0, 0, 34, 5],
  [0, 0, 0, 6, 0, 6, 34],
];

// Measured from the working pipeline database (data/output/db/db.sqlite) and, for
// Codeberg/Zenodo, from analysis/measure_platform_reproducibility.py (which
// diffs each repo's original notebook against its executed *_output.ipynb
// directly on disk, using the same cell-comparison logic as the pipeline's
// own analysis/nbprocess — needed because a missing PYTHONPATH export in
// run_full_sample.sh silently dropped every notebook_executions /
// notebook_reproducibility_metrics row for this run; fixed in
// pipeline/run_full_sample.sh). GitHub's numbers are the only ones with
// notebook-level metrics already in the database, and they come from the
// Feb 2026 baseline batch (main.sh) — a different, earlier run than
// Codeberg/Zenodo's Sept 2026 full-sample run, not the same controlled
// sample. "Acquired" = repository successfully cloned/downloaded. "Still
// pending" = acquired but deferred for a later, non-fast-first pass because
// it has many notebooks. "Executed & measured" = run_status SUCCESS.
const PLATFORM_EVALUATION = [
  {
    platform: 'GitHub', sample: 'Feb 2026 baseline batch',
    attempted: 116, acquired: '115 (99.1%)', executed: '89 (77.4%)', pending: '0 (0%)',
    avgScore: '24.3%', cellWeighted: '20.3%', scoreValue: 0.2433,
    time: '2 min', issue: 'Kernel not found (20 repos)',
  },
  {
    platform: 'Codeberg', sample: 'Sept 2026 full-sample run (in progress)',
    attempted: 65, acquired: '64 (98.5%)', executed: '40 (62.5%)', pending: '21 (32.3%)',
    avgScore: '37.1%', cellWeighted: '33.0%', scoreValue: 0.3709,
    time: '5 min', issue: 'Environment setup failed (2 repos)',
  },
  {
    platform: 'Zenodo', sample: 'Sept 2026 full-sample run (in progress)',
    attempted: 50, acquired: '39 (78.0%)', executed: '20 (51.3%)', pending: '11 (22.0%)',
    avgScore: '27.1%', cellWeighted: '22.2%', scoreValue: 0.2706,
    time: '4 min', issue: 'Zenodo download failed (7 records)',
  },
];

function PlatformReproducibilityChart() {
  return (
    <div className="repro-chart">
      <div className="repro-chart-head">
        <h3>How reproducible is each platform?</h3>
        <p>Average per-notebook reproducibility score across executed notebooks &middot; 0% = no cells matched, 100% = identical output</p>
      </div>
      <div className="repro-chart-rows">
        {PLATFORM_EVALUATION.map((platform) => {
          const pct = Math.max(0, Math.min(100, platform.scoreValue * 100));
          return (
            <div className="repro-chart-row" key={platform.platform}>
              <span className="repro-chart-label">{platform.platform}</span>
              <div className="repro-chart-track-wrap">
                <div className="repro-chart-track">
                  <span className="repro-chart-tick" style={{ left: '25%' }} />
                  <span className="repro-chart-tick" style={{ left: '50%' }} />
                  <span className="repro-chart-tick" style={{ left: '75%' }} />
                  <div className="repro-chart-bar" style={{ width: `${pct}%` }} />
                </div>
                <span className="repro-chart-value" style={{ left: `calc(${pct}% + 8px)` }}>{platform.avgScore}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="repro-chart-axis">
        <span className="repro-chart-axis-spacer" />
        <span className="repro-chart-axis-ticks"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></span>
      </div>
    </div>
  );
}

function EvaluationSection() {
  const [view, setView] = useState<'classification' | 'reproducibility'>('classification');

  return (
    <div className="evaluation-docs">
      <div className="evaluation-view-bar">
        <div className="evaluation-view-toggle" role="tablist" aria-label="Evaluation report section">
          <button type="button" role="tab" aria-selected={view === 'classification'} className={view === 'classification' ? 'active' : ''} onClick={() => setView('classification')}><Icon name="spark" size={15} />Classification</button>
          <button type="button" role="tab" aria-selected={view === 'reproducibility'} className={view === 'reproducibility' ? 'active' : ''} onClick={() => setView('reproducibility')}><Icon name="chart" size={15} />Reproducibility by platform</button>
        </div>
        {view === 'classification'
          ? <span className="evaluation-simulated-pill">ILLUSTRATIVE n=342</span>
          : <span className="evaluation-observed-pill">LIVE PIPELINE DATA</span>}
      </div>

      {view === 'classification' && <>
      <section className="panel evaluation-panel">
        <div className="panel-heading">
          <div><h2>Classification evaluation</h2><p>Compare automated predictions with independent human labels</p></div>
        </div>
        <div className="evaluation-question-grid single">
          <article><span>01 · Classification</span><h3>Did the system choose the correct category?</h3><p>Compare rule and LLM predictions with labels assigned manually by human reviewers.</p><strong>Unit measured: notebook</strong></article>
        </div>
      </section>

      <section className="panel evaluation-panel">
        <div className="panel-heading">
          <div><h2>What each classification metric calculates</h2><p>Use the same manually labelled notebooks for every classifier comparison</p></div>
        </div>
        <div className="evaluation-definition-grid">
          {EVALUATION_METRICS.map((metric) => (
            <article key={metric.name}>
              <div><h3>{metric.name}</h3><code>{metric.formula}</code></div>
              <dl><div><dt>Uses</dt><dd>{metric.uses}</dd></div><div><dt>Tells you</dt><dd>{metric.tells}</dd></div></dl>
            </article>
          ))}
        </div>
      </section>

      <section className="panel evaluation-panel">
        <div className="panel-heading">
          <div><h2>Illustrative classification result</h2><p>Example values for a simulated, manually labelled set of 342 notebooks</p></div>
        </div>
        <div className="evaluation-metric-strip">
          <article><span>Rule accuracy</span><strong>73.1%</strong><small>250 of 342 correct</small></article>
          <article><span>Rule macro F1</span><strong>73.6%</strong><small>Equal weight per category</small></article>
          <article><span>LLM accuracy</span><strong>80.1%</strong><small>Requires the LLM to be enabled</small></article>
          <article><span>Rule–LLM disagreement</span><strong>21.6%</strong><small>74 of 342 predictions differ</small></article>
        </div>
        <div className="evaluation-table-wrap">
          <table className="evaluation-table">
            <caption>Precision, recall, and F1 by category</caption>
            <thead><tr><th>Category</th><th>Precision</th><th>Recall</th><th>F1 score</th><th>Support</th></tr></thead>
            <tbody>{EVALUATION_CATEGORIES.map((category) => (
              <tr key={category.short}><td><b>{category.short}</b><span>{category.label}</span></td><td>{category.precision}</td><td>{category.recall}</td><td><strong>{category.f1}</strong></td><td>{category.support}</td></tr>
            ))}</tbody>
            <tfoot><tr><td>Macro average</td><td>75.0%</td><td>73.1%</td><td>73.6%</td><td>342</td></tr></tfoot>
          </table>
        </div>
        <div className="evaluation-table-wrap" style={{ marginTop: 18 }}>
          <table className="evaluation-table">
            <caption>Example notebooks: rule vs. LLM vs. human label</caption>
            <thead><tr><th>Notebook</th><th>Rule category</th><th>LLM category</th><th>Human category</th><th>Agreement</th></tr></thead>
            <tbody>{EXAMPLE_CLASSIFICATIONS.map((row) => (
              <tr key={row.notebook}>
                <td><b>{row.notebook}</b><span>{row.repo}</span></td>
                <td>{row.rule}</td>
                <td>{row.llm}</td>
                <td><strong>{row.human}</strong></td>
                <td>{row.agree ? <span className="evaluation-observed-pill" style={{ fontSize: 8 }}>ALL AGREE</span> : <span className="evaluation-simulated-pill" style={{ fontSize: 8 }}>REVIEWED</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="panel evaluation-panel">
        <div className="panel-heading">
          <div><h2>Confusion matrix</h2><p>Rows are human labels; columns are rule-based predictions</p></div>
        </div>
        <div className="confusion-layout">
          <div className="confusion-axis-y">Actual human label</div>
          <div className="evaluation-table-wrap confusion-wrap">
            <table className="confusion-table">
              <caption>Predicted category →</caption>
              <thead><tr><th aria-label="Actual category" />{EVALUATION_CATEGORIES.map((category) => <th key={category.short} title={category.label}>{category.short}</th>)}</tr></thead>
              <tbody>{CONFUSION_MATRIX.map((row, rowIndex) => (
                <tr key={EVALUATION_CATEGORIES[rowIndex].short}>
                  <th scope="row" title={EVALUATION_CATEGORIES[rowIndex].label}>{EVALUATION_CATEGORIES[rowIndex].short}</th>
                  {row.map((value, columnIndex) => <td className={rowIndex === columnIndex ? 'correct' : value > 0 ? 'mistake' : ''} key={`${rowIndex}-${columnIndex}`}>{value}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="confusion-legend"><span><i className="correct" />Diagonal = correct</span><span><i className="mistake" />Off-diagonal = confused category</span><p>Example: the first row shows 40 data-preparation notebooks classified correctly, 6 mistaken for data analysis, and 5 mistaken for a tutorial.</p></div>
        </div>
      </section>

      </>}

      {view === 'reproducibility' && <>
      <section className="panel evaluation-panel">
        <div className="panel-heading">
          <div><h2>What is being evaluated?</h2><p>Platform quality is measured at acquisition and execution level</p></div>
        </div>
        <div className="evaluation-question-grid single">
          <article><span>02 · Reproducibility</span><h3>Can the notebook be acquired and re-executed?</h3><p>Compare acquisition, successful execution, reproducibility score, running time, and failure reasons across GitHub, Codeberg, and Zenodo.</p><strong>Units reported: repository and notebook</strong></article>
        </div>
      </section>

      <section className="panel evaluation-panel">
        <div className="panel-heading">
          <div><h2>Reproducibility across platforms</h2><p>Measure acquisition separately from execution so download failures are not hidden inside notebook scores</p></div>
        </div>
        <p className="evaluation-sample-note">GitHub is measured from the Feb 2026 baseline batch; Codeberg and Zenodo are measured from the Sept 2026 full-sample run, which is still in progress &mdash; sample sizes are not yet balanced across platforms.</p>
        <div className="evaluation-table-wrap">
          <table className="evaluation-table platform-table">
            <caption>Current pipeline results, by platform and run</caption>
            <thead><tr><th>Platform</th><th>Attempted</th><th>Acquired</th><th>Executed &amp; measured</th><th>Still pending</th><th>Avg. score</th><th>Cell-weighted</th><th>Median time</th><th>Most common issue</th></tr></thead>
            <tbody>{PLATFORM_EVALUATION.map((platform) => (
              <tr key={platform.platform}><td><strong>{platform.platform}</strong></td><td>{platform.attempted}</td><td>{platform.acquired}</td><td>{platform.executed}</td><td>{platform.pending}</td><td><strong>{platform.avgScore}</strong></td><td>{platform.cellWeighted}</td><td>{platform.time}</td><td>{platform.issue}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <PlatformReproducibilityChart />
      </section>

      <section className="panel evaluation-panel">
        <div className="panel-heading"><div><h2>Reproducibility evaluation procedure</h2><p>How the three platforms are compared fairly</p></div></div>
        <ol className="evaluation-procedure">
          <li><span>1</span><div><strong>Freeze a balanced sample</strong><p>Select 20 unique repositories per platform using the same documented inclusion rules.</p></div></li>
          <li><span>2</span><div><strong>Acquire every repository</strong><p>Record whether cloning or downloading succeeds before notebook execution begins.</p></div></li>
          <li><span>3</span><div><strong>Run the same pipeline</strong><p>Use the same container limits, dependency strategy, timeout, and eight pipeline stages for every platform.</p></div></li>
          <li><span>4</span><div><strong>Record every outcome</strong><p>Keep clean runs, runs with cell errors, execution failures, output scores, duration, and failure reasons.</p></div></li>
          <li><span>5</span><div><strong>Aggregate per repository</strong><p>Use the median notebook score per repository so repositories with many notebooks do not dominate.</p></div></li>
          <li><span>6</span><div><strong>Compare the platforms</strong><p>Report acquisition rate, execution outcomes, median reproducibility score, median time, and common failure causes.</p></div></li>
        </ol>
      </section>
      </>}
    </div>
  );
}

function KnowledgeGraphSection() {
  return (
    <div className="coming-soon-wrap">
      <h1>Coming soon</h1>
    </div>
  );
}

function DocumentationPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get('tab');
  const tab: DocTab = isDocTab(requested) ? requested : 'pipeline';

  function setTab(next: DocTab) {
    router.replace(next === 'pipeline' ? '/documentation' : `/documentation?tab=${next}`);
  }

  return (
    <div className="app-shell" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <section className="workspace" style={{ gridColumn: 1 }}>
        <DocsHeader />
        <div className="content">
          <PageHeading
            eyebrow="Documentation"
            title={HEADINGS[tab].title}
            subtitle={HEADINGS[tab].subtitle}
          />

          <DocumentationTabs active={tab} onChange={setTab} />

          <div style={{ marginTop: 20 }}>
            {tab === 'pipeline' && <PipelineSection />}
            {tab === 'ai-classification' && <AiClassificationSection />}
            {tab === 'evaluation' && <EvaluationSection />}
            {tab === 'knowledge-graph' && <KnowledgeGraphSection />}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function DocumentationPage() {
  return (
    <Suspense fallback={null}>
      <DocumentationPageContent />
    </Suspense>
  );
}
