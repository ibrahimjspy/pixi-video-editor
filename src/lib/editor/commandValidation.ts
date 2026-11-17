import { Asset, Command } from '@/types/editor';
import { isEffectType } from '@/lib/effects/registry';
import { isLookId } from '@/lib/effects/looks';

type UnknownRecord = Record<string, unknown>;

/** Returns whether a value is a plain JSON-like object. */
const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Returns whether a value is a finite number when it is present. */
const isOptionalNumber = (value: unknown): value is number | undefined =>
  value === undefined || (typeof value === 'number' && Number.isFinite(value));

/** Returns whether a value is a string when it is present. */
const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

/** Returns whether a value is a boolean when it is present. */
const isOptionalBoolean = (value: unknown): value is boolean | undefined =>
  value === undefined || typeof value === 'boolean';

/** Returns whether a value is a supported text alignment when it is present. */
const isOptionalAlign = (value: unknown): boolean =>
  value === undefined || value === 'left' || value === 'center' || value === 'right';

/** Validates a map of effect control values: numbers, strings and booleans only. */
const isEffectParams = (value: unknown): boolean =>
  isRecord(value) &&
  Object.values(value).every(
    (entry) =>
      (typeof entry === 'number' && Number.isFinite(entry)) ||
      typeof entry === 'string' ||
      typeof entry === 'boolean',
  );

const isOptionalEffectParams = (value: unknown): boolean =>
  value === undefined || isEffectParams(value);

const isOptionalIntensity = (value: unknown): boolean =>
  value === undefined ||
  (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1);

const LAYER_PATCH_VALIDATORS: Record<string, (value: unknown) => boolean> = {
  x: isOptionalNumber,
  y: isOptionalNumber,
  width: isOptionalNumber,
  height: isOptionalNumber,
  rotation: isOptionalNumber,
  opacity: isOptionalNumber,
  name: isOptionalString,
  visible: isOptionalBoolean,
  muted: isOptionalBoolean,
  blendMode: isOptionalString,
  animationPreset: (value) => value === null || isOptionalString(value),
  startMs: isOptionalNumber,
  durationMs: isOptionalNumber,
  text: isOptionalString,
  fontSize: isOptionalNumber,
  fontFamily: isOptionalString,
  color: isOptionalString,
  align: isOptionalAlign,
  volume: isOptionalNumber,
  trimStartMs: isOptionalNumber,
  trimEndMs: (value) => value === null || isOptionalNumber(value),
  effectParams: (value) =>
    value === undefined || (isRecord(value) && Object.values(value).every(isEffectParams)),
  effectEnabled: (value) =>
    value === undefined ||
    (isRecord(value) && Object.values(value).every((entry) => typeof entry === 'boolean')),
  lookIntensity: isOptionalIntensity,
};

/**
 * Validates a generic layer patch. Unknown keys are rejected so a model cannot
 * overwrite identity or ordering fields such as `id`, `type`, or `zIndex`.
 */
const isLayerPatch = (value: unknown): boolean =>
  isRecord(value) &&
  Object.entries(value).every(([key, entry]) => {
    const validate = Object.prototype.hasOwnProperty.call(LAYER_PATCH_VALIDATORS, key)
      ? LAYER_PATCH_VALIDATORS[key]
      : undefined;

    return validate !== undefined && validate(entry);
  });

/**
 * Validates the persisted asset shape accepted by the import command.
 *
 * Provider-generated plans are untrusted JSON. Checking every required asset
 * field prevents malformed commands from reaching code that assumes identifiers
 * and URLs exist.
 */
const isAsset = (value: unknown): value is Asset => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    (value.kind === 'image' || value.kind === 'video') &&
    typeof value.name === 'string' &&
    typeof value.url === 'string' &&
    typeof value.mimeType === 'string' &&
    typeof value.importedAt === 'string' &&
    isOptionalNumber(value.width) &&
    isOptionalNumber(value.height) &&
    isOptionalNumber(value.durationMs)
  );
};

/**
 * Runtime-validates a command received across an API or model boundary.
 *
 * TypeScript types disappear at runtime, so this guard protects command
 * execution from missing identifiers, non-finite geometry, unsupported enum
 * values, and mismatched model output.
 */
export const isSupportedCommand = (value: unknown): value is Command => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  switch (value.type) {
    case 'import_asset':
      return (
        isAsset(value.asset) &&
        (value.placeOnCanvas === undefined || typeof value.placeOnCanvas === 'boolean')
      );
    case 'create_text':
      return (
        typeof value.text === 'string' &&
        isOptionalNumber(value.x) &&
        isOptionalNumber(value.y) &&
        isOptionalNumber(value.width) &&
        isOptionalNumber(value.height) &&
        isOptionalNumber(value.fontSize) &&
        isOptionalString(value.color) &&
        isOptionalString(value.fontFamily)
      );
    case 'set_canvas_ratio':
      return value.aspectRatio === '16:9' || value.aspectRatio === '9:16' || value.aspectRatio === '1:1';
    case 'move_layer':
      return (
        typeof value.layerId === 'string' &&
        typeof value.x === 'number' && Number.isFinite(value.x) &&
        typeof value.y === 'number' && Number.isFinite(value.y)
      );
    case 'resize_layer':
      return (
        typeof value.layerId === 'string' &&
        typeof value.width === 'number' && Number.isFinite(value.width) &&
        typeof value.height === 'number' && Number.isFinite(value.height)
      );
    case 'trim_clip':
      return (
        typeof value.layerId === 'string' &&
        typeof value.trimStartMs === 'number' && Number.isFinite(value.trimStartMs) &&
        (value.trimEndMs === null ||
          (typeof value.trimEndMs === 'number' && Number.isFinite(value.trimEndMs)))
      );
    case 'reorder_layer':
      return (
        typeof value.layerId === 'string' &&
        typeof value.toIndex === 'number' &&
        Number.isInteger(value.toIndex)
      );
    case 'add_effect':
      return (
        typeof value.layerId === 'string' &&
        isEffectType(value.effect) &&
        isOptionalEffectParams(value.params) &&
        (value.index === undefined ||
          (typeof value.index === 'number' && Number.isInteger(value.index) && value.index >= 0))
      );
    case 'update_effect':
      return (
        typeof value.layerId === 'string' &&
        typeof value.effectId === 'string' &&
        isOptionalEffectParams(value.params) &&
        isOptionalBoolean(value.enabled) &&
        (value.params !== undefined || value.enabled !== undefined)
      );
    case 'remove_effect':
      return typeof value.layerId === 'string' && typeof value.effectId === 'string';
    case 'reorder_effect':
      return (
        typeof value.layerId === 'string' &&
        typeof value.effectId === 'string' &&
        typeof value.toIndex === 'number' &&
        Number.isInteger(value.toIndex)
      );
    case 'set_effects':
      return (
        typeof value.layerId === 'string' &&
        Array.isArray(value.effects) &&
        value.effects.every(
          (entry) =>
            isRecord(entry) &&
            isEffectType(entry.type) &&
            isOptionalEffectParams(entry.params) &&
            isOptionalBoolean(entry.enabled),
        ) &&
        (value.look === undefined ||
          value.look === null ||
          (isRecord(value.look) && isLookId(value.look.id) && isOptionalIntensity(value.look.intensity)))
      );
    case 'set_look':
      return (
        typeof value.layerId === 'string' &&
        (value.look === null || isLookId(value.look)) &&
        isOptionalIntensity(value.intensity)
      );
    case 'add_adjustment_layer':
      return (
        isOptionalString(value.name) &&
        isOptionalNumber(value.startMs) &&
        isOptionalNumber(value.durationMs) &&
        (value.durationMs === undefined || value.durationMs > 0)
      );
    case 'set_layer_frame':
      return (
        typeof value.layerId === 'string' &&
        isOptionalNumber(value.x) &&
        isOptionalNumber(value.y) &&
        isOptionalNumber(value.width) &&
        isOptionalNumber(value.height) &&
        isOptionalNumber(value.rotation)
      );
    case 'update_text':
      return (
        typeof value.layerId === 'string' &&
        isOptionalString(value.text) &&
        isOptionalNumber(value.fontSize) &&
        (value.fontSize === undefined || value.fontSize > 0) &&
        isOptionalString(value.fontFamily) &&
        isOptionalString(value.color) &&
        isOptionalAlign(value.align)
      );
    case 'rename_layer':
      return (
        typeof value.layerId === 'string' &&
        typeof value.name === 'string' &&
        value.name.trim().length > 0
      );
    case 'patch_layer':
      return typeof value.layerId === 'string' && isLayerPatch(value.patch);
    case 'set_style_params': {
      if (typeof value.layerId !== 'string' || !isRecord(value.params)) {
        return false;
      }

      return (
        isOptionalNumber(value.params.opacity) &&
        isOptionalNumber(value.params.rotation) &&
        isOptionalNumber(value.params.fontSize) &&
        isOptionalString(value.params.color) &&
        isOptionalString(value.params.fontFamily)
      );
    }
    case 'add_caption_block':
      return typeof value.text === 'string';
    case 'apply_animation_preset':
      return (
        typeof value.layerId === 'string' &&
        ['drift-in', 'punch-zoom', 'soft-fade'].includes(String(value.preset))
      );
    case 'mute_or_hide_layer':
      return (
        typeof value.layerId === 'string' &&
        (value.muted === undefined || typeof value.muted === 'boolean') &&
        (value.visible === undefined || typeof value.visible === 'boolean')
      );
    case 'clear_effects':
    case 'duplicate_layer':
      return typeof value.layerId === 'string';
    case 'delete_layer':
      return (
        typeof value.layerId === 'string' &&
        (value.ripple === undefined || typeof value.ripple === 'boolean')
      );
    case 'split_layer':
      return (
        typeof value.layerId === 'string' &&
        typeof value.atMs === 'number' &&
        Number.isFinite(value.atMs) &&
        value.atMs >= 0
      );
    case 'undo':
    case 'redo':
      return true;
    case 'export_preview':
      return ['mp4', 'webm', 'png-sequence'].includes(String(value.format));
    default:
      return false;
  }
};
