'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './AppShell';
import { addNotebookToStore, useStore } from '@/lib/store';
import type { Notebook } from '@/lib/mock-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const UUID_PATTERN = /^[0-9a-f-]{36}$/;

type Phase = 'form' | 'saving' | 'done' | 'error';

export default function AddNotebookModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { repositories } = useStore();
  const [repositoryId, setRepositoryId] = useState('');
  const [path, setPath] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Notebook | null>(null);
  const router = useRouter();

  const importedRepositories = useMemo(
    () => repositories.filter((repository) => UUID_PATTERN.test(repository.id)),
    [repositories],
  );

  function reset() {
    setRepositoryId('');
    setPath('');
    setPhase('form');
    setError(null);
    setSaved(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!repositoryId) {
      setError('Choose which repository this notebook belongs to.');
      return;
    }
    setError(null);
    setPhase('saving');
    try {
      const response = await fetch(`/api/repositories/${repositoryId}/notebooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path.trim() }),
      });
      const payload = await response.json().catch(() => null) as
        | { notebook: Notebook }
        | { error: { message: string } }
        | null;
      if (!response.ok || !payload || 'error' in payload) {
        setError(payload && 'error' in payload ? payload.error.message : 'The notebook could not be added. Try again.');
        setPhase('error');
        return;
      }
      addNotebookToStore(payload.notebook);
      setSaved(payload.notebook);
      setPhase('done');
    } catch {
      setError('NotebookFair could not reach the server. Check your connection and try again.');
      setPhase('error');
    }
  }

  function openRepository() {
    if (!repositoryId) return;
    handleClose();
    router.push(`/repositories/${repositoryId}`);
  }

  const selectedRepository = importedRepositories.find((repository) => repository.id === repositoryId);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) handleClose(); }}>
      <DialogContent className="modal-card sm:max-w-[560px] p-0 gap-0" showCloseButton={false}>
        <div className="modal-head import-head">
          <div className="dialog-title">
            <span className="dialog-title-icon"><Icon name="plus" size={17} /></span>
            <DialogHeader>
              <DialogTitle>Add notebook</DialogTitle>
              <DialogDescription>
                {phase === 'done'
                  ? 'The notebook was added to the repository.'
                  : 'Register a notebook at a specific path inside an already-imported repository.'}
              </DialogDescription>
            </DialogHeader>
          </div>
          <Button type="button" className="icon-button" variant="outline" size="icon" onClick={handleClose} aria-label="Close"><Icon name="x" size={16} /></Button>
        </div>

        {(phase === 'form' || phase === 'saving' || phase === 'error') && (
          <form onSubmit={submit} className="modal-body import-form" noValidate>
            <div className="field-group">
              <label className="field-label" htmlFor="notebook-repo">Repository</label>
              {importedRepositories.length === 0 ? (
                <p className="field-hint">Import a repository first — there is nothing to add a notebook to yet.</p>
              ) : (
                <select
                  id="notebook-repo"
                  className="text-input"
                  value={repositoryId}
                  onChange={(event) => setRepositoryId(event.target.value)}
                  style={{ width: '100%', height: 40, borderRadius: 8 }}
                >
                  <option value="" disabled>Choose a repository…</option>
                  {importedRepositories.map((repository) => (
                    <option key={repository.id} value={repository.id}>{repository.name} — {repository.url}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="notebook-path">Notebook path</label>
              <div className="input-shell">
                <Icon name="book" size={15} />
                <Input
                  id="notebook-path"
                  className="text-input"
                  placeholder="e.g. notebooks/analysis.ipynb"
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                  disabled={importedRepositories.length === 0}
                />
              </div>
              <p className="field-hint">
                Path relative to the repository root, including any folder — e.g. <code>experiments/2026/model.ipynb</code>. It must end in <code>.ipynb</code>.
              </p>
            </div>

            {error && <p className="field-error" role="alert"><Icon name="alert" size={12} />{error}</p>}

            <div className="modal-actions import-actions">
              <Button type="button" className="button secondary" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                type="submit"
                className="button primary"
                disabled={importedRepositories.length === 0 || !repositoryId || path.trim().length === 0 || phase === 'saving'}
              >
                {phase === 'saving' ? 'Adding…' : 'Add notebook'} <Icon name="arrow" size={14} />
              </Button>
            </div>
          </form>
        )}

        {phase === 'done' && saved && (
          <div className="modal-body import-complete">
            <div className="success-banner large-success">
              <span className="success-icon"><Icon name="check" size={18} /></span>
              <div>
                <strong>Notebook added</strong>
                <p>{saved.sourcePath} was saved to {selectedRepository?.name ?? 'the repository'}. Run analysis on the repository to execute and classify it.</p>
              </div>
            </div>
            <div className="modal-actions import-actions">
              <Button type="button" className="button secondary" variant="outline" onClick={handleClose}>Back to dashboard</Button>
              <Button type="button" className="button primary" onClick={openRepository}>Open repository <Icon name="arrow" size={14} /></Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
