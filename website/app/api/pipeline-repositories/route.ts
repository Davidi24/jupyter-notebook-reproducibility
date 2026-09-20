import { NextResponse } from 'next/server';
import { PipelineRunnerError, listPipelineRepositories } from '@/lib/server/pipeline-runner';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const repositories = await listPipelineRepositories();
    return NextResponse.json({ repositories }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof PipelineRunnerError
      ? error.message
      : 'The pipeline database could not be reached.';
    return NextResponse.json(
      { error: { message } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
