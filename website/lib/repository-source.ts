export type RepositorySource =
  | {
      platform: 'GitHub';
      canonicalUrl: string;
      externalId: string;
      owner: string;
      repository: string;
    }
  | {
      platform: 'Codeberg';
      canonicalUrl: string;
      externalId: string;
      owner: string;
      repository: string;
    }
  | {
      platform: 'Zenodo';
      canonicalUrl: string;
      externalId: string;
      recordId: string;
    };

export class SourceValidationError extends Error {
  readonly code: 'INVALID_URL' | 'UNSUPPORTED_SOURCE';

  constructor(code: 'INVALID_URL' | 'UNSUPPORTED_SOURCE', message: string) {
    super(message);
    this.name = 'SourceValidationError';
    this.code = code;
  }
}

const REPOSITORY_PART = /^[A-Za-z0-9_.-]+$/;

function normalizeInput(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new SourceValidationError('INVALID_URL', 'Enter a repository or Zenodo record URL.');
  }
  if (trimmed.length > 2048) {
    throw new SourceValidationError('INVALID_URL', 'The URL is too long.');
  }
  return /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function safePart(value: string, label: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new SourceValidationError('INVALID_URL', `The ${label} contains invalid URL encoding.`);
  }
  if (!REPOSITORY_PART.test(decoded) || decoded === '.' || decoded === '..') {
    throw new SourceValidationError('INVALID_URL', `The ${label} is not valid.`);
  }
  return decoded;
}

export function parseRepositorySource(raw: string): RepositorySource {
  let url: URL;
  try {
    url = new URL(normalizeInput(raw));
  } catch (error) {
    if (error instanceof SourceValidationError) throw error;
    throw new SourceValidationError('INVALID_URL', 'Enter a complete repository URL.');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new SourceValidationError('INVALID_URL', 'Only HTTP or HTTPS repository URLs are supported.');
  }
  if (url.username || url.password) {
    throw new SourceValidationError('INVALID_URL', 'URLs containing usernames or passwords are not accepted.');
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'github.com' || host === 'codeberg.org') {
    if (parts.length < 2) {
      throw new SourceValidationError('INVALID_URL', 'Use a repository URL containing both the owner and repository name.');
    }
    const owner = safePart(parts[0], 'repository owner');
    const repository = safePart(parts[1].replace(/\.git$/i, ''), 'repository name');
    const shared = {
      owner,
      repository,
      externalId: `${owner}/${repository}`,
      canonicalUrl: `https://${host}/${owner}/${repository}`,
    };
    return host === 'github.com'
      ? { platform: 'GitHub', ...shared }
      : { platform: 'Codeberg', ...shared };
  }

  if (host === 'zenodo.org') {
    const recordIndex = parts.findIndex((part) => part === 'record' || part === 'records');
    const recordId = recordIndex >= 0 ? parts[recordIndex + 1] : undefined;
    if (!recordId || !/^\d+$/.test(recordId)) {
      throw new SourceValidationError('INVALID_URL', 'Use a Zenodo record URL such as https://zenodo.org/records/1234567.');
    }
    return {
      platform: 'Zenodo',
      recordId,
      externalId: recordId,
      canonicalUrl: `https://zenodo.org/records/${recordId}`,
    };
  }

  throw new SourceValidationError(
    'UNSUPPORTED_SOURCE',
    'This source is not supported. Use a public GitHub, Codeberg, or Zenodo URL.',
  );
}
