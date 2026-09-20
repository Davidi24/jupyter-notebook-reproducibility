'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell, { Icon, PageHeading, ScoreRing } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ACTIVE, PIPELINE_PHASES, buildActivity, pipelinePhase } from '@/components/PipelineStatusCard';
import { scoreLabel } from '@/lib/mock-data';
import type { PipelineJobSnapshot } from '@/lib/analysis-contract';
import type { DirectRerunJob, PipelineRepositoryRow } from '@/lib/server/pipeline-runner';

type LoadState = 'loading' | 'ready' | 'error';

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

// Adapts a DirectRerunJob (this page's real WSL-backed rerun) into the same
// shape PipelineStatusCard's phase/activity logic expects, so the exact same
// live-progress rendering used for "Import repository" applies here too.
function asSnapshot(job: DirectRerunJob): PipelineJobSnapshot {
  return {
    id: job.id,
    repositoryId: job.repositoryId,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    notebookCount: job.notebookPath.split(';').filter(Boolean).length,
    message: job.message,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.createdAt,
    finishedAt: job.status === 'running' ? null : job.updatedAt,
    result: job.result,
    log: job.log,
  };
}

const PAGE_SIZE = 20;

function pageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, 2, total - 1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - (sorted[i - 1] as number) > 1) result.push('…');
    result.push(p);
  });
  return result;
}

function formatDate(value: string | null) {
  if (!value) return 'Not run yet';
  const date = new Date(value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function repoStatus(lastRunStatus: string | null): 'Imported' | 'Running' | 'Completed' | 'Failed' {
  if (!lastRunStatus) return 'Imported';
  if (lastRunStatus === 'RUNNING') return 'Running';
  return lastRunStatus === 'SUCCESS' ? 'Completed' : 'Failed';
}

function prettyCategory(value: string | null) {
  if (!value) return 'Uncertain';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function executionLabel(value: string | null): 'Success' | 'Partial' | 'Failed' | 'Not run' {
  if (!value) return 'Not run';
  if (value === 'SUCCESS') return 'Success';
  if (value === 'SUCCESS_WITH_ERRORS') return 'Partial';
  return 'Failed';
}

// Metadata completeness has no stored field in the pipeline DB — this is a
// real, derived measure (fraction of these fields that are actually filled
// in), not a fabricated number.
function metadataCompleteness(repo: PipelineRepositoryRow) {
  const fields = [repo.description, repo.authors.length > 0, repo.license, repo.doi, repo.keywords.length > 0];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}

// Same live progress rendering the "Import repository" flow uses
// (PipelineStatusCard), reused here for the real repository rerun — a
// six-phase list plus a scrolling "live activity" feed of what the pipeline
// is doing right now.
function RepoRunProgress({ job, onDismiss }: { job: DirectRerunJob; onDismiss: () => void }) {
  const snapshot = asSnapshot(job);
  const active = ACTIVE.has(snapshot.status);
  const terminal = !active;
  const phase = pipelinePhase(snapshot);
  const activities = useMemo(() => buildActivity(snapshot, phase), [snapshot, phase]);

  return (
    <div className="repo-run-progress">
      <div className="pipeline-stage-row"><strong>{snapshot.stage}</strong><b>{snapshot.progress}%</b></div>
      <Progress value={snapshot.progress} aria-label={`Rerun ${snapshot.progress}% complete`} className="pipeline-progress" />
      <p className="pipeline-message">{snapshot.message}</p>

      <div className="pipeline-phase-heading">
        <strong>Six-phase run</strong>
        <span>{active ? `Phase ${phase + 1} of ${PIPELINE_PHASES.length}` : 'Run complete'}</span>
      </div>
      <ol className="pipeline-phase-list">
        {PIPELINE_PHASES.map((item, index) => {
          const successful = snapshot.status === 'succeeded' || snapshot.status === 'partial';
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
        <div className="pipeline-activity-head"><strong>Live activity</strong><span>{active ? 'Updating automatically' : 'Finished'}</span></div>
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

      {snapshot.error && <p className="pipeline-error"><Icon name="alert" size={12} />{snapshot.error}</p>}
      {terminal && (
        <div className="pipeline-actions">
          <Button variant="outline" size="sm" type="button" onClick={onDismiss}>Dismiss</Button>
        </div>
      )}
    </div>
  );
}

export default function RepositoriesPage() {
  const [repositories, setRepositories] = useState<PipelineRepositoryRow[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [rerunJobs, setRerunJobs] = useState<Record<string, DirectRerunJob>>({});
  const [page, setPage] = useState(1);
  const [runFilter, setRunFilter] = useState<'All' | 'Run' | 'In progress' | 'Not run'>('All');
  const rerunGeneration = useRef<Record<string, number>>({});
  const [uploadStates, setUploadStates] = useState<Record<string, 'uploading' | 'error'>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});

  async function load() {
    setLoadState('loading');
    setLoadError(null);
    try {
      const response = await fetch('/api/pipeline-repositories', { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as { repositories?: PipelineRepositoryRow[]; error?: { message: string } } | null;
      if (!response.ok || !payload || payload.error) {
        throw new Error(payload?.error?.message ?? 'The pipeline database could not be loaded.');
      }
      setRepositories(payload.repositories ?? []);
      setPage(1);
      setLoadState('ready');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'The pipeline database could not be loaded.');
      setLoadState('error');
    }
  }

  useEffect(() => { void load(); }, []);

  async function uploadNotebookFile(repositoryId: string, file: File) {
    if (!file.name.toLowerCase().endsWith('.ipynb')) {
      setUploadStates((current) => ({ ...current, [repositoryId]: 'error' }));
      setUploadErrors((current) => ({ ...current, [repositoryId]: 'Choose a .ipynb file.' }));
      return;
    }
    setUploadStates((current) => ({ ...current, [repositoryId]: 'uploading' }));
    setUploadErrors((current) => { const next = { ...current }; delete next[repositoryId]; return next; });
    try {
      const content = await file.text();
      const response = await fetch('/api/pipeline-notebooks/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryId, filename: file.name, content }),
      });
      const payload = await response.json().catch(() => null) as { error?: { message: string } } | null;
      if (!response.ok || !payload || payload.error) {
        throw new Error(payload?.error?.message ?? 'The notebook could not be uploaded.');
      }
      setUploadStates((current) => { const next = { ...current }; delete next[repositoryId]; return next; });
      await load();
    } catch (error) {
      setUploadStates((current) => ({ ...current, [repositoryId]: 'error' }));
      setUploadErrors((current) => ({ ...current, [repositoryId]: error instanceof Error ? error.message : 'The notebook could not be uploaded.' }));
    }
  }

  const filteredRepositories = useMemo(() => {
    if (runFilter === 'All') return repositories;
    if (runFilter === 'In progress') return repositories.filter((repo) => repo.lastRunStatus === 'RUNNING');
    if (runFilter === 'Not run') return repositories.filter((repo) => repo.lastRunStatus === null);
    return repositories.filter((repo) => repo.lastRunStatus !== null && repo.lastRunStatus !== 'RUNNING');
  }, [repositories, runFilter]);

  useEffect(() => { setPage(1); }, [runFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRepositories.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRepositories = filteredRepositories.slice(pageStart, pageStart + PAGE_SIZE);
  const inProgressCount = useMemo(() => repositories.filter((r) => r.lastRunStatus === 'RUNNING').length, [repositories]);
  const runCount = useMemo(() => repositories.filter((r) => r.lastRunStatus !== null && r.lastRunStatus !== 'RUNNING').length, [repositories]);
  const notRunCount = repositories.length - runCount - inProgressCount;

  function toggleExpanded(repositoryId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(repositoryId)) next.delete(repositoryId);
      else next.add(repositoryId);
      return next;
    });
  }

  async function rerunRepository(repositoryId: string) {
    const generation = (rerunGeneration.current[repositoryId] ?? 0) + 1;
    rerunGeneration.current[repositoryId] = generation;
    const isCurrent = () => rerunGeneration.current[repositoryId] === generation;

    try {
      const startResponse = await fetch('/api/pipeline-rerun-repository', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryId }),
      });
      const startPayload = await startResponse.json().catch(() => null) as DirectRerunJob & { error?: { message: string } } | null;
      if (!startResponse.ok || !startPayload || startPayload.error || !startPayload.id) {
        throw new Error(startPayload?.error?.message ?? 'The rerun could not be started.');
      }
      if (!isCurrent()) return;
      setRerunJobs((current) => ({ ...current, [repositoryId]: startPayload }));

      let job = startPayload;
      while (job.status === 'running') {
        await wait(2000);
        if (!isCurrent()) return;
        const pollResponse = await fetch(`/api/pipeline-rerun/${job.id}`, { cache: 'no-store' });
        const pollPayload = await pollResponse.json().catch(() => null) as DirectRerunJob & { error?: { message: string } } | null;
        if (!pollResponse.ok || !pollPayload || pollPayload.error) {
          throw new Error(pollPayload?.error?.message ?? 'The rerun status could not be read.');
        }
        job = pollPayload;
        if (!isCurrent()) return;
        setRerunJobs((current) => ({ ...current, [repositoryId]: job }));
      }
      await load();
    } catch (error) {
      if (!isCurrent()) return;
      setRerunJobs((current) => ({
        ...current,
        [repositoryId]: {
          id: '', repositoryId, notebookId: null as unknown as string, notebookPath: '',
          status: 'failed', stage: 'Failed', progress: 0,
          message: error instanceof Error ? error.message : 'The rerun could not be completed.',
          error: error instanceof Error ? error.message : 'The rerun could not be completed.',
          log: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), result: null,
        },
      }));
    }
  }

  function dismissRerun(repositoryId: string) {
    rerunGeneration.current[repositoryId] = (rerunGeneration.current[repositoryId] ?? 0) + 1;
    setRerunJobs((current) => { const next = { ...current }; delete next[repositoryId]; return next; });
  }

  return (
    <AppShell active="Repositories">
      <PageHeading
        eyebrow="Workspace"
        title="Repositories"
        subtitle="Real repositories from your pipeline database (data/output/db/db.sqlite) — GitHub, Codeberg, and Zenodo sources the pipeline has actually acquired and executed."
        status={loadState === 'ready' ? `${repositories.length} repositories` : loadState === 'loading' ? 'Loading…' : 'Unavailable'}
      />

      {loadState === 'error' && (
        <div className="sync-error-banner" role="alert">
          <span><Icon name="alert" size={15} /></span>
          <div>
            <strong>Could not load the pipeline database</strong>
            <p>{loadError} Make sure the local pipeline runner is running (started automatically by <code>npm run dev</code>).</p>
          </div>
          <button type="button" onClick={() => { void load(); }}>Retry</button>
        </div>
      )}

      {loadState === 'ready' && repositories.length > 0 && (
        <div className="toolbar">
          <div className="filter-row">
            <button type="button" className={`filter-chip ${runFilter === 'All' ? 'active' : ''}`} onClick={() => setRunFilter('All')}>
              All<b>{repositories.length}</b>
            </button>
            <button type="button" className={`filter-chip ${runFilter === 'Run' ? 'active' : ''}`} onClick={() => setRunFilter('Run')}>
              Run<b>{runCount}</b>
            </button>
            <button type="button" className={`filter-chip ${runFilter === 'In progress' ? 'active' : ''}`} onClick={() => setRunFilter('In progress')}>
              In progress<b>{inProgressCount}</b>
            </button>
            <button type="button" className={`filter-chip ${runFilter === 'Not run' ? 'active' : ''}`} onClick={() => setRunFilter('Not run')}>
              Not run<b>{notRunCount}</b>
            </button>
          </div>
        </div>
      )}

      <div className="repo-grid">
        {pageRepositories.map((repo) => {
          const status = repoStatus(repo.lastRunStatus);
          const isExpanded = expandedIds.has(repo.id);
          const rerunJob = rerunJobs[repo.id];
          const rerunActive = rerunJob ? ACTIVE.has(rerunJob.status) : false;
          const externallyRunning = repo.lastRunStatus === 'RUNNING' && !rerunJob;
          const completeness = metadataCompleteness(repo);

          return (
            <div className={`repo-card${isExpanded ? ' expanded' : ''}`} key={repo.id}>
              <div className="repo-card-head">
                <a href={repo.url} target="_blank" rel="noreferrer" className="repo-card-title-link">
                  <h3>{repo.title || repo.name}</h3>
                  <p>{repo.url.replace(/^https?:\/\//, '')}</p>
                </a>
                <span className="platform-badge"><Icon name="branch" size={11} />{repo.platform}</span>
              </div>
              {repo.description && <p className="repo-card-desc">{repo.description}</p>}
              <div>
                <div className="meta-bar-row"><span>Metadata completeness</span><span>{completeness}%</span></div>
                <div className="meta-bar"><i style={{ width: `${completeness}%` }} /></div>
              </div>
              <div className="repo-card-foot">
                <span className={`status-pill ${status.toLowerCase()}`}>{status}</span>
                <span>
                  {repo.notebookCount} notebook{repo.notebookCount === 1 ? '' : 's'}
                  {' - '}
                  {repo.averageScorePercent === null ? 'analysis pending' : `avg ${repo.averageScorePercent}%`}
                </span>
                <span>{formatDate(repo.lastRunFinishedAt ?? repo.lastRunStartedAt)}</span>
                <div className="repo-card-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    className="repo-action-rerun"
                    disabled={rerunActive || externallyRunning}
                    title={externallyRunning ? 'Already running elsewhere (e.g. a batch run) — wait for it to finish.' : undefined}
                    aria-label={`${repo.lastRunStatus === null ? 'Run' : 'Rerun'} all notebooks in ${repo.name}`}
                    onClick={() => void rerunRepository(repo.id)}
                  >
                    {rerunActive || externallyRunning ? <span className="spinner" /> : <Icon name={repo.lastRunStatus === null ? 'play' : 'rerun'} size={12} />}
                    {rerunActive ? `${rerunJob.progress}%` : externallyRunning ? 'Running…' : (repo.lastRunStatus === null ? 'Run' : 'Rerun')}
                  </Button>
                  {repo.notebookCount > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      className="repo-action-expand"
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? `Collapse notebooks in ${repo.name}` : `Show notebooks in ${repo.name}`}
                      onClick={() => toggleExpanded(repo.id)}
                    >
                      <span className="repo-expand-icon"><Icon name="chevron" size={12} /></span>
                      {isExpanded ? 'Hide notebooks' : 'Notebooks'}
                    </Button>
                  )}
                  <label
                    className="repo-action-neutral repo-upload-icon-button"
                    aria-disabled={uploadStates[repo.id] === 'uploading'}
                    aria-label={`Import a notebook from your computer into ${repo.name}`}
                    title="Import a notebook from your computer"
                  >
                    {uploadStates[repo.id] === 'uploading' ? <span className="spinner" /> : <Icon name="plus" size={12} />}
                    <input
                      type="file"
                      accept=".ipynb"
                      disabled={uploadStates[repo.id] === 'uploading'}
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void uploadNotebookFile(repo.id, file);
                      }}
                    />
                  </label>
                </div>
                {uploadStates[repo.id] === 'error' && (
                  <div style={{ width: '100%' }}><small className="notebook-rerun-error">{uploadErrors[repo.id]}</small></div>
                )}
              </div>

              {rerunJob && <RepoRunProgress job={rerunJob} onDismiss={() => dismissRerun(repo.id)} />}

              {isExpanded && repo.notebookCount > 0 && (
                <div className="table-wrap repo-card-notebooks">
                  <table>
                    <thead><tr><th>Notebook</th><th>Classification</th><th>Score</th><th>Execution</th><th>Updated</th></tr></thead>
                    <tbody>
                      {repo.notebooks.map((item) => {
                        const category = item.finalCategory ?? item.ruleCategory ?? item.llmCategory;
                        const score = item.reproducibilityScore === null ? null : Math.round(item.reproducibilityScore * 100);
                        const execution = executionLabel(item.executionStatus);
                        return (
                          <tr key={item.id}>
                            <td><span className="notebook-cell"><i className="file-icon">&#9638;</i><span><strong>{item.name}</strong><small>{item.language}</small></span></span></td>
                            <td>
                              <span className="category"><Icon name="spark" size={13} />{prettyCategory(category)}</span>
                              {item.needsHumanReview && <div style={{ marginTop: 4 }}><span className="status-pill partial"><Icon name="alert" size={10} />Needs review</span></div>}
                            </td>
                            <td><span className="score-cell"><ScoreRing score={score} /><small>{scoreLabel(score)}</small></span></td>
                            <td><span className={`status-pill ${execution.toLowerCase().replace(/\s+/g, '-')}`}>{execution}</span></td>
                            <td className="muted">{formatDate(repo.lastRunFinishedAt ?? repo.lastRunStartedAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {repo.notebooks.length === 0 && <p style={{ padding: 16, color: 'var(--fg-subtle)', fontSize: 10 }}>No notebooks in this repository yet.</p>}
                </div>
              )}
            </div>
          );
        })}
        {loadState === 'ready' && repositories.length === 0 && (
          <p style={{ padding: 24, color: 'var(--fg-subtle)', fontSize: 10 }}>
            No repositories in the pipeline database yet. Run <code>bash run.sh</code> to process one.
          </p>
        )}
        {loadState === 'ready' && repositories.length > 0 && filteredRepositories.length === 0 && (
          <p style={{ padding: 24, color: 'var(--fg-subtle)', fontSize: 10 }}>
            No repositories match this filter.
          </p>
        )}
      </div>

      {loadState === 'ready' && filteredRepositories.length > 0 && (
        <nav className="pagination" aria-label="Repositories pages">
          <span className="pagination-summary">
            Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filteredRepositories.length)} of {filteredRepositories.length}
          </span>
          <div className="pagination-controls">
            <Button variant="outline" size="sm" type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
              <span className="pagination-arrow-prev"><Icon name="arrow" size={12} /></span> Prev
            </Button>
            {pageNumbers(currentPage, totalPages).map((p, i) => p === '…'
              ? <span key={`ellipsis-${i}`} className="pagination-ellipsis">…</span>
              : (
                <Button
                  key={p}
                  variant="outline"
                  size="sm"
                  type="button"
                  className={p === currentPage ? 'pagination-page active' : 'pagination-page'}
                  aria-current={p === currentPage ? 'page' : undefined}
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              ))}
            <Button variant="outline" size="sm" type="button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>
              Next <Icon name="arrow" size={12} />
            </Button>
          </div>
        </nav>
      )}
    </AppShell>
  );
}
