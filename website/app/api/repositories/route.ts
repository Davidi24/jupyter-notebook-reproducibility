import { NextResponse } from 'next/server';
import type { RepositoryImportFailure } from '@/lib/repository-import-contract';
import { RepositoryDatabaseError, listImportedRepositories } from '@/lib/server/repository-database';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await listImportedRepositories();
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof RepositoryDatabaseError
      ? 'Imported repositories are temporarily unavailable. Refresh to try again.'
      : 'Imported repositories could not be loaded.';
    const body: RepositoryImportFailure = {
      error: { code: 'DATABASE_UNAVAILABLE', message, retryable: true },
    };
    return NextResponse.json(body, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
