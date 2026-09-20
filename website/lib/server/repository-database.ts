import { env } from 'cloudflare:workers';
import {
  CREATE_ANALYSIS_JOBS_TABLE,
  CREATE_NOTEBOOKS_TABLE,
  CREATE_NOTEBOOK_ANALYSES_TABLE,
  CREATE_REPOSITORIES_TABLE,
  CREATE_SCHEMA_INDEXES,
} from '@/db/schema-sql';
import type { Category, Notebook, RepoRun, Repository } from '@/lib/mock-data';
import type { PipelineJobSnapshot, PipelineNotebookResult } from '@/lib/analysis-contract';
import type { ImportedRepositoryCollection, RepositoryImportSuccess } from '@/lib/repository-import-contract';
import type { RepositorySource } from '@/lib/repository-source';

type RuntimeBindings = { DB?: D1Database };

interface RepositoryRow {
  id: string;
  canonical_url: string;
  platform: Repository['platform'];
  external_id: string;
  name: string;
  description: string;
  authors_json: string;
  license: string;
  doi: string | null;
  keywords_json: string;
  metadata_completeness: number;
  imported_at: string;
  warnings_json: string;
}

interface NotebookRow {
  id: string;
  repository_id: string;
  source_path: string;
  title: string;
  language: string;
  visibility: Notebook['visibility'];
  imported_at: string;
  analysis_status: string;
  analysis_score: number | null;
  rule_category: string | null;
  ai_category: string | null;
  confidence_permille: number | null;
  agreement: string | null;
  final_category: string | null;
  human_review: number | null;
  execution_status: string | null;
  execution_duration_seconds: number | null;
  execution_note: string | null;
  analysis_updated_at: string | null;
}

interface AnalysisJobRow {
  id: string;
  repository_id: string;
  runner_job_id: string;
  status: PipelineJobSnapshot['status'];
  stage: string;
  progress: number;
  message: string;
  error: string | null;
  result_json: string | null;
  target_notebooks_json: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export class RepositoryDatabaseError extends Error {
  constructor(
    readonly kind: 'unavailable' | 'duplicate' | 'write_failed',
    message: string,
    readonly existingRepositoryId?: string,
  ) {
    super(message);
    this.name = 'RepositoryDatabaseError';
  }
}

let schemaReady: Promise<void> | undefined;

function getDatabase() {
  const database = (env as unknown as RuntimeBindings).DB;
  if (!database) {
    throw new RepositoryDatabaseError('unavailable', 'The repository database is not configured.');
  }
  return database;
}

async function ensureSchema(database: D1Database) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await database.prepare('PRAGMA foreign_keys = ON').run();
      await database.prepare(CREATE_REPOSITORIES_TABLE).run();
      await database.prepare(CREATE_NOTEBOOKS_TABLE).run();
      await database.prepare(CREATE_ANALYSIS_JOBS_TABLE).run();
      const analysisJobColumns = await database
        .prepare('PRAGMA table_info(analysis_jobs)')
        .all<{ name: string }>();
      if (!analysisJobColumns.results.some((column) => column.name === 'target_notebooks_json')) {
        await database
          .prepare("ALTER TABLE analysis_jobs ADD COLUMN target_notebooks_json TEXT NOT NULL DEFAULT '[]'")
          .run();
      }
      await database.prepare(CREATE_NOTEBOOK_ANALYSES_TABLE).run();
      for (const statement of CREATE_SCHEMA_INDEXES) {
        await database.prepare(statement).run();
      }
      await database.prepare('PRAGMA optimize').run();
    })().catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  try {
    await schemaReady;
  } catch {
    throw new RepositoryDatabaseError('unavailable', 'The repository database could not be initialized.');
  }
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function dateLabel(value: string | null, fallback = 'Imported') {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function durationLabel(startedAt: string | null, finishedAt: string | null) {
  if (!startedAt || !finishedAt) return 'In progress';
  const seconds = Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

function jobRunFromRow(row: AnalysisJobRow): RepoRun {
  const status: RepoRun['status'] = row.status === 'succeeded'
    ? 'Success'
    : row.status === 'partial'
      ? 'Partial'
      : row.status === 'failed' || row.status === 'cancelled'
        ? 'Failed'
        : 'Running';
  return {
    date: dateLabel(row.started_at ?? row.created_at),
    status,
    duration: durationLabel(row.started_at, row.finished_at),
    note: row.message,
  };
}

function repositoryFromRow(row: RepositoryRow, jobs: AnalysisJobRow[]): Repository {
  const warnings = parseStringArray(row.warnings_json);
  const repositoryJobs = jobs.filter((job) => job.repository_id === row.id).map(jobRunFromRow);
  const runs: RepoRun[] = [
    ...repositoryJobs,
    {
      date: dateLabel(row.imported_at, 'Imported'),
      status: 'Imported',
      duration: '—',
      note: 'Repository metadata and notebook paths imported.',
    },
  ];
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    url: row.canonical_url.replace(/^https?:\/\//, ''),
    description: row.description,
    authors: parseStringArray(row.authors_json),
    license: row.license,
    doi: row.doi ?? undefined,
    keywords: parseStringArray(row.keywords_json),
    metadataCompleteness: row.metadata_completeness,
    lastRun: repositoryJobs.length > 0 ? repositoryJobs[0].date : 'Not run',
    warnings,
    runs,
  };
}

const CATEGORY_LABELS: Record<string, Category> = {
  visualization: 'Visualization',
  data_analysis: 'Data analysis',
  data_preparation: 'Data preparation',
  machine_learning: 'Machine learning',
  modeling: 'Modeling',
  simulation: 'Simulation',
  tutorial: 'Tutorial',
  software_development: 'Software development',
  mixed_purpose: 'Mixed purpose',
  uncertain: 'Uncertain',
};

function categoryLabel(value: string | null): Category | null {
  if (!value) return null;
  return CATEGORY_LABELS[value.toLowerCase().replace(/[ -]+/g, '_')] ?? null;
}

function notebookFromRow(row: NotebookRow): Notebook {
  const ruleCategory = categoryLabel(row.rule_category);
  const aiCategory = categoryLabel(row.ai_category);
  const hasAnalysis = row.execution_status !== null || row.analysis_score !== null || ruleCategory !== null;
  const executionStatus: Notebook['executionStatus'] = row.execution_status === 'SUCCESS'
    ? 'Success'
    : row.execution_status === 'SUCCESS_WITH_ERRORS'
      ? 'Partial'
      : row.execution_status
        ? 'Failed'
        : row.analysis_status === 'Running'
          ? 'Running'
          : row.analysis_status === 'Queued'
            ? 'Queued'
            : row.analysis_status === 'Failed'
              ? 'Failed'
              : 'Not run';
  const humanReview = row.human_review === 1;
  const finalCategory = humanReview
    ? 'Pending review'
    : categoryLabel(row.final_category) ?? (hasAnalysis ? ruleCategory ?? 'Pending review' : 'Pending analysis');
  return {
    id: row.id,
    repositoryId: row.repository_id,
    sourcePath: row.source_path,
    title: row.title,
    language: row.language,
    score: row.analysis_score,
    ruleCategory,
    aiCategory,
    confidence: row.confidence_permille === null ? null : row.confidence_permille / 1000,
    agreement: row.agreement === 'Agreed' ? 'Agreed' : row.agreement === 'Disagreed' ? 'Disagreed' : null,
    finalCategory,
    humanReview,
    visibility: row.visibility,
    updated: row.analysis_updated_at ? dateLabel(row.analysis_updated_at) : 'Imported',
    executionStatus,
    executionNote: row.execution_note ?? (
      executionStatus === 'Running' || executionStatus === 'Queued'
        ? 'The reproducibility pipeline is currently processing this repository.'
        : 'Repository imported successfully. Execution and classification have not started.'
    ),
  };
}

export async function findRepositoryByCanonicalUrl(canonicalUrl: string) {
  const database = getDatabase();
  await ensureSchema(database);
  return database
    .prepare('SELECT id FROM repositories WHERE canonical_url = ? LIMIT 1')
    .bind(canonicalUrl)
    .first<{ id: string }>();
}

export async function listImportedRepositories(): Promise<ImportedRepositoryCollection> {
  const database = getDatabase();
  await ensureSchema(database);
  try {
    const [repositoryResult, notebookResult, jobResult] = await Promise.all([
      database.prepare('SELECT * FROM repositories ORDER BY imported_at DESC').all<RepositoryRow>(),
      database.prepare(`
        SELECT
          notebooks.*,
          notebook_analyses.score AS analysis_score,
          notebook_analyses.rule_category,
          notebook_analyses.ai_category,
          notebook_analyses.confidence_permille,
          notebook_analyses.agreement,
          notebook_analyses.final_category,
          notebook_analyses.human_review,
          notebook_analyses.execution_status,
          notebook_analyses.execution_duration_seconds,
          notebook_analyses.execution_note,
          notebook_analyses.updated_at AS analysis_updated_at
        FROM notebooks
        LEFT JOIN notebook_analyses ON notebook_analyses.notebook_id = notebooks.id
        ORDER BY notebooks.imported_at DESC, notebooks.source_path ASC
      `).all<NotebookRow>(),
      database.prepare('SELECT * FROM analysis_jobs ORDER BY created_at DESC').all<AnalysisJobRow>(),
    ]);
    const repositories = repositoryResult.results.map((row) => repositoryFromRow(row, jobResult.results));
    const notebooks = notebookResult.results.map(notebookFromRow);
    return { repositories, notebooks };
  } catch {
    throw new RepositoryDatabaseError('unavailable', 'Imported repositories could not be loaded.');
  }
}

export async function getRepositoryAnalysisInput(repositoryId: string) {
  const database = getDatabase();
  await ensureSchema(database);
  const repository = await database
    .prepare('SELECT id, canonical_url FROM repositories WHERE id = ? LIMIT 1')
    .bind(repositoryId)
    .first<{ id: string; canonical_url: string }>();
  if (!repository) return null;
  const notebooksResult = await database
    .prepare('SELECT id, source_path FROM notebooks WHERE repository_id = ? ORDER BY source_path')
    .bind(repositoryId)
    .all<{ id: string; source_path: string }>();
  return {
    id: repository.id,
    url: repository.canonical_url,
    notebooks: notebooksResult.results.map((notebook) => notebook.source_path),
  };
}

export async function getNotebookAnalysisInput(notebookId: string) {
  const database = getDatabase();
  await ensureSchema(database);
  const row = await database.prepare(`
    SELECT
      notebooks.id AS notebook_id,
      notebooks.repository_id,
      notebooks.source_path,
      repositories.canonical_url
    FROM notebooks
    INNER JOIN repositories ON repositories.id = notebooks.repository_id
    WHERE notebooks.id = ?
    LIMIT 1
  `).bind(notebookId).first<{
    notebook_id: string;
    repository_id: string;
    source_path: string;
    canonical_url: string;
  }>();
  if (!row) return null;
  return {
    notebookId: row.notebook_id,
    repositoryId: row.repository_id,
    url: row.canonical_url,
    notebooks: [row.source_path],
  };
}

function snapshotFromJobRow(row: AnalysisJobRow): PipelineJobSnapshot {
  let result: PipelineJobSnapshot['result'];
  try {
    result = row.result_json ? JSON.parse(row.result_json) as PipelineJobSnapshot['result'] : undefined;
  } catch {
    result = undefined;
  }
  return {
    id: row.runner_job_id,
    repositoryId: row.repository_id,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    message: row.message,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    result,
    targetNotebooks: parseStringArray(row.target_notebooks_json),
  };
}

export async function getLatestAnalysisJob(repositoryId: string) {
  const database = getDatabase();
  await ensureSchema(database);
  const row = await database
    .prepare('SELECT * FROM analysis_jobs WHERE repository_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(repositoryId)
    .first<AnalysisJobRow>();
  return row ? snapshotFromJobRow(row) : null;
}

export async function createAnalysisJob(snapshot: PipelineJobSnapshot, targetNotebooks: string[] = []) {
  if (!snapshot.id) throw new RepositoryDatabaseError('write_failed', 'The runner did not provide a job ID.');
  const database = getDatabase();
  await ensureSchema(database);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  try {
    await database.batch([
      database.prepare(`
        INSERT INTO analysis_jobs (
          id, repository_id, runner_job_id, status, stage, progress, message, error,
          result_json, target_notebooks_json, created_at, updated_at, started_at, finished_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        snapshot.repositoryId,
        snapshot.id,
        snapshot.status,
        snapshot.stage,
        snapshot.progress,
        snapshot.message,
        snapshot.error,
        snapshot.result ? JSON.stringify(snapshot.result) : null,
        JSON.stringify(targetNotebooks),
        snapshot.createdAt ?? now,
        snapshot.updatedAt ?? now,
        snapshot.startedAt,
        snapshot.finishedAt,
      ),
      targetNotebooks.length > 0
        ? database.prepare(`
            UPDATE notebooks SET analysis_status = ?
            WHERE repository_id = ? AND source_path IN (SELECT value FROM json_each(?))
          `).bind('Queued', snapshot.repositoryId, JSON.stringify(targetNotebooks))
        : database.prepare('UPDATE notebooks SET analysis_status = ? WHERE repository_id = ?')
          .bind('Queued', snapshot.repositoryId),
    ]);
  } catch (error) {
    throw new RepositoryDatabaseError(
      'write_failed',
      error instanceof Error ? error.message : 'The analysis job could not be saved.',
    );
  }
  return snapshot;
}

function analysisStatusForJob(status: PipelineJobSnapshot['status']) {
  if (status === 'queued' || status === 'preparing' || status === 'building') return 'Queued';
  if (status === 'running') return 'Running';
  if (status === 'succeeded') return 'Completed';
  if (status === 'partial') return 'Partial';
  if (status === 'failed' || status === 'cancelled') return 'Failed';
  return 'Pending';
}

function confidencePermille(result: PipelineNotebookResult) {
  const confidence = result.llmConfidence ?? result.ruleConfidence;
  return confidence === null ? null : Math.max(0, Math.min(1000, Math.round(confidence * 1000)));
}

function agreementLabel(result: PipelineNotebookResult) {
  if (result.agreementStatus === 'AGREED' || result.agreementStatus === 'HUMAN_REVIEWED') return 'Agreed';
  if (result.llmCategory && result.agreementStatus) return 'Disagreed';
  return null;
}

export async function syncAnalysisJob(snapshot: PipelineJobSnapshot) {
  if (!snapshot.id) throw new RepositoryDatabaseError('write_failed', 'The runner job ID is missing.');
  const database = getDatabase();
  await ensureSchema(database);
  const stored = await database
    .prepare('SELECT id, target_notebooks_json FROM analysis_jobs WHERE runner_job_id = ? AND repository_id = ? LIMIT 1')
    .bind(snapshot.id, snapshot.repositoryId)
    .first<{ id: string; target_notebooks_json: string }>();
  if (!stored) throw new RepositoryDatabaseError('write_failed', 'The analysis job is not registered.');

  const now = snapshot.updatedAt ?? new Date().toISOString();
  const targetNotebooks = parseStringArray(stored.target_notebooks_json);
  const statements = [
    database.prepare(`
      UPDATE analysis_jobs
      SET status = ?, stage = ?, progress = ?, message = ?, error = ?, result_json = ?,
          updated_at = ?, started_at = ?, finished_at = ?
      WHERE id = ?
    `).bind(
      snapshot.status,
      snapshot.stage,
      snapshot.progress,
      snapshot.message,
      snapshot.error,
      snapshot.result ? JSON.stringify(snapshot.result) : null,
      now,
      snapshot.startedAt,
      snapshot.finishedAt,
      stored.id,
    ),
    targetNotebooks.length > 0
      ? database.prepare(`
          UPDATE notebooks SET analysis_status = ?
          WHERE repository_id = ? AND source_path IN (SELECT value FROM json_each(?))
        `).bind(analysisStatusForJob(snapshot.status), snapshot.repositoryId, JSON.stringify(targetNotebooks))
      : database.prepare('UPDATE notebooks SET analysis_status = ? WHERE repository_id = ?')
        .bind(analysisStatusForJob(snapshot.status), snapshot.repositoryId),
  ];

  if (snapshot.result) {
    const notebookRows = await database
      .prepare('SELECT id, source_path FROM notebooks WHERE repository_id = ?')
      .bind(snapshot.repositoryId)
      .all<{ id: string; source_path: string }>();
    const notebookIds = new Map(notebookRows.results.map((row) => [row.source_path, row.id]));
    for (const result of snapshot.result.notebooks) {
      const notebookId = notebookIds.get(result.path);
      if (!notebookId) continue;
      const executionStatus = result.executionStatus ?? (snapshot.status === 'failed' ? 'FAIL' : 'NOT_RUN');
      const note = result.errorMessage ?? result.warning ?? (
        executionStatus === 'SUCCESS'
          ? 'Notebook executed successfully and its outputs were compared.'
          : executionStatus === 'SUCCESS_WITH_ERRORS'
            ? 'Notebook executed, but one or more cells produced errors.'
            : snapshot.result.error ?? 'The notebook did not complete successfully.'
      );
      statements.push(database.prepare(`
        INSERT INTO notebook_analyses (
          notebook_id, analysis_job_id, score, rule_category, ai_category,
          confidence_permille, agreement, final_category, human_review,
          execution_status, execution_duration_seconds, execution_note, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(notebook_id) DO UPDATE SET
          analysis_job_id = excluded.analysis_job_id,
          score = excluded.score,
          rule_category = excluded.rule_category,
          ai_category = excluded.ai_category,
          confidence_permille = excluded.confidence_permille,
          agreement = excluded.agreement,
          final_category = excluded.final_category,
          human_review = excluded.human_review,
          execution_status = excluded.execution_status,
          execution_duration_seconds = excluded.execution_duration_seconds,
          execution_note = excluded.execution_note,
          updated_at = excluded.updated_at
      `).bind(
        notebookId,
        stored.id,
        result.reproducibilityScore,
        result.ruleCategory,
        result.llmCategory,
        confidencePermille(result),
        agreementLabel(result),
        result.finalCategory,
        result.needsHumanReview ? 1 : 0,
        executionStatus,
        result.durationSeconds === null ? null : Math.round(result.durationSeconds),
        note,
        now,
      ));
    }
  }

  try {
    for (let index = 0; index < statements.length; index += 100) {
      await database.batch(statements.slice(index, index + 100));
    }
  } catch (error) {
    throw new RepositoryDatabaseError(
      'write_failed',
      error instanceof Error ? error.message : 'The pipeline results could not be saved.',
    );
  }
  return { ...snapshot, targetNotebooks };
}

export async function saveImportedRepository(
  source: RepositorySource,
  imported: RepositoryImportSuccess,
) {
  const database = getDatabase();
  await ensureSchema(database);

  const existing = await findRepositoryByCanonicalUrl(source.canonicalUrl);
  if (existing) {
    throw new RepositoryDatabaseError('duplicate', 'This repository is already in the workspace.', existing.id);
  }

  const importedAt = new Date().toISOString();
  const repositoryStatement = database.prepare(`
    INSERT INTO repositories (
      id, canonical_url, platform, external_id, name, description, authors_json,
      license, doi, keywords_json, metadata_completeness, default_branch,
      source_updated_at, imported_at, import_status, warnings_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    imported.repository.id,
    source.canonicalUrl,
    imported.repository.platform,
    source.externalId,
    imported.repository.name,
    imported.repository.description,
    JSON.stringify(imported.repository.authors),
    imported.repository.license,
    imported.repository.doi ?? null,
    JSON.stringify(imported.repository.keywords),
    imported.repository.metadataCompleteness,
    null,
    null,
    importedAt,
    'Imported',
    JSON.stringify(imported.warnings),
  );

  const notebookStatements = imported.notebooks.map((notebook) => database.prepare(`
    INSERT INTO notebooks (
      id, repository_id, source_path, title, language, visibility, imported_at, analysis_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    notebook.id,
    imported.repository.id,
    notebook.sourcePath ?? notebook.title,
    notebook.title,
    notebook.language,
    notebook.visibility,
    importedAt,
    'Pending',
  ));

  const statements = [repositoryStatement, ...notebookStatements];
  try {
    for (let index = 0; index < statements.length; index += 100) {
      await database.batch(statements.slice(index, index + 100));
    }
  } catch (error) {
    await database.prepare('DELETE FROM repositories WHERE id = ?').bind(imported.repository.id).run().catch(() => undefined);
    const duplicate = await findRepositoryByCanonicalUrl(source.canonicalUrl).catch(() => null);
    if (duplicate) {
      throw new RepositoryDatabaseError('duplicate', 'This repository is already in the workspace.', duplicate.id);
    }
    const detail = error instanceof Error ? error.message : '';
    throw new RepositoryDatabaseError('write_failed', detail || 'The imported repository could not be saved.');
  }
}

const NOTEBOOK_PATH_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.ipynb$/;

export class NotebookValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotebookValidationError';
  }
}

export function validateNotebookPath(rawPath: string): string {
  const path = rawPath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!path) throw new NotebookValidationError('Enter a notebook path.');
  if (path.length > 512) throw new NotebookValidationError('The notebook path is too long.');
  if (path.split('/').some((part) => part === '..' || part === '.')) {
    throw new NotebookValidationError('The notebook path cannot contain "." or "..".');
  }
  if (!NOTEBOOK_PATH_PATTERN.test(path)) {
    throw new NotebookValidationError('Enter a relative path ending in .ipynb, e.g. notebooks/analysis.ipynb.');
  }
  return path;
}

export async function addNotebookToRepository(repositoryId: string, rawSourcePath: string): Promise<Notebook> {
  const sourcePath = validateNotebookPath(rawSourcePath);
  const database = getDatabase();
  await ensureSchema(database);

  const repository = await database
    .prepare('SELECT id FROM repositories WHERE id = ? LIMIT 1')
    .bind(repositoryId)
    .first<{ id: string }>();
  if (!repository) {
    throw new RepositoryDatabaseError('write_failed', 'The repository was not found.');
  }

  const existing = await database
    .prepare('SELECT id FROM notebooks WHERE repository_id = ? AND source_path = ? LIMIT 1')
    .bind(repositoryId, sourcePath)
    .first<{ id: string }>();
  if (existing) {
    throw new RepositoryDatabaseError('duplicate', 'This notebook path already exists in the repository.');
  }

  const id = crypto.randomUUID();
  const importedAt = new Date().toISOString();
  const title = sourcePath.split('/').pop() || sourcePath;

  try {
    await database.prepare(`
      INSERT INTO notebooks (
        id, repository_id, source_path, title, language, visibility, imported_at, analysis_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, repositoryId, sourcePath, title, 'Pending inspection', 'Private', importedAt, 'Pending').run();
  } catch (error) {
    throw new RepositoryDatabaseError(
      'write_failed',
      error instanceof Error ? error.message : 'The notebook could not be saved.',
    );
  }

  const notebook: Notebook = {
    id,
    repositoryId,
    sourcePath,
    title,
    language: 'Pending inspection',
    score: null,
    ruleCategory: null,
    aiCategory: null,
    confidence: null,
    agreement: null,
    finalCategory: 'Pending analysis',
    humanReview: false,
    visibility: 'Private',
    updated: 'Just now',
    executionStatus: 'Not run',
    executionNote: 'Notebook added to the repository. Run analysis to execute and classify it.',
  };
  return notebook;
}

export function getOptionalGithubToken() {
  const token = (env as unknown as RuntimeBindings & { GITHUB_TOKEN?: string }).GITHUB_TOKEN;
  return typeof token === 'string' && token.trim() ? token.trim() : undefined;
}
