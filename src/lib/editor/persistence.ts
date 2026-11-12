import { Project } from '@/types/editor';
import { createDefaultFilters } from '@/lib/editor/defaults';

const DATABASE_NAME = 'signal-studio-editor';
const DATABASE_VERSION = 1;
const PROJECT_STORE = 'project';
const BLOB_STORE = 'assetBlobs';
const CURRENT_PROJECT_KEY = 'current';

interface StoredProject {
  project: Project;
  savedAt: string;
}

export interface LoadedProject {
  /** The saved project, with fresh object URLs on every asset that has a blob. */
  project: Project;
  /** Original media blobs keyed by asset id. */
  files: Map<string, Blob>;
  /** Assets whose media could not be restored and will not render. */
  missingAssetIds: string[];
  savedAt: string;
}

/** Returns whether this environment can persist projects at all. */
export const isPersistenceAvailable = (): boolean =>
  typeof indexedDB !== 'undefined';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Checks the fields the editor dereferences without guarding. */
const isProjectShape = (value: unknown): value is Project =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.currentSceneId === 'string' &&
  Array.isArray(value.scenes) &&
  value.scenes.length > 0 &&
  Array.isArray(value.assets) &&
  Array.isArray(value.layers) &&
  isRecord(value.selection);

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const transactionToPromise = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        database.createObjectStore(PROJECT_STORE);
      }

      if (!database.objectStoreNames.contains(BLOB_STORE)) {
        database.createObjectStore(BLOB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Editor database is blocked by another tab.'));
  });

/**
 * Saves the project and its media to IndexedDB in the browser.
 *
 * The project is stored as structured JSON. Media blobs are stored once per
 * asset id: blobs already saved are not rewritten, and blobs for assets that
 * are no longer in the project are deleted. Nothing outside `project` is
 * written, so provider API keys never reach storage.
 *
 * @param project - The project to save.
 * @param files - Original media blobs keyed by asset id.
 * @returns Whether the save succeeded. Failures are logged, never thrown.
 */
export const saveProject = async (
  project: Project,
  files: ReadonlyMap<string, Blob>,
): Promise<boolean> => {
  if (!isPersistenceAvailable()) {
    return false;
  }

  try {
    const database = await openDatabase();

    try {
      const savedBlobKeys = new Set(
        await requestToPromise(
          database.transaction(BLOB_STORE, 'readonly').objectStore(BLOB_STORE).getAllKeys(),
        ),
      );
      const projectAssetIds = new Set(project.assets.map((asset) => asset.id));

      // All writes are queued synchronously so the transaction cannot
      // auto-commit between them.
      const transaction = database.transaction([PROJECT_STORE, BLOB_STORE], 'readwrite');
      const completed = transactionToPromise(transaction);
      const blobStore = transaction.objectStore(BLOB_STORE);
      const stored: StoredProject = { project, savedAt: new Date().toISOString() };

      transaction.objectStore(PROJECT_STORE).put(stored, CURRENT_PROJECT_KEY);

      projectAssetIds.forEach((assetId) => {
        const blob = files.get(assetId);

        if (blob && !savedBlobKeys.has(assetId)) {
          blobStore.put(blob, assetId);
        }
      });

      savedBlobKeys.forEach((key) => {
        if (typeof key !== 'string' || !projectAssetIds.has(key)) {
          blobStore.delete(key);
        }
      });

      await completed;
      return true;
    } finally {
      database.close();
    }
  } catch (error) {
    console.error('[persistence] Could not save the project.', error);
    return false;
  }
};

/**
 * Loads the saved project and re-creates an object URL for every asset whose
 * media blob was stored.
 *
 * Object URLs from a previous page load are dead, so each asset's `url` is
 * replaced. Layers are back-filled with default values for any filter added
 * since the project was saved.
 *
 * @returns The saved project, or `null` when there is none, storage is
 * unavailable, or loading failed. Failures are logged, never thrown.
 */
export const loadProject = async (): Promise<LoadedProject | null> => {
  if (!isPersistenceAvailable()) {
    return null;
  }

  try {
    const database = await openDatabase();

    try {
      const transaction = database.transaction([PROJECT_STORE, BLOB_STORE], 'readonly');
      const blobStore = transaction.objectStore(BLOB_STORE);
      const [stored, blobKeys, blobs] = await Promise.all([
        requestToPromise<unknown>(
          transaction.objectStore(PROJECT_STORE).get(CURRENT_PROJECT_KEY),
        ),
        requestToPromise(blobStore.getAllKeys()),
        requestToPromise<unknown[]>(blobStore.getAll()),
      ]);

      if (!isRecord(stored) || !isProjectShape(stored.project)) {
        return null;
      }

      const files = new Map<string, Blob>();

      blobKeys.forEach((key, index) => {
        const blob = blobs[index];

        if (typeof key === 'string' && blob instanceof Blob) {
          files.set(key, blob);
        }
      });

      const missingAssetIds: string[] = [];
      const defaultFilters = createDefaultFilters();
      const saved = stored.project;
      const project: Project = {
        ...saved,
        assets: saved.assets.map((asset) => {
          const blob = files.get(asset.id);

          if (blob) {
            return { ...asset, url: URL.createObjectURL(blob) };
          }

          if (asset.url.startsWith('blob:')) {
            missingAssetIds.push(asset.id);
          }

          return asset;
        }),
        layers: saved.layers.map((layer) => ({
          ...layer,
          filters: { ...defaultFilters, ...layer.filters },
        })),
      };

      return {
        project,
        files,
        missingAssetIds,
        savedAt: typeof stored.savedAt === 'string' ? stored.savedAt : project.updatedAt,
      };
    } finally {
      database.close();
    }
  } catch (error) {
    console.error('[persistence] Could not load the saved project.', error);
    return null;
  }
};

/**
 * Deletes the saved project and all stored media, for a "new project" flow.
 *
 * @returns Whether the delete succeeded. Failures are logged, never thrown.
 */
export const clearSavedProject = async (): Promise<boolean> => {
  if (!isPersistenceAvailable()) {
    return false;
  }

  try {
    const database = await openDatabase();

    try {
      const transaction = database.transaction([PROJECT_STORE, BLOB_STORE], 'readwrite');
      const completed = transactionToPromise(transaction);

      transaction.objectStore(PROJECT_STORE).clear();
      transaction.objectStore(BLOB_STORE).clear();

      await completed;
      return true;
    } finally {
      database.close();
    }
  } catch (error) {
    console.error('[persistence] Could not clear the saved project.', error);
    return false;
  }
};
