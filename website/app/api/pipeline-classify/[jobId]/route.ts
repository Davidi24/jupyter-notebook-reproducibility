import { NextResponse } from 'next/server';
import { PipelineRunnerError, getClassifyOnly } from '@/lib/server/pipeline-runner';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  try {
    const job = await getClassifyOnly(jobId);
    return NextResponse.json(job, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof PipelineRunnerError
      ? error.message
      : 'The reclassify status could not be read.';
    return NextResponse.json({ error: { message } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
