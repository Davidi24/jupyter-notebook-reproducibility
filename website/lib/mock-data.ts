export type Platform = 'GitHub' | 'Codeberg' | 'Zenodo';
export type Visibility = 'Private' | 'Public';
export type ExecutionStatus = 'Queued' | 'Running' | 'Success' | 'Partial' | 'Failed';
export type Category =
  | 'Visualization'
  | 'Data analysis'
  | 'Data preparation'
  | 'Machine learning'
  | 'Modeling'
  | 'Simulation'
  | 'Tutorial'
  | 'Software development'
  | 'Mixed purpose'
  | 'Uncertain';

export interface RepoRun {
  date: string;
  status: 'Imported' | 'Running' | 'Success' | 'Partial' | 'Failed';
  duration: string;
  note: string;
}

export interface Repository {
  id: string;
  name: string;
  platform: Platform;
  url: string;
  description: string;
  authors: string[];
  license: string;
  doi?: string;
  keywords: string[];
  metadataCompleteness: number;
  lastRun: string;
  runs: RepoRun[];
  warnings?: string[];
}

export interface Notebook {
  id: string;
  title: string;
  repositoryId: string;
  sourcePath?: string;
  language: string;
  score: number | null;
  ruleCategory: Category | null;
  aiCategory: Category | null;
  confidence: number | null;
  agreement: 'Agreed' | 'Disagreed' | null;
  finalCategory: Category | 'Pending review' | 'Pending analysis';
  humanReview: boolean;
  visibility: Visibility;
  updated: string;
  executionStatus: ExecutionStatus | 'Not run';
  executionNote?: string;
}

export interface SharedNotebook {
  id: string;
  title: string;
  repository: string;
  platform: Platform;
  owner: string;
  ownerInitials: string;
  category: Category;
  score: number;
  sharedOn: string;
}

export const repositories: Repository[] = [
  {
    id: 'ipynb-py-convert',
    name: 'ipynb-py-convert',
    platform: 'GitHub',
    url: 'github.com/research-tools/ipynb-py-convert',
    description:
      'Utility notebooks for converting between .py and .ipynb formats, with worked visualization and data-preparation examples.',
    authors: ['J. Ferreira', 'T. Lindgren'],
    license: 'MIT',
    keywords: ['conversion', 'utilities', 'visualization'],
    metadataCompleteness: 96,
    lastRun: '2 min ago',
    runs: [
      { date: 'Aug 28, 2026 - 21:04', status: 'Success', duration: '4m 12s', note: 'Full re-run after classifier update' },
      { date: 'Aug 21, 2026 - 09:40', status: 'Success', duration: '4m 30s', note: 'Scheduled weekly run' },
      { date: 'Jul 30, 2026 - 14:12', status: 'Success', duration: '4m 51s', note: 'Initial acquisition and execution' },
    ],
  },
  {
    id: 'climate-data-study',
    name: 'climate-data-study',
    platform: 'Zenodo',
    url: 'zenodo.org/records/8421093',
    description:
      'Archived analysis notebooks accompanying a regional climate dataset, covering station metadata merging and trend modelling.',
    authors: ['S. Okafor', 'H. Brandt', 'P. Novak'],
    license: 'CC-BY-4.0',
    doi: '10.5281/zenodo.8421093',
    keywords: ['climate', 'reproducibility', 'time-series'],
    metadataCompleteness: 88,
    lastRun: 'Yesterday',
    runs: [
      { date: 'Aug 27, 2026 - 18:22', status: 'Partial', duration: '9m 03s', note: 'station_metadata_merge.ipynb needs a pinned environment' },
      { date: 'Aug 12, 2026 - 11:15', status: 'Success', duration: '8m 47s', note: 'Scheduled monthly run' },
    ],
  },
  {
    id: 'fair-ml-experiments',
    name: 'fair-ml-experiments',
    platform: 'Codeberg',
    url: 'codeberg.org/fair-ml/fair-ml-experiments',
    description:
      'Machine-learning benchmarking notebooks exploring FAIR metadata practices for model training pipelines.',
    authors: ['M. Alaoui'],
    license: 'Apache-2.0',
    keywords: ['machine-learning', 'FAIR', 'benchmarking'],
    metadataCompleteness: 74,
    lastRun: 'Aug 24',
    runs: [
      { date: 'Aug 24, 2026 - 16:47', status: 'Failed', duration: '2m 18s', note: "hyperparam_search.ipynb: ModuleNotFoundError: No module named xgboost" },
      { date: 'Aug 24, 2026 - 16:40', status: 'Partial', duration: '5m 02s', note: 'model_training.ipynb missing environment.yml, fell back to detected requirements' },
      { date: 'Aug 9, 2026 - 10:05', status: 'Success', duration: '6m 15s', note: 'Initial acquisition and execution' },
    ],
  },
];

export const notebooks: Notebook[] = [
  { id: 'plot', title: 'plot.ipynb', repositoryId: 'ipynb-py-convert', language: 'Python 3.11', score: 94, ruleCategory: 'Visualization', aiCategory: 'Visualization', confidence: 0.96, agreement: 'Agreed', finalCategory: 'Visualization', humanReview: false, visibility: 'Public', updated: '2 min ago', executionStatus: 'Success' },
  { id: 'data-cleaning', title: 'data_cleaning.ipynb', repositoryId: 'ipynb-py-convert', language: 'Python 3.11', score: 91, ruleCategory: 'Data preparation', aiCategory: 'Data preparation', confidence: 0.93, agreement: 'Agreed', finalCategory: 'Data preparation', humanReview: false, visibility: 'Private', updated: 'Aug 21', executionStatus: 'Success' },
  { id: 'feature-engineering', title: 'feature_engineering.ipynb', repositoryId: 'ipynb-py-convert', language: 'Python 3.11', score: 85, ruleCategory: 'Data preparation', aiCategory: 'Modeling', confidence: 0.58, agreement: 'Disagreed', finalCategory: 'Pending review', humanReview: true, visibility: 'Private', updated: 'Aug 18', executionStatus: 'Success' },
  { id: 'api-demo', title: 'api_demo.ipynb', repositoryId: 'ipynb-py-convert', language: 'Python 3.10', score: 97, ruleCategory: 'Tutorial', aiCategory: 'Tutorial', confidence: 0.98, agreement: 'Agreed', finalCategory: 'Tutorial', humanReview: false, visibility: 'Public', updated: 'Aug 15', executionStatus: 'Success' },
  { id: 'eda-overview', title: 'eda_overview.ipynb', repositoryId: 'ipynb-py-convert', language: 'Python 3.11', score: 89, ruleCategory: 'Data analysis', aiCategory: 'Data analysis', confidence: 0.91, agreement: 'Agreed', finalCategory: 'Data analysis', humanReview: false, visibility: 'Private', updated: 'Aug 12', executionStatus: 'Success' },

  { id: 'analysis-main', title: 'analysis_main.ipynb', repositoryId: 'climate-data-study', language: 'Python 3.10', score: 88, ruleCategory: 'Data analysis', aiCategory: 'Data analysis', confidence: 0.89, agreement: 'Agreed', finalCategory: 'Data analysis', humanReview: false, visibility: 'Public', updated: 'Yesterday', executionStatus: 'Success' },
  { id: 'temperature-trends', title: 'temperature_trends.ipynb', repositoryId: 'climate-data-study', language: 'Python 3.10', score: 93, ruleCategory: 'Visualization', aiCategory: 'Visualization', confidence: 0.95, agreement: 'Agreed', finalCategory: 'Visualization', humanReview: false, visibility: 'Private', updated: 'Aug 24', executionStatus: 'Success' },
  { id: 'station-metadata-merge', title: 'station_metadata_merge.ipynb', repositoryId: 'climate-data-study', language: 'Python 3.9', score: 79, ruleCategory: 'Data preparation', aiCategory: 'Data analysis', confidence: 0.61, agreement: 'Disagreed', finalCategory: 'Pending review', humanReview: true, visibility: 'Private', updated: 'Aug 20', executionStatus: 'Partial', executionNote: 'Missing pinned environment; re-executed with closest matching versions' },
  { id: 'climate-model-eval', title: 'climate_model_eval.ipynb', repositoryId: 'climate-data-study', language: 'Python 3.10', score: 82, ruleCategory: 'Modeling', aiCategory: 'Modeling', confidence: 0.87, agreement: 'Agreed', finalCategory: 'Modeling', humanReview: false, visibility: 'Private', updated: 'Aug 17', executionStatus: 'Success' },

  { id: 'model-training', title: 'model_training.ipynb', repositoryId: 'fair-ml-experiments', language: 'Python 3.11', score: 72, ruleCategory: 'Machine learning', aiCategory: 'Machine learning', confidence: 0.9, agreement: 'Agreed', finalCategory: 'Machine learning', humanReview: false, visibility: 'Private', updated: 'Aug 24', executionStatus: 'Partial', executionNote: 'Missing environment.yml; dependency versions inferred from imports' },
  { id: 'hyperparam-search', title: 'hyperparam_search.ipynb', repositoryId: 'fair-ml-experiments', language: 'Python 3.11', score: 68, ruleCategory: 'Machine learning', aiCategory: 'Machine learning', confidence: 0.77, agreement: 'Agreed', finalCategory: 'Machine learning', humanReview: false, visibility: 'Private', updated: 'Aug 22', executionStatus: 'Failed', executionNote: "ModuleNotFoundError: No module named xgboost" },
  { id: 'results-summary', title: 'results_summary.ipynb', repositoryId: 'fair-ml-experiments', language: 'Python 3.11', score: 90, ruleCategory: 'Tutorial', aiCategory: 'Tutorial', confidence: 0.94, agreement: 'Agreed', finalCategory: 'Tutorial', humanReview: false, visibility: 'Public', updated: 'Aug 19', executionStatus: 'Success' },
];

export const sharedNotebooks: SharedNotebook[] = [
  { id: 'shared-1', title: 'survey_response_clustering.ipynb', repository: 'social-survey-toolkit', platform: 'GitHub', owner: 'Amara Solheim', ownerInitials: 'AS', category: 'Machine learning', score: 90, sharedOn: 'Aug 23' },
  { id: 'shared-2', title: 'sensor_drift_correction.ipynb', repository: 'iot-reproducibility', platform: 'Codeberg', owner: 'Kenji Watari', ownerInitials: 'KW', category: 'Data preparation', score: 86, sharedOn: 'Aug 19' },
  { id: 'shared-3', title: 'genome_variant_viz.ipynb', repository: 'bio-fair-notebooks', platform: 'Zenodo', owner: 'Priya Chandran', ownerInitials: 'PC', category: 'Visualization', score: 95, sharedOn: 'Aug 14' },
  { id: 'shared-4', title: 'macro_forecast_baseline.ipynb', repository: 'econ-open-models', platform: 'GitHub', owner: 'Lukas Werner', ownerInitials: 'LW', category: 'Modeling', score: 81, sharedOn: 'Aug 6' },
];

export function getRepository(repos: Repository[], id: string) {
  return repos.find((r) => r.id === id);
}

export function notebooksForRepository(nbs: Notebook[], repositoryId: string) {
  return nbs.filter((n) => n.repositoryId === repositoryId);
}

export function getNotebook(nbs: Notebook[], id: string) {
  return nbs.find((n) => n.id === id);
}

export function averageScore(list: Notebook[]) {
  const scores = list.flatMap((notebook) => notebook.score === null ? [] : [notebook.score]);
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

export function scoreLabel(score: number | null) {
  if (score === null) return 'Pending';
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Review';
  return 'Critical';
}

export function repoStatus(list: Notebook[]): 'Imported' | 'Running' | 'Completed' | 'Partial' | 'Failed' {
  if (list.length === 0 || list.every((n) => n.executionStatus === 'Not run')) return 'Imported';
  if (list.some((n) => n.executionStatus === 'Running' || n.executionStatus === 'Queued')) return 'Running';
  if (list.some((n) => n.executionStatus === 'Failed')) return 'Failed';
  if (list.some((n) => n.executionStatus === 'Partial')) return 'Partial';
  return 'Completed';
}

export function platformSummary(repos: Repository[], nbs: Notebook[]) {
  const platforms: Platform[] = ['GitHub', 'Codeberg', 'Zenodo'];
  return platforms.map((platform) => {
    const platformRepos = repos.filter((r) => r.platform === platform);
    const platformNbs = nbs.filter((n) => platformRepos.some((r) => r.id === n.repositoryId));
    return { platform, repoCount: platformRepos.length, notebookCount: platformNbs.length, avgScore: averageScore(platformNbs) };
  });
}

export function categoryDistribution(nbs: Notebook[]) {
  const counts = new Map<Category, number>();
  nbs.forEach((n) => {
    if (n.finalCategory === 'Pending review' || n.finalCategory === 'Pending analysis') return;
    counts.set(n.finalCategory, (counts.get(n.finalCategory) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

export function agreementSummary(nbs: Notebook[]) {
  const classified = nbs.filter((n) => n.agreement !== null);
  const agreed = classified.filter((n) => n.agreement === 'Agreed').length;
  const disagreed = classified.length - agreed;
  return { agreed, disagreed, total: classified.length };
}

export function scoreBuckets(nbs: Notebook[]) {
  const buckets = [
    { label: 'Excellent (90-100)', min: 90, max: 100, tone: 'good' as const },
    { label: 'Good (80-89)', min: 80, max: 89, tone: 'info' as const },
    { label: 'Review (70-79)', min: 70, max: 79, tone: 'warning' as const },
    { label: 'Critical (<70)', min: 0, max: 69, tone: 'critical' as const },
  ];
  return buckets.map((b) => ({
    ...b,
    count: nbs.filter((n) => n.score !== null && n.score >= b.min && n.score <= b.max).length,
  }));
}

export const kgStats = {
  totalTriples: 222119,
  ontologyClasses: 14,
  ontologyProperties: 37,
  lastBuild: 'Aug 28, 2026 - 21:36',
  entities: [
    { label: 'Repositories', count: repositories.length },
    { label: 'Notebooks', count: notebooks.length },
    { label: 'Classification activities', count: notebooks.length },
    { label: 'Pipeline runs', count: repositories.reduce((sum, r) => sum + r.runs.length, 0) },
  ],
};

export interface SparqlQuery {
  id: string;
  file: string;
  description: string;
  rowCount: number;
  columns: string[];
  rows: string[][];
}

export const sparqlQueries: SparqlQuery[] = [
  {
    id: '01',
    file: '01_repositories_by_platform.rq',
    description: 'Counts repositories grouped by source platform.',
    rowCount: 3,
    columns: ['platform', 'count'],
    rows: [['GitHub', '1'], ['Codeberg', '1'], ['Zenodo', '1']],
  },
  {
    id: '02',
    file: '02_repository_metadata.rq',
    description: 'Normalized metadata (license, authors, keywords) for every repository.',
    rowCount: 3,
    columns: ['repository', 'license', 'keywords'],
    rows: [
      ['ipynb-py-convert', 'MIT', 'conversion, utilities, visualization'],
      ['climate-data-study', 'CC-BY-4.0', 'climate, reproducibility, time-series'],
      ['fair-ml-experiments', 'Apache-2.0', 'machine-learning, FAIR, benchmarking'],
    ],
  },
  {
    id: '03',
    file: '03_notebook_execution_route.rq',
    description: 'Traces every pipeline stage transition each notebook passed through.',
    rowCount: 50,
    columns: ['notebook', 'stage', 'status'],
    rows: [
      ['plot.ipynb', 'venv_created', 'ok'],
      ['plot.ipynb', 'executed', 'ok'],
      ['model_training.ipynb', 'requirements_inferred', 'warning'],
      ['hyperparam_search.ipynb', 'executed', 'failed'],
    ],
  },
  {
    id: '04',
    file: '04_repository_run_statuses.rq',
    description: 'All recorded pipeline runs per repository, including reruns.',
    rowCount: 5,
    columns: ['repository', 'run_date', 'status'],
    rows: [
      ['ipynb-py-convert', '2026-08-28', 'success'],
      ['climate-data-study', '2026-08-27', 'partial'],
      ['climate-data-study', '2026-08-12', 'success'],
      ['fair-ml-experiments', '2026-08-24', 'failed'],
      ['fair-ml-experiments', '2026-08-09', 'success'],
    ],
  },
  {
    id: '05',
    file: '05_reproducibility_by_platform.rq',
    description: 'Aggregate reproducibility score across the whole knowledge graph.',
    rowCount: 1,
    columns: ['avg_reproducibility'],
    rows: [['85.7']],
  },
  {
    id: '06',
    file: '06_zenodo_archived_records.rq',
    description: 'Zenodo-specific archival metadata (DOI, record ID).',
    rowCount: 1,
    columns: ['repository', 'doi'],
    rows: [['climate-data-study', '10.5281/zenodo.8421093']],
  },
  {
    id: '07',
    file: '07_notebook_classifications.rq',
    description: 'Rule/AI classification and agreement lookup for a single notebook.',
    rowCount: 1,
    columns: ['notebook', 'rule_category', 'ai_category', 'agreement', 'human_review'],
    rows: [['notebook/27273', 'visualization', 'visualization', 'AGREED', 'false']],
  },
];
