import type { EffectParamValue, EffectParams } from '@/types/editor';

/**
 * The effect catalogue: every effect a layer can carry, with the controls it
 * exposes. This file is plain data (no PixiJS), so the inspector, the command
 * layer, the AI contracts and the renderer all read the same definitions.
 *
 * The renderer side of each effect lives in `src/lib/renderer/effects.ts`,
 * keyed by the same `type`.
 */

export const EFFECT_CATEGORIES = [
  'Color',
  'Blur',
  'Light',
  'Stylize',
  'Distort',
  'Retro',
] as const;

export type EffectCategory = (typeof EFFECT_CATEGORIES)[number];

interface ParamBase {
  key: string;
  label: string;
  /** Short help shown as a tooltip and sent to the AI. */
  hint?: string;
}

export interface NumberParam extends ParamBase {
  kind: 'number';
  min: number;
  max: number;
  step: number;
  default: number;
  /**
   * The value at which this control does nothing. A look's intensity slider
   * moves the control between this value and the look's value.
   */
  neutral?: number;
  unit?: string;
}

export interface ColorParam extends ParamBase {
  kind: 'color';
  /** `#rrggbb`. */
  default: string;
}

export interface BooleanParam extends ParamBase {
  kind: 'boolean';
  default: boolean;
}

export interface SelectParam extends ParamBase {
  kind: 'select';
  default: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export type EffectParamDefinition = NumberParam | ColorParam | BooleanParam | SelectParam;

export interface EffectDefinition {
  type: string;
  label: string;
  category: EffectCategory;
  description: string;
  searchTerms: string[];
  params: EffectParamDefinition[];
}

const num = (
  key: string,
  label: string,
  min: number,
  max: number,
  step: number,
  defaultValue: number,
  extra: Partial<Pick<NumberParam, 'neutral' | 'unit' | 'hint'>> = {},
): NumberParam => ({ kind: 'number', key, label, min, max, step, default: defaultValue, ...extra });

const color = (key: string, label: string, defaultValue: string, hint?: string): ColorParam => ({
  kind: 'color',
  key,
  label,
  default: defaultValue,
  hint,
});

const bool = (key: string, label: string, defaultValue: boolean, hint?: string): BooleanParam => ({
  kind: 'boolean',
  key,
  label,
  default: defaultValue,
  hint,
});

const select = (
  key: string,
  label: string,
  defaultValue: string,
  options: ReadonlyArray<{ value: string; label: string }>,
): SelectParam => ({ kind: 'select', key, label, default: defaultValue, options });

const centerX = num('centerX', 'Centre X', 0, 1, 0.01, 0.5, { hint: '0 = left edge, 1 = right edge' });
const centerY = num('centerY', 'Centre Y', 0, 1, 0.01, 0.5, { hint: '0 = top edge, 1 = bottom edge' });
const angle = (defaultValue = 0, label = 'Angle') =>
  num('angle', label, -180, 180, 1, defaultValue, { unit: '°' });
const animated = (hint: string) => bool('animated', 'Animate', true, hint);

export const EFFECT_DEFINITIONS: EffectDefinition[] = [
  // ----------------------------------------------------------------- Color
  {
    type: 'colorAdjust',
    label: 'Color adjust',
    category: 'Color',
    description: 'Exposure, contrast, saturation, white balance and fade in one effect.',
    searchTerms: ['brightness', 'exposure', 'contrast', 'saturation', 'vibrance', 'temperature', 'warm', 'cool', 'tint', 'hue', 'gamma', 'fade', 'grade', 'colour'],
    params: [
      num('brightness', 'Brightness', 0, 2, 0.01, 1, { neutral: 1 }),
      num('contrast', 'Contrast', 0, 2, 0.01, 1, { neutral: 1 }),
      num('saturation', 'Saturation', 0, 2, 0.01, 1, { neutral: 1 }),
      num('vibrance', 'Vibrance', -1, 1, 0.01, 0, { neutral: 0 }),
      num('temperature', 'Temperature', -1, 1, 0.01, 0, { neutral: 0, hint: 'Negative is cooler (blue), positive is warmer (orange)' }),
      num('tint', 'Tint', -1, 1, 0.01, 0, { neutral: 0, hint: 'Negative is greener, positive is more magenta' }),
      num('hue', 'Hue', -180, 180, 1, 0, { neutral: 0, unit: '°' }),
      num('gamma', 'Gamma', 0.2, 3, 0.01, 1, { neutral: 1, hint: 'Midtone brightness' }),
      num('fade', 'Fade', 0, 1, 0.01, 0, { neutral: 0, hint: 'Lifts the blacks like faded film' }),
    ],
  },
  {
    type: 'rgbGain',
    label: 'RGB balance',
    category: 'Color',
    description: 'Scale the red, green and blue channels separately.',
    searchTerms: ['channel', 'red', 'green', 'blue', 'balance', 'mixer'],
    params: [
      num('red', 'Red', 0, 2, 0.01, 1, { neutral: 1 }),
      num('green', 'Green', 0, 2, 0.01, 1, { neutral: 1 }),
      num('blue', 'Blue', 0, 2, 0.01, 1, { neutral: 1 }),
    ],
  },
  {
    type: 'blackWhite',
    label: 'Black & white',
    category: 'Color',
    description: 'Remove colour, fully or partly.',
    searchTerms: ['grayscale', 'greyscale', 'mono', 'monochrome', 'desaturate', 'bw'],
    params: [num('amount', 'Amount', 0, 1, 0.01, 1, { neutral: 0 })],
  },
  {
    type: 'sepia',
    label: 'Sepia',
    category: 'Color',
    description: 'Warm brown tone of old photographs.',
    searchTerms: ['brown', 'vintage', 'old', 'warm'],
    params: [num('amount', 'Amount', 0, 1, 0.01, 0.8, { neutral: 0 })],
  },
  {
    type: 'invert',
    label: 'Invert',
    category: 'Color',
    description: 'Turn the picture into its negative.',
    searchTerms: ['negative', 'reverse'],
    params: [num('amount', 'Amount', 0, 1, 0.01, 1, { neutral: 0 })],
  },
  {
    type: 'duotone',
    label: 'Duotone',
    category: 'Color',
    description: 'Recolour the picture with one colour for shadows and one for highlights.',
    searchTerms: ['two tone', 'split tone', 'gradient map', 'recolor'],
    params: [
      color('shadows', 'Shadows', '#1b1464'),
      color('highlights', 'Highlights', '#ffb347'),
      num('amount', 'Amount', 0, 1, 0.01, 1, { neutral: 0 }),
    ],
  },
  {
    type: 'colorOverlay',
    label: 'Color overlay',
    category: 'Color',
    description: 'Wash the layer with a flat colour.',
    searchTerms: ['tint', 'wash', 'fill', 'colorize'],
    params: [
      color('color', 'Color', '#ff5a36'),
      num('amount', 'Amount', 0, 1, 0.01, 0.3, { neutral: 0 }),
    ],
  },
  {
    type: 'gradientOverlay',
    label: 'Gradient overlay',
    category: 'Color',
    description: 'Lay a two-colour gradient over the layer.',
    searchTerms: ['gradient', 'wash', 'light leak', 'fade'],
    params: [
      color('from', 'From', '#ff7a18'),
      color('to', 'To', '#3a1c71'),
      select('shape', 'Shape', 'linear', [
        { value: 'linear', label: 'Linear' },
        { value: 'radial', label: 'Radial' },
      ]),
      angle(90),
      num('amount', 'Amount', 0, 1, 0.01, 0.35, { neutral: 0 }),
    ],
  },
  {
    type: 'colorReplace',
    label: 'Replace color',
    category: 'Color',
    description: 'Swap one colour for another.',
    searchTerms: ['swap', 'change color', 'recolor', 'key'],
    params: [
      color('from', 'Replace', '#00ff00'),
      color('to', 'With', '#ff00ff'),
      num('tolerance', 'Tolerance', 0, 1, 0.01, 0.3, { neutral: 0, hint: 'How close a colour must be to count as a match' }),
    ],
  },

  // ------------------------------------------------------------------ Blur
  {
    type: 'gaussianBlur',
    label: 'Blur',
    category: 'Blur',
    description: 'Smooth, even blur.',
    searchTerms: ['gaussian', 'soft', 'defocus', 'smooth'],
    params: [
      num('strength', 'Strength', 0, 60, 0.5, 8, { neutral: 0, unit: 'px' }),
      num('quality', 'Quality', 1, 10, 1, 4, { hint: 'Higher is smoother and slower' }),
    ],
  },
  {
    type: 'motionBlur',
    label: 'Motion blur',
    category: 'Blur',
    description: 'Smear the picture in one direction.',
    searchTerms: ['directional', 'speed', 'streak'],
    params: [num('distance', 'Distance', 0, 120, 1, 30, { neutral: 0, unit: 'px' }), angle(0)],
  },
  {
    type: 'zoomBlur',
    label: 'Zoom blur',
    category: 'Blur',
    description: 'Blur that rushes outward from a point.',
    searchTerms: ['radial', 'speed', 'warp', 'focus'],
    params: [
      num('strength', 'Strength', 0, 0.6, 0.01, 0.15, { neutral: 0 }),
      num('innerRadius', 'Sharp area', 0, 1, 0.01, 0.15, { hint: 'Size of the sharp area around the centre' }),
      centerX,
      centerY,
    ],
  },
  {
    type: 'spinBlur',
    label: 'Spin blur',
    category: 'Blur',
    description: 'Blur that rotates around a point.',
    searchTerms: ['radial', 'rotate', 'circular'],
    params: [num('angle', 'Angle', -90, 90, 1, 12, { neutral: 0, unit: '°' }), centerX, centerY],
  },
  {
    type: 'tiltShift',
    label: 'Tilt shift',
    category: 'Blur',
    description: 'Keep a horizontal band sharp and blur the rest, like a miniature.',
    searchTerms: ['miniature', 'depth of field', 'focus band'],
    params: [
      num('blur', 'Blur', 0, 60, 0.5, 14, { neutral: 0, unit: 'px' }),
      num('position', 'Focus position', 0, 1, 0.01, 0.5, { hint: '0 = top, 1 = bottom' }),
      num('spread', 'Falloff', 0.05, 1, 0.01, 0.5, { hint: 'How gradually the blur ramps up' }),
    ],
  },
  {
    type: 'sharpen',
    label: 'Sharpen',
    category: 'Blur',
    description: 'Crisper edges, or a gentle soften with negative values.',
    searchTerms: ['sharp', 'crisp', 'detail', 'clarity', 'soften'],
    params: [num('amount', 'Amount', -1, 1, 0.01, 0.4, { neutral: 0 })],
  },

  // ----------------------------------------------------------------- Light
  {
    type: 'glow',
    label: 'Glow',
    category: 'Light',
    description: 'Coloured light around and inside the layer’s edges.',
    searchTerms: ['neon', 'halo', 'light', 'aura'],
    params: [
      color('color', 'Color', '#ffffff'),
      num('outer', 'Outer strength', 0, 10, 0.1, 2, { neutral: 0 }),
      num('inner', 'Inner strength', 0, 10, 0.1, 0, { neutral: 0 }),
      num('distance', 'Size', 1, 30, 1, 12, { unit: 'px' }),
      bool('knockout', 'Glow only', false, 'Hide the layer and keep only its glow'),
    ],
  },
  {
    type: 'bloom',
    label: 'Bloom',
    category: 'Light',
    description: 'Bright areas bleed soft light, like a lens in strong light.',
    searchTerms: ['glow', 'dreamy', 'highlights', 'soft light'],
    params: [
      num('intensity', 'Intensity', 0, 3, 0.01, 0.8, { neutral: 0 }),
      num('threshold', 'Threshold', 0, 1, 0.01, 0.5, { hint: 'How bright a pixel must be to bloom' }),
      num('blur', 'Spread', 0, 20, 0.5, 6, { unit: 'px' }),
    ],
  },
  {
    type: 'godray',
    label: 'Light rays',
    category: 'Light',
    description: 'Shafts of light streaming across the layer.',
    searchTerms: ['god rays', 'sun', 'beams', 'volumetric', 'shafts'],
    params: [
      num('intensity', 'Intensity', 0, 1, 0.01, 0.6, { neutral: 0 }),
      angle(30),
      num('gain', 'Density', 0, 1, 0.01, 0.5),
      num('lacunarity', 'Detail', 0.5, 5, 0.1, 2.5),
      animated('Rays drift slowly as the video plays'),
    ],
  },
  {
    type: 'dropShadow',
    label: 'Drop shadow',
    category: 'Light',
    description: 'Shadow behind the layer.',
    searchTerms: ['shadow', 'depth', 'lift'],
    params: [
      color('color', 'Color', '#000000'),
      num('opacity', 'Opacity', 0, 1, 0.01, 0.5, { neutral: 0 }),
      num('blur', 'Softness', 0, 20, 0.5, 4, { unit: 'px' }),
      num('distance', 'Distance', 0, 80, 1, 8, { unit: 'px' }),
      angle(45),
    ],
  },
  {
    type: 'outline',
    label: 'Outline',
    category: 'Light',
    description: 'Solid stroke around the layer’s edges.',
    searchTerms: ['stroke', 'border', 'edge'],
    params: [
      color('color', 'Color', '#ffffff'),
      num('thickness', 'Thickness', 0, 20, 0.5, 3, { neutral: 0, unit: 'px' }),
      num('opacity', 'Opacity', 0, 1, 0.01, 1),
    ],
  },
  {
    type: 'vignette',
    label: 'Vignette',
    category: 'Light',
    description: 'Darken the corners to pull the eye to the centre.',
    searchTerms: ['corners', 'darken edges', 'frame', 'focus'],
    params: [
      num('amount', 'Amount', 0, 1, 0.01, 0.6, { neutral: 0 }),
      num('size', 'Size', 0, 1, 0.01, 0.35, { hint: 'How far the darkening reaches in' }),
      num('softness', 'Softness', 0, 1, 0.01, 0.4),
    ],
  },

  // --------------------------------------------------------------- Stylize
  {
    type: 'grain',
    label: 'Film grain',
    category: 'Stylize',
    description: 'Fine noise over the picture.',
    searchTerms: ['noise', 'texture', 'film', 'static'],
    params: [
      num('amount', 'Amount', 0, 1, 0.01, 0.18, { neutral: 0 }),
      animated('Grain changes every frame, like real film'),
    ],
  },
  {
    type: 'pixelate',
    label: 'Pixelate',
    category: 'Stylize',
    description: 'Large square pixels. Also useful to hide a face or text.',
    searchTerms: ['mosaic', 'censor', '8-bit', 'blocks'],
    params: [num('size', 'Block size', 1, 80, 1, 12, { neutral: 1, unit: 'px' })],
  },
  {
    type: 'halftone',
    label: 'Halftone',
    category: 'Stylize',
    description: 'Printed-newspaper dot pattern.',
    searchTerms: ['dots', 'print', 'comic', 'newspaper'],
    params: [
      num('scale', 'Dot scale', 0.3, 2, 0.01, 1, { hint: 'Higher is finer dots' }),
      angle(5),
      bool('grayscale', 'Black & white', true),
    ],
  },
  {
    type: 'crossHatch',
    label: 'Cross hatch',
    category: 'Stylize',
    description: 'Pen-and-ink hatching.',
    searchTerms: ['sketch', 'ink', 'drawing', 'hatch'],
    params: [],
  },
  {
    type: 'ascii',
    label: 'ASCII',
    category: 'Stylize',
    description: 'Rebuild the picture out of text characters.',
    searchTerms: ['text', 'terminal', 'characters', 'matrix'],
    params: [
      num('size', 'Character size', 4, 24, 1, 8, { unit: 'px' }),
      bool('tinted', 'Single color', false),
      color('color', 'Color', '#39ff14'),
    ],
  },
  {
    type: 'emboss',
    label: 'Emboss',
    category: 'Stylize',
    description: 'Raised, stamped-metal relief.',
    searchTerms: ['relief', 'stamp', 'raised'],
    params: [num('strength', 'Strength', 0, 10, 0.1, 3, { neutral: 0 })],
  },
  {
    type: 'bevel',
    label: 'Bevel',
    category: 'Stylize',
    description: 'Lit and shaded edges for a 3D look.',
    searchTerms: ['3d', 'edge', 'raised', 'chisel'],
    params: [
      num('thickness', 'Thickness', 0, 12, 0.5, 3, { neutral: 0, unit: 'px' }),
      angle(45, 'Light angle'),
      color('light', 'Light', '#ffffff'),
      num('lightOpacity', 'Light opacity', 0, 1, 0.01, 0.7),
      color('shadow', 'Shadow', '#000000'),
      num('shadowOpacity', 'Shadow opacity', 0, 1, 0.01, 0.7),
    ],
  },

  // --------------------------------------------------------------- Distort
  {
    type: 'bulge',
    label: 'Bulge / pinch',
    category: 'Distort',
    description: 'Push the picture outward (positive) or pinch it inward (negative).',
    searchTerms: ['fisheye', 'lens', 'pinch', 'warp'],
    params: [
      num('strength', 'Strength', -1, 1, 0.01, 0.5, { neutral: 0 }),
      num('radius', 'Radius', 0.05, 1, 0.01, 0.5, { hint: 'Fraction of the layer’s shorter side' }),
      centerX,
      centerY,
    ],
  },
  {
    type: 'twist',
    label: 'Twist',
    category: 'Distort',
    description: 'Swirl the picture around a point.',
    searchTerms: ['swirl', 'spiral', 'whirl', 'warp'],
    params: [
      num('angle', 'Amount', -10, 10, 0.1, 3, { neutral: 0 }),
      num('radius', 'Radius', 0.05, 1, 0.01, 0.5, { hint: 'Fraction of the layer’s shorter side' }),
      centerX,
      centerY,
    ],
  },
  {
    type: 'shockwave',
    label: 'Shockwave',
    category: 'Distort',
    description: 'A ring that ripples outward from a point.',
    searchTerms: ['ripple', 'ring', 'pulse', 'impact', 'wave'],
    params: [
      num('amplitude', 'Strength', 0, 80, 1, 24, { neutral: 0 }),
      num('wavelength', 'Ring width', 20, 400, 1, 140, { unit: 'px' }),
      num('progress', 'Position', 0, 1, 0.01, 0.35, { hint: 'How far the ring has travelled when not animated' }),
      animated('The ring travels outward and repeats'),
      num('period', 'Repeat every', 0.3, 6, 0.1, 1.6, { unit: 's' }),
      centerX,
      centerY,
    ],
  },
  {
    type: 'ripple',
    label: 'Ripple',
    category: 'Distort',
    description: 'Wobble the picture as if seen through water or heat.',
    searchTerms: ['displace', 'water', 'heat', 'wobble', 'distort'],
    params: [num('amount', 'Amount', 0, 120, 1, 30, { neutral: 0 })],
  },
  {
    type: 'mirror',
    label: 'Reflection',
    category: 'Distort',
    description: 'Mirror the upper part of the layer into the lower part, flat or rippled like water.',
    searchTerms: ['mirror', 'water', 'reflect', 'lake'],
    params: [
      num('boundary', 'Waterline', 0.05, 1, 0.01, 0.65, { neutral: 1, hint: '0 = top, 1 = bottom (no reflection)' }),
      num('waves', 'Waves', 0, 60, 1, 12, { hint: '0 is a flat mirror' }),
      num('wavelength', 'Wave length', 10, 200, 1, 60, { unit: 'px' }),
      num('fade', 'Fade out', 0, 1, 0.01, 0.6, { hint: 'How much the reflection fades towards the bottom' }),
      animated('Waves move as the video plays'),
    ],
  },
  {
    type: 'rgbSplit',
    label: 'RGB split',
    category: 'Distort',
    description: 'Pull the colour channels apart (chromatic aberration).',
    searchTerms: ['chromatic', 'aberration', 'glitch', 'channel', '3d'],
    params: [num('amount', 'Amount', 0, 40, 0.5, 6, { neutral: 0, unit: 'px' }), angle(0)],
  },
  {
    type: 'glitch',
    label: 'Glitch',
    category: 'Distort',
    description: 'Broken-signal slices and colour tearing.',
    searchTerms: ['digital', 'error', 'corrupt', 'tear', 'datamosh'],
    params: [
      num('offset', 'Slice shift', 0, 200, 1, 40, { neutral: 0, unit: 'px' }),
      num('slices', 'Slices', 2, 40, 1, 10),
      num('colorShift', 'Color tearing', 0, 30, 0.5, 4, { neutral: 0, unit: 'px' }),
      angle(0, 'Direction'),
      animated('The slices reshuffle as the video plays'),
      num('rate', 'Changes per second', 1, 30, 1, 10),
    ],
  },

  // ----------------------------------------------------------------- Retro
  {
    type: 'crt',
    label: 'CRT screen',
    category: 'Retro',
    description: 'Old tube television: scan lines, curve and static.',
    searchTerms: ['tv', 'scanlines', 'vhs', 'monitor', 'retro'],
    params: [
      num('lineContrast', 'Line strength', 0, 1, 0.01, 0.3, { neutral: 0 }),
      num('lineWidth', 'Line width', 0.5, 6, 0.1, 2, { unit: 'px' }),
      num('curvature', 'Curve', 0, 10, 0.1, 1.5),
      num('noise', 'Static', 0, 1, 0.01, 0.15, { neutral: 0 }),
      num('vignette', 'Dark corners', 0, 1, 0.01, 0.5, { neutral: 0 }),
      bool('vertical', 'Vertical lines', false),
      animated('Lines roll and static flickers as the video plays'),
    ],
  },
  {
    type: 'oldFilm',
    label: 'Old film',
    category: 'Retro',
    description: 'Scratched, grainy, sepia film stock.',
    searchTerms: ['vintage', 'scratches', 'projector', 'silent film', '8mm'],
    params: [
      num('sepia', 'Sepia', 0, 1, 0.01, 0.3, { neutral: 0 }),
      num('noise', 'Grain', 0, 1, 0.01, 0.3, { neutral: 0 }),
      num('scratch', 'Scratches', 0, 1, 0.01, 0.5, { neutral: 0 }),
      num('scratchDensity', 'Scratch count', 0, 1, 0.01, 0.3),
      num('vignette', 'Dark corners', 0, 1, 0.01, 0.6, { neutral: 0 }),
      animated('Scratches and grain flicker as the video plays'),
    ],
  },
];

const DEFINITIONS_BY_TYPE = new Map(EFFECT_DEFINITIONS.map((definition) => [definition.type, definition]));

export const getEffectDefinition = (type: string): EffectDefinition | undefined =>
  DEFINITIONS_BY_TYPE.get(type);

export const isEffectType = (type: unknown): type is string =>
  typeof type === 'string' && DEFINITIONS_BY_TYPE.has(type);

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Returns the value a control accepts for `raw`, or `undefined` when it is unusable. */
const coerceParam = (
  definition: EffectParamDefinition,
  raw: unknown,
): EffectParamValue | undefined => {
  switch (definition.kind) {
    case 'number':
      return typeof raw === 'number' && Number.isFinite(raw)
        ? Math.max(definition.min, Math.min(definition.max, raw))
        : undefined;
    case 'color':
      return typeof raw === 'string' && HEX_COLOR.test(raw) ? raw.toLowerCase() : undefined;
    case 'boolean':
      return typeof raw === 'boolean' ? raw : undefined;
    case 'select':
      return definition.options.some((option) => option.value === raw) ? (raw as string) : undefined;
  }
};

/** The default value of every control of an effect. */
export const getDefaultParams = (definition: EffectDefinition): EffectParams =>
  Object.fromEntries(definition.params.map((param) => [param.key, param.default]));

/**
 * Keeps only the controls an effect declares, clamps numbers to their range
 * and drops values of the wrong kind. Unknown keys are discarded.
 */
export const sanitizeEffectParams = (
  definition: EffectDefinition,
  params: unknown,
): EffectParams => {
  const next: EffectParams = {};

  if (typeof params !== 'object' || params === null) {
    return next;
  }

  const source = params as Record<string, unknown>;

  definition.params.forEach((param) => {
    const value = coerceParam(param, source[param.key]);

    if (value !== undefined) {
      next[param.key] = value;
    }
  });

  return next;
};

/** A complete set of controls: defaults overlaid with the valid values of `params`. */
export const resolveEffectParams = (
  definition: EffectDefinition,
  params: unknown,
): EffectParams => ({
  ...getDefaultParams(definition),
  ...sanitizeEffectParams(definition, params),
});

/** Controls of an effect whose value differs from the default, for compact summaries. */
export const getChangedParams = (definition: EffectDefinition, params: EffectParams): EffectParams =>
  Object.fromEntries(
    definition.params
      .filter((param) => params[param.key] !== undefined && params[param.key] !== param.default)
      .map((param) => [param.key, params[param.key]]),
  );
