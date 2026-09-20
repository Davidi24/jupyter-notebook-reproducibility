'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell, { Icon, PageHeading, ScoreRing } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { scoreLabel } from '@/lib/mock-data';
import type { PipelineRepositoryRow } from '@/lib/server/pipeline-runner';

type LoadState = 'loading' | 'ready' | 'error';
type NotebookRunState = { status: 'starting' | 'running' | 'done' | 'error'; message?: string };

interface FlatNotebook {
  id: string;
  repositoryId: string;
  repositoryName: string;
  repositoryPlatform: string;
  repositoryUrl: string;
  title: string;
  language: string;
  finalCategory: string | null;
  ruleCategory: string | null;
  llmCategory: string | null;
  needsHumanReview: boolean;
  executionStatus: string | null;
  reproducibilityScore: number | null;
  updated: string | null;
}

function formatDate(value: string | null) {
  if (!value) return 'Not run yet';
  const date = new Date(value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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

function flatten(repositories: PipelineRepositoryRow[]): FlatNotebook[] {
  return repositories.flatMap((repo) => repo.notebooks.map((nb) => ({
    id: nb.id,
    repositoryId: repo.id,
    repositoryName: repo.name,
    repositoryPlatform: repo.platform,
    repositoryUrl: repo.url,
    title: nb.name,
    language: nb.language,
    finalCategory: nb.finalCategory,
    ruleCategory: nb.ruleCategory,
    llmCategory: nb.llmCategory,
    needsHumanReview: nb.needsHumanReview,
    executionStatus: nb.executionStatus,
    reproducibilityScore: nb.reproducibilityScore,
    updated: repo.lastRunFinishedAt ?? repo.lastRunStartedAt,
  })));
}

const platforms = ['All', 'github', 'codeberg', 'zenodo'] as const;
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

export default function NotebooksPage() {
  const [repositories, setRepositories] = useState<PipelineRepositoryRow[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<(typeof platforms)[number]>('All');
  const [category, setCategory] = useState<string>('All');
  const [status, setStatus] = useState<'All' | 'Success' | 'Partial' | 'Failed' | 'Not run'>('All');
  const [page, setPage] = useState(1);
  const [runStates, setRunStates] = useState<Record<string, NotebookRunState>>({});
  const [classifyStates, setClassifyStates] = useState<Record<string, 'running' | 'error'>>({});

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
      setLoadState('ready');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'The pipeline database could not be loaded.');
      setLoadState('error');
    }
  }

  useEffect(() => { void load(); }, []);

  const notebooks = useMemo(() => flatten(repositories), [repositories]);

  function updateRunState(notebookId: string, next: NotebookRunState) {
    setRunStates((current) => ({ ...current, [notebookId]: next }));
  }

  function wait(milliseconds: number) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  async function rerunNotebook(notebookId: string, repositoryId: string) {
    updateRunState(notebookId, { status: 'starting' });
    try {
      const startResponse = await fetch('/api/pipeline-rerun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryId, notebookId }),
      });
      const startPayload = await startResponse.json().catch(() => null) as { id?: string; error?: { message: string } } | null;
      if (!startResponse.ok || !startPayload || startPayload.error || !startPayload.id) {
        throw new Error(startPayload?.error?.message ?? 'The rerun could not be started.');
      }

      updateRunState(notebookId, { status: 'running' });
      let status = 'running';
      while (status === 'running') {
        await wait(2500);
        const pollResponse = await fetch(`/api/pipeline-rerun/${startPayload.id}`, { cache: 'no-store' });
        const pollPayload = await pollResponse.json().catch(() => null) as { status?: string; error?: string | null } | null;
        if (!pollResponse.ok || !pollPayload) {
          throw new Error('The rerun status could not be read.');
        }
        status = pollPayload.status ?? 'failed';
        if (status === 'failed' && pollPayload.error) {
          throw new Error(pollPayload.error);
        }
      }

      await load();
      updateRunState(notebookId, { status: 'done' });
    } catch (error) {
      updateRunState(notebookId, {
        status: 'error',
        message: error instanceof Error ? error.message : 'The notebook rerun could not be completed.',
      });
    }
  }

  async function reclassifyNotebook(notebookId: string, repositoryId: string) {
    setClassifyStates((current) => ({ ...current, [notebookId]: 'running' }));
    try {
      const startResponse = await fetch('/api/pipeline-classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryId, notebookId }),
      });
      const startPayload = await startResponse.json().catch(() => null) as { id?: string; error?: { message: string } } | null;
      if (!startResponse.ok || !startPayload || startPayload.error || !startPayload.id) {
        throw new Error(startPayload?.error?.message ?? 'The reclassification could not be started.');
      }

      let jobStatus = 'running';
      while (jobStatus === 'running') {
        await wait(2000);
        const pollResponse = await fetch(`/api/pipeline-classify/${startPayload.id}`, { cache: 'no-store' });
        const pollPayload = await pollResponse.json().catch(() => null) as { status?: string; error?: string | null } | null;
        if (!pollResponse.ok || !pollPayload) {
          throw new Error('The reclassify status could not be read.');
        }
        jobStatus = pollPayload.status ?? 'failed';
        if (jobStatus === 'failed') {
          throw new Error(pollPayload.error ?? 'Reclassification failed.');
        }
      }

      await load();
      setClassifyStates((current) => {
        const next = { ...current };
        delete next[notebookId];
        return next;
      });
    } catch {
      setClassifyStates((current) => ({ ...current, [notebookId]: 'error' }));
    }
  }

  const categories = useMemo(() => {
    const present = new Set<string>();
    notebooks.forEach((n) => {
      const value = n.finalCategory ?? n.ruleCategory ?? n.llmCategory;
      if (value) present.add(value);
    });
    return ['All', ...[...present].sort()];
  }, [notebooks]);

  const filtered = useMemo(() => {
    return notebooks.filter((n) => {
      const notebookCategory = n.finalCategory ?? n.ruleCategory ?? n.llmCategory;
      const matchesPlatform = platform === 'All' || n.repositoryPlatform === platform;
      const matchesCategory = category === 'All' || notebookCategory === category;
      const matchesStatus = status === 'All' || executionLabel(n.executionStatus) === status;
      const matchesQuery =
        query.trim() === '' ||
        n.title.toLowerCase().includes(query.toLowerCase()) ||
        n.repositoryName.toLowerCase().includes(query.toLowerCase());
      return matchesPlatform && matchesCategory && matchesStatus && matchesQuery;
    });
  }, [notebooks, query, platform, category, status]);

  useEffect(() => { setPage(1); }, [query, platform, category, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageNotebooks = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <AppShell active="My notebooks">
      <PageHeading
        eyebrow="Workspace"
        title="My notebooks"
        subtitle="Real notebooks from your pipeline database (data/output/db/db.sqlite) — rerun any of them for real."
        status={loadState === 'ready' ? `${notebooks.length} notebooks` : loadState === 'loading' ? 'Loading…' : 'Unavailable'}
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

      <div className="toolbar">
        <div className="filter-row">
          {platforms.map((p) => (
            <button key={p} type="button" className={`filter-chip ${platform === p ? 'active' : ''}`} onClick={() => setPlatform(p)}>
              {p === 'All' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
              <b>{p === 'All' ? notebooks.length : notebooks.filter((n) => n.repositoryPlatform === p).length}</b>
            </button>
          ))}
        </div>
        <select
          className="category-select"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by classification"
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c === 'All' ? 'All classifications' : prettyCategory(c)}</option>
          ))}
        </select>
        <select
          className="category-select"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          aria-label="Filter by execution status"
        >
          <option value="All">All statuses</option>
          <option value="Not run">Not run</option>
          <option value="Success">Success</option>
          <option value="Partial">Partial</option>
          <option value="Failed">Failed</option>
        </select>
        <label className="mini-search">
          <Icon name="search" size={14} />
          <input placeholder="Search notebooks..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <section className="panel notebooks-panel">
        <div className="panel-heading"><div><h2>Notebooks</h2><p>{filtered.length} of {notebooks.length} shown</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Notebook</th><th>Repository</th><th>Classification</th><th>Score</th><th>Execution</th><th>Updated</th><th>Action</th></tr></thead>
            <tbody>{pageNotebooks.map((item) => {
              const category = item.finalCategory ?? item.ruleCategory ?? item.llmCategory;
              const score = item.reproducibilityScore === null ? null : Math.round(item.reproducibilityScore * 100);
              const execution = executionLabel(item.executionStatus);
              const runState = runStates[item.id];
              const isBusy = runState?.status === 'starting' || runState?.status === 'running';
              return (
                <tr key={item.id}>
                  <td><span className="notebook-cell"><i className="file-icon">&#9638;</i><span><strong>{item.title}</strong><small>{item.language}</small></span></span></td>
                  <td><a href={item.repositoryUrl} target="_blank" rel="noreferrer" className="muted" style={{ textDecoration: 'none' }}>{item.repositoryName}<br /><small style={{ color: 'var(--fg-subtle)' }}>{item.repositoryPlatform}</small></a></td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span className="category"><Icon name="spark" size={13} />{prettyCategory(category)}</span>
                      <Button
                        variant="outline"
                        size="icon-xs"
                        type="button"
                        className="repo-action-neutral"
                        disabled={classifyStates[item.id] === 'running'}
                        aria-label={`Reclassify ${item.title} only`}
                        title="Reclassify only (no execution)"
                        onClick={() => void reclassifyNotebook(item.id, item.repositoryId)}
                      >
                        {classifyStates[item.id] === 'running' ? <span className="spinner" /> : <Icon name="rerun" size={11} />}
                      </Button>
                    </span>
                    {classifyStates[item.id] === 'error' && <div style={{ marginTop: 4 }}><small className="notebook-rerun-error">Reclassify failed</small></div>}
                    {item.needsHumanReview && <div style={{ marginTop: 4 }}><span className="status-pill partial"><Icon name="alert" size={10} />Needs review</span></div>}
                  </td>
                  <td><span className="score-cell"><ScoreRing score={score} /><small>{scoreLabel(score)}</small></span></td>
                  <td><span className={`status-pill ${execution.toLowerCase().replace(/\s+/g, '-')}`}>{execution}</span></td>
                  <td className="muted">{formatDate(item.updated)}</td>
                  <td>
                    <Button
                      className="notebook-rerun repo-action-rerun"
                      variant="outline"
                      size="sm"
                      type="button"
                      disabled={isBusy}
                      aria-label={`${item.executionStatus === null ? 'Run' : 'Rerun'} ${item.title}`}
                      title={runState?.message}
                      onClick={() => void rerunNotebook(item.id, item.repositoryId)}
                    >
                      {isBusy ? <span className="spinner" /> : <Icon name={item.executionStatus === null && !runState ? 'play' : 'rerun'} size={12} />}
                      {runState?.status === 'starting'
                        ? 'Starting'
                        : runState?.status === 'running'
                          ? 'Running'
                          : runState?.status === 'done'
                            ? 'Run again'
                            : runState?.status === 'error'
                              ? 'Retry'
                              : (item.executionStatus === null ? 'Run' : 'Rerun')}
                    </Button>
                    {runState?.status === 'error' && <small className="notebook-rerun-error">{runState.message}</small>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
          {filtered.length === 0 && <p style={{ padding: 24, color: 'var(--fg-subtle)', fontSize: 10 }}>No notebooks match this filter.</p>}
        </div>
      </section>

      {loadState === 'ready' && filtered.length > 0 && (
        <nav className="pagination" aria-label="Notebooks pages">
          <span className="pagination-summary">
            Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
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
