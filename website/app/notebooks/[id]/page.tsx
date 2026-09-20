'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppShell, { Icon, ScoreRing } from '@/components/AppShell';
import { useStore } from '@/lib/store';
import { getNotebook, getRepository, scoreLabel } from '@/lib/mock-data';

export default function NotebookDetailPage() {
  const params = useParams<{ id: string }>();
  const { notebooks, repositories, importSyncStatus } = useStore();
  const notebook = getNotebook(notebooks, params.id);
  const [isPublic, setIsPublic] = useState(notebook?.visibility === 'Public');

  if (!notebook) {
    return (
      <AppShell active="My notebooks">
        <p style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>{importSyncStatus === 'idle' || importSyncStatus === 'loading' ? 'Loading saved notebook…' : <>Notebook not found. <Link href="/notebooks">Back to notebooks</Link></>}</p>
      </AppShell>
    );
  }

  const repo = getRepository(repositories, notebook.repositoryId);

  return (
    <AppShell active="My notebooks">
      <div className="breadcrumb"><Link href="/notebooks">My notebooks</Link><span>/</span><b>{notebook.title}</b></div>

      <div className="page-heading">
        <div>
          <p className="eyebrow">{repo?.platform} - {repo?.name}</p>
          <h1>{notebook.title}</h1>
          <p>{notebook.language} - Last updated {notebook.updated}</p>
        </div>
        <span className={`status-pill ${notebook.executionStatus.toLowerCase().replace(/\s+/g, '-')}`}>{notebook.executionStatus === 'Not run' ? 'Analysis pending' : `${notebook.executionStatus} execution`}</span>
      </div>

      <div className="detail-grid">
        <div>
          <section className="detail-panel">
            <h2>Reproducibility</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 18 }}>
              <ScoreRing score={notebook.score} size={72} />
              <div>
                <strong style={{ display: 'block', fontSize: 20, color: 'var(--fg)', fontWeight: 700 }}>{scoreLabel(notebook.score)}</strong>
                <p style={{ margin: '4px 0 0', color: 'var(--fg-muted)', fontSize: 9.5 }}>{notebook.score === null ? 'Execution and output comparison have not started.' : 'Cell-level output comparison between the original and re-executed run.'}</p>
              </div>
            </div>
            {notebook.executionNote && (
              <div className="note-callout"><Icon name="alert" size={15} /><span>{notebook.executionNote}</span></div>
            )}
          </section>

          <section className="detail-panel">
            <h2>Classification</h2>
            <div className="kv-grid">
              <div><dt>Rule-based category</dt><dd>{notebook.ruleCategory ?? 'Pending'}</dd></div>
              <div><dt>AI category (local LLM)</dt><dd>{notebook.aiCategory ?? 'Pending'}</dd></div>
              <div><dt>Agreement</dt><dd>{notebook.agreement === null ? 'Pending' : notebook.agreement === 'Agreed' ? <span className="status-pill completed"><Icon name="check" size={10} />Agreed</span> : <span className="status-pill partial"><Icon name="alert" size={10} />Disagreed</span>}</dd></div>
              <div><dt>Confidence</dt><dd>{notebook.confidence === null ? 'Pending' : `${Math.round(notebook.confidence * 100)}%`}</dd></div>
              <div><dt>Final category</dt><dd>{notebook.finalCategory}</dd></div>
              <div><dt>Human review</dt><dd>{notebook.humanReview ? 'Pending' : 'Not required'}</dd></div>
            </div>
          </section>
        </div>

        <div>
          <section className="detail-panel">
            <h2>Repository</h2>
            <p style={{ margin: '0 0 12px', color: 'var(--fg-muted)', fontSize: 9.5, lineHeight: 1.6 }}>{repo?.description}</p>
            <Link href={`/repositories/${repo?.id}`} className="text-button" style={{ padding: 0 }}>View repository <Icon name="arrow" size={13} /></Link>
          </section>

          <section className="detail-panel">
            <h2>Sharing</h2>
            <div className="toggle-row">
              <div><strong>Public visibility</strong><p>Anyone with the link can view this analysis.</p></div>
              <label className="toggle"><input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /><span className="track" /></label>
            </div>
            <p style={{ margin: '10px 0 0', color: 'var(--fg-subtle)', fontSize: 8 }}>Preview only - sharing changes are not persisted in this mock.</p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
