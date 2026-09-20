import { NextResponse } from 'next/server';
import { PipelineRunnerError, startDirectRerun } from '@/lib/server/pipeline-runner';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { repositoryId?: unknown; notebookId?: unknown } | null;
    const repositoryId = typeof body?.repositoryId === 'string' ? body.repositoryId : null;
    const notebookId = typeof body?.notebookId === 'string' ? body.notebookId : null;
    if (!repositoryId || !notebookId) {
      return NextResponse.json(
        { error: { message: 'repositoryId and notebookId are required.' } },
        { status: 400 },
      );
    }
    const job = await startDirectRerun(repositoryId, notebookId);
    return NextResponse.json(job, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof PipelineRunnerError
      ? error.message
      : 'The rerun could not be started.';
    return NextResponse.json({ error: { message } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
