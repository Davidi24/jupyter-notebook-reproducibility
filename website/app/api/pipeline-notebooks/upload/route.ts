import { NextResponse } from 'next/server';
import { PipelineRunnerError, uploadLocalNotebook } from '@/lib/server/pipeline-runner';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { filename?: unknown; content?: unknown } | null;
    const filename = typeof body?.filename === 'string' ? body.filename : null;
    const content = typeof body?.content === 'string' ? body.content : null;
    if (!filename || !content) {
      return NextResponse.json({ error: { message: 'filename and content are required.' } }, { status: 400 });
    }
    const result = await uploadLocalNotebook(filename, content);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof PipelineRunnerError
      ? error.message
      : 'The notebook could not be uploaded.';
    return NextResponse.json({ error: { message } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
