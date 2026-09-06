import type { PipelineJobSnapshot } from '@/lib/analysis-contract';
import {
  createAnalysisJob,
  getLatestAnalysisJob,
  getNotebookAnalysisInput,
  getRepositoryAnalysisInput,
  syncAnalysisJob,
} from '@/lib/server/repository-database';
import {
  cancelRunnerJob,
  getRunnerJob,
  PipelineRunnerError,
  startRunnerJob,
} from '@/lib/server/pipeline-runner';

const ACTIVE_STATUSES = new Set<PipelineJobSnapshot['status']>([
  'queued', 'preparing', 'building', 'running',
]);

export class RepositoryAnalysisError extends Error {
  constructor(
    readonly kind: 'not_found' | 'notebook_not_found' | 'no_notebooks' | 'busy' | 'unavailable' | 'failed',
    message: string,
  ) {
    super(message);
    this.name = 'RepositoryAnalysisError';
  }
}

function runnerFailure(error: unknown): never {
  if (error instanceof PipelineRunnerError) {
    throw new RepositoryAnalysisError(
      error.kind === 'unavailable' ? 'unavailable' : 'failed',
      error.message,
    );
  }
  throw error;
}

export function unavailableAnalysis(repositoryId: string, message: string): PipelineJobSnapshot {
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

export async function launchRepositoryAnalysis(repositoryId: string) {
  const latest = await getLatestAnalysisJob(repositoryId);
  if (latest && ACTIVE_STATUSES.has(latest.status)) {
    return (await refreshRepositoryAnalysis(repositoryId)) ?? latest;
  }
  const input = await getRepositoryAnalysisInput(repositoryId);
  if (!input) throw new RepositoryAnalysisError('not_found', 'The repository was not found.');
  if (input.notebooks.length === 0) {
    throw new RepositoryAnalysisError('no_notebooks', 'This repository does not contain notebooks to analyze.');
  }
  try {
    const snapshot = await startRunnerJob({
      repositoryId,
      url: input.url,
      notebooks: input.notebooks,
    });
    return await createAnalysisJob(snapshot, input.notebooks);
  } catch (error) {
    return runnerFailure(error);
  }
}

export async function launchNotebookAnalysis(notebookId: string) {
  const input = await getNotebookAnalysisInput(notebookId);
  if (!input) throw new RepositoryAnalysisError('notebook_not_found', 'The notebook was not found.');

  const latest = await getLatestAnalysisJob(input.repositoryId);
  if (latest && ACTIVE_STATUSES.has(latest.status)) {
    const isSameNotebook = latest.targetNotebooks?.length === 1
      && latest.targetNotebooks[0] === input.notebooks[0];
    if (isSameNotebook) return (await refreshRepositoryAnalysis(input.repositoryId)) ?? latest;
    throw new RepositoryAnalysisError(
      'busy',
      'Another notebook in this repository is already running. Wait for it to finish, then try again.',
    );
  }

  try {
    const snapshot = await startRunnerJob({
      repositoryId: input.repositoryId,
      url: input.url,
      notebooks: input.notebooks,
    });
    return await createAnalysisJob(snapshot, input.notebooks);
  } catch (error) {
    return runnerFailure(error);
  }
}

export async function refreshRepositoryAnalysis(repositoryId: string) {
  const latest = await getLatestAnalysisJob(repositoryId);
  if (!latest) return null;
  if (!latest.id || !ACTIVE_STATUSES.has(latest.status)) return latest;
  try {
    const snapshot = await getRunnerJob(repositoryId, latest.id);
    return await syncAnalysisJob(snapshot);
  } catch (error) {
    return runnerFailure(error);
  }
}

export async function cancelRepositoryAnalysis(repositoryId: string) {
  const latest = await getLatestAnalysisJob(repositoryId);
  if (!latest?.id || !ACTIVE_STATUSES.has(latest.status)) return latest;
  try {
    const snapshot = await cancelRunnerJob(repositoryId, latest.id);
    return await syncAnalysisJob(snapshot);
  } catch (error) {
    return runnerFailure(error);
  }
}
