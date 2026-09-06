'use client';

import Link from 'next/link';
import AppShell, { Icon, PageHeading } from '@/components/AppShell';
import { hydrateImportedRepositories, useStore } from '@/lib/store';
import { notebooksForRepository, averageScore, repoStatus } from '@/lib/mock-data';

export default function RepositoriesPage() {
  const { repositories, notebooks, importSyncStatus, importSyncError } = useStore();
  return (
    <AppShell active="Repositories">
      <PageHeading
        eyebrow="Workspace"
        title="Repositories"
        subtitle="GitHub, Codeberg, and Zenodo sources the pipeline has acquired and executed."
        status={`${repositories.length} repositories`}
      />

      {importSyncStatus === 'error' && (
        <div className="sync-error-banner" role="alert">
          <span><Icon name="alert" size={15} /></span>
          <div><strong>Saved imports could not be loaded</strong><p>{importSyncError}</p></div>
          <button type="button" onClick={() => { void hydrateImportedRepositories(true); }}>Retry</button>
        </div>
      )}

      <div className="repo-grid">
        {repositories.map((repo) => {
          const nbs = notebooksForRepository(notebooks, repo.id);
          const status = repoStatus(nbs);
          const avg = averageScore(nbs);
          const hasScores = nbs.some((notebook) => notebook.score !== null);
          return (
            <Link href={`/repositories/${repo.id}`} className="repo-card" key={repo.id}>
              <div className="repo-card-head">
                <div>
                  <h3>{repo.name}</h3>
                  <p>{repo.url}</p>
                </div>
                <span className="platform-badge"><Icon name="branch" size={11} />{repo.platform}</span>
              </div>
              <p className="repo-card-desc">{repo.description}</p>
              <div>
                <div className="meta-bar-row"><span>Metadata completeness</span><span>{repo.metadataCompleteness}%</span></div>
                <div className="meta-bar"><i style={{ width: `${repo.metadataCompleteness}%` }} /></div>
              </div>
              <div className="repo-card-foot">
                <span className={`status-pill ${status.toLowerCase()}`}>{status}</span>
                <span>{nbs.length} notebooks - {hasScores ? `avg ${avg}%` : 'analysis pending'}</span>
                <span>{repo.lastRun}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
