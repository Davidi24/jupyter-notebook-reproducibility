import { NextResponse } from 'next/server';
import type { RepositoryImportErrorCode, RepositoryImportFailure } from '@/lib/repository-import-contract';
import { parseRepositorySource, SourceValidationError } from '@/lib/repository-source';
import {
  findRepositoryByCanonicalUrl,
  getOptionalGithubToken,
  RepositoryDatabaseError,
  saveImportedRepository,
} from '@/lib/server/repository-database';
import { importRemoteRepository, RepositoryProviderError } from '@/lib/server/repository-provider';
import {
  launchRepositoryAnalysis,
  RepositoryAnalysisError,
  unavailableAnalysis,
} from '@/lib/server/repository-analysis';

export const dynamic = 'force-dynamic';

function failure(
  code: RepositoryImportErrorCode,
  message: string,
  status: number,
  retryable: boolean,
  existingRepositoryId?: string,
) {
  const body: RepositoryImportFailure = {
    error: { code, message, retryable, existingRepositoryId },
  };
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4096) {
    return failure('INVALID_REQUEST', 'The import request is too large.', 413, false);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return failure('INVALID_REQUEST', 'Send a JSON object containing a repository URL.', 400, false);
  }
  if (rawBody.length > 4096) {
    return failure('INVALID_REQUEST', 'The import request is too large.', 413, false);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return failure('INVALID_REQUEST', 'Send a JSON object containing a repository URL.', 400, false);
  }

  if (!body || typeof body !== 'object' || typeof (body as { url?: unknown }).url !== 'string') {
    return failure('INVALID_REQUEST', 'A repository URL is required.', 400, false);
  }

  try {
    const source = parseRepositorySource((body as { url: string }).url);
    const existing = await findRepositoryByCanonicalUrl(source.canonicalUrl);
    if (existing) {
      return failure(
        'DUPLICATE_REPOSITORY',
        'This repository is already in your workspace.',
        409,
        false,
        existing.id,
      );
    }

    const imported = await importRemoteRepository(source, {
      githubToken: getOptionalGithubToken(),
      signal: request.signal,
    });
    await saveImportedRepository(source, imported);
    try {
      imported.analysis = await launchRepositoryAnalysis(imported.repository.id);
    } catch (analysisError) {
      const message = analysisError instanceof RepositoryAnalysisError
        ? analysisError.message
        : 'The reproducibility runner could not be started.';
      imported.analysis = unavailableAnalysis(imported.repository.id, message);
      imported.warnings = [...imported.warnings, `${message} You can start analysis from the repository page.`];
      imported.repository.warnings = imported.warnings;
    }
    return NextResponse.json(imported, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SourceValidationError) {
      return failure(error.code, error.message, 400, false);
    }
    if (error instanceof RepositoryProviderError) {
      return failure(error.code, error.message, error.status, error.retryable);
    }
    if (error instanceof RepositoryDatabaseError) {
      if (error.kind === 'duplicate') {
        return failure('DUPLICATE_REPOSITORY', error.message, 409, false, error.existingRepositoryId);
      }
      return failure(
        'DATABASE_UNAVAILABLE',
        'The repository was read successfully but could not be saved. Try again.',
        503,
        true,
      );
    }

    console.error('Repository import failed', error);
    return failure('IMPORT_FAILED', 'The repository could not be imported because of an unexpected error.', 500, true);
  }
}
