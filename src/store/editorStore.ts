import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import {
  AiMessage,
  AiPlan,
  Asset,
  Command,
  CommandRecord,
  Layer,
  LayerFrame,
  LayerPatch,
  Project,
  ProviderConfig,
  VersionSnapshot,
} from '@/types/editor';
import {
  createDefaultProject,
  createVersionSnapshot,
  DEFAULT_PROVIDER_CONFIG,
  getCurrentLayers,
  getCurrentScene,
} from '@/lib/editor/defaults';
import {
  applyCommand,
  applyCommands,
  createCommandRecord,
  createSuccessResult,
} from '@/lib/editor/commands';
import { applyLayerPatch, mergeLayerPatches } from '@/lib/editor/layerPatch';
import {
  isPersistenceAvailable,
  loadProject,
  saveProject,
} from '@/lib/editor/persistence';

const HISTORY_LIMIT = 40;
const VERSION_LIMIT = 16;
const COMMAND_LOG_LIMIT = 30;
const AUTOSAVE_DELAY_MS = 800;

/**
 * A slider-style edit that is being previewed but is not yet in history.
 *
 * `base` is the project as it was before the first preview of the gesture and
 * `patch` is every preview so far merged into one.
 */
export interface PendingLayerPatch {
  layerId: string;
  base: Project;
  patch: LayerPatch;
}

/**
 * Editor state and actions.
 *
 * Immutability contract: a `Project` object is never mutated after it has been
 * placed in the store. Every edit produces a new project, which is what lets
 * `history`, `future`, and `versions` hold earlier projects by reference
 * without cloning them. Code that reads `project` must not write to it.
 */
interface ProjectStore {
  project: Project;
  history: Project[];
  future: Project[];
  versions: VersionSnapshot[];
  commandLog: CommandRecord[];
  providerConfig: ProviderConfig;
  providerValidation: {
    status: 'idle' | 'valid' | 'invalid';
    message: string;
  };
  aiSessionId: string | null;
  aiMessages: AiMessage[];
  draftPlan: AiPlan | null;
  isAdvancedOpen: boolean;
  /** Live frames of layers being dragged on the canvas, keyed by layer id. */
  transientFrameByLayerId: Record<string, LayerFrame>;
  /** The open slider gesture, or `null` when none is in progress. */
  pendingLayerPatch: PendingLayerPatch | null;
  /** Selects a layer. Does nothing when it is already selected. */
  selectLayer: (layerId: string | null) => void;
  /** Selects an asset. Does nothing when it is already selected. */
  selectAsset: (assetId: string | null) => void;
  setProjectName: (name: string) => void;
  setProviderConfig: (config: Partial<ProviderConfig>) => void;
  setProviderValidation: (
    state: ProjectStore['providerValidation'],
  ) => void;
  setAiSessionId: (sessionId: string | null) => void;
  addAiMessage: (message: Omit<AiMessage, 'id' | 'createdAt'>) => void;
  setDraftPlan: (plan: AiPlan | null) => void;
  toggleAdvancedOpen: () => void;
  /**
   * Applies one command as one undo step. An open slider gesture is committed
   * first. Commands that change nothing add no undo step.
   */
  executeCommand: (command: Command, source?: 'user' | 'ai') => void;
  /**
   * Applies every action of an AI plan as ONE undo step with one version
   * snapshot labelled with the plan summary. Failed actions are skipped, the
   * rest still apply, and the assistant message reports the failures.
   */
  executePlan: (plan: AiPlan) => void;
  importAsset: (asset: Asset, placeOnCanvas?: boolean) => void;
  setTransientFrame: (layerId: string, frame: LayerFrame) => void;
  clearTransientFrame: (layerId: string) => void;
  /**
   * Ends a canvas drag: writes the final frame as a single `set_layer_frame`
   * command (or nothing when the frame did not change) and clears the layer's
   * transient frame.
   */
  commitLayerFrame: (layerId: string, frame: LayerFrame) => void;
  /**
   * Shows a layer edit immediately without recording it. Use for continuous
   * controls such as sliders, where one drag fires many input events.
   *
   * The first call of a gesture remembers the pre-edit project; later calls
   * keep updating `project` only. History, versions, and the command log are
   * untouched until `commitLayerPatch`. `patch.filters` is merged onto the
   * layer's filters, and values are clamped exactly as the commands clamp
   * them. Previewing a different layer commits the open gesture first.
   *
   * Typical wiring: `onInput` -> `previewLayerPatch`, then `onPointerUp`,
   * `onBlur`, or `onChange` -> `commitLayerPatch`, and Escape ->
   * `cancelLayerPatch`.
   *
   * @example
   * previewLayerPatch(layer.id, { filters: { blur: 0.4 } });
   * previewLayerPatch(layer.id, { opacity: 0.5 });
   */
  previewLayerPatch: (layerId: string, patch: LayerPatch) => void;
  /**
   * Ends the open gesture. If the layer changed, the whole gesture becomes ONE
   * undo step, the redo stack is cleared, and one `patch_layer` entry is added
   * to the command log. Does nothing when no gesture is open, so it is safe to
   * call from both `onPointerUp` and `onBlur`.
   *
   * `executeCommand`, `executePlan`, `undo`, `redo`, and `restoreVersion` call
   * this automatically before they run.
   *
   * @param label - Summary and version label. Defaults to "Adjusted <layer>".
   * @param options - Pass `{ snapshot: false }` to skip the version snapshot.
   */
  commitLayerPatch: (label?: string, options?: { snapshot?: boolean }) => void;
  /** Abandons the open gesture and restores the layers as they were before it. */
  cancelLayerPatch: () => void;
  undo: () => void;
  redo: () => void;
  restoreVersion: (versionId: string) => void;
  /**
   * Remembers the original media for an asset so it can be saved with the
   * project. Call it right after creating the asset's object URL. Blobs live in
   * a module-level map, not in store state, so they never trigger renders.
   *
   * Autosave falls back to reading the blob back from the asset's `blob:` URL,
   * so this is an optimisation and a safety net rather than a requirement.
   */
  registerAssetBlob: (assetId: string, blob: Blob) => void;
  /**
   * Revokes object URLs of imported assets that nothing can bring back: not
   * the current project, any undo or redo entry, any version, or an open
   * gesture. Never called automatically.
   *
   * @returns The number of URLs revoked.
   */
  releaseUnusedAssetUrls: () => number;
  /**
   * Replaces the project with the one saved in this browser, if there is one,
   * and resets undo history. Call once from a `useEffect` and await it before
   * `startAutosave`. Skipped when the project was edited while loading.
   *
   * @returns Whether a saved project was loaded. Never rejects.
   */
  hydrateFromStorage: () => Promise<boolean>;
  /**
   * Starts saving the project to this browser shortly after each change.
   * Returns a function that stops autosave and flushes a pending save, suitable
   * as a `useEffect` cleanup. A no-op during server rendering.
   */
  startAutosave: () => () => void;
  seedSystemMessage: () => void;
}

/** The part of the store that undoable edits read and replace. */
type EditSlice = Pick<
  ProjectStore,
  'project' | 'history' | 'future' | 'versions' | 'commandLog' | 'pendingLayerPatch'
>;

/** Original media by asset id, kept outside zustand so it is never serialised. */
const assetBlobs = new Map<string, Blob>();

/** Every `blob:` URL the editor has seen on an asset, by asset id. */
const assetObjectUrls = new Map<string, string>();

const trackAssetUrls = (project: Project) => {
  project.assets.forEach((asset) => {
    if (asset.url.startsWith('blob:')) {
      assetObjectUrls.set(asset.id, asset.url);
    }
  });
};

/** Appends an earlier project to the undo stack by reference. */
const pushHistory = (history: Project[], project: Project): Project[] =>
  [...history, project].slice(-HISTORY_LIMIT);

const pushVersion = (
  versions: VersionSnapshot[],
  snapshot: VersionSnapshot | null,
): VersionSnapshot[] =>
  snapshot ? [snapshot, ...versions].slice(0, VERSION_LIMIT) : versions;

/** Prepends records to the newest-first command log. */
const pushRecords = (
  commandLog: CommandRecord[],
  records: CommandRecord[],
): CommandRecord[] =>
  records.length > 0
    ? [...[...records].reverse(), ...commandLog].slice(0, COMMAND_LOG_LIMIT)
    : commandLog;

/** Compares two versions of a layer field by field, and filter by filter. */
const isSameLayer = (a: Layer | undefined, b: Layer | undefined): boolean => {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  const left: LayerPatch = a;
  const right: LayerPatch = b;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof LayerPatch>;

  for (const key of keys) {
    if (key !== 'filters' && !Object.is(left[key], right[key])) {
      return false;
    }
  }

  return (Object.keys(b.filters) as Array<keyof Layer['filters']>).every(
    (key) => a.filters[key] === b.filters[key],
  );
};

const copyPatchField = <K extends keyof LayerPatch>(
  target: LayerPatch,
  source: LayerPatch,
  key: K,
) => {
  target[key] = source[key];
};

/**
 * Rewrites a gesture's merged patch with the values that actually ended up on
 * the layer, so the logged command records clamped values rather than raw
 * slider input.
 */
const finalisePatch = (patch: LayerPatch, layer: Layer): LayerPatch => {
  const applied: LayerPatch = {};
  const current: LayerPatch = layer;

  (Object.keys(patch) as Array<keyof LayerPatch>).forEach((key) => {
    if (key === 'filters') {
      const filters: NonNullable<LayerPatch['filters']> = {};

      (Object.keys(patch.filters ?? {}) as Array<keyof Layer['filters']>).forEach(
        (filterKey) => {
          if (filterKey in layer.filters) {
            filters[filterKey] = layer.filters[filterKey];
          }
        },
      );
      applied.filters = filters;
    } else if (key in layer) {
      copyPatchField(applied, current, key);
    }
  });

  return applied;
};

/**
 * Commits the open slider gesture, if any, and returns the resulting slice.
 *
 * Returns the same object when no gesture is open, so callers can cheaply
 * settle before every history operation.
 */
const settleLayerPatch = <T extends EditSlice>(
  state: T,
  label?: string,
  snapshot = true,
): T | EditSlice => {
  const pending = state.pendingLayerPatch;

  if (!pending) {
    return state;
  }

  const before = pending.base.layers.find((layer) => layer.id === pending.layerId);
  const after = state.project.layers.find((layer) => layer.id === pending.layerId);

  if (!after || isSameLayer(before, after)) {
    return {
      project: state.project,
      history: state.history,
      future: state.future,
      versions: state.versions,
      commandLog: state.commandLog,
      pendingLayerPatch: null,
    };
  }

  const summary = label ?? `Adjusted ${after.name}`;
  const command: Command = {
    type: 'patch_layer',
    layerId: pending.layerId,
    patch: finalisePatch(pending.patch, after),
  };
  const project: Project = {
    ...state.project,
    updatedAt: new Date().toISOString(),
  };
  // Selection or the project name may have changed mid-gesture; only the
  // layers are rolled back for the undo entry.
  const previous: Project = { ...state.project, layers: pending.base.layers };

  return {
    project,
    history: pushHistory(state.history, previous),
    future: [],
    versions: pushVersion(
      state.versions,
      snapshot ? createVersionSnapshot(project, summary, 'user') : null,
    ),
    commandLog: pushRecords(state.commandLog, [
      createCommandRecord(command, createSuccessResult(command, summary), 'user'),
    ]),
    pendingLayerPatch: null,
  };
};

const initialProject = createDefaultProject();
const initialVersion = createVersionSnapshot(
  initialProject,
  'Initial project',
  'user',
);

export const useEditorStore = create<ProjectStore>((set, get) => ({
  project: initialProject,
  history: [],
  future: [],
  versions: [initialVersion],
  commandLog: [],
  providerConfig: DEFAULT_PROVIDER_CONFIG,
  providerValidation: {
    status: 'idle',
    message: 'Bring your own Claude or Gemini key.',
  },
  aiSessionId: null,
  aiMessages: [],
  draftPlan: null,
  isAdvancedOpen: false,
  transientFrameByLayerId: {},
  pendingLayerPatch: null,
  selectLayer: (layerId) =>
    set((state) =>
      state.project.selection.layerId === layerId
        ? state
        : {
            project: {
              ...state.project,
              selection: {
                ...state.project.selection,
                layerId,
              },
            },
          },
    ),
  selectAsset: (assetId) =>
    set((state) =>
      state.project.selection.assetId === assetId
        ? state
        : {
            project: {
              ...state.project,
              selection: {
                ...state.project.selection,
                assetId,
              },
            },
          },
    ),
  setProjectName: (name) =>
    set((state) => ({
      project: {
        ...state.project,
        name,
        updatedAt: new Date().toISOString(),
      },
    })),
  setProviderConfig: (config) =>
    set((state) => ({
      providerConfig: {
        ...state.providerConfig,
        ...config,
      } as ProviderConfig,
    })),
  setProviderValidation: (providerValidation) => set({ providerValidation }),
  setAiSessionId: (aiSessionId) => set({ aiSessionId }),
  addAiMessage: (message) =>
    set((state) => ({
      aiMessages: [
        ...state.aiMessages,
        {
          id: uuidv4(),
          createdAt: new Date().toISOString(),
          ...message,
        },
      ],
    })),
  setDraftPlan: (draftPlan) => set({ draftPlan }),
  toggleAdvancedOpen: () =>
    set((state) => ({ isAdvancedOpen: !state.isAdvancedOpen })),
  executeCommand: (command, source = 'user') => {
    const state = get();
    const settled = settleLayerPatch(state);

    if (command.type === 'undo') {
      if (settled.history.length === 0) {
        set(settled);
        return;
      }

      set({
        ...settled,
        project: settled.history[settled.history.length - 1],
        history: settled.history.slice(0, -1),
        future: [settled.project, ...settled.future],
        draftPlan: null,
      });
      return;
    }

    if (command.type === 'redo') {
      if (settled.future.length === 0) {
        set(settled);
        return;
      }

      set({
        ...settled,
        project: settled.future[0],
        history: pushHistory(settled.history, settled.project),
        future: settled.future.slice(1),
        draftPlan: null,
      });
      return;
    }

    const execution = applyCommand(settled.project, command, { source });

    if (!execution.result.ok) {
      set(settled);
      return;
    }

    const changed = execution.project !== settled.project;

    if (changed) {
      trackAssetUrls(execution.project);
    }

    set({
      ...settled,
      project: execution.project,
      history: changed ? pushHistory(settled.history, settled.project) : settled.history,
      future: changed ? [] : settled.future,
      versions: pushVersion(settled.versions, execution.snapshot),
      commandLog: pushRecords(
        settled.commandLog,
        execution.record ? [execution.record] : [],
      ),
      draftPlan: null,
    });
  },
  executePlan: (plan) => {
    const isHistoryAction = (type: Command['type']) => type === 'undo' || type === 'redo';
    const failures: string[] = [];
    let appliedCount = 0;

    if (
      plan.actions.length > 0 &&
      plan.actions.every((action) => isHistoryAction(action.payload.type))
    ) {
      // A plan made only of undo/redo steps walks history instead of editing.
      plan.actions.forEach((action) => get().executeCommand(action.payload, 'ai'));
      appliedCount = plan.actions.length;
    } else {
      const settled = settleLayerPatch(get());
      const editActions = plan.actions.filter((action) => {
        if (isHistoryAction(action.payload.type)) {
          failures.push(`${action.title}: undo and redo cannot be mixed with edits in one plan`);
          return false;
        }

        return true;
      });
      const batch = applyCommands(
        settled.project,
        editActions.map((action) => action.payload),
        { source: 'ai', snapshotLabel: plan.summary },
      );

      batch.results.forEach((result, index) => {
        if (result.ok) {
          appliedCount += 1;
        } else {
          failures.push(`${editActions[index].title}: ${result.summary}`);
        }
      });

      const changed = batch.project !== settled.project;

      if (changed) {
        trackAssetUrls(batch.project);
      }

      set({
        ...settled,
        project: batch.project,
        history: changed ? pushHistory(settled.history, settled.project) : settled.history,
        future: changed ? [] : settled.future,
        versions: pushVersion(settled.versions, batch.snapshot),
        commandLog: pushRecords(settled.commandLog, batch.records),
      });
    }

    const failureNote =
      failures.length > 0
        ? ` ${failures.length} action(s) failed: ${failures.join('; ')}.`
        : '';

    set((state) => ({
      aiMessages: [
        ...state.aiMessages,
        {
          id: uuidv4(),
          role: 'assistant',
          content: `Applied plan "${plan.summary}" with ${appliedCount} of ${plan.actions.length} action(s).${failureNote}`,
          createdAt: new Date().toISOString(),
        },
      ],
      draftPlan: null,
    }));
  },
  importAsset: (asset, placeOnCanvas = true) =>
    get().executeCommand(
      {
        type: 'import_asset',
        asset,
        placeOnCanvas,
      },
      'user',
    ),
  setTransientFrame: (layerId, frame) =>
    set((state) => ({
      transientFrameByLayerId: {
        ...state.transientFrameByLayerId,
        [layerId]: frame,
      },
    })),
  clearTransientFrame: (layerId) =>
    set((state) => {
      if (!(layerId in state.transientFrameByLayerId)) {
        return state;
      }

      const nextFrames = { ...state.transientFrameByLayerId };
      delete nextFrames[layerId];
      return { transientFrameByLayerId: nextFrames };
    }),
  commitLayerFrame: (layerId, frame) => {
    const layer = get().project.layers.find((entry) => entry.id === layerId);

    if (
      layer &&
      (layer.x !== frame.x ||
        layer.y !== frame.y ||
        layer.width !== frame.width ||
        layer.height !== frame.height ||
        layer.rotation !== frame.rotation)
    ) {
      get().executeCommand(
        {
          type: 'set_layer_frame',
          layerId,
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.height,
          rotation: frame.rotation,
        },
        'user',
      );
    }

    get().clearTransientFrame(layerId);
  },
  previewLayerPatch: (layerId, patch) =>
    set((state) => {
      const settled =
        state.pendingLayerPatch && state.pendingLayerPatch.layerId !== layerId
          ? settleLayerPatch(state)
          : state;
      const project = applyLayerPatch(settled.project, layerId, patch);

      if (project === settled.project) {
        return settled;
      }

      const pending = settled.pendingLayerPatch;

      return {
        ...settled,
        project,
        pendingLayerPatch: {
          layerId,
          base: pending?.base ?? settled.project,
          patch: pending ? mergeLayerPatches(pending.patch, patch) : patch,
        },
      };
    }),
  commitLayerPatch: (label, options) =>
    set((state) => settleLayerPatch(state, label, options?.snapshot !== false)),
  cancelLayerPatch: () =>
    set((state) =>
      state.pendingLayerPatch
        ? {
            project: {
              ...state.project,
              layers: state.pendingLayerPatch.base.layers,
            },
            pendingLayerPatch: null,
          }
        : state,
    ),
  undo: () => get().executeCommand({ type: 'undo' }, 'user'),
  redo: () => get().executeCommand({ type: 'redo' }, 'user'),
  restoreVersion: (versionId) =>
    set((state) => {
      const version = state.versions.find((entry) => entry.id === versionId);

      if (!version) {
        return state;
      }

      const settled = settleLayerPatch(state);

      return {
        ...settled,
        project: version.project,
        history: pushHistory(settled.history, settled.project),
        future: [],
        draftPlan: null,
      };
    }),
  registerAssetBlob: (assetId, blob) => {
    assetBlobs.set(assetId, blob);
  },
  releaseUnusedAssetUrls: () => {
    const state = get();
    const referencedAssetIds = new Set<string>();
    const visitedAssetLists = new Set<Asset[]>();
    const visit = (project: Project) => {
      // Projects share their `assets` array until an import changes it.
      if (visitedAssetLists.has(project.assets)) {
        return;
      }

      visitedAssetLists.add(project.assets);
      project.assets.forEach((asset) => referencedAssetIds.add(asset.id));
    };

    visit(state.project);
    state.history.forEach(visit);
    state.future.forEach(visit);
    state.versions.forEach((version) => visit(version.project));

    if (state.pendingLayerPatch) {
      visit(state.pendingLayerPatch.base);
    }

    let released = 0;

    assetObjectUrls.forEach((url, assetId) => {
      if (referencedAssetIds.has(assetId)) {
        return;
      }

      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
      }

      assetObjectUrls.delete(assetId);
      assetBlobs.delete(assetId);
      released += 1;
    });

    return released;
  },
  hydrateFromStorage: async () => {
    const projectAtStart = get().project;

    try {
      const loaded = await loadProject();

      if (!loaded) {
        return false;
      }

      if (get().project !== projectAtStart) {
        // The user started working before the saved project arrived; keep
        // their work and drop the URLs created for the saved one.
        loaded.project.assets.forEach((asset) => {
          if (loaded.files.has(asset.id)) {
            URL.revokeObjectURL(asset.url);
          }
        });
        return false;
      }

      if (loaded.missingAssetIds.length > 0) {
        console.warn(
          `[editorStore] ${loaded.missingAssetIds.length} saved asset(s) have no stored media and will not render.`,
        );
      }

      loaded.files.forEach((blob, assetId) => assetBlobs.set(assetId, blob));
      trackAssetUrls(loaded.project);

      set({
        project: loaded.project,
        history: [],
        future: [],
        versions: [createVersionSnapshot(loaded.project, 'Restored project', 'user')],
        commandLog: [],
        pendingLayerPatch: null,
        transientFrameByLayerId: {},
        draftPlan: null,
      });

      return true;
    } catch (error) {
      console.error('[editorStore] Could not restore the saved project.', error);
      return false;
    }
  },
  startAutosave: () => startAutosave(),
  seedSystemMessage: () => {
    const messages = get().aiMessages;

    if (messages.length > 0) {
      return;
    }

    const project = get().project;
    const layers = getCurrentLayers(project);
    const scene = getCurrentScene(project);

    set({
      aiMessages: [
        {
          id: uuidv4(),
          role: 'system',
          content: `Signal Studio is ready. ${layers.length} layer(s) on a ${scene.aspectRatio} canvas.`,
          createdAt: new Date().toISOString(),
        },
      ],
    });
  },
}));

/**
 * Makes sure every `blob:` asset in a project has its media in `assetBlobs`,
 * reading it back from the object URL when it was never registered.
 */
const collectAssetBlobs = async (project: Project): Promise<Map<string, Blob>> => {
  await Promise.all(
    project.assets.map(async (asset) => {
      if (assetBlobs.has(asset.id) || !asset.url.startsWith('blob:')) {
        return;
      }

      try {
        const response = await fetch(asset.url);
        assetBlobs.set(asset.id, await response.blob());
      } catch (error) {
        console.warn(`[editorStore] Could not read media for asset ${asset.name}.`, error);
      }
    }),
  );

  return assetBlobs;
};

/**
 * Saves the project to this browser shortly after each change.
 *
 * Changes are debounced, so a burst of edits or a slider drag produces one
 * save, and saves run one at a time. Call it from a `useEffect` after
 * `hydrateFromStorage` has resolved; calling it earlier could overwrite the
 * saved project with the empty default one.
 *
 * @param delayMs - Quiet time after the last change before saving.
 * @returns A function that stops autosave and flushes a pending save.
 */
export const startAutosave = (delayMs: number = AUTOSAVE_DELAY_MS): (() => void) => {
  if (!isPersistenceAvailable()) {
    return () => undefined;
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let queue: Promise<void> = Promise.resolve();

  const flush = () => {
    timer = null;
    const project = useEditorStore.getState().project;

    queue = queue
      .then(async () => {
        await saveProject(project, await collectAssetBlobs(project));
      })
      .catch((error: unknown) => {
        console.error('[editorStore] Autosave failed.', error);
      });
  };

  const unsubscribe = useEditorStore.subscribe((state, previous) => {
    if (state.project === previous.project) {
      return;
    }

    if (timer !== null) {
      clearTimeout(timer);
    }

    timer = setTimeout(flush, delayMs);
  });

  return () => {
    unsubscribe();

    if (timer !== null) {
      clearTimeout(timer);
      flush();
    }
  };
};
