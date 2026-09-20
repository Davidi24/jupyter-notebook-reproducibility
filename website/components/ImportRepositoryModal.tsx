'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './AppShell';
import { addImportedRepository } from '@/lib/store';
import type { RepositoryImportFailure, RepositoryImportSuccess } from '@/lib/repository-import-contract';
import { parseRepositorySource, SourceValidationError } from '@/lib/repository-source';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const STEPS = [
  { label: 'Validate and inspect source', detail: 'Confirm the platform, read metadata, and discover notebooks' },
  { label: 'Save repository to workspace', detail: 'Store the repository and notebook paths, then queue analysis' },
];

const FIRST_STEP_DURATION_MS = 1000;
const SECOND_STEP_DURATION_MS = 3000;
const REDIRECT_SECONDS = 4;

const SOURCES = [
  { name: 'GitHub', icon: 'github', hint: 'github.com' },
  { name: 'Codeberg', icon: 'branch', hint: 'codeberg.org' },
  { name: 'Zenodo', icon: 'database', hint: 'zenodo.org/records' },
];

const DEMO_URL = 'https://github.com/fusion-jena/fairjupyter';
type Phase = 'form' | 'running' | 'done' | 'error';

function importFailure(message: string, retryable = true): RepositoryImportFailure {
  return { error: { code: 'IMPORT_FAILED', message, retryable } };
}

export default function ImportRepositoryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [stepIndex, setStepIndex] = useState(0);
  const [result, setResult] = useState<RepositoryImportSuccess | null>(null);
  const [failure, setFailure] = useState<RepositoryImportFailure | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const redirectTimer = useRef<number | null>(null);
  const [redirectSeconds, setRedirectSeconds] = useState(REDIRECT_SECONDS);
  const router = useRouter();

  function clearRedirect() {
    if (redirectTimer.current !== null) {
      window.clearInterval(redirectTimer.current);
      redirectTimer.current = null;
    }
  }

  useEffect(() => clearRedirect, []);

  const detectedSource = useMemo(() => {
    if (!url.trim()) return null;
    try {
      return parseRepositorySource(url);
    } catch {
      return null;
    }
  }, [url]);

  const progress = phase === 'running' ? (stepIndex === 0 ? 38 : 78) : phase === 'done' ? 100 : 0;

  function reset() {
    requestController.current?.abort();
    requestController.current = null;
    clearRedirect();
    setUrl('');
    setPhase('form');
    setStepIndex(0);
    setResult(null);
    setFailure(null);
    setFieldError(null);
    setRedirectSeconds(REDIRECT_SECONDS);
  }

  function handleClose() {
    clearRedirect();
    reset();
    onClose();
  }

  function validateUrl() {
    try {
      const parsed = parseRepositorySource(url);
      setFieldError(null);
      return parsed;
    } catch (error) {
      const message = error instanceof SourceValidationError ? error.message : 'Enter a valid repository URL.';
      setFieldError(message);
      return null;
    }
  }

  async function runImport(event: React.FormEvent) {
    event.preventDefault();
    if (!validateUrl()) return;

    const controller = new AbortController();
    requestController.current = controller;
    setFailure(null);
    setStepIndex(0);
    setPhase('running');

    try {
      const request = fetch('/api/repositories/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
        signal: controller.signal,
      }).then(
        (response) => ({ response, error: null }),
        (error: unknown) => ({ response: null, error }),
      );
      await new Promise((resolve) => window.setTimeout(resolve, FIRST_STEP_DURATION_MS));
      if (controller.signal.aborted) return;
      setStepIndex(1);
      const [{ response, error: requestError }] = await Promise.all([
        request,
        new Promise((resolve) => window.setTimeout(resolve, SECOND_STEP_DURATION_MS)),
      ]);
      if (requestError) throw requestError;
      if (!response) throw new Error('The import service returned no response.');
      const payload = await response.json().catch(() => null) as RepositoryImportSuccess | RepositoryImportFailure | null;

      if (!response.ok || !payload || 'error' in payload) {
        const errorPayload = payload && 'error' in payload
          ? payload
          : importFailure('The server returned an unreadable response. Try again.');
        setFailure(errorPayload);
        setPhase('error');
        return;
      }

      addImportedRepository(payload.repository, payload.notebooks);
      setResult(payload);
      setPhase('done');
      setRedirectSeconds(REDIRECT_SECONDS);
      const repositoryId = payload.repository.id;
      let secondsRemaining = REDIRECT_SECONDS;
      redirectTimer.current = window.setInterval(() => {
        secondsRemaining -= 1;
        setRedirectSeconds(secondsRemaining);
        if (secondsRemaining <= 0) {
          clearRedirect();
          openRepository(repositoryId);
        }
      }, 1000);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setFailure(importFailure('NotebookFair could not reach the import service. Check your connection and try again.'));
      setPhase('error');
    } finally {
      if (requestController.current === controller) requestController.current = null;
    }
  }

  function retryImport() {
    setFailure(null);
    setPhase('form');
    setStepIndex(0);
  }

  function openRepository(repositoryId: string) {
    clearRedirect();
    handleClose();
    router.push(`/repositories/${repositoryId}`);
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) handleClose(); }}>
      <DialogContent
        className={`modal-card import-modal sm:max-w-[720px] p-0 gap-0 ${phase === 'running' ? 'is-running' : ''} ${phase === 'done' ? 'is-complete' : ''}`}
        data-testid="import-dialog"
        showCloseButton={false}
      >
        <div className="modal-head import-head">
          <div className="dialog-title">
            <span className="dialog-title-icon"><Icon name="upload" size={17} /></span>
            <DialogHeader>
              <DialogTitle id="import-title">Import repository</DialogTitle>
              <DialogDescription>
                {phase === 'form' && 'Connect a public research source to your workspace.'}
                {phase === 'running' && `Import phase ${stepIndex + 1} of ${STEPS.length}.`}
                {phase === 'done' && 'Everything is ready. Opening the live analysis workspace.'}
                {phase === 'error' && 'The import needs your attention.'}
              </DialogDescription>
            </DialogHeader>
          </div>
          <Button type="button" className="icon-button" variant="outline" size="icon" onClick={handleClose} aria-label={phase === 'running' ? 'Cancel import' : 'Close'}><Icon name="x" size={16} /></Button>
        </div>

        {phase === 'form' && (
          <form onSubmit={runImport} className="modal-body import-form" noValidate>
            <div className="source-grid" aria-label="Supported repository sources">
              {SOURCES.map((source) => (
                <div className="source-card" key={source.name}>
                  <span><Icon name={source.icon} size={17} /></span>
                  <div><strong>{source.name}</strong><small>{source.hint}</small></div>
                  <i><Icon name="check" size={10} /></i>
                </div>
              ))}
            </div>

            <div className="field-group">
              <div className="field-label-row">
                <label className="field-label" htmlFor="repo-url">Repository or record URL</label>
                <Button type="button" className="example-link" variant="link" onClick={() => { setUrl(DEMO_URL); setFieldError(null); }}>Use demo URL</Button>
              </div>
              <div className={`input-shell ${fieldError ? 'has-error' : ''}`}>
                <Icon name="globe" size={15} />
                <Input
                  id="repo-url"
                  className="text-input"
                  placeholder="https://github.com/owner/repository"
                  value={url}
                  onChange={(event) => { setUrl(event.target.value); setFieldError(null); }}
                  onBlur={() => { if (url.trim()) validateUrl(); }}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? 'repo-url-error' : 'repo-url-hint'}
                  autoFocus
                />
                {detectedSource && <Badge className="detected-source" variant="secondary">{detectedSource.platform}</Badge>}
              </div>
              {fieldError
                ? <p className="field-error" id="repo-url-error" role="alert"><Icon name="alert" size={12} />{fieldError}</p>
                : <p className="field-hint" id="repo-url-hint">Public GitHub and Codeberg repositories and published Zenodo records are supported. Private sources require credentials and are rejected safely.</p>}
            </div>

            <div className="import-preview">
              <span><Icon name="layers" size={18} /></span>
              <div><strong>Two quick import phases, then live analysis</strong><p>NotebookFair validates and saves the source first, then redirects you to follow the six-phase reproducibility pipeline.</p></div>
            </div>

            <div className="modal-actions import-actions">
              <Button type="button" className="button secondary" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="submit" className="button primary" disabled={url.trim().length === 0}>Validate & import <Icon name="arrow" size={14} /></Button>
            </div>
          </form>
        )}

        {phase === 'running' && (
          <div className="modal-body import-running" aria-live="polite">
            <div className="progress-summary">
              <div><span className="status-dot"><i /></span><div><strong>{STEPS[stepIndex].label}</strong><p>{STEPS[stepIndex].detail}</p></div></div>
              <b>{progress}%</b>
            </div>
            <Progress className="progress-track large" value={progress} aria-label="Import in progress" />

            <div className="import-run-grid">
              <ol className="step-list detailed">
                {STEPS.map((step, index) => (
                  <li key={step.label} className={index < stepIndex ? 'done' : index === stepIndex ? 'active' : 'pending'}>
                    <span className="step-icon">
                      {index < stepIndex ? <Icon name="check" size={11} /> : index === stepIndex ? <span className="spinner" /> : <span>{index + 1}</span>}
                    </span>
                    <span><strong>{step.label}</strong><small>{step.detail}</small></span>
                  </li>
                ))}
              </ol>

              <aside className="analysis-visual">
                <div className="analysis-head"><span><Icon name="terminal" size={15} /></span><strong>Import activity</strong></div>
                <dl className="analysis-metrics">
                  <div><dt>Source</dt><dd>{detectedSource?.platform ?? 'Checking'}</dd></div>
                  <div><dt>Import phase</dt><dd>{stepIndex + 1} of {STEPS.length}</dd></div>
                  <div><dt>Analysis</dt><dd>{stepIndex === 0 ? 'Waiting to queue' : 'Being queued'}</dd></div>
                  <div><dt>Visibility</dt><dd><Icon name="lock" size={11} /> Private</dd></div>
                </dl>
                <div className="activity-log">
                  <p><span>phase 1</span> Validate source, metadata, and notebook paths</p>
                  <p><span>phase 2</span> Save records and queue isolated analysis</p>
                  <p><span>next</span> Redirect to the live repository pipeline</p>
                </div>
                <div className="mock-notice"><Icon name="lock" size={13} /><span>Notebook code runs only inside the isolated Docker runner.</span></div>
              </aside>
            </div>

            <div className="modal-actions import-actions running-actions">
              <span>This can take a few seconds for large repositories.</span>
              <Button type="button" className="button secondary" variant="outline" onClick={handleClose}>Cancel import</Button>
            </div>
          </div>
        )}

        {phase === 'error' && failure && (
          <div className="modal-body import-error-state" role="alert">
            <div className="error-banner">
              <span className="error-icon"><Icon name="alert" size={18} /></span>
              <div><strong>Repository was not imported</strong><p>{failure.error.message}</p></div>
            </div>
            <div className="error-details">
              <span>Error code</span><code>{failure.error.code}</code>
              <p>{failure.error.retryable ? 'This problem may be temporary. You can retry the same URL.' : 'Change the URL or open the existing repository before trying again.'}</p>
            </div>
            <div className="modal-actions import-actions">
              <Button type="button" className="button secondary" variant="outline" onClick={retryImport}>Edit URL</Button>
              {failure.error.existingRepositoryId
                ? <Button type="button" className="button primary" onClick={() => openRepository(failure.error.existingRepositoryId as string)}>Open existing repository <Icon name="arrow" size={14} /></Button>
                : <Button type="button" className="button primary" onClick={retryImport}>{failure.error.retryable ? 'Try again' : 'Use another URL'} <Icon name="arrow" size={14} /></Button>}
            </div>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="modal-body import-complete">
            <div className="success-banner large-success">
              <span className="success-icon"><Icon name="check" size={18} /></span>
              <div>
                <strong>Everything is ready</strong>
                <p>
                  {result.repository.name} was imported successfully with {result.notebooks.length} notebook{result.notebooks.length === 1 ? '' : 's'}. We’re taking you to its live reproducibility analysis in {redirectSeconds}s…
                </p>
              </div>
            </div>

            <div className="result-metrics">
              <div><span><Icon name="book" size={16} /></span><strong>{result.notebooks.length}</strong><small>Notebooks found</small></div>
              <div><span><Icon name="fileSearch" size={16} /></span><strong>{result.repository.metadataCompleteness}%</strong><small>Metadata complete</small></div>
              <div><span><Icon name="clock" size={16} /></span><strong>{result.analysis?.status === 'unavailable' ? 'Awaiting runner' : 'Queued'}</strong><small>Analysis status</small></div>
            </div>

            <div className="result-list">
              <p><Icon name="check" size={13} /><span><strong>Source validated</strong><small>{result.repository.platform} metadata was read successfully</small></span></p>
              <p><Icon name="check" size={13} /><span><strong>Records saved</strong><small>Imports remain available after reloading the site</small></span></p>
              <p><Icon name="lock" size={13} /><span><strong>Private by default</strong><small>Imported notebooks are not shared automatically</small></span></p>
              <p className={result.analysis?.status === 'unavailable' ? 'result-warning' : ''}><Icon name={result.analysis?.status === 'unavailable' ? 'alert' : 'terminal'} size={13} /><span><strong>Pipeline {result.analysis?.status === 'unavailable' ? 'waiting' : 'started'}</strong><small>{result.analysis?.message ?? 'Open the repository to follow execution progress.'}</small></span></p>
              {result.warnings.map((warning) => <p className="result-warning" key={warning}><Icon name="alert" size={13} /><span><strong>Import note</strong><small>{warning}</small></span></p>)}
            </div>

            <div className="modal-actions import-actions">
              <Button type="button" className="button secondary" variant="outline" onClick={() => { clearRedirect(); handleClose(); }}>Stay on dashboard</Button>
              <Button type="button" className="button primary" onClick={() => openRepository(result.repository.id)}>
                Open repository now <Icon name="arrow" size={14} />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
