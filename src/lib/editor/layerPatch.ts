import { EffectInstance, Layer, LayerLook, LayerPatch, Project } from '@/types/editor';
import { MIN_LAYER_SIZE } from '@/lib/editor/defaults';
import { clampIntensity, mergeEffectParams } from '@/lib/effects/stack';

/** Shortest clip, in milliseconds, a trim may leave behind. */
export const MIN_TRIM_DURATION_MS = 250;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const isSameParams = (a: EffectInstance['params'], b: EffectInstance['params']) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  return [...keys].every((key) => a[key] === b[key]);
};

/**
 * Applies `effectParams` and `effectEnabled` to a stack. Effects that do not
 * change keep their object identity; the same array is returned when nothing
 * changes at all.
 */
const patchEffects = (
  effects: EffectInstance[],
  patch: Pick<LayerPatch, 'effectParams' | 'effectEnabled'>,
): EffectInstance[] => {
  let changed = false;

  const next = effects.map((effect) => {
    const paramPatch = patch.effectParams?.[effect.id];
    const enabledPatch = patch.effectEnabled?.[effect.id];
    const params = paramPatch ? mergeEffectParams(effect, paramPatch) : effect.params;
    const enabled = typeof enabledPatch === 'boolean' ? enabledPatch : effect.enabled;

    if (enabled === effect.enabled && isSameParams(params, effect.params)) {
      return effect;
    }

    changed = true;

    return { ...effect, params, enabled };
  });

  return changed ? next : effects;
};

/** A layer patch resolved into the fields to write onto the layer. */
export type ResolvedLayerPatch = Omit<
  LayerPatch,
  'effectParams' | 'effectEnabled' | 'lookIntensity'
> & {
  effects?: EffectInstance[];
  look?: LayerLook;
};

/**
 * Turns a requested patch into the exact field values to write onto a layer.
 *
 * Values are clamped to the editor's limits, fields that do not apply to the
 * layer's type are dropped, effect edits are merged into the effect stack, and
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
    if (isFiniteNumber(patch.volume)) next.volume = clamp(patch.volume, 0, 1);

    // A video layer's timeline length is its trimmed source range, so trim
    // points and duration are resolved together and kept consistent.
    const trimStart = isFiniteNumber(patch.trimStartMs)
      ? Math.max(0, patch.trimStartMs)
      : layer.trimStartMs;
    let trimEnd = layer.trimEndMs;

    if (patch.trimEndMs === null) {
      trimEnd = null;
    } else if (isFiniteNumber(patch.trimEndMs)) {
      trimEnd = patch.trimEndMs;
    } else if (isFiniteNumber(patch.durationMs)) {
      trimEnd = trimStart + patch.durationMs;
    }

    if (trimEnd !== null) {
      trimEnd = Math.max(trimStart + MIN_TRIM_DURATION_MS, trimEnd);
    }

    if (isFiniteNumber(patch.trimStartMs)) next.trimStartMs = trimStart;
    if (patch.trimEndMs !== undefined || trimEnd !== layer.trimEndMs) next.trimEndMs = trimEnd;
    if (trimEnd !== null) {
      next.durationMs = trimEnd - trimStart;
    } else if (!isFiniteNumber(patch.durationMs)) {
      delete next.durationMs;
    }
  }

  const current = layer as unknown as Record<string, unknown>;
  const resolved = next as Record<string, unknown>;

  Object.keys(resolved).forEach((key) => {
    if (Object.is(resolved[key], current[key])) {
      delete resolved[key];
    }
  });

  if (patch.effectParams || patch.effectEnabled) {
    const effects = patchEffects(layer.effects ?? [], patch);

    if (effects !== layer.effects) {
      next.effects = effects;
    }
  }

  if (isFiniteNumber(patch.lookIntensity) && layer.look) {
    const intensity = clampIntensity(patch.lookIntensity);

    if (intensity !== layer.look.intensity) {
      next.look = { ...layer.look, intensity };
    }
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
 * winning field by field, and control by control within each effect.
 */
export const mergeLayerPatches = (
  earlier: LayerPatch,
  later: LayerPatch,
): LayerPatch => {
  const merged: LayerPatch = { ...earlier, ...later };

  if (earlier.effectParams || later.effectParams) {
    const effectParams = { ...earlier.effectParams };

    Object.entries(later.effectParams ?? {}).forEach(([effectId, params]) => {
      effectParams[effectId] = { ...effectParams[effectId], ...params };
    });
    merged.effectParams = effectParams;
  }

  if (earlier.effectEnabled || later.effectEnabled) {
    merged.effectEnabled = { ...earlier.effectEnabled, ...later.effectEnabled };
  }

  return merged;
};
