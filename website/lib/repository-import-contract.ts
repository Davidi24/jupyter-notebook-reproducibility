import type { Notebook, Repository } from './mock-data';
import type { PipelineJobSnapshot } from './analysis-contract';

export type RepositoryImportErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_URL'
  | 'UNSUPPORTED_SOURCE'
  | 'DUPLICATE_REPOSITORY'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_PRIVATE'
  | 'SOURCE_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'IMPORT_TIMEOUT'
  | 'REPOSITORY_TOO_LARGE'
  | 'DATABASE_UNAVAILABLE'
  | 'IMPORT_FAILED';

export interface RepositoryImportSuccess {
  repository: Repository;
  notebooks: Notebook[];
  warnings: string[];
  analysis?: PipelineJobSnapshot;
}

export interface ImportedRepositoryCollection {
  repositories: Repository[];
  notebooks: Notebook[];
}

export interface RepositoryImportFailure {
  error: {
    code: RepositoryImportErrorCode;
    message: string;
    retryable: boolean;
    existingRepositoryId?: string;
  };
}
