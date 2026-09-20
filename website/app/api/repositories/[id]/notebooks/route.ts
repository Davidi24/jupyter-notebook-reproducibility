import { NextResponse } from 'next/server';
import {
  addNotebookToRepository,
  NotebookValidationError,
  RepositoryDatabaseError,
} from '@/lib/server/repository-database';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

interface AddNotebookFailure {
  error: { code: 'INVALID_REQUEST' | 'INVALID_PATH' | 'REPOSITORY_NOT_FOUND' | 'DUPLICATE_NOTEBOOK' | 'DATABASE_UNAVAILABLE'; message: string };
}

function failure(code: AddNotebookFailure['error']['code'], message: string, status: number) {
  const body: AddNotebookFailure = { error: { code, message } };
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return failure('REPOSITORY_NOT_FOUND', 'The repository ID is invalid.', 404);
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4096) {
    return failure('INVALID_REQUEST', 'The request is too large.', 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return failure('INVALID_REQUEST', 'Send a JSON object containing a notebook path.', 400);
  }

  const path = body && typeof body === 'object' ? (body as { path?: unknown }).path : undefined;
  if (typeof path !== 'string') {
    return failure('INVALID_REQUEST', 'A notebook path is required.', 400);
  }

  try {
    const notebook = await addNotebookToRepository(id, path);
    return NextResponse.json({ notebook }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof NotebookValidationError) {
      return failure('INVALID_PATH', error.message, 400);
    }
    if (error instanceof RepositoryDatabaseError) {
      if (error.kind === 'duplicate') return failure('DUPLICATE_NOTEBOOK', error.message, 409);
      if (error.message === 'The repository was not found.') return failure('REPOSITORY_NOT_FOUND', error.message, 404);
      return failure('DATABASE_UNAVAILABLE', 'The notebook was validated but could not be saved. Try again.', 503);
    }
    console.error('Add notebook failed', error);
    return failure('DATABASE_UNAVAILABLE', 'The notebook could not be added because of an unexpected error.', 500);
  }
}
