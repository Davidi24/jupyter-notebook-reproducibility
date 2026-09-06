export const CREATE_REPOSITORIES_TABLE = `
CREATE TABLE IF NOT EXISTS repositories (
  id TEXT PRIMARY KEY NOT NULL,
  canonical_url TEXT NOT NULL,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  authors_json TEXT NOT NULL,
  license TEXT NOT NULL,
  doi TEXT,
  keywords_json TEXT NOT NULL,
  metadata_completeness INTEGER NOT NULL,
  default_branch TEXT,
  source_updated_at TEXT,
  imported_at TEXT NOT NULL,
  import_status TEXT NOT NULL,
  warnings_json TEXT NOT NULL
)`;

export const CREATE_NOTEBOOKS_TABLE = `
CREATE TABLE IF NOT EXISTS notebooks (
  id TEXT PRIMARY KEY NOT NULL,
  repository_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  title TEXT NOT NULL,
  language TEXT NOT NULL,
  visibility TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  analysis_status TEXT NOT NULL,
  FOREIGN KEY (repository_id) REFERENCES repositories(id) ON UPDATE no action ON DELETE cascade
)`;

export const CREATE_ANALYSIS_JOBS_TABLE = `
CREATE TABLE IF NOT EXISTS analysis_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  repository_id TEXT NOT NULL,
  runner_job_id TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  progress INTEGER NOT NULL,
  message TEXT NOT NULL,
  error TEXT,
  result_json TEXT,
  target_notebooks_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY (repository_id) REFERENCES repositories(id) ON UPDATE no action ON DELETE cascade
)`;

export const CREATE_NOTEBOOK_ANALYSES_TABLE = `
CREATE TABLE IF NOT EXISTS notebook_analyses (
  notebook_id TEXT PRIMARY KEY NOT NULL,
  analysis_job_id TEXT NOT NULL,
  score INTEGER,
  rule_category TEXT,
  ai_category TEXT,
  confidence_permille INTEGER,
  agreement TEXT,
  final_category TEXT,
  human_review INTEGER NOT NULL,
  execution_status TEXT NOT NULL,
  execution_duration_seconds INTEGER,
  execution_note TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (analysis_job_id) REFERENCES analysis_jobs(id) ON UPDATE no action ON DELETE cascade
)`;

export const CREATE_SCHEMA_INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_repositories_canonical_url ON repositories (canonical_url)',
  'CREATE INDEX IF NOT EXISTS idx_repositories_platform ON repositories (platform)',
  'CREATE INDEX IF NOT EXISTS idx_repositories_imported_at ON repositories (imported_at)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_notebooks_repository_path ON notebooks (repository_id, source_path)',
  'CREATE INDEX IF NOT EXISTS idx_notebooks_repository_id ON notebooks (repository_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_analysis_jobs_runner_job_id ON analysis_jobs (runner_job_id)',
  'CREATE INDEX IF NOT EXISTS idx_analysis_jobs_repository_created ON analysis_jobs (repository_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON analysis_jobs (status)',
  'CREATE INDEX IF NOT EXISTS idx_notebook_analyses_job_id ON notebook_analyses (analysis_job_id)',
] as const;
