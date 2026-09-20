'use client';

import { useSyncExternalStore } from 'react';
import {
  repositories as seedRepositories,
  notebooks as seedNotebooks,
  Repository,
  Notebook,
} from './mock-data';
import type { ImportedRepositoryCollection, RepositoryImportFailure } from './repository-import-contract';

interface State {
  repositories: Repository[];
  notebooks: Notebook[];
  importSyncStatus: 'idle' | 'loading' | 'ready' | 'error';
  importSyncError: string | null;
}

let state: State = {
  repositories: seedRepositories,
  notebooks: seedNotebooks,
  importSyncStatus: 'idle',
  importSyncError: null,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function addImportedRepository(repository: Repository, notebooks: Notebook[]) {
  state = {
    ...state,
    repositories: [repository, ...state.repositories.filter((item) => item.id !== repository.id)],
    notebooks: [...notebooks, ...state.notebooks.filter((item) => item.repositoryId !== repository.id)],
    importSyncStatus: 'ready',
    importSyncError: null,
  };
  emit();
}

export function addNotebookToStore(notebook: Notebook) {
  state = {
    ...state,
    notebooks: [notebook, ...state.notebooks.filter((item) => item.id !== notebook.id)],
  };
  emit();
}

let hydrationRequest: Promise<void> | null = null;

export function hydrateImportedRepositories(force = false) {
  if (hydrationRequest && !force) return hydrationRequest;
  if (state.importSyncStatus === 'ready' && !force) return Promise.resolve();

  state = { ...state, importSyncStatus: 'loading', importSyncError: null };
  emit();

  hydrationRequest = fetch('/api/repositories', { cache: 'no-store' })
    .then(async (response) => {
      const payload = await response.json().catch(() => null) as ImportedRepositoryCollection | RepositoryImportFailure | null;
      if (!response.ok || !payload || 'error' in payload) {
        const message = payload && 'error' in payload
          ? payload.error.message
          : 'Imported repositories could not be loaded.';
        throw new Error(message);
      }

      const importedIds = new Set(payload.repositories.map((repository) => repository.id));
      state = {
        repositories: [...payload.repositories, ...state.repositories.filter((repository) => !importedIds.has(repository.id))],
        notebooks: [
          ...payload.notebooks,
          ...state.notebooks.filter((notebook) => !importedIds.has(notebook.repositoryId)),
        ],
        importSyncStatus: 'ready',
        importSyncError: null,
      };
      emit();
    })
    .catch((error: unknown) => {
      state = {
        ...state,
        importSyncStatus: 'error',
        importSyncError: error instanceof Error ? error.message : 'Imported repositories could not be loaded.',
      };
      emit();
    })
    .finally(() => {
      hydrationRequest = null;
    });

  return hydrationRequest;
}

export function useStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
