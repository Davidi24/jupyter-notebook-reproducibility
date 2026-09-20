import { NextResponse } from 'next/server';
import type { PipelineActionFailure } from '@/lib/analysis-contract';
import { launchNotebookAnalysis, RepositoryAnalysisError } from '@/lib/server/repository-analysis';

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

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return failure('NOTEBOOK_NOT_FOUND', 'The notebook ID is invalid.', 404, false);
  }
  try {
    const snapshot = await launchNotebookAnalysis(id);
    return NextResponse.json(snapshot, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof RepositoryAnalysisError) {
      if (error.kind === 'notebook_not_found') return failure('NOTEBOOK_NOT_FOUND', error.message, 404, false);
      if (error.kind === 'busy') return failure('PIPELINE_BUSY', error.message, 409, true);
      if (error.kind === 'unavailable') return failure('PIPELINE_UNAVAILABLE', error.message, 503, true);
      return failure('PIPELINE_FAILED', error.message, 502, true);
    }
    console.error('Notebook analysis request failed', error);
    return failure('PIPELINE_FAILED', 'The notebook run could not be started.', 500, true);
  }
}
