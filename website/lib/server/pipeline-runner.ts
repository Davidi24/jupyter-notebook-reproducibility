import { env } from 'cloudflare:workers';
import type { PipelineJobSnapshot } from '@/lib/analysis-contract';

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
