import { v4 as uuidv4 } from 'uuid';
import type { EffectInstance, EffectParams, Layer, LayerLook } from '@/types/editor';
import {
  getEffectDefinition,
  resolveEffectParams,
  sanitizeEffectParams,
} from '@/lib/effects/registry';
import { getLookDefinition } from '@/lib/effects/looks';

/**
 * Helpers for a layer's effect stack: creating effects, turning a look plus a
 * stack into the flat list the renderer draws, and upgrading projects saved
 * with the older one-slider-per-filter model.
 */

/** Creates an effect with every control filled in. Returns null for an unknown type. */
export const createEffect = (
  type: string,
  params?: unknown,
  enabled: boolean = true,
): EffectInstance | null => {
  const definition = getEffectDefinition(type);

  if (!definition) {
    return null;
  }

  return { id: uuidv4(), type, enabled, params: resolveEffectParams(definition, params) };
};

/** Clamps an intensity to 0..1, defaulting to full strength. */
export const clampIntensity = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;

/** One effect ready to draw: a known type and a complete set of controls. */
export interface ResolvedEffect {
  /** Stable key: the effect's id, or `look:<index>` for effects from a look. */
  key: string;
  type: string;
  params: EffectParams;
}

/**
 * Scales a look effect by the look's intensity: numeric controls that declare
 * a neutral value move from neutral (intensity 0) to the look's value
 * (intensity 1). Colours, switches and sizes are left as the look defines them.
 */
const scaleParams = (type: string, params: EffectParams, intensity: number): EffectParams => {
  const definition = getEffectDefinition(type);

  if (!definition) {
    return params;
  }

  const resolved = resolveEffectParams(definition, params);

  if (intensity >= 1) {
    return resolved;
  }

  definition.params.forEach((param) => {
    const value = resolved[param.key];

    if (param.kind === 'number' && param.neutral !== undefined && typeof value === 'number') {
      resolved[param.key] = param.neutral + (value - param.neutral) * intensity;
    }
  });

  return resolved;
};

/** The effects a look contributes at its current intensity. */
export const resolveLookEffects = (look: LayerLook | null | undefined): ResolvedEffect[] => {
  const definition = look ? getLookDefinition(look.id) : undefined;

  if (!look || !definition) {
    return [];
  }

  const intensity = clampIntensity(look.intensity);

  if (intensity <= 0) {
    return [];
  }

  return definition.effects.map((effect, index) => ({
    key: `look:${index}`,
    type: effect.type,
    params: scaleParams(effect.type, effect.params, intensity),
  }));
};

/** Everything drawn for a layer, in order: its look, then its enabled effects. */
export const resolveLayerEffects = (
  look: LayerLook | null | undefined,
  effects: readonly EffectInstance[] | undefined,
): ResolvedEffect[] => {
  const resolved = resolveLookEffects(look);

  (effects ?? []).forEach((effect) => {
    const definition = getEffectDefinition(effect.type);

    if (effect.enabled && definition) {
      resolved.push({
        key: effect.id,
        type: effect.type,
        params: resolveEffectParams(definition, effect.params),
      });
    }
  });

  return resolved;
};

/** Whether a layer has a look or at least one effect switched on. */
export const hasActiveEffects = (layer: Pick<Layer, 'look' | 'effects'>): boolean =>
  Boolean(layer.look && getLookDefinition(layer.look.id) && layer.look.intensity > 0) ||
  (layer.effects ?? []).some((effect) => effect.enabled);

/** A copy of a stack with fresh ids, for pasting onto another layer. */
export const cloneEffects = (effects: readonly EffectInstance[]): EffectInstance[] =>
  effects.map((effect) => ({ ...effect, id: uuidv4(), params: { ...effect.params } }));

/**
 * Cleans a stack read from storage or from a model: unknown effect types are
 * dropped, controls are clamped, ids are made unique.
 */
export const sanitizeEffects = (value: unknown): EffectInstance[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const effects: EffectInstance[] = [];

  value.forEach((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return;
    }

    const raw = entry as Record<string, unknown>;
    const definition = typeof raw.type === 'string' ? getEffectDefinition(raw.type) : undefined;

    if (!definition) {
      return;
    }

    const id = typeof raw.id === 'string' && raw.id && !seen.has(raw.id) ? raw.id : uuidv4();
    seen.add(id);
    effects.push({
      id,
      type: definition.type,
      enabled: raw.enabled !== false,
      params: resolveEffectParams(definition, raw.params),
    });
  });

  return effects;
};

/** Cleans a stored look: null unless it names a look in the library. */
export const sanitizeLook = (value: unknown): LayerLook | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const raw = value as Record<string, unknown>;

  return typeof raw.id === 'string' && getLookDefinition(raw.id)
    ? { id: raw.id, intensity: clampIntensity(raw.intensity) }
    : null;
};

/** Merges new control values onto an effect, keeping only valid ones. */
export const mergeEffectParams = (effect: EffectInstance, params: unknown): EffectParams => {
  const definition = getEffectDefinition(effect.type);

  return definition
    ? { ...effect.params, ...sanitizeEffectParams(definition, params) }
    : effect.params;
};

// ---------------------------------------------------------------------------
// Upgrade from the first filter model, where a layer carried one number per
// filter (`layer.filters`). Each non-default number becomes an effect.
// ---------------------------------------------------------------------------

type LegacyFilters = Record<string, unknown>;

const legacyNumber = (filters: LegacyFilters, key: string, fallback: number): number => {
  const value = filters[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

/** Converts a saved `filters` object into an equivalent effect stack. */
export const migrateLegacyFilters = (value: unknown): EffectInstance[] => {
  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const filters = value as LegacyFilters;
  const get = (key: string, fallback = 0) => legacyNumber(filters, key, fallback);
  const effects: EffectInstance[] = [];
  const add = (type: string, params: EffectParams) => {
    const effect = createEffect(type, params);

    if (effect) {
      effects.push(effect);
    }
  };

  const grade = {
    brightness: get('brightness', 1),
    contrast: get('contrast', 1),
    saturation: get('saturation', 1),
    vibrance: get('vibrance'),
    hue: get('hue'),
    gamma: get('gamma', 1),
  };

  if (
    grade.brightness !== 1 ||
    grade.contrast !== 1 ||
    grade.saturation !== 1 ||
    grade.vibrance !== 0 ||
    grade.hue !== 0 ||
    grade.gamma !== 1
  ) {
    add('colorAdjust', grade);
  }

  if (get('grayscale') > 0) add('blackWhite', { amount: get('grayscale') });
  if (get('sepia') > 0) add('sepia', { amount: get('sepia') });
  if (get('invert') > 0) add('invert', { amount: get('invert') });
  if (get('sharpness') !== 0) add('sharpen', { amount: get('sharpness') });
  if (get('blur') > 0) add('gaussianBlur', { strength: get('blur') * 10 });
  if (get('kawaseBlur') > 0) add('gaussianBlur', { strength: get('kawaseBlur') * 8 });
  if (get('zoomBlur') > 0) add('zoomBlur', { strength: get('zoomBlur') * 0.3, innerRadius: 0 });
  if (get('tiltShift') > 0) add('tiltShift', { blur: get('tiltShift') * 20 });
  if (get('bulgePinch') !== 0) add('bulge', { strength: get('bulgePinch') });
  if (get('twist') !== 0) add('twist', { angle: get('twist') * 10 });
  if (get('shockwave') > 0) add('shockwave', { amplitude: get('shockwave') * 30, animated: false });
  if (get('displacement') > 0) add('ripple', { amount: get('displacement') * 40 });
  if (get('glow') > 0) add('glow', { outer: get('glow') * 4, inner: get('glow') * 2, distance: 15 });
  if (get('outline') > 0) add('outline', { thickness: get('outline') * 4 });
  if (get('dropShadow') > 0) add('dropShadow', { opacity: get('dropShadow'), blur: get('dropShadow') * 5 });
  if (get('bevel') > 0) add('bevel', { thickness: get('bevel') * 3 });
  if (get('emboss') > 0) add('emboss', { strength: get('emboss') * 2 });
  if (get('pixelate') > 0) add('pixelate', { size: Math.max(1, get('pixelate') * 20) });
  if (get('dot') > 0) add('halftone', { scale: 1.5 - get('dot') });
  if (get('crossHatch') > 0) add('crossHatch', {});
  if (get('crt') > 0) {
    const crt = get('crt');
    add('crt', { curvature: crt * 2, lineWidth: Math.max(0.5, crt * 2), lineContrast: crt * 0.3, vignette: crt, noise: 0, animated: false });
  }
  if (get('oldFilm') > 0) {
    const film = get('oldFilm');
    add('oldFilm', { sepia: film * 0.3, noise: film * 0.3, scratch: film * 0.5, scratchDensity: film * 0.3, vignette: film, animated: false });
  }
  if (get('ascii') > 0) add('ascii', { size: Math.max(4, get('ascii') * 8) });
  if (get('noise') > 0) add('grain', { amount: get('noise') * 0.6, animated: false });
  if (get('bloom') > 0) add('bloom', { intensity: get('bloom') * 1.5 });
  if (get('godray') > 0) add('godray', { intensity: get('godray'), gain: get('godray') * 0.5, animated: false });
  if (get('reflection') > 0) add('mirror', { boundary: 1 - get('reflection') * 0.5, waves: 0, animated: false });
  if (get('waterReflection') > 0) {
    add('mirror', { boundary: 1 - get('waterReflection') * 0.5, waves: 10 + get('waterReflection') * 30, animated: false });
  }
  if (get('rgbSplit') > 0) add('rgbSplit', { amount: get('rgbSplit') * 5 });
  if (get('colorReplace') > 0) add('colorReplace', { from: '#000000', to: '#ff0000', tolerance: get('colorReplace') });

  return effects;
};

/**
 * Brings a stored layer up to the current effect model: an old `filters`
 * object becomes a stack, and the stack and look are validated.
 */
export const normalizeLayerEffects = <T extends object>(layer: T): T & Pick<Layer, 'effects' | 'look'> => {
  const { filters, ...rest } = layer as T & { filters?: unknown; effects?: unknown; look?: unknown };
  const effects = Array.isArray(rest.effects)
    ? sanitizeEffects(rest.effects)
    : migrateLegacyFilters(filters);

  return { ...(rest as T), effects, look: sanitizeLook(rest.look) };
};
