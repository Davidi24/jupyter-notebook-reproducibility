import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const repositories = sqliteTable(
  'repositories',
  {
    id: text('id').primaryKey(),
    canonicalUrl: text('canonical_url').notNull(),
    platform: text('platform').notNull(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    authorsJson: text('authors_json').notNull(),
    license: text('license').notNull(),
    doi: text('doi'),
    keywordsJson: text('keywords_json').notNull(),
    metadataCompleteness: integer('metadata_completeness').notNull(),
    defaultBranch: text('default_branch'),
    sourceUpdatedAt: text('source_updated_at'),
    importedAt: text('imported_at').notNull(),
    importStatus: text('import_status').notNull(),
    warningsJson: text('warnings_json').notNull(),
  },
  (table) => [
    uniqueIndex('idx_repositories_canonical_url').on(table.canonicalUrl),
    index('idx_repositories_platform').on(table.platform),
    index('idx_repositories_imported_at').on(table.importedAt),
  ],
);

export const notebooks = sqliteTable(
  'notebooks',
  {
    id: text('id').primaryKey(),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id, { onDelete: 'cascade' }),
    sourcePath: text('source_path').notNull(),
    title: text('title').notNull(),
    language: text('language').notNull(),
    visibility: text('visibility').notNull(),
    importedAt: text('imported_at').notNull(),
    analysisStatus: text('analysis_status').notNull(),
  },
  (table) => [
    uniqueIndex('idx_notebooks_repository_path').on(table.repositoryId, table.sourcePath),
    index('idx_notebooks_repository_id').on(table.repositoryId),
  ],
);

export const analysisJobs = sqliteTable(
  'analysis_jobs',
  {
    id: text('id').primaryKey(),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id, { onDelete: 'cascade' }),
    runnerJobId: text('runner_job_id').notNull(),
    status: text('status').notNull(),
    stage: text('stage').notNull(),
    progress: integer('progress').notNull(),
    message: text('message').notNull(),
    error: text('error'),
    resultJson: text('result_json'),
    targetNotebooksJson: text('target_notebooks_json').notNull().default('[]'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
  },
  (table) => [
    uniqueIndex('idx_analysis_jobs_runner_job_id').on(table.runnerJobId),
    index('idx_analysis_jobs_repository_created').on(table.repositoryId, table.createdAt),
    index('idx_analysis_jobs_status').on(table.status),
  ],
);

export const notebookAnalyses = sqliteTable(
  'notebook_analyses',
  {
    notebookId: text('notebook_id')
      .primaryKey()
      .references(() => notebooks.id, { onDelete: 'cascade' }),
    analysisJobId: text('analysis_job_id')
      .notNull()
      .references(() => analysisJobs.id, { onDelete: 'cascade' }),
    score: integer('score'),
    ruleCategory: text('rule_category'),
    aiCategory: text('ai_category'),
    confidencePermille: integer('confidence_permille'),
    agreement: text('agreement'),
    finalCategory: text('final_category'),
    humanReview: integer('human_review', { mode: 'boolean' }).notNull(),
    executionStatus: text('execution_status').notNull(),
    executionDurationSeconds: integer('execution_duration_seconds'),
    executionNote: text('execution_note'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_notebook_analyses_job_id').on(table.analysisJobId)],
);
