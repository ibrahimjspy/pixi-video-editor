import { v4 as uuidv4 } from 'uuid';
import {
  Command,
  CommandRecord,
  Layer,
  Project,
  Scene,
  TextLayer,
  ToolResult,
  VersionSnapshot,
} from '@/types/editor';
import {
  CANVAS_DIMENSIONS,
  createDefaultFilters,
  createVersionSnapshot,
  getAssetById,
  getCurrentScene,
  getLayerById,
  MIN_LAYER_SIZE,
} from '@/lib/editor/defaults';
import { FILTER_PRESETS } from '@/lib/editor/filterPresets';
import {
  isFilterKey,
  MIN_TRIM_DURATION_MS,
  patchLayerInPlace,
} from '@/lib/editor/layerPatch';

export interface CommandExecutionContext {
  source: 'user' | 'ai';
  /**
   * Set to `false` to skip the version snapshot, for callers that group
   * several commands under one snapshot of their own. Defaults to `true`.
   */
  snapshot?: boolean;
}

export interface CommandExecutionResult {
  project: Project;
  result: ToolResult;
  snapshot: VersionSnapshot | null;
  record: CommandRecord | null;
}

export interface CommandBatchContext extends CommandExecutionContext {
  /** Label for the single snapshot that covers the whole batch. */
  snapshotLabel?: string;
}

export interface CommandBatchResult {
  /** The input project when nothing changed, otherwise one new project. */
  project: Project;
  /** One result per input command, in input order. */
  results: ToolResult[];
  /** Audit records for the commands that succeeded, in input order. */
  records: CommandRecord[];
  snapshot: VersionSnapshot | null;
}

/** What a command handler reports after editing the working project. */
interface CommandOutcome {
  ok: true;
  summary: string;
  /** Version-history label. Defaults to the summary. */
  snapshotLabel?: string;
  warnings?: string[];
  /** `false` when the handler left the working project untouched. */
  mutated?: boolean;
}

interface CommandFailure {
  ok: false;
  summary: string;
}

type HandlerResult = CommandOutcome | CommandFailure;

/** Commands that never edit the project and so never need a working copy. */
type PassiveCommand = Extract<Command, { type: 'undo' | 'redo' | 'export_preview' }>;

type MutatingCommand = Exclude<Command, PassiveCommand>;

const done = (
  summary: string,
  extra: Omit<CommandOutcome, 'ok' | 'summary'> = {},
): CommandOutcome => ({ ok: true, summary, ...extra });

const fail = (summary: string): CommandFailure => ({ ok: false, summary });

const LAYER_NOT_FOUND = 'Layer not found';

const isPassiveCommand = (command: Command): command is PassiveCommand =>
  command.type === 'undo' ||
  command.type === 'redo' ||
  command.type === 'export_preview';

const toToolResult = (command: Command, outcome: HandlerResult): ToolResult => ({
  commandId: uuidv4(),
  type: command.type,
  ok: outcome.ok,
  summary: outcome.summary,
  warnings: outcome.ok ? outcome.warnings ?? [] : [],
});

/**
 * Builds the audit-log entry for a command that has been applied.
 *
 * Exported so the store can log edits it applies without going through
 * `applyCommand`, such as a committed slider gesture.
 */
export const createCommandRecord = (
  command: Command,
  result: ToolResult,
  source: 'user' | 'ai',
): CommandRecord => ({
  id: uuidv4(),
  source,
  createdAt: new Date().toISOString(),
  command,
  result,
});

/** Builds a successful tool result for an edit applied outside `applyCommand`. */
export const createSuccessResult = (command: Command, summary: string): ToolResult =>
  toToolResult(command, done(summary));

const roundTo2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Rewrites every layer's `zIndex` in a scene to match its position in
 * `scene.layerIds`, so draw order has a single source of truth and no gaps.
 */
export const renumberZIndex = (project: Project, scene: Scene) => {
  const layersById = new Map(project.layers.map((layer) => [layer.id, layer]));

  scene.layerIds.forEach((layerId, index) => {
    const layer = layersById.get(layerId);

    if (layer) {
      layer.zIndex = index;
    }
  });
};

/**
 * Adds a layer to the working project and selects it.
 *
 * @param index - Position in the scene's draw order. Defaults to the top.
 */
const insertLayer = (
  project: Project,
  scene: Scene,
  layer: Layer,
  index: number = scene.layerIds.length,
) => {
  project.layers.push(layer);
  scene.layerIds.splice(index, 0, layer.id);
  renumberZIndex(project, scene);
  project.selection.layerId = layer.id;
};

/**
 * Creates a centered layer that fits inside 72% of the active canvas while
 * preserving the source media's aspect ratio.
 */
const buildLayerFromAsset = (
  project: Project,
  assetId: string,
): Layer | null => {
  const asset = getAssetById(project, assetId);
  const scene = getCurrentScene(project);

  if (!asset) {
    return null;
  }

  const sourceWidth = Math.max(1, asset.width ?? scene.canvasWidth);
  const sourceHeight = Math.max(1, asset.height ?? scene.canvasHeight);
  const scale = Math.min(
    1,
    (scene.canvasWidth * 0.72) / sourceWidth,
    (scene.canvasHeight * 0.72) / sourceHeight,
  );
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);

  const base = {
    id: uuidv4(),
    assetId: asset.id,
    x: Math.round((scene.canvasWidth - width) / 2),
    y: Math.round((scene.canvasHeight - height) / 2),
    width,
    height,
    rotation: 0,
    zIndex: scene.layerIds.length,
    visible: true,
    muted: false,
    filters: createDefaultFilters(),
    opacity: 1,
    startMs: 0,
  };
  const baseName = asset.name.replace(/\.[^.]+$/, '');

  if (asset.kind === 'image') {
    return {
      ...base,
      name: baseName || 'Image layer',
      type: 'image',
      durationMs: scene.durationMs,
    };
  }

  return {
    ...base,
    name: baseName || 'Video layer',
    type: 'video',
    durationMs: asset.durationMs ?? scene.durationMs,
    trimStartMs: 0,
    trimEndMs: asset.durationMs ?? null,
  };
};

/** Builds the text layer for a `create_text` or `add_caption_block` command. */
const buildTextLayer = (
  scene: Scene,
  command: Extract<Command, { type: 'create_text' | 'add_caption_block' }>,
): TextLayer => {
  const shared = {
    id: uuidv4(),
    type: 'text' as const,
    text: command.text,
    rotation: 0,
    zIndex: scene.layerIds.length,
    visible: true,
    muted: false,
    filters: createDefaultFilters(),
    opacity: 1,
    align: 'center' as const,
    startMs: 0,
    durationMs: scene.durationMs,
  };

  if (command.type === 'create_text') {
    return {
      ...shared,
      name: 'Headline',
      x: command.x ?? 72,
      y: command.y ?? 72,
      width: command.width ?? Math.round(scene.canvasWidth * 0.72),
      height: command.height ?? 120,
      fontSize: command.fontSize ?? 56,
      fontFamily: command.fontFamily ?? 'Space Grotesk, sans-serif',
      color: command.color ?? '#f4ecd8',
    };
  }

  return {
    ...shared,
    name: 'Caption',
    x: Math.max(40, Math.round(scene.canvasWidth * 0.08)),
    y: Math.round(scene.canvasHeight * 0.77),
    width: Math.round(scene.canvasWidth * 0.84),
    height: 88,
    fontSize: 34,
    fontFamily: 'IBM Plex Sans, sans-serif',
    color: '#f4ecd8',
  };
};

/**
 * Resizes a scene's canvas and carries its layers along.
 *
 * Every layer is scaled by one uniform factor, the largest that keeps the old
 * canvas fully inside the new one, and is repositioned so its offset from the
 * canvas centre scales by the same factor. Text font sizes scale too, so a
 * composition keeps its look instead of drifting off-canvas.
 */
const resizeSceneCanvas = (
  project: Project,
  scene: Scene,
  width: number,
  height: number,
) => {
  const factor = Math.min(width / scene.canvasWidth, height / scene.canvasHeight);
  const previousCenterX = scene.canvasWidth / 2;
  const previousCenterY = scene.canvasHeight / 2;
  const sceneLayerIds = new Set(scene.layerIds);

  project.layers.forEach((layer) => {
    if (!sceneLayerIds.has(layer.id)) {
      return;
    }

    const layerCenterX = layer.x + layer.width / 2;
    const layerCenterY = layer.y + layer.height / 2;
    const nextWidth = Math.max(MIN_LAYER_SIZE, roundTo2(layer.width * factor));
    const nextHeight = Math.max(MIN_LAYER_SIZE, roundTo2(layer.height * factor));

    layer.x = roundTo2(width / 2 + (layerCenterX - previousCenterX) * factor - nextWidth / 2);
    layer.y = roundTo2(height / 2 + (layerCenterY - previousCenterY) * factor - nextHeight / 2);
    layer.width = nextWidth;
    layer.height = nextHeight;

    if (layer.type === 'text') {
      layer.fontSize = Math.max(1, roundTo2(layer.fontSize * factor));
    }
  });

  scene.canvasWidth = width;
  scene.canvasHeight = height;
};

/**
 * Edits the working project for one command and describes what happened.
 *
 * Handlers must return `fail(...)` before making any change, because a batch
 * keeps using the same working project after a failed command.
 */
const runCommand = (project: Project, command: MutatingCommand): HandlerResult => {
  const scene = getCurrentScene(project);

  switch (command.type) {
    case 'import_asset': {
      project.assets.unshift(command.asset);
      project.selection.assetId = command.asset.id;

      const layer = command.placeOnCanvas
        ? buildLayerFromAsset(project, command.asset.id)
        : null;

      if (!layer) {
        return done(`Imported ${command.asset.name}`);
      }

      insertLayer(project, scene, layer);
      return done(`Imported ${command.asset.name} and placed it on the canvas`);
    }
    case 'create_text':
    case 'add_caption_block': {
      insertLayer(project, scene, buildTextLayer(scene, command));

      return done(
        command.type === 'create_text'
          ? `Added text layer: "${command.text}"`
          : 'Added caption block',
      );
    }
    case 'set_canvas_ratio': {
      if (scene.aspectRatio === command.aspectRatio) {
        return done(`Canvas is already ${command.aspectRatio}`, { mutated: false });
      }

      const dimensions = CANVAS_DIMENSIONS[command.aspectRatio];
      resizeSceneCanvas(project, scene, dimensions.width, dimensions.height);
      scene.aspectRatio = command.aspectRatio;

      return done(`Switched canvas to ${command.aspectRatio}`, {
        snapshotLabel: `Canvas ${command.aspectRatio}`,
      });
    }
    case 'move_layer': {
      const layer = getLayerById(project, command.layerId);

      if (!layer) {
        return fail(LAYER_NOT_FOUND);
      }

      layer.x = command.x;
      layer.y = command.y;
      project.selection.layerId = layer.id;

      return done(`Moved ${layer.name}`, { snapshotLabel: `Move ${layer.name}` });
    }
    case 'resize_layer': {
      const layer = getLayerById(project, command.layerId);

      if (!layer) {
        return fail(LAYER_NOT_FOUND);
      }

      layer.width = Math.max(MIN_LAYER_SIZE, command.width);
      layer.height = Math.max(MIN_LAYER_SIZE, command.height);
      project.selection.layerId = layer.id;

      return done(`Resized ${layer.name}`, { snapshotLabel: `Resize ${layer.name}` });
    }
    case 'set_layer_frame': {
      const layer = getLayerById(project, command.layerId);

      if (!layer) {
        return fail(LAYER_NOT_FOUND);
      }

      const changed = patchLayerInPlace(layer, {
        x: command.x,
        y: command.y,
        width: command.width,
        height: command.height,
        rotation: command.rotation,
      });

      if (!changed) {
        return done(`${layer.name} is already in that position`, { mutated: false });
      }

      project.selection.layerId = layer.id;

      return done(`Transformed ${layer.name}`, {
        snapshotLabel: `Transform ${layer.name}`,
      });
    }
    case 'trim_clip': {
      const layer = getLayerById(project, command.layerId);

      if (!layer || layer.type !== 'video') {
        return fail('Video layer not found');
      }

      const durationMs = getAssetById(project, layer.assetId)?.durationMs;
      const maximumStart =
        durationMs === undefined
          ? Number.POSITIVE_INFINITY
          : Math.max(0, durationMs - MIN_TRIM_DURATION_MS);

      layer.trimStartMs = Math.min(maximumStart, Math.max(0, command.trimStartMs));
      layer.trimEndMs =
        command.trimEndMs === null
          ? null
          : Math.min(
              durationMs ?? Number.POSITIVE_INFINITY,
              Math.max(layer.trimStartMs + MIN_TRIM_DURATION_MS, command.trimEndMs),
            );

      return done(`Trimmed ${layer.name}`, { snapshotLabel: `Trim ${layer.name}` });
    }
    case 'reorder_layer': {
      const layer = getLayerById(project, command.layerId);

      if (!layer || !scene.layerIds.includes(command.layerId)) {
        return fail('Layer not found in the active scene');
      }

      const sceneLayerIds = scene.layerIds.filter((layerId) => layerId !== command.layerId);
      const boundedIndex = Math.max(0, Math.min(command.toIndex, sceneLayerIds.length));
      sceneLayerIds.splice(boundedIndex, 0, command.layerId);
      scene.layerIds = sceneLayerIds;
      renumberZIndex(project, scene);

      return done(`Reordered ${layer.name}`, { snapshotLabel: 'Reorder layers' });
    }
    case 'apply_filter_preset': {
      const layer = getLayerById(project, command.layerId);

      if (!layer) {
        return fail(LAYER_NOT_FOUND);
      }

      layer.filters = {
        ...createDefaultFilters(),
        ...FILTER_PRESETS[command.preset],
      };

      return done(`Applied ${command.preset} preset to ${layer.name}`, {
        snapshotLabel: `${command.preset} preset`,
      });
    }
    case 'set_filters': {
      const layer = getLayerById(project, command.layerId);

      if (!layer) {
        return fail(LAYER_NOT_FOUND);
      }

      const unknownKey = Object.keys(command.filters).find((key) => !isFilterKey(key));

      if (unknownKey) {
        return fail(`Unknown filter: ${unknownKey}`);
      }

      if (!patchLayerInPlace(layer, { filters: command.filters })) {
        return done(`Filters on ${layer.name} are already set`, { mutated: false });
      }

      return done(`Updated filters on ${layer.name}`, {
        snapshotLabel: `Filters ${layer.name}`,
      });
    }
    case 'reset_filters': {
      const layer = getLayerById(project, command.layerId);

      if (!layer) {
        return fail(LAYER_NOT_FOUND);
      }

      layer.filters = createDefaultFilters();

      return done(`Reset filters on ${layer.name}`, {
        snapshotLabel: `Reset filters ${layer.name}`,
      });
    }
    case 'set_style_params': {
      const layer = getLayerById(project, command.layerId);

      if (!layer) {
        return fail(LAYER_NOT_FOUND);
      }

      if (typeof command.params.opacity === 'number') {
        layer.opacity = Math.max(0, Math.min(1, command.params.opacity));
      }

      if (typeof command.params.rotation === 'number') {
        layer.rotation = command.params.rotation;
      }

      if (layer.type === 'text') {
        if (command.params.color) {
          layer.color = command.params.color;
        }
        if (command.params.fontSize) {
          layer.fontSize = command.params.fontSize;
        }
        if (command.params.fontFamily) {
          layer.fontFamily = command.params.fontFamily;
        }
      }

      return done(`Updated styling for ${layer.name}`, {
        snapshotLabel: `Style ${layer.name}`,
      });
    }
    case 'update_text': {
      const layer = getLayerById(project, command.layerId);

      if (!layer || layer.type !== 'text') {
        return fail('Text layer not found');
      }

      const changed = patchLayerInPlace(layer, {
        text: command.text,
        fontSize: command.fontSize,
        fontFamily: command.fontFamily,
        color: command.color,
        align: command.align,
      });

      if (!changed) {
        return done(`${layer.name} already has that text`, { mutated: false });
      }

      return done(`Updated text on ${layer.name}`, {
        snapshotLabel: `Text ${layer.name}`,
      });
    }
    case 'patch_layer': {
      const layer = getLayerById(project, command.layerId);

      if (!layer) {
        return fail(LAYER_NOT_FOUND);
      }

      if (!patchLayerInPlace(layer, command.patch)) {
        return done(`${layer.name} is already up to date`, { mutated: false });
      }

      return done(`Adjusted ${layer.name}`, { snapshotLabel: `Adjust ${layer.name}` });
    }
    case 'apply_animation_preset': {
      const layer = getLayerById(project, command.layerId);

      if (!layer) {
        return fail(LAYER_NOT_FOUND);
      }

      layer.animationPreset = command.preset;

      return done(`Applied ${command.preset} to ${layer.name}`, {
        snapshotLabel: `Animation ${command.preset}`,
      });
    }
    case 'mute_or_hide_layer': {
      const layer = getLayerById(project, command.layerId);

      if (!layer) {
        return fail(LAYER_NOT_FOUND);
      }

      if (typeof command.visible === 'boolean') {
        layer.visible = command.visible;
      }

      if (typeof command.muted === 'boolean') {
        layer.muted = command.muted;
      }

      return done(`Updated visibility for ${layer.name}`, {
        snapshotLabel: `Visibility ${layer.name}`,
      });
    }
    case 'rename_layer': {
      const layer = getLayerById(project, command.layerId);
      const name = command.name.trim();

      if (!layer) {
        return fail(LAYER_NOT_FOUND);
      }

      if (!name) {
        return fail('Layer name cannot be empty');
      }

      if (layer.name === name) {
        return done(`Layer is already named ${name}`, { mutated: false });
      }

      const previousName = layer.name;
      layer.name = name;

      return done(`Renamed ${previousName} to ${name}`, {
        snapshotLabel: `Rename ${name}`,
      });
    }
    case 'duplicate_layer': {
      const layer = getLayerById(project, command.layerId);

      if (!layer) {
        return fail(LAYER_NOT_FOUND);
      }

      const sourceScene =
        project.scenes.find((entry) => entry.layerIds.includes(layer.id)) ?? scene;
      const sourceIndex = sourceScene.layerIds.indexOf(layer.id);
      const copy: Layer = {
        ...structuredClone(layer),
        id: uuidv4(),
        name: `${layer.name} copy`,
        x: layer.x + 24,
        y: layer.y + 24,
      };

      insertLayer(
        project,
        sourceScene,
        copy,
        sourceIndex === -1 ? sourceScene.layerIds.length : sourceIndex + 1,
      );

      return done(`Duplicated ${layer.name}`, { snapshotLabel: `Duplicate ${layer.name}` });
    }
    case 'delete_layer': {
      const layer = getLayerById(project, command.layerId);

      if (!layer) {
        return fail(LAYER_NOT_FOUND);
      }

      project.layers = project.layers.filter((entry) => entry.id !== command.layerId);
      project.scenes.forEach((entry) => {
        if (entry.layerIds.includes(command.layerId)) {
          entry.layerIds = entry.layerIds.filter((layerId) => layerId !== command.layerId);
          renumberZIndex(project, entry);
        }
      });
      project.selection.layerId = null;

      return done(`Deleted ${layer.name}`, {
        snapshotLabel: `Delete ${layer.name}`,
        warnings: ['This action can be reversed from version history.'],
      });
    }
    default: {
      command satisfies never;
      return fail('Unsupported command');
    }
  }
};

/** Describes a command that is acknowledged without editing the project. */
const runPassiveCommand = (command: PassiveCommand): CommandOutcome => {
  switch (command.type) {
    case 'undo':
      return done('Undo requested', { mutated: false });
    case 'redo':
      return done('Redo requested', { mutated: false });
    case 'export_preview':
      return done(`Prepared ${command.format} export preview`, {
        mutated: false,
        warnings: ['Export is a product-level stub in this version.'],
      });
  }
};

/**
 * Applies several commands to one working copy of a project.
 *
 * The project is cloned at most once, and only if a command needs to edit it.
 * Failed commands are skipped and reported in `results`; the remaining commands
 * still run. If anything changed, the result carries one new project and one
 * snapshot for the whole batch, which lets a caller treat the batch as a single
 * undo step. The input project is never mutated.
 */
export const applyCommands = (
  originalProject: Project,
  commands: Command[],
  context: CommandBatchContext,
): CommandBatchResult => {
  let working: Project | null = null;
  let mutated = false;
  let lastLabel: string | null = null;
  const results: ToolResult[] = [];
  const records: CommandRecord[] = [];

  commands.forEach((command) => {
    let outcome: HandlerResult;

    if (isPassiveCommand(command)) {
      outcome = runPassiveCommand(command);
    } else {
      working ??= structuredClone(originalProject);
      outcome = runCommand(working, command);
    }

    const result = toToolResult(command, outcome);
    results.push(result);

    if (!outcome.ok) {
      return;
    }

    // Undo and redo are history operations owned by the store, so they leave
    // no audit record here.
    if (command.type !== 'undo' && command.type !== 'redo') {
      records.push(createCommandRecord(command, result, context.source));
    }

    if (outcome.mutated !== false) {
      mutated = true;
      lastLabel = outcome.snapshotLabel ?? outcome.summary;
    }
  });

  // `working` is only assigned inside the callback above, which TypeScript's
  // control-flow analysis cannot see.
  const edited = working as Project | null;

  if (!mutated || !edited) {
    return { project: originalProject, results, records, snapshot: null };
  }

  edited.updatedAt = new Date().toISOString();

  return {
    project: edited,
    results,
    records,
    snapshot:
      context.snapshot === false
        ? null
        : createVersionSnapshot(
            edited,
            context.snapshotLabel ?? lastLabel ?? 'Edit',
            context.source,
          ),
  };
};

/**
 * Applies one typed command to a cloned project and returns its audit record.
 *
 * Failed commands leave the original project untouched. Successful mutating
 * commands include a restorable snapshot; non-mutating commands (an export
 * preview, or an edit that changes nothing) return the original project object
 * with a trace record and no snapshot.
 */
export const applyCommand = (
  originalProject: Project,
  command: Command,
  context: CommandExecutionContext,
): CommandExecutionResult => {
  const batch = applyCommands(originalProject, [command], context);

  return {
    project: batch.project,
    result: batch.results[0],
    snapshot: batch.snapshot,
    record: batch.records[0] ?? null,
  };
};
