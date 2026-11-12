import { FilterSettings, Layer, LayerPatch, Project } from '@/types/editor';
import { FILTER_DEFINITIONS } from '@/lib/renderer/filterDefinitions';
import { MIN_LAYER_SIZE } from '@/lib/editor/defaults';

/** Shortest clip, in milliseconds, a trim may leave behind. */
export const MIN_TRIM_DURATION_MS = 250;

const FILTER_RANGES = new Map(
  FILTER_DEFINITIONS.map((definition) => [
    definition.key,
    { min: definition.min, max: definition.max },
  ]),
);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** Returns whether a string names a filter declared in FILTER_DEFINITIONS. */
export const isFilterKey = (key: string): key is keyof FilterSettings =>
  FILTER_RANGES.has(key);

/**
 * Drops unknown keys and non-finite values from a filter patch and clamps the
 * rest to the range declared by each filter definition.
 */
export const sanitizeFilterPatch = (
  patch: Partial<FilterSettings> | undefined,
): Partial<FilterSettings> => {
  const next: Partial<FilterSettings> = {};

  if (!patch) {
    return next;
  }

  Object.entries(patch).forEach(([key, value]) => {
    const range = FILTER_RANGES.get(key);

    if (range && isFilterKey(key) && isFiniteNumber(value)) {
      next[key] = clamp(value, range.min, range.max);
    }
  });

  return next;
};

/** A layer patch whose filters have been merged into a complete set. */
export type ResolvedLayerPatch = Omit<LayerPatch, 'filters'> & {
  filters?: FilterSettings;
};

/**
 * Turns a requested patch into the exact field values to write onto a layer.
 *
 * Values are clamped to the editor's limits, fields that do not apply to the
 * layer's type are dropped, filters are merged onto the current filters, and
 * fields whose value would not change are removed. An empty result therefore
 * means the patch is a no-op.
 */
export const resolveLayerPatch = (
  layer: Layer,
  patch: LayerPatch,
): ResolvedLayerPatch => {
  const next: ResolvedLayerPatch = {};

  if (isFiniteNumber(patch.x)) next.x = patch.x;
  if (isFiniteNumber(patch.y)) next.y = patch.y;
  if (isFiniteNumber(patch.width)) next.width = Math.max(MIN_LAYER_SIZE, patch.width);
  if (isFiniteNumber(patch.height)) next.height = Math.max(MIN_LAYER_SIZE, patch.height);
  if (isFiniteNumber(patch.rotation)) next.rotation = patch.rotation;
  if (isFiniteNumber(patch.opacity)) next.opacity = clamp(patch.opacity, 0, 1);
  if (typeof patch.name === 'string' && patch.name.trim()) next.name = patch.name.trim();
  if (typeof patch.visible === 'boolean') next.visible = patch.visible;
  if (typeof patch.muted === 'boolean') next.muted = patch.muted;
  if (typeof patch.blendMode === 'string') next.blendMode = patch.blendMode;
  if (typeof patch.animationPreset === 'string' || patch.animationPreset === null) {
    next.animationPreset = patch.animationPreset;
  }
  if (isFiniteNumber(patch.startMs)) next.startMs = Math.max(0, patch.startMs);
  if (isFiniteNumber(patch.durationMs)) next.durationMs = Math.max(0, patch.durationMs);

  if (layer.type === 'text') {
    if (typeof patch.text === 'string') next.text = patch.text;
    if (isFiniteNumber(patch.fontSize)) next.fontSize = Math.max(1, patch.fontSize);
    if (typeof patch.fontFamily === 'string' && patch.fontFamily) {
      next.fontFamily = patch.fontFamily;
    }
    if (typeof patch.color === 'string' && patch.color) next.color = patch.color;
    if (patch.align === 'left' || patch.align === 'center' || patch.align === 'right') {
      next.align = patch.align;
    }
  }

  if (layer.type === 'video') {
    if (isFiniteNumber(patch.trimStartMs)) next.trimStartMs = Math.max(0, patch.trimStartMs);
    if (patch.trimEndMs === null) {
      next.trimEndMs = null;
    } else if (isFiniteNumber(patch.trimEndMs)) {
      next.trimEndMs = Math.max(
        (next.trimStartMs ?? layer.trimStartMs) + MIN_TRIM_DURATION_MS,
        patch.trimEndMs,
      );
    }
  }

  const current: LayerPatch = layer;

  (Object.keys(next) as Array<keyof ResolvedLayerPatch>).forEach((key) => {
    if (Object.is(next[key], current[key])) {
      delete next[key];
    }
  });

  const filterPatch = sanitizeFilterPatch(patch.filters);
  const filterChanged = (Object.keys(filterPatch) as Array<keyof FilterSettings>).some(
    (key) => filterPatch[key] !== layer.filters[key],
  );

  if (filterChanged) {
    next.filters = { ...layer.filters, ...filterPatch };
  }

  return next;
};

/**
 * Writes a patch onto a layer that the caller owns (a layer inside a cloned
 * working project).
 *
 * @returns Whether any field changed.
 */
export const patchLayerInPlace = (layer: Layer, patch: LayerPatch): boolean => {
  const resolved = resolveLayerPatch(layer, patch);
  Object.assign(layer, resolved);
  return Object.keys(resolved).length > 0;
};

/**
 * Returns a project with one layer patched, without mutating the input.
 *
 * Only the project object, its `layers` array, and the patched layer are
 * re-created; everything else is shared with the input. The same project is
 * returned when the layer is missing or the patch changes nothing.
 */
export const applyLayerPatch = (
  project: Project,
  layerId: string,
  patch: LayerPatch,
): Project => {
  const layer = project.layers.find((entry) => entry.id === layerId);

  if (!layer) {
    return project;
  }

  const resolved = resolveLayerPatch(layer, patch);

  if (Object.keys(resolved).length === 0) {
    return project;
  }

  const nextLayer = { ...layer, ...resolved } as Layer;

  return {
    ...project,
    layers: project.layers.map((entry) => (entry.id === layerId ? nextLayer : entry)),
  };
};

/**
 * Combines two patches for the same layer into one, with the later patch
 * winning field by field and filter by filter.
 */
export const mergeLayerPatches = (
  earlier: LayerPatch,
  later: LayerPatch,
): LayerPatch => {
  const merged: LayerPatch = { ...earlier, ...later };

  if (earlier.filters || later.filters) {
    merged.filters = { ...earlier.filters, ...later.filters };
  }

  return merged;
};
