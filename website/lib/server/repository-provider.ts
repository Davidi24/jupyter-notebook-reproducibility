import type { Notebook, Repository } from '@/lib/mock-data';
import type { RepositoryImportErrorCode, RepositoryImportSuccess } from '@/lib/repository-import-contract';
import type { RepositorySource } from '@/lib/repository-source';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_NOTEBOOKS = 2_000;

export class RepositoryProviderError extends Error {
  constructor(
    readonly code: RepositoryImportErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'RepositoryProviderError';
  }
}

interface RemoteRepository {
  externalId: string;
  name: string;
  description: string;
  authors: string[];
  license: string;
  doi?: string;
  keywords: string[];
  defaultBranch?: string;
  sourceUpdatedAt?: string;
  notebookPaths: string[];
  warnings: string[];
}

interface GitTreeEntry {
  path?: string;
  type?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function textValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function notebookPathsFromTree(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is GitTreeEntry => isObject(entry))
    .filter((entry) => entry.type === 'blob' && typeof entry.path === 'string' && entry.path.toLowerCase().endsWith('.ipynb'))
    .map((entry) => entry.path as string)
    .sort((a, b) => a.localeCompare(b));
}

function stripHtml(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchJson(url: string, headers: HeadersInit, platform: string, externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const abortFromRequest = () => controller.abort();
  externalSignal?.addEventListener('abort', abortFromRequest, { once: true });
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { headers, signal: controller.signal, redirect: 'manual' });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RepositoryProviderError('IMPORT_TIMEOUT', `${platform} took too long to respond. Try again.`, 504, true);
    }
    console.error('Repository provider request failed', { platform, url, error });
    throw new RepositoryProviderError('SOURCE_UNAVAILABLE', `${platform} could not be reached. Try again later.`, 502, true);
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromRequest);
  }

  if (!response.ok) {
    if (response.status >= 300 && response.status < 400) {
      throw new RepositoryProviderError('SOURCE_UNAVAILABLE', `${platform} redirected the API request unexpectedly. Try again later.`, 502, true);
    }
    const rateLimited = response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0';
    if (rateLimited) {
      throw new RepositoryProviderError('RATE_LIMITED', `${platform} temporarily rejected the request because its API limit was reached. Try again later.`, 429, true);
    }
    if (response.status === 401 || response.status === 403) {
      throw new RepositoryProviderError('SOURCE_PRIVATE', 'This repository is private or requires authentication. Public sources can be imported without credentials.', 403, false);
    }
    if (response.status === 404) {
      throw new RepositoryProviderError('SOURCE_NOT_FOUND', 'The repository or record was not found. Check the URL and confirm that it is public.', 404, false);
    }
    if (response.status >= 500) {
      throw new RepositoryProviderError('SOURCE_UNAVAILABLE', `${platform} is temporarily unavailable. Try again later.`, 502, true);
    }
    throw new RepositoryProviderError('IMPORT_FAILED', `${platform} rejected the import request.`, 422, false);
  }

  try {
    return await response.json() as unknown;
  } catch {
    throw new RepositoryProviderError('SOURCE_UNAVAILABLE', `${platform} returned an unreadable response. Try again later.`, 502, true);
  }
}

function checkNotebookLimit(paths: string[]) {
  if (paths.length > MAX_NOTEBOOKS) {
    throw new RepositoryProviderError(
      'REPOSITORY_TOO_LARGE',
      `This source contains more than ${MAX_NOTEBOOKS.toLocaleString()} notebooks. Split it into smaller repositories before importing.`,
      422,
      false,
    );
  }
}

async function importGitHub(source: Extract<RepositorySource, { platform: 'GitHub' }>, token?: string, signal?: AbortSignal): Promise<RemoteRepository> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'NotebookFair',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const base = `https://api.github.com/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}`;
  const metadata = await fetchJson(base, headers, 'GitHub', signal);
  if (!isObject(metadata)) {
    throw new RepositoryProviderError('SOURCE_UNAVAILABLE', 'GitHub returned incomplete repository metadata.', 502, true);
  }

  const defaultBranch = textValue(metadata.default_branch, 'main');
  let notebookPaths: string[] = [];
  const warnings: string[] = [];
  if (metadata.archived === true) warnings.push('This GitHub repository is archived and read-only.');

  if (Number(metadata.size ?? 0) > 0) {
    const tree = await fetchJson(`${base}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`, headers, 'GitHub', signal);
    if (!isObject(tree)) {
      throw new RepositoryProviderError('SOURCE_UNAVAILABLE', 'GitHub returned an incomplete file listing.', 502, true);
    }
    if (tree.truncated === true) {
      throw new RepositoryProviderError('REPOSITORY_TOO_LARGE', 'GitHub could not return the complete repository tree. Import a smaller repository or archive.', 422, false);
    }
    notebookPaths = notebookPathsFromTree(tree.tree);
  }

  checkNotebookLimit(notebookPaths);
  if (notebookPaths.length === 0) warnings.push('No .ipynb files were found in the default branch.');

  const owner = isObject(metadata.owner) ? textValue(metadata.owner.login) : source.owner;
  const license = isObject(metadata.license)
    ? textValue(metadata.license.spdx_id, textValue(metadata.license.name, 'Not specified'))
    : 'Not specified';

  return {
    externalId: String(metadata.id ?? source.externalId),
    name: textValue(metadata.name, source.repository),
    description: textValue(metadata.description, 'No repository description provided.'),
    authors: owner ? [owner] : [],
    license,
    keywords: stringList(metadata.topics),
    defaultBranch,
    sourceUpdatedAt: textValue(metadata.updated_at),
    notebookPaths,
    warnings,
  };
}

async function importCodeberg(source: Extract<RepositorySource, { platform: 'Codeberg' }>, signal?: AbortSignal): Promise<RemoteRepository> {
  const headers = { Accept: 'application/json', 'User-Agent': 'NotebookFair' };
  const base = `https://codeberg.org/api/v1/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}`;
  const metadata = await fetchJson(base, headers, 'Codeberg', signal);
  if (!isObject(metadata)) {
    throw new RepositoryProviderError('SOURCE_UNAVAILABLE', 'Codeberg returned incomplete repository metadata.', 502, true);
  }

  const defaultBranch = textValue(metadata.default_branch, 'main');
  let notebookPaths: string[] = [];
  const warnings: string[] = [];
  if (metadata.archived === true) warnings.push('This Codeberg repository is archived and read-only.');
  if (!metadata.empty) {
    const tree = await fetchJson(`${base}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=true`, headers, 'Codeberg', signal);
    if (!isObject(tree)) {
      throw new RepositoryProviderError('SOURCE_UNAVAILABLE', 'Codeberg returned an incomplete file listing.', 502, true);
    }
    if (tree.truncated === true) {
      throw new RepositoryProviderError('REPOSITORY_TOO_LARGE', 'Codeberg could not return the complete repository tree. Import a smaller repository.', 422, false);
    }
    notebookPaths = notebookPathsFromTree(tree.tree);
  }

  checkNotebookLimit(notebookPaths);
  if (notebookPaths.length === 0) warnings.push('No .ipynb files were found in the default branch.');

  const owner = isObject(metadata.owner)
    ? textValue(metadata.owner.full_name, textValue(metadata.owner.login, source.owner))
    : source.owner;
  const license = isObject(metadata.license)
    ? textValue(metadata.license.spdx_id, textValue(metadata.license.name, 'Not specified'))
    : 'Not specified';
  const topics = Array.isArray(metadata.topics)
    ? metadata.topics.flatMap((topic) => typeof topic === 'string' ? [topic] : isObject(topic) ? [textValue(topic.name)].filter(Boolean) : [])
    : [];

  return {
    externalId: String(metadata.id ?? source.externalId),
    name: textValue(metadata.name, source.repository),
    description: textValue(metadata.description, 'No repository description provided.'),
    authors: owner ? [owner] : [],
    license,
    keywords: topics,
    defaultBranch,
    sourceUpdatedAt: textValue(metadata.updated_at),
    notebookPaths,
    warnings,
  };
}

async function importZenodo(source: Extract<RepositorySource, { platform: 'Zenodo' }>, signal?: AbortSignal): Promise<RemoteRepository> {
  const metadata = await fetchJson(
    `https://zenodo.org/api/records/${encodeURIComponent(source.recordId)}`,
    { Accept: 'application/json', 'User-Agent': 'NotebookFair' },
    'Zenodo',
    signal,
  );
  if (!isObject(metadata) || !isObject(metadata.metadata)) {
    throw new RepositoryProviderError('SOURCE_UNAVAILABLE', 'Zenodo returned incomplete record metadata.', 502, true);
  }

  const recordMetadata = metadata.metadata;
  const files = Array.isArray(metadata.files) ? metadata.files.filter(isObject) : [];
  const notebookPaths = files
    .map((file) => textValue(file.key))
    .filter((path) => path.toLowerCase().endsWith('.ipynb'))
    .sort((a, b) => a.localeCompare(b));
  checkNotebookLimit(notebookPaths);

  const warnings: string[] = [];
  const archiveCount = files.filter((file) => /\.(zip|tar|tar\.gz|tgz)$/i.test(textValue(file.key))).length;
  if (archiveCount > 0) warnings.push(`${archiveCount} archive file${archiveCount === 1 ? ' was' : 's were'} recorded but not expanded during metadata import.`);
  if (notebookPaths.length === 0) warnings.push('No standalone .ipynb files were attached to this Zenodo record.');

  const creators = Array.isArray(recordMetadata.creators)
    ? recordMetadata.creators.flatMap((creator) => isObject(creator) && textValue(creator.name) ? [textValue(creator.name)] : [])
    : [];
  const license = isObject(recordMetadata.license)
    ? textValue(recordMetadata.license.id, textValue(recordMetadata.license.title, 'Not specified'))
    : 'Not specified';

  return {
    externalId: String(metadata.id ?? source.recordId),
    name: textValue(recordMetadata.title, `Zenodo record ${source.recordId}`),
    description: stripHtml(recordMetadata.description) || 'No record description provided.',
    authors: creators,
    license,
    doi: textValue(metadata.doi, textValue(recordMetadata.doi)) || undefined,
    keywords: stringList(recordMetadata.keywords),
    sourceUpdatedAt: textValue(metadata.updated),
    notebookPaths,
    warnings,
  };
}

function metadataCompleteness(remote: RemoteRepository) {
  const fields = [
    remote.description && !remote.description.startsWith('No '),
    remote.authors.length > 0,
    remote.license !== 'Not specified',
    remote.keywords.length > 0,
    Boolean(remote.defaultBranch || remote.doi),
  ];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

export async function importRemoteRepository(
  source: RepositorySource,
  options: { githubToken?: string; signal?: AbortSignal } = {},
): Promise<RepositoryImportSuccess> {
  const remote = source.platform === 'GitHub'
    ? await importGitHub(source, options.githubToken, options.signal)
    : source.platform === 'Codeberg'
      ? await importCodeberg(source, options.signal)
      : await importZenodo(source, options.signal);

  const repositoryId = crypto.randomUUID();
  const repository: Repository = {
    id: repositoryId,
    name: remote.name,
    platform: source.platform,
    url: source.canonicalUrl.replace(/^https?:\/\//, ''),
    description: remote.description,
    authors: remote.authors.length > 0 ? remote.authors : ['Not specified'],
    license: remote.license,
    doi: remote.doi,
    keywords: remote.keywords,
    metadataCompleteness: metadataCompleteness(remote),
    lastRun: 'Not run',
    warnings: remote.warnings,
    runs: [{
      date: 'Just now',
      status: 'Imported',
      duration: '—',
      note: `${remote.notebookPaths.length} notebook${remote.notebookPaths.length === 1 ? '' : 's'} discovered; analysis has not started.`,
    }],
  };

  const notebooks: Notebook[] = remote.notebookPaths.map((path) => ({
    id: crypto.randomUUID(),
    title: path.split('/').pop() || path,
    sourcePath: path,
    repositoryId,
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
    executionNote: 'Repository imported successfully. Execution and classification have not started.',
  }));

  return { repository, notebooks, warnings: remote.warnings };
}
