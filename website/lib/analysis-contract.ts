export type PipelineJobStatus =
  | 'queued'
  | 'preparing'
  | 'building'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'unavailable';

export interface PipelineNotebookResult {
  path: string;
  language: string;
  executionStatus: string | null;
  durationSeconds: number | null;
  errorType: string | null;
  errorCategory: string | null;
  errorMessage: string | null;
  errorCount: number;
  totalCodeCells?: number | null;
  identicalCellsCount?: number | null;
  differentCellsCount?: number | null;
  nondeterministicCellsCount?: number | null;
  reproducibilityScore: number | null;
  ruleCategory: string | null;
  ruleConfidence: number | null;
  llmCategory: string | null;
  llmConfidence: number | null;
  agreementStatus: string | null;
  needsHumanReview: boolean;
  warning: string | null;
  finalCategory: string | null;
}

export interface PipelineResult {
  status: 'succeeded' | 'partial' | 'failed';
  pipelineStatus: string;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationSeconds: number | null;
  notebooks: PipelineNotebookResult[];
}

export interface PipelineJobSnapshot {
  id: string | null;
  repositoryId: string;
  status: PipelineJobStatus;
  stage: string;
  progress: number;
  notebookCount?: number;
  targetNotebooks?: string[];
  message: string;
  error: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  result?: PipelineResult | null;
  log?: string[];
}

export interface PipelineActionFailure {
  error: {
    code: 'REPOSITORY_NOT_FOUND' | 'NOTEBOOK_NOT_FOUND' | 'NO_NOTEBOOKS' | 'PIPELINE_BUSY' | 'PIPELINE_UNAVAILABLE' | 'PIPELINE_FAILED';
    message: string;
    retryable: boolean;
  };
}
