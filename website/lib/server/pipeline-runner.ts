import { env } from 'cloudflare:workers';
import type { PipelineJobSnapshot, PipelineResult } from '@/lib/analysis-contract';

type RuntimeBindings = { PIPELINE_RUNNER_URL?: string };

export class PipelineRunnerError extends Error {
  constructor(
    readonly kind: 'unavailable' | 'rejected' | 'invalid_response',
    message: string,
  ) {
    super(message);
    this.name = 'PipelineRunnerError';
  }
}

function configuredRunnerUrl() {
  const runtimeValue = (env as unknown as RuntimeBindings).PIPELINE_RUNNER_URL;
  const processValue = typeof process !== 'undefined' ? process.env.PIPELINE_RUNNER_URL : undefined;
  const developmentDefault = typeof process !== 'undefined' && process.env.NODE_ENV === 'development'
    ? 'http://127.0.0.1:8788'
    : '';
  const value = (runtimeValue || processValue || developmentDefault).trim();
  if (!value) {
    throw new PipelineRunnerError(
      'unavailable',
      'The reproducibility runner is not configured for this environment.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new PipelineRunnerError('unavailable', 'The reproducibility runner URL is invalid.');
  }
  const loopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1';
  if ((parsed.protocol !== 'https:' && !(loopback && parsed.protocol === 'http:')) || parsed.username || parsed.password) {
    throw new PipelineRunnerError('unavailable', 'The reproducibility runner URL is not allowed.');
  }
  parsed.pathname = parsed.pathname.replace(/\/$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

async function runnerRequest(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${configuredRunnerUrl()}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      const message = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : 'The reproducibility runner rejected the request.';
      throw new PipelineRunnerError(response.status >= 500 ? 'unavailable' : 'rejected', message);
    }
    if (!body || typeof body !== 'object') {
      throw new PipelineRunnerError('invalid_response', 'The reproducibility runner returned an unreadable response.');
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof PipelineRunnerError) throw error;
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'The reproducibility runner did not respond in time.'
      : 'The reproducibility runner could not be reached.';
    throw new PipelineRunnerError('unavailable', message);
  } finally {
    clearTimeout(timeout);
  }
}

function parseSnapshot(body: Record<string, unknown>, repositoryId: string): PipelineJobSnapshot {
  const status = typeof body.status === 'string' ? body.status : '';
  const allowedStatuses = new Set([
    'queued', 'preparing', 'building', 'running', 'succeeded', 'partial', 'failed', 'cancelled',
  ]);
  if (typeof body.id !== 'string' || !allowedStatuses.has(status)) {
    throw new PipelineRunnerError('invalid_response', 'The reproducibility runner returned an invalid job response.');
  }
  const result = body.result && typeof body.result === 'object'
    ? body.result as PipelineJobSnapshot['result']
    : undefined;
  return {
    id: body.id,
    repositoryId,
    status: status as PipelineJobSnapshot['status'],
    stage: typeof body.stage === 'string' ? body.stage : 'Pipeline',
    progress: typeof body.progress === 'number' ? Math.max(0, Math.min(100, Math.round(body.progress))) : 0,
    notebookCount: typeof body.notebookCount === 'number' ? Math.max(0, Math.round(body.notebookCount)) : undefined,
    message: typeof body.message === 'string' ? body.message : 'Pipeline status updated.',
    error: typeof body.error === 'string' ? body.error : null,
    createdAt: typeof body.createdAt === 'string' ? body.createdAt : null,
    updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : null,
    startedAt: typeof body.startedAt === 'string' ? body.startedAt : null,
    finishedAt: typeof body.finishedAt === 'string' ? body.finishedAt : null,
    result,
    log: Array.isArray(body.log) ? body.log.filter((line): line is string => typeof line === 'string').slice(-80) : undefined,
  };
}

export async function startRunnerJob(input: {
  repositoryId: string;
  url: string;
  notebooks: string[];
}) {
  const body = await runnerRequest('/jobs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return parseSnapshot(body, input.repositoryId);
}

export async function getRunnerJob(repositoryId: string, runnerJobId: string) {
  if (!/^[0-9a-f]{32}$/.test(runnerJobId)) {
    throw new PipelineRunnerError('invalid_response', 'The saved runner job ID is invalid.');
  }
  const body = await runnerRequest(`/jobs/${runnerJobId}`);
  return parseSnapshot(body, repositoryId);
}

export async function cancelRunnerJob(repositoryId: string, runnerJobId: string) {
  if (!/^[0-9a-f]{32}$/.test(runnerJobId)) {
    throw new PipelineRunnerError('invalid_response', 'The saved runner job ID is invalid.');
  }
  const body = await runnerRequest(`/jobs/${runnerJobId}/cancel`, { method: 'POST', body: '{}' });
  return parseSnapshot(body, repositoryId);
}

export interface PipelineNotebookRow {
  id: string;
  name: string;
  language: string;
  finalCategory: string | null;
  ruleCategory: string | null;
  llmCategory: string | null;
  agreement: string | null;
  needsHumanReview: boolean;
  executionStatus: string | null;
  executionDuration: number | null;
  reproducibilityScore: number | null;
}

export interface PipelineRepositoryRow {
  id: string;
  name: string;
  platform: string;
  url: string;
  title: string;
  description: string;
  authors: string[];
  license: string;
  doi: string | null;
  keywords: string[];
  notebookCount: number;
  lastRunStatus: string | null;
  lastRunStartedAt: string | null;
  lastRunFinishedAt: string | null;
  runCount: number;
  averageScorePercent: number | null;
  notebooks: PipelineNotebookRow[];
}

// Reads real, already-executed repositories straight from the pipeline's own
// SQLite database via the local runner service — distinct from the D1-backed
// "imported repository" workspace the rest of the website uses.
export async function listPipelineRepositories(): Promise<PipelineRepositoryRow[]> {
  const body = await runnerRequest('/repositories');
  return Array.isArray(body.repositories) ? (body.repositories as PipelineRepositoryRow[]) : [];
}

export interface DirectRerunJob {
  id: string;
  repositoryId: string;
  notebookId: string;
  notebookPath: string;
  status: 'running' | 'succeeded' | 'partial' | 'failed';
  stage: string;
  progress: number;
  message: string;
  error: string | null;
  log: string[];
  createdAt: string;
  updatedAt: string;
  result: PipelineResult | null;
}

// Reruns one real pipeline notebook directly on the host (via WSL on
// Windows) — no Docker required. Writes into the same real SQLite database
// listPipelineRepositories() reads from.
export async function startDirectRerun(repositoryId: string, notebookId: string): Promise<DirectRerunJob> {
  const body = await runnerRequest('/direct-rerun', {
    method: 'POST',
    body: JSON.stringify({ repositoryId: Number(repositoryId), notebookId: Number(notebookId) }),
  });
  return body as unknown as DirectRerunJob;
}

// Reruns every notebook in a repository (not just one) — same mechanism as
// startDirectRerun, driven by the repository's full notebook list.
export async function startDirectRerunRepository(repositoryId: string): Promise<DirectRerunJob> {
  const body = await runnerRequest('/direct-rerun-repository', {
    method: 'POST',
    body: JSON.stringify({ repositoryId: Number(repositoryId) }),
  });
  return body as unknown as DirectRerunJob;
}

export async function getDirectRerun(jobId: string): Promise<DirectRerunJob> {
  if (!/^[0-9a-f]{32}$/.test(jobId)) {
    throw new PipelineRunnerError('invalid_response', 'Invalid rerun job ID.');
  }
  const body = await runnerRequest(`/direct-rerun/${jobId}`);
  return body as unknown as DirectRerunJob;
}

export interface ClassifyOnlyJob {
  id: string;
  repositoryId: string;
  notebookId: string;
  status: 'running' | 'succeeded' | 'failed';
  message: string;
  error: string | null;
  result: {
    rule_category: string | null;
    llm_category: string | null;
    final_category: string | null;
    agreement_status: string | null;
    needs_human_review: number;
  } | null;
}

// Reclassifies one notebook only — clones/downloads if needed, then runs
// just the classification step. No dependency install, no execution; much
// faster than startDirectRerun.
export async function startClassifyOnly(repositoryId: string, notebookId: string): Promise<ClassifyOnlyJob> {
  const body = await runnerRequest('/classify-only', {
    method: 'POST',
    body: JSON.stringify({ repositoryId: Number(repositoryId), notebookId: Number(notebookId) }),
  });
  return body as unknown as ClassifyOnlyJob;
}

export async function getClassifyOnly(jobId: string): Promise<ClassifyOnlyJob> {
  if (!/^[0-9a-f]{32}$/.test(jobId)) {
    throw new PipelineRunnerError('invalid_response', 'Invalid reclassify job ID.');
  }
  const body = await runnerRequest(`/classify-only/${jobId}`);
  return body as unknown as ClassifyOnlyJob;
}

// Uploads a notebook file straight from the user's computer, registering it
// as a new standalone "local" entry in the same real pipeline database.
export async function uploadLocalNotebook(filename: string, content: string): Promise<{ repositoryId: number; notebookFilename: string }> {
  const body = await runnerRequest('/local-notebooks', {
    method: 'POST',
    body: JSON.stringify({ filename, content }),
  });
  return body as unknown as { repositoryId: number; notebookFilename: string };
}
