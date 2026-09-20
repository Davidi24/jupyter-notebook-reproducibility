import { NextResponse } from 'next/server';
import type { PipelineActionFailure } from '@/lib/analysis-contract';
import {
  cancelRepositoryAnalysis,
  launchRepositoryAnalysis,
  refreshRepositoryAnalysis,
  RepositoryAnalysisError,
  unavailableAnalysis,
} from '@/lib/server/repository-analysis';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

function failure(
  code: PipelineActionFailure['error']['code'],
  message: string,
  status: number,
  retryable: boolean,
) {
  const body: PipelineActionFailure = { error: { code, message, retryable } };
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function repositoryId(context: RouteContext) {
  const { id } = await context.params;
  return /^[0-9a-f-]{36}$/.test(id) ? id : null;
}

function analysisFailure(error: unknown, repositoryIdValue: string) {
  if (error instanceof RepositoryAnalysisError) {
    if (error.kind === 'not_found') return failure('REPOSITORY_NOT_FOUND', error.message, 404, false);
    if (error.kind === 'no_notebooks') return failure('NO_NOTEBOOKS', error.message, 422, false);
    if (error.kind === 'unavailable') {
      return NextResponse.json(unavailableAnalysis(repositoryIdValue, error.message), {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    return failure('PIPELINE_FAILED', error.message, 502, true);
  }
  console.error('Repository analysis request failed', error);
  return failure('PIPELINE_FAILED', 'The analysis request failed unexpectedly.', 500, true);
}

export async function GET(_request: Request, context: RouteContext) {
  const id = await repositoryId(context);
  if (!id) return failure('REPOSITORY_NOT_FOUND', 'The repository ID is invalid.', 404, false);
  try {
    const snapshot = await refreshRepositoryAnalysis(id);
    return NextResponse.json(
      snapshot ?? unavailableAnalysis(id, 'No analysis run has been started yet.'),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return analysisFailure(error, id);
  }
}

export async function POST(_request: Request, context: RouteContext) {
  const id = await repositoryId(context);
  if (!id) return failure('REPOSITORY_NOT_FOUND', 'The repository ID is invalid.', 404, false);
  try {
    const snapshot = await launchRepositoryAnalysis(id);
    return NextResponse.json(snapshot, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return analysisFailure(error, id);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const id = await repositoryId(context);
  if (!id) return failure('REPOSITORY_NOT_FOUND', 'The repository ID is invalid.', 404, false);
  try {
    const snapshot = await cancelRepositoryAnalysis(id);
    return NextResponse.json(
      snapshot ?? unavailableAnalysis(id, 'No active analysis run was found.'),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return analysisFailure(error, id);
  }
}
