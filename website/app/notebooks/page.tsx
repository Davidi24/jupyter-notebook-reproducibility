'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell, { Icon, PageHeading, ScoreRing } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import type { PipelineActionFailure, PipelineJobSnapshot } from '@/lib/analysis-contract';
import { hydrateImportedRepositories, useStore } from '@/lib/store';
import { getRepository, scoreLabel, Platform } from '@/lib/mock-data';

const platforms: ('All' | Platform)[] = ['All', 'GitHub', 'Codeberg', 'Zenodo'];
const activeStatuses = new Set<PipelineJobSnapshot['status']>(['queued', 'preparing', 'building', 'running']);
type NotebookRunState = { status: 'starting' | 'running' | 'done' | 'error'; progress: number; message?: string };

function isFailure(value: unknown): value is PipelineActionFailure {
  if (!value || typeof value !== 'object' || !('error' in value)) return false;
  const { error } = value as { error: unknown };
  return Boolean(error && typeof error === 'object');
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export default function NotebooksPage() {
  const { notebooks, repositories } = useStore();
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<'All' | Platform>('All');
  const [runStates, setRunStates] = useState<Record<string, NotebookRunState>>({});

  function updateRunState(notebookId: string, next: NotebookRunState) {
    setRunStates((current) => ({ ...current, [notebookId]: next }));
  }

  async function rerunNotebook(notebookId: string, repositoryId: string) {
    updateRunState(notebookId, { status: 'starting', progress: 0 });
    try {
      const response = await fetch(`/api/notebooks/${notebookId}/analysis`, { method: 'POST' });
      const payload = await response.json().catch(() => null) as PipelineJobSnapshot | PipelineActionFailure | null;
      if (!payload || isFailure(payload)) {
        throw new Error(payload && isFailure(payload) ? payload.error.message : 'The pipeline returned an unreadable response.');
      }
      if (!payload.id) throw new Error('The pipeline did not return a job ID.');

      const runnerJobId = payload.id;
      updateRunState(notebookId, { status: 'running', progress: payload.progress });
      while (activeStatuses.has(payload.status)) {
        await wait(2500);
        const statusResponse = await fetch(`/api/repositories/${repositoryId}/analysis`, { cache: 'no-store' });
        const statusPayload = await statusResponse.json().catch(() => null) as PipelineJobSnapshot | PipelineActionFailure | null;
        if (!statusPayload || isFailure(statusPayload)) {
          throw new Error(statusPayload && isFailure(statusPayload) ? statusPayload.error.message : 'The pipeline status could not be read.');
        }
        if (statusPayload.id !== runnerJobId) throw new Error('A newer repository run replaced this notebook run.');
        Object.assign(payload, statusPayload);
        updateRunState(notebookId, { status: 'running', progress: statusPayload.progress });
      }

      await hydrateImportedRepositories(true);
      if (payload.status === 'succeeded' || payload.status === 'partial') {
        updateRunState(notebookId, { status: 'done', progress: 100 });
      } else {
        throw new Error(payload.error ?? payload.message ?? 'The notebook run failed.');
      }
    } catch (error) {
      updateRunState(notebookId, {
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'The notebook run could not be completed.',
      });
      await hydrateImportedRepositories(true);
    }
  }

  const filtered = useMemo(() => {
    return notebooks.filter((n) => {
      const repo = getRepository(repositories, n.repositoryId);
      const matchesPlatform = platform === 'All' || repo?.platform === platform;
      const matchesQuery =
        query.trim() === '' ||
        n.title.toLowerCase().includes(query.toLowerCase()) ||
        repo?.name.toLowerCase().includes(query.toLowerCase());
      return matchesPlatform && matchesQuery;
    });
  }, [notebooks, repositories, query, platform]);

  return (
    <AppShell active="My notebooks">
      <PageHeading
        eyebrow="Workspace"
        title="My notebooks"
        subtitle="Every notebook the pipeline has re-executed and classified across your repositories."
        status={`${notebooks.length} notebooks`}
      />

      <div className="toolbar">
        <div className="filter-row">
          {platforms.map((p) => (
            <button key={p} type="button" className={`filter-chip ${platform === p ? 'active' : ''}`} onClick={() => setPlatform(p)}>
              {p}
              <b>{p === 'All' ? notebooks.length : notebooks.filter((n) => getRepository(repositories, n.repositoryId)?.platform === p).length}</b>
            </button>
          ))}
        </div>
        <label className="mini-search">
          <Icon name="search" size={14} />
          <input placeholder="Search notebooks..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <section className="panel notebooks-panel">
        <div className="panel-heading"><div><h2>Notebooks</h2><p>{filtered.length} of {notebooks.length} shown</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Notebook</th><th>Repository</th><th>Classification</th><th>Score</th><th>Execution</th><th>Visibility</th><th>Updated</th><th>Action</th></tr></thead>
            <tbody>{filtered.map((item) => {
              const repo = getRepository(repositories, item.repositoryId);
              return (
                <tr key={item.id}>
                  <td><Link href={`/notebooks/${item.id}`} className="notebook-cell"><i className="file-icon">&#9638;</i><span><strong>{item.title}</strong><small>{item.language}</small></span></Link></td>
                  <td><Link href={`/repositories/${repo?.id}`} className="muted" style={{ textDecoration: 'none' }}>{repo?.name}<br /><small style={{ color: 'var(--fg-subtle)' }}>{repo?.platform}</small></Link></td>
                  <td>
                    <span className="category"><Icon name="spark" size={13} />{item.finalCategory}</span>
                    {item.agreement === 'Disagreed' && <div style={{ marginTop: 4 }}><span className="status-pill partial"><Icon name="alert" size={10} />Needs review</span></div>}
                  </td>
                  <td><span className="score-cell"><ScoreRing score={item.score} /><small>{scoreLabel(item.score)}</small></span></td>
                  <td><span className={`status-pill ${item.executionStatus.toLowerCase().replace(/\s+/g, '-')}`}>{item.executionStatus}</span></td>
                  <td><span className={`visibility ${item.visibility.toLowerCase()}`}><Icon name={item.visibility === 'Public' ? 'globe' : 'lock'} size={12} />{item.visibility}</span></td>
                  <td className="muted">{item.updated}</td>
                  <td>
                    <Button
                      className="notebook-rerun"
                      variant="outline"
                      size="sm"
                      type="button"
                      disabled={runStates[item.id]?.status === 'starting' || runStates[item.id]?.status === 'running'}
                      aria-label={`Rerun only ${item.title}`}
                      title={runStates[item.id]?.message}
                      onClick={() => void rerunNotebook(item.id, item.repositoryId)}
                    >
                      {runStates[item.id]?.status === 'starting' || runStates[item.id]?.status === 'running'
                        ? <span className="spinner" />
                        : <Icon name="rerun" size={12} />}
                      {runStates[item.id]?.status === 'starting'
                        ? 'Starting'
                        : runStates[item.id]?.status === 'running'
                          ? `${runStates[item.id].progress}%`
                          : runStates[item.id]?.status === 'done'
                            ? 'Run again'
                            : runStates[item.id]?.status === 'error'
                              ? 'Retry'
                              : 'Rerun'}
                    </Button>
                    {runStates[item.id]?.status === 'error' && <small className="notebook-rerun-error">{runStates[item.id].message}</small>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
          {filtered.length === 0 && <p style={{ padding: 24, color: 'var(--fg-subtle)', fontSize: 10 }}>No notebooks match this filter.</p>}
        </div>
      </section>
    </AppShell>
  );
}
