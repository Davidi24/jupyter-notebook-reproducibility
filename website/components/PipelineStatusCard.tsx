'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PipelineActionFailure, PipelineJobSnapshot, PipelineNotebookResult } from '@/lib/analysis-contract';
import { hydrateImportedRepositories } from '@/lib/store';
import { Icon, ScoreRing } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

const ACTIVE = new Set<PipelineJobSnapshot['status']>(['queued', 'preparing', 'building', 'running']);

const PIPELINE_PHASES = [
  { label: 'Acquire repository', detail: 'Validate the source and collect notebook files.' },
  { label: 'Classify notebooks', detail: 'Detect each notebook\'s research purpose.' },
  { label: 'Resolve dependencies', detail: 'Read requirements and discover imported packages.' },
  { label: 'Prepare environment', detail: 'Build an isolated Python environment.' },
  { label: 'Execute notebooks', detail: 'Run every notebook cell by cell.' },
  { label: 'Compare and save', detail: 'Compare outputs, calculate scores, and save results.' },
] as const;

type Activity = { label: string; detail: string; state: 'done' | 'active' | 'pending' };
type AnalysisFactor = { title: string; detail: string; tone: 'positive' | 'warning' | 'critical' };

function pipelinePhase(job: PipelineJobSnapshot) {
  const stage = job.stage.toLowerCase();
  if (stage.includes('classif')) return 1;
  if (stage.includes('resolving depend')) return 2;
  if (stage.includes('environment') || stage.includes('installing depend')) return 3;
  if (stage.includes('executing')) return 4;
  if (stage.includes('compar') || stage.includes('complete')) return 5;
  if (job.progress >= 91) return 5;
  if (job.progress >= 55) return 4;
  if (job.progress >= 40) return 3;
  if (job.progress >= 25) return 2;
  if (job.progress >= 15) return 1;
  return 0;
}

function cleanNotebookPath(path: string) {
  const normalized = path.trim().replaceAll('\\', '/');
  return normalized.split('/').filter(Boolean).at(-1) ?? normalized;
}

function findLast(lines: string[], pattern: RegExp) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = lines[index].match(pattern);
    if (match) return match;
  }
  return null;
}

function buildActivity(job: PipelineJobSnapshot, phase: number): Activity[] {
  const lines = job.log ?? [];
  const successfulTerminal = job.status === 'succeeded' || job.status === 'partial';
  const stateFor = (index: number): Activity['state'] => (
    successfulTerminal || index < phase ? 'done' : index === phase && ACTIVE.has(job.status) ? 'active' : 'pending'
  );
  const notebookSummary = findLast(lines, /\[REPO\] Notebooks: total=(\d+) python=(\d+)/);
  const total = job.notebookCount ?? Number(notebookSummary?.[2] ?? job.result?.notebooks.length ?? 0);
  const classified = lines.filter((line) => line.includes('[CLASSIFICATION] Result stored')).length;
  const dependencySummary = findLast(lines, /Final requirements\.txt created with\s+(\d+)\s+packages/i);
  const installed = lines.filter((line) => line.includes('[PYENV] ✓ ')).length;
  const lastInstalled = findLast(lines, /\[PYENV\] ✓\s+(.+)$/);
  const executions = lines.filter((line) => /^(SUCCESS|SUCCESS_WITH_ERRORS|EXEC_FAIL)\|/.test(line)).length;
  const runningNotebook = findLast(lines, /\[PYENV\] Executing notebook:\s*(.+)$/);
  const comparison = findLast(lines, /\[NOTEBOOK\] ID=.*?path=(.+)$/);
  const environment = findLast(lines, /\[PYENV\] Environment ready\. Python:\s*(.+)$/);
  const activities: Activity[] = [];

  if (phase >= 1 || notebookSummary) {
    activities.push({
      label: 'Repository acquired',
      detail: total > 0 ? `${total} notebook${total === 1 ? '' : 's'} ready for analysis.` : 'Source and notebook paths were validated.',
      state: stateFor(0),
    });
  }
  if (phase >= 2 || classified > 0) {
    activities.push({
      label: 'Classification complete',
      detail: classified > 0 ? `${classified} notebook${classified === 1 ? '' : 's'} classified so far.` : 'Research-purpose categories were saved.',
      state: stateFor(1),
    });
  }
  if (phase >= 3 || dependencySummary) {
    const count = Number(dependencySummary?.[1] ?? 0);
    activities.push({
      label: 'Dependencies discovered',
      detail: count > 0 ? `${count} required package${count === 1 ? '' : 's'} found.` : 'Repository requirements and notebook imports were inspected.',
      state: stateFor(2),
    });
  }
  if (phase >= 4 || environment || installed > 0) {
    const installDetail = lastInstalled?.[1]
      ? `${installed} package${installed === 1 ? '' : 's'} passed installation; latest: ${lastInstalled[1]}.`
      : environment?.[1]
        ? `Isolated environment ready with ${environment[1]}.`
        : 'The isolated Python environment is being prepared.';
    activities.push({ label: 'Environment prepared', detail: installDetail, state: stateFor(3) });
  }
  if (phase >= 5 || runningNotebook || executions > 0) {
    const next = Math.min(executions + 1, Math.max(total, 1));
    const executionDetail = runningNotebook?.[1] && ACTIVE.has(job.status)
      ? `Notebook ${next}${total > 0 ? ` of ${total}` : ''} is running: ${cleanNotebookPath(runningNotebook[1])}.`
      : `${executions}${total > 0 ? ` of ${total}` : ''} notebook${total === 1 ? '' : 's'} executed.`;
    activities.push({ label: 'Notebook execution', detail: executionDetail, state: stateFor(4) });
  }
  if (phase >= 5 || comparison || successfulTerminal) {
    const detail = successfulTerminal
      ? `Results and reproducibility scores saved for ${job.result?.notebooks.length ?? total} notebook${(job.result?.notebooks.length ?? total) === 1 ? '' : 's'}.`
      : comparison?.[1]
        ? `Comparing original and executed outputs for ${cleanNotebookPath(comparison[1])}.`
        : job.message;
    activities.push({ label: successfulTerminal ? 'Analysis saved' : 'Comparing outputs', detail, state: stateFor(5) });
  }
  if (activities.length === 0) {
    activities.push({ label: job.stage, detail: job.message, state: ACTIVE.has(job.status) ? 'active' : 'pending' });
  } else if (ACTIVE.has(job.status) && !activities.some((activity) => activity.state === 'active')) {
    activities.push({ label: job.stage, detail: job.message, state: 'active' });
  }
  return activities.slice(-6);
}

function metric(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function resultScore(notebooks: PipelineNotebookResult[]) {
  const totalCells = notebooks.reduce((sum, notebook) => sum + metric(notebook.totalCodeCells), 0);
  const identicalCells = notebooks.reduce((sum, notebook) => sum + metric(notebook.identicalCellsCount), 0);
  if (totalCells > 0) return Math.round((identicalCells / totalCells) * 100);
  const scores = notebooks.flatMap((notebook) => (
    typeof notebook.reproducibilityScore === 'number' ? [notebook.reproducibilityScore] : []
  ));
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function scoreTone(score: number | null) {
  if (score === null || score < 70) return 'critical';
  if (score < 90) return 'warning';
  return 'positive';
}

function scoreSummary(score: number | null, matched: number, total: number) {
  if (score === null) return 'The run finished, but no notebook produced a complete output comparison.';
  if (total > 0) {
    const unmatched = Math.max(0, total - matched);
    if (unmatched === 0) return `All ${total} compared code-cell outputs matched the originals.`;
    return `${matched} of ${total} code-cell outputs matched the originals. The remaining ${unmatched} changed or could not be reproduced.`;
  }
  if (score === 100) return 'Every output that could be compared matched the original notebook.';
  return `${score}% of the comparable notebook outputs matched the originals; ${100 - score}% differed or could not be confirmed.`;
}

function analysisFactors(job: PipelineJobSnapshot, notebooks: PipelineNotebookResult[], score: number | null) {
  const total = notebooks.reduce((sum, notebook) => sum + metric(notebook.totalCodeCells), 0);
  const matched = notebooks.reduce((sum, notebook) => sum + metric(notebook.identicalCellsCount), 0);
  const changed = notebooks.reduce((sum, notebook) => sum + metric(notebook.differentCellsCount), 0);
  const nondeterministic = notebooks.reduce((sum, notebook) => sum + metric(notebook.nondeterministicCellsCount), 0);
  const errors = notebooks.reduce((sum, notebook) => sum + metric(notebook.errorCount), 0);
  const firstError = notebooks.find((notebook) => notebook.errorMessage || notebook.errorType || notebook.errorCategory);
  const missingRequirements = (job.log ?? []).some((line) => (
    /no requirements found|requirements file .* not found|no requirements\.txt found/i.test(line)
  ));
  const factors: AnalysisFactor[] = [];

  if (total > 0) {
    const unmatched = Math.max(0, total - matched);
    factors.push(unmatched === 0
      ? { title: 'Every compared output matched', detail: `${matched} of ${total} code cells reproduced the stored outputs.`, tone: 'positive' }
      : { title: `${unmatched} output${unmatched === 1 ? '' : 's'} did not match`, detail: `${matched} of ${total} code cells reproduced the original result${matched === 1 ? '' : 's'}${changed > 0 ? `; ${changed} produced changed output` : ''}.`, tone: score !== null && score < 70 ? 'critical' : 'warning' });
  } else if (score !== null && score < 100) {
    factors.push({ title: 'Output differences reduced the score', detail: `${100 - score}% of comparable outputs changed or could not be verified against the originals.`, tone: score < 70 ? 'critical' : 'warning' });
  }

  if (nondeterministic > 0) {
    factors.push({ title: `${nondeterministic} potentially nondeterministic cell${nondeterministic === 1 ? '' : 's'}`, detail: 'These cells may depend on randomness, time, external data, or execution order. Pin inputs and set random seeds before rerunning.', tone: 'warning' });
  }
  if (errors > 0) {
    const errorName = firstError?.errorType ?? firstError?.errorCategory ?? 'Runtime error';
    factors.push({ title: `${errors} execution error${errors === 1 ? '' : 's'} detected`, detail: firstError?.errorMessage ? `${errorName}: ${firstError.errorMessage}` : `${errorName} prevented one or more cells from completing normally.`, tone: 'critical' });
  }
  if (missingRequirements) {
    factors.push({ title: 'No complete dependency file was available', detail: 'The runner inferred packages from notebook imports. Add a pinned requirements.txt or environment.yml to make the environment repeatable.', tone: 'warning' });
  }
  if (score === null && factors.length === 0) {
    factors.push({ title: 'No reproducibility score was produced', detail: 'Review the notebook execution details below, resolve the reported issue, and run the analysis again.', tone: 'critical' });
  }
  if (factors.length === 0) {
    factors.push({ title: 'No blocking reproducibility issues found', detail: 'The isolated execution completed and the compared outputs matched.', tone: 'positive' });
  }
  return factors.slice(0, 4);
}

function notebookResultDetail(notebook: PipelineNotebookResult) {
  const total = metric(notebook.totalCodeCells);
  const matched = metric(notebook.identicalCellsCount);
  const changed = metric(notebook.differentCellsCount);
  if (notebook.errorMessage) return notebook.errorMessage;
  if (total > 0) return `${matched}/${total} code-cell outputs matched${changed > 0 ? `; ${changed} changed` : ''}.`;
  if (notebook.reproducibilityScore !== null) return `${notebook.reproducibilityScore}% of comparable outputs matched.`;
  return 'No complete output comparison was available for this notebook.';
}

function formatCategory(value: string | null) {
  if (!value) return null;
  const words = value.toLowerCase().split(/[\s_-]+/).filter(Boolean);
  if (words.length === 0) return null;
  return words.map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join(' ');
}

function notebookCategoryLabel(notebook: PipelineNotebookResult) {
  return formatCategory(notebook.finalCategory) ?? formatCategory(notebook.ruleCategory) ?? 'Pending classification';
}

function PipelineResultAnalysis({
  job,
  submitting,
  onRunAgain,
}: {
  job: PipelineJobSnapshot;
  submitting: boolean;
  onRunAgain: () => void;
}) {
  const notebooks = job.result?.notebooks ?? [];
  const score = resultScore(notebooks);
  const total = notebooks.reduce((sum, notebook) => sum + metric(notebook.totalCodeCells), 0);
  const matched = notebooks.reduce((sum, notebook) => sum + metric(notebook.identicalCellsCount), 0);
  const changed = notebooks.reduce((sum, notebook) => sum + metric(notebook.differentCellsCount), 0);
  const errors = notebooks.reduce((sum, notebook) => sum + metric(notebook.errorCount), 0);
  const factors = analysisFactors(job, notebooks, score);
  const tone = scoreTone(score);

  return (
    <div className="pipeline-results" aria-labelledby="reproducibility-result-title">
      <div className={`pipeline-result-hero ${tone}`}>
        <ScoreRing score={score} size={76} />
        <div>
          <span className="pipeline-result-kicker"><Icon name="check" size={11} /> Analysis complete</span>
          <h3 id="reproducibility-result-title">{score === null ? 'Score unavailable' : `${score}% reproducible`}</h3>
          <p>{scoreSummary(score, matched, total)}</p>
        </div>
      </div>

      <div className="pipeline-result-grid">
        <section className="pipeline-explanation">
          <div className="pipeline-section-title"><div><strong>Why this score?</strong><span>Evidence from the isolated run</span></div><Icon name="fileSearch" size={16} /></div>
          <ol>
            {factors.map((factor) => (
              <li className={factor.tone} key={`${factor.title}-${factor.detail}`}>
                <span>{factor.tone === 'positive' ? <Icon name="check" size={10} /> : <Icon name="alert" size={10} />}</span>
                <div><strong>{factor.title}</strong><p>{factor.detail}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section className="pipeline-breakdown" aria-label="Reproducibility score breakdown">
          <div className="pipeline-section-title"><div><strong>Run breakdown</strong><span>What the pipeline measured</span></div><Icon name="chart" size={16} /></div>
          <dl>
            <div><dt>Notebooks analyzed</dt><dd>{notebooks.length}</dd></div>
            <div><dt>Code cells compared</dt><dd>{total || '—'}</dd></div>
            <div><dt>Matching outputs</dt><dd>{total ? matched : '—'}</dd></div>
            <div><dt>Changed outputs</dt><dd>{total ? Math.max(changed, total - matched) : '—'}</dd></div>
            <div><dt>Runtime errors</dt><dd className={errors > 0 ? 'has-errors' : ''}>{errors}</dd></div>
            <div><dt>Run status</dt><dd>{job.status === 'partial' ? 'Completed with issues' : 'Completed'}</dd></div>
          </dl>
        </section>
      </div>

      {notebooks.length > 0 && (
        <section className="pipeline-notebook-results">
          <div className="pipeline-section-title"><div><strong>Notebook results</strong><span>Open a notebook below for its saved record</span></div></div>
          <div>
            {notebooks.map((notebook) => {
              const notebookScore = notebook.reproducibilityScore;
              return (
                <article key={notebook.path}>
                  <ScoreRing score={notebookScore} size={38} />
                  <div>
                    <strong>{cleanNotebookPath(notebook.path)}</strong>
                    <p>{notebookResultDetail(notebook)}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                      <span className="category"><Icon name="spark" size={11} />{notebookCategoryLabel(notebook)}</span>
                      {notebook.needsHumanReview && <span className="status-pill partial"><Icon name="alert" size={10} />Needs review</span>}
                    </div>
                  </div>
                  <span className={`notebook-result-status ${scoreTone(notebookScore)}`}>{notebookScore === null ? 'No score' : notebookScore >= 90 ? 'Strong' : notebookScore >= 70 ? 'Review' : 'Needs attention'}</span>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className="pipeline-actions pipeline-result-actions">
        <small>Fix the issues above, then rerun to measure the improvement.</small>
        <Button onClick={onRunAgain} disabled={submitting}>Run analysis again <Icon name="arrow" size={13} /></Button>
      </div>
    </div>
  );
}

function isFailure(value: unknown): value is PipelineActionFailure {
  if (!value || typeof value !== 'object' || !('error' in value)) return false;
  const err = (value as { error: unknown }).error;
  return Boolean(err) && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string';
}

function fallback(repositoryId: string, message: string): PipelineJobSnapshot {
  return {
    id: null,
    repositoryId,
    status: 'unavailable',
    stage: 'Runner unavailable',
    progress: 0,
    message,
    error: message,
    createdAt: null,
    updatedAt: null,
    startedAt: null,
    finishedAt: null,
  };
}

export default function PipelineStatusCard({ repositoryId }: { repositoryId: string }) {
  const [job, setJob] = useState<PipelineJobSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const hydratedTerminalJob = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/repositories/${repositoryId}/analysis`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as PipelineJobSnapshot | PipelineActionFailure | null;
      if (!payload) throw new Error('The pipeline returned an unreadable response.');
      if (isFailure(payload)) throw new Error(payload.error.message);
      setJob(payload);
      if (!ACTIVE.has(payload.status) && payload.id && hydratedTerminalJob.current !== payload.id) {
        hydratedTerminalJob.current = payload.id;
        await hydrateImportedRepositories(true);
      }
    } catch (error) {
      setJob(fallback(repositoryId, error instanceof Error ? error.message : 'Pipeline status is unavailable.'));
    } finally {
      setLoading(false);
    }
  }, [repositoryId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!job || !ACTIVE.has(job.status)) return;
    const timer = window.setInterval(() => { void load(); }, 3000);
    return () => window.clearInterval(timer);
  }, [job, load]);

  async function start() {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/repositories/${repositoryId}/analysis`, { method: 'POST' });
      const payload = await response.json().catch(() => null) as PipelineJobSnapshot | PipelineActionFailure | null;
      if (!payload) throw new Error('The pipeline returned an unreadable response.');
      if (isFailure(payload)) throw new Error(payload.error.message);
      setJob(payload);
    } catch (error) {
      setJob(fallback(repositoryId, error instanceof Error ? error.message : 'The pipeline could not be started.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel() {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/repositories/${repositoryId}/analysis`, { method: 'DELETE' });
      const payload = await response.json().catch(() => null) as PipelineJobSnapshot | PipelineActionFailure | null;
      if (!payload) throw new Error('The pipeline returned an unreadable response.');
      if (isFailure(payload)) throw new Error(payload.error.message);
      setJob(payload);
      await hydrateImportedRepositories(true);
    } catch (error) {
      setJob((current) => current ? { ...current, error: error instanceof Error ? error.message : 'Cancellation failed.' } : current);
    } finally {
      setSubmitting(false);
    }
  }

  const active = job ? ACTIVE.has(job.status) : false;
  const terminal = job?.status === 'succeeded' || job?.status === 'partial' || job?.status === 'failed' || job?.status === 'cancelled';
  const showAnalysis = Boolean(job?.result && (job.status === 'succeeded' || job.status === 'partial'));
  const phase = job ? pipelinePhase(job) : 0;
  const activities = useMemo(() => job ? buildActivity(job, phase) : [], [job, phase]);

  return (
    <section className={`detail-panel pipeline-card ${job?.status ?? 'loading'} ${active ? 'is-active' : ''} ${showAnalysis ? 'has-results' : ''}`} aria-live="polite">
      <div className="pipeline-card-head">
        <div>
          <span className={`pipeline-icon ${showAnalysis ? 'complete' : ''}`}><Icon name={showAnalysis ? 'check' : 'terminal'} size={15} /></span>
          <div><h2>{showAnalysis ? 'Reproducibility analysis' : 'Reproducibility pipeline'}</h2><p>{showAnalysis ? 'Results from the completed isolated execution' : 'Real isolated notebook execution and classification'}</p></div>
        </div>
        {job && <span className={`status-pill ${job.status}`}>{job.status === 'succeeded' ? 'Completed' : job.status === 'partial' ? 'Completed with issues' : active ? 'Running' : job.status}</span>}
      </div>

      {loading && <p className="pipeline-message">Loading pipeline status…</p>}
      {!loading && job && (
        showAnalysis ? <PipelineResultAnalysis job={job} submitting={submitting} onRunAgain={start} /> : <>
          <div className="pipeline-stage-row"><strong>{job.stage}</strong><b>{job.progress}%</b></div>
          <Progress value={job.progress} aria-label={`Pipeline ${job.progress}% complete`} className="pipeline-progress" />
          <p className="pipeline-message">{job.message}</p>

          <div className="pipeline-phase-heading">
            <strong>Six-phase analysis</strong>
            <span>{active ? `Phase ${phase + 1} of ${PIPELINE_PHASES.length}` : terminal ? 'Run complete' : 'Ready to start'}</span>
          </div>
          <ol className="pipeline-phase-list">
            {PIPELINE_PHASES.map((item, index) => {
              const successful = job.status === 'succeeded' || job.status === 'partial';
              const state = successful || index < phase ? 'done' : active && index === phase ? 'active' : 'pending';
              return (
                <li key={item.label} className={state} aria-current={state === 'active' ? 'step' : undefined}>
                  <span className="pipeline-phase-number">
                    {state === 'done' ? <Icon name="check" size={10} /> : state === 'active' ? <span className="spinner" /> : index + 1}
                  </span>
                  <span><strong>{index + 1}. {item.label}</strong><small>{item.detail}</small></span>
                </li>
              );
            })}
          </ol>

          <div className="pipeline-activity">
            <div className="pipeline-activity-head"><strong>Live activity</strong><span>{active ? 'Updating automatically' : 'Latest run'}</span></div>
            <ol>
              {activities.map((activity, index) => (
                <li className={activity.state} key={`${activity.label}-${index}`}>
                  <span className="pipeline-activity-icon">
                    {activity.state === 'done' ? <Icon name="check" size={9} /> : activity.state === 'active' ? <span className="spinner" /> : <span />}
                  </span>
                  <span><strong>{activity.label}</strong><small>{activity.detail}</small></span>
                </li>
              ))}
            </ol>
          </div>
          {job.error && <p className="pipeline-error"><Icon name="alert" size={12} />{job.error}</p>}
          <div className="pipeline-actions">
            {active
              ? <Button variant="outline" onClick={cancel} disabled={submitting}>Cancel run</Button>
              : <Button onClick={start} disabled={submitting}>{terminal ? 'Run again' : 'Start analysis'} <Icon name="arrow" size={13} /></Button>}
            {active && <small>This can take several minutes or longer, depending on dependencies and notebook count.</small>}
          </div>
        </>
      )}
    </section>
  );
}
