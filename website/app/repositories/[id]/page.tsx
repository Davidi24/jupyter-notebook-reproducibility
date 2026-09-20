'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppShell, { Icon, ScoreRing } from '@/components/AppShell';
import { useStore } from '@/lib/store';
import { getRepository, notebooksForRepository, averageScore, repoStatus, scoreLabel } from '@/lib/mock-data';
import PipelineStatusCard from '@/components/PipelineStatusCard';

export default function RepositoryDetailPage() {
  const params = useParams<{ id: string }>();
  const { repositories, notebooks, importSyncStatus } = useStore();
  const repo = getRepository(repositories, params.id);

  if (!repo) {
    return (
      <AppShell active="Repositories">
        <p style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>{importSyncStatus === 'idle' || importSyncStatus === 'loading' ? 'Loading saved repository…' : <>Repository not found. <Link href="/repositories">Back to repositories</Link></>}</p>
      </AppShell>
    );
  }

  const nbs = notebooksForRepository(notebooks, repo.id);
  const status = repoStatus(nbs);
  const avg = averageScore(nbs);
  const hasScores = nbs.some((notebook) => notebook.score !== null);

  return (
    <AppShell active="Repositories">
      <div className="breadcrumb"><Link href="/repositories">Repositories</Link><span>/</span><b>{repo.name}</b></div>

      <div className="page-heading">
        <div>
          <p className="eyebrow">{repo.platform}</p>
          <h1>{repo.name}</h1>
          <p>{repo.url}</p>
        </div>
        <span className={`status-pill ${status.toLowerCase()}`}>{status}</span>
      </div>

      <div className="detail-grid">
        <div>
          <PipelineStatusCard repositoryId={repo.id} />
          <section className="detail-panel">
            <h2>Overview</h2>
            <p style={{ margin: '0 0 16px', color: 'var(--fg-muted)', fontSize: 10, lineHeight: 1.6 }}>{repo.description}</p>
            <div className="kv-grid">
              <div><dt>Authors</dt><dd>{repo.authors.join(', ')}</dd></div>
              <div><dt>License</dt><dd>{repo.license}</dd></div>
              <div><dt>DOI</dt><dd>{repo.doi ?? 'Not applicable'}</dd></div>
              <div><dt>Notebooks</dt><dd>{nbs.length}</dd></div>
              <div><dt>Avg. reproducibility</dt><dd>{hasScores ? `${avg}%` : 'Pending analysis'}</dd></div>
              <div><dt>Metadata completeness</dt><dd>{repo.metadataCompleteness}%</dd></div>
            </div>
            {repo.warnings && repo.warnings.length > 0 && (
              <div className="repository-warnings">
                {repo.warnings.map((warning) => <p key={warning}><Icon name="alert" size={13} />{warning}</p>)}
              </div>
            )}
            <div className="tag-row" style={{ marginTop: 16 }}>
              {repo.keywords.map((k) => <span className="keyword-tag" key={k}>{k}</span>)}
            </div>
          </section>

          <section className="detail-panel">
            <h2>Notebooks in this repository</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Notebook</th><th>Classification</th><th>Score</th><th>Execution</th></tr></thead>
                <tbody>{nbs.map((n) => (
                  <tr key={n.id}>
                    <td><Link href={`/notebooks/${n.id}`} className="notebook-cell"><i className="file-icon">&#9638;</i><span><strong>{n.title}</strong><small>{n.language}</small></span></Link></td>
                    <td><span className="category"><Icon name="spark" size={13} />{n.finalCategory}</span></td>
                    <td><span className="score-cell"><ScoreRing score={n.score} /><small>{scoreLabel(n.score)}</small></span></td>
                    <td><span className={`status-pill ${n.executionStatus.toLowerCase().replace(/\s+/g, '-')}`}>{n.executionStatus}</span></td>
                  </tr>
                ))}</tbody>
              </table>
              {nbs.length === 0 && <p style={{ padding: 18, color: 'var(--fg-subtle)', fontSize: 9.5 }}>No notebooks recorded yet.</p>}
            </div>
          </section>
        </div>

        <div>
          <section className="detail-panel">
            <h2>Pipeline run history</h2>
            <div className="run-list">
              {repo.runs.map((run, i) => (
                <div className="run-item" key={i}>
                  <span className={`run-dot ${run.status.toLowerCase()}`} />
                  <div>
                    <div className="run-item-head">{run.status} <small>- {run.date} - {run.duration}</small></div>
                    <p>{run.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
