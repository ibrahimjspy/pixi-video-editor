import * as PIXI from 'pixi.js';
import {
  AdjustmentFilter,
  AdvancedBloomFilter,
  AsciiFilter,
  BevelFilter,
  BulgePinchFilter,
  ColorGradientFilter,
  ColorOverlayFilter,
  ColorReplaceFilter,
  ConvolutionFilter,
  CrossHatchFilter,
  CRTFilter,
  DotFilter,
  DropShadowFilter,
  EmbossFilter,
  GlitchFilter,
  GlowFilter,
  GodrayFilter,
  MotionBlurFilter,
  OldFilmFilter,
  OutlineFilter,
  PixelateFilter,
  RadialBlurFilter,
  ReflectionFilter,
  RGBSplitFilter,
  ShockwaveFilter,
  TiltShiftFilter,
  TwistFilter,
  ZoomBlurFilter,
} from 'pixi-filters';

import {
  buildColorMatrix,
  ColorMatrix20,
  duotoneMatrix,
  gainMatrix,
  grayscaleMatrix,
  identityMatrix,
  invertMatrix,
  sepiaMatrix,
} from '@/lib/effects/colorMatrix';
import { resolveLayerEffects, ResolvedEffect } from '@/lib/effects/stack';
import { getDisplacementSprite } from '@/lib/renderer/displacementMap';
import type { EffectInstance, EffectParams, LayerLook } from '@/types/editor';

/**
 * Turns a layer's look and effect stack into PixiJS filters.
 *
 * Each effect type has a small factory that creates its filter(s) once and an
 * `update` that writes the current control values, the target's size and the
 * playhead time into them. Dragging a slider therefore only updates uniforms;
 * filters are rebuilt when the stack itself changes (an effect is added,
 * removed, reordered or switched), or when a control that is baked into the
 * shader changes.
 */

/** Global-space bounds of the filtered object. */
export interface EffectGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface EffectRuntime {
  filters: PIXI.Filter[];
  /** Writes control values into the filters. */
  update: (params: EffectParams, geometry: EffectGeometry, timeMs: number) => void;
  /** Releases anything the filters do not own themselves. */
  dispose?: () => void;
}

interface EffectFactory {
  create: (params: EffectParams) => EffectRuntime;
  /** Controls that cannot change on a live filter; a new value rebuilds it. */
  rebuildKey?: (params: EffectParams) => string;
  /** Whether the effect reads the playhead time with these controls. */
  usesTime?: (params: EffectParams) => boolean;
}

// Controls arrive resolved: every key present and of the declared kind.
const n = (params: EffectParams, key: string): number => params[key] as number;
const s = (params: EffectParams, key: string): string => params[key] as string;
const b = (params: EffectParams, key: string): boolean => params[key] as boolean;

const DEG = Math.PI / 180;

const hexToRgb = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.slice(1), 16);

  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
};

/** Repeatable pseudo-random number in (0, 1) for a whole-number step. */
const stepRandom = (step: number): number => {
  const value = Math.sin(step * 12.9898 + 78.233) * 43758.5453;

  return 0.001 + (value - Math.floor(value)) * 0.998;
};

/** Which frame of a flickering effect the playhead is on. */
const flickerStep = (timeMs: number, perSecond: number): number =>
  Math.floor((Math.max(0, timeMs) / 1000) * perSecond);

const isAnimated = (params: EffectParams): boolean => b(params, 'animated');

/** 3x3 kernel: amount > 0 sharpens (unsharp-style), amount < 0 softens towards a box blur. */
const sharpnessKernel = (amount: number): Float32Array => {
  if (amount >= 0) {
    const a = amount * 1.5;

    return new Float32Array([0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0]);
  }

  const t = -amount;
  const side = t / 9;

  return new Float32Array([side, side, side, side, 1 - t + side, side, side, side, side]);
};

/** An effect that is one colour matrix. */
const matrixEffect = (build: (params: EffectParams) => ColorMatrix20): EffectFactory => ({
  create: () => {
    const filter = new PIXI.ColorMatrixFilter();

    return {
      filters: [filter],
      update: (params) => {
        filter.matrix = build(params);
      },
    };
  },
});

const FACTORIES: Record<string, EffectFactory> = {
  // ----------------------------------------------------------------- Color
  colorAdjust: {
    // Gamma is not linear, so it needs its own pass; it is only added when used.
    rebuildKey: (params) => (n(params, 'gamma') !== 1 ? 'gamma' : ''),
    create: (initial) => {
      const matrix = new PIXI.ColorMatrixFilter();
      const gamma = n(initial, 'gamma') !== 1 ? new AdjustmentFilter({ gamma: n(initial, 'gamma') }) : null;

      return {
        filters: gamma ? [matrix, gamma] : [matrix],
        update: (params) => {
          matrix.matrix =
            buildColorMatrix({
              brightness: n(params, 'brightness'),
              contrast: n(params, 'contrast'),
              saturation: n(params, 'saturation'),
              vibrance: n(params, 'vibrance'),
              temperature: n(params, 'temperature'),
              tint: n(params, 'tint'),
              hue: n(params, 'hue'),
              fade: n(params, 'fade'),
            }) ?? identityMatrix();

          if (gamma) {
            gamma.gamma = n(params, 'gamma');
          }
        },
      };
    },
  },
  rgbGain: matrixEffect((params) => gainMatrix(n(params, 'red'), n(params, 'green'), n(params, 'blue'))),
  blackWhite: matrixEffect((params) => grayscaleMatrix(n(params, 'amount'))),
  sepia: matrixEffect((params) => sepiaMatrix(n(params, 'amount'))),
  invert: matrixEffect((params) => invertMatrix(n(params, 'amount'))),
  duotone: matrixEffect((params) =>
    duotoneMatrix(hexToRgb(s(params, 'shadows')), hexToRgb(s(params, 'highlights')), n(params, 'amount')),
  ),
  colorOverlay: {
    create: (initial) => {
      const filter = new ColorOverlayFilter({ color: s(initial, 'color'), alpha: n(initial, 'amount') });

      return {
        filters: [filter],
        update: (params) => {
          filter.color = s(params, 'color');
          filter.alpha = n(params, 'amount');
        },
      };
    },
  },
  gradientOverlay: {
    create: (initial) => {
      const stopsOf = (params: EffectParams) => [
        { offset: 0, color: s(params, 'from'), alpha: 1 },
        { offset: 1, color: s(params, 'to'), alpha: 1 },
      ];
      const typeOf = (params: EffectParams) => (s(params, 'shape') === 'radial' ? 1 : 0);
      const filter = new ColorGradientFilter({
        type: typeOf(initial),
        stops: stopsOf(initial),
        angle: n(initial, 'angle'),
        alpha: n(initial, 'amount'),
        replace: false,
      });

      return {
        filters: [filter],
        update: (params) => {
          filter.stops = stopsOf(params);
          filter.type = typeOf(params);
          filter.angle = n(params, 'angle');
          filter.alpha = n(params, 'amount');
        },
      };
    },
  },
  colorReplace: {
    create: (initial) => {
      const filter = new ColorReplaceFilter({
        originalColor: s(initial, 'from'),
        targetColor: s(initial, 'to'),
        tolerance: n(initial, 'tolerance'),
      });

      return {
        filters: [filter],
        update: (params) => {
          filter.originalColor = s(params, 'from');
          filter.targetColor = s(params, 'to');
          filter.tolerance = n(params, 'tolerance');
        },
      };
    },
  },

  // ------------------------------------------------------------------ Blur
  gaussianBlur: {
    create: (initial) => {
      const filter = new PIXI.BlurFilter({ strength: n(initial, 'strength'), quality: n(initial, 'quality') });

      return {
        filters: [filter],
        update: (params) => {
          filter.strength = n(params, 'strength');
          filter.quality = Math.round(n(params, 'quality'));
        },
      };
    },
  },
  motionBlur: {
    create: () => {
      const filter = new MotionBlurFilter({ velocity: { x: 0, y: 0 }, kernelSize: 15 });

      return {
        filters: [filter],
        update: (params) => {
          const distance = n(params, 'distance');
          const radians = n(params, 'angle') * DEG;

          filter.velocity = { x: Math.cos(radians) * distance, y: Math.sin(radians) * distance };
          // More samples for longer smears; the shader wants an odd count.
          filter.kernelSize = Math.min(25, 5 + 2 * Math.round(distance / 12));
          filter.padding = distance;
        },
      };
    },
  },
  zoomBlur: {
    create: (initial) => {
      const filter = new ZoomBlurFilter({ strength: n(initial, 'strength'), radius: -1 });

      return {
        filters: [filter],
        update: (params, { width, height }) => {
          filter.strength = n(params, 'strength');
          filter.center = { x: width * n(params, 'centerX'), y: height * n(params, 'centerY') };
          filter.innerRadius = (n(params, 'innerRadius') * Math.min(width, height)) / 2;
        },
      };
    },
  },
  spinBlur: {
    create: (initial) => {
      const filter = new RadialBlurFilter({ angle: n(initial, 'angle'), kernelSize: 15, radius: -1 });

      return {
        filters: [filter],
        update: (params, { width, height }) => {
          filter.angle = n(params, 'angle');
          filter.center = { x: width * n(params, 'centerX'), y: height * n(params, 'centerY') };
        },
      };
    },
  },
  tiltShift: {
    create: (initial) => {
      const filter = new TiltShiftFilter({ blur: n(initial, 'blur') });

      return {
        filters: [filter],
        update: (params, { width, height }) => {
          const y = height * n(params, 'position');

          filter.blur = n(params, 'blur');
          filter.start = { x: 0, y };
          filter.end = { x: width, y };
          filter.gradientBlur = Math.max(1, height * n(params, 'spread'));
          filter.updateDelta();
        },
      };
    },
  },
  sharpen: {
    create: (initial) => {
      const filter = new ConvolutionFilter({ matrix: sharpnessKernel(n(initial, 'amount')) });

      return {
        filters: [filter],
        update: (params, { width, height }) => {
          filter.matrix = sharpnessKernel(n(params, 'amount'));
          // The filter samples neighbours at 1/width, 1/height: keep that at one pixel.
          filter.width = width;
          filter.height = height;
        },
      };
    },
  },

  // ----------------------------------------------------------------- Light
  glow: {
    // The glow's reach is compiled into the shader.
    rebuildKey: (params) => String(Math.round(n(params, 'distance'))),
    create: (initial) => {
      const filter = new GlowFilter({
        distance: Math.round(n(initial, 'distance')),
        outerStrength: n(initial, 'outer'),
        innerStrength: n(initial, 'inner'),
        color: s(initial, 'color'),
        quality: 0.2,
        knockout: b(initial, 'knockout'),
      });

      return {
        filters: [filter],
        update: (params) => {
          filter.outerStrength = n(params, 'outer');
          filter.innerStrength = n(params, 'inner');
          filter.color = s(params, 'color');
          filter.knockout = b(params, 'knockout');
        },
      };
    },
  },
  bloom: {
    create: (initial) => {
      // `brightness` multiplies the ORIGINAL image, so it stays at 1; only the bloom layer scales.
      const filter = new AdvancedBloomFilter({
        threshold: n(initial, 'threshold'),
        bloomScale: n(initial, 'intensity'),
        brightness: 1,
        blur: n(initial, 'blur'),
        quality: 4,
      });

      return {
        filters: [filter],
        update: (params) => {
          filter.threshold = n(params, 'threshold');
          filter.bloomScale = n(params, 'intensity');
          filter.blur = n(params, 'blur');
        },
      };
    },
  },
  godray: {
    usesTime: isAnimated,
    create: (initial) => {
      const filter = new GodrayFilter({
        angle: n(initial, 'angle'),
        gain: n(initial, 'gain'),
        lacunarity: n(initial, 'lacunarity'),
        alpha: n(initial, 'intensity'),
        parallel: true,
        time: 0,
      });

      return {
        filters: [filter],
        update: (params, _geometry, timeMs) => {
          filter.angle = n(params, 'angle');
          filter.gain = n(params, 'gain');
          filter.lacunarity = n(params, 'lacunarity');
          filter.alpha = n(params, 'intensity');
          filter.time = isAnimated(params) ? (timeMs / 1000) * 0.4 : 0;
        },
      };
    },
  },
  dropShadow: {
    create: (initial) => {
      const filter = new DropShadowFilter({
        color: s(initial, 'color'),
        alpha: n(initial, 'opacity'),
        blur: n(initial, 'blur'),
        quality: 4,
      });

      return {
        filters: [filter],
        update: (params) => {
          const radians = n(params, 'angle') * DEG;
          const distance = n(params, 'distance');

          filter.offset = { x: Math.cos(radians) * distance, y: Math.sin(radians) * distance };
          filter.color = s(params, 'color');
          filter.alpha = n(params, 'opacity');
          filter.blur = n(params, 'blur');
        },
      };
    },
  },
  outline: {
    create: (initial) => {
      const filter = new OutlineFilter({
        thickness: n(initial, 'thickness'),
        color: s(initial, 'color'),
        alpha: n(initial, 'opacity'),
        quality: 0.2,
      });

      return {
        filters: [filter],
        update: (params) => {
          filter.thickness = n(params, 'thickness');
          filter.color = s(params, 'color');
          filter.alpha = n(params, 'opacity');
        },
      };
    },
  },
  vignette: {
    create: () => {
      // The CRT filter with its lines, curve and static switched off is a plain vignette.
      const filter = new CRTFilter({ curvature: 0, lineWidth: 0, lineContrast: 0, noise: 0, noiseSize: 1 });

      return {
        filters: [filter],
        update: (params) => {
          filter.vignetting = n(params, 'size');
          filter.vignettingAlpha = n(params, 'amount');
          filter.vignettingBlur = n(params, 'softness');
        },
      };
    },
  },

  // --------------------------------------------------------------- Stylize
  grain: {
    usesTime: isAnimated,
    create: (initial) => {
      const filter = new PIXI.NoiseFilter({ noise: n(initial, 'amount'), seed: 0.5 });

      return {
        filters: [filter],
        update: (params, _geometry, timeMs) => {
          filter.noise = n(params, 'amount');
          filter.seed = isAnimated(params) ? stepRandom(flickerStep(timeMs, 24)) : 0.5;
        },
      };
    },
  },
  pixelate: {
    create: (initial) => {
      const filter = new PixelateFilter(n(initial, 'size'));

      return {
        filters: [filter],
        update: (params) => {
          filter.size = Math.max(1, n(params, 'size'));
        },
      };
    },
  },
  halftone: {
    create: (initial) => {
      const filter = new DotFilter({
        scale: n(initial, 'scale'),
        angle: n(initial, 'angle') * DEG,
        grayscale: b(initial, 'grayscale'),
      });

      return {
        filters: [filter],
        update: (params) => {
          filter.scale = n(params, 'scale');
          filter.angle = n(params, 'angle') * DEG;
          filter.grayscale = b(params, 'grayscale');
        },
      };
    },
  },
  crossHatch: {
    create: () => ({ filters: [new CrossHatchFilter()], update: () => {} }),
  },
  ascii: {
    create: (initial) => {
      const filter = new AsciiFilter({
        size: n(initial, 'size'),
        color: s(initial, 'color'),
        replaceColor: b(initial, 'tinted'),
      });

      return {
        filters: [filter],
        update: (params) => {
          filter.size = Math.round(n(params, 'size'));
          filter.color = s(params, 'color');
          filter.replaceColor = b(params, 'tinted');
        },
      };
    },
  },
  emboss: {
    create: (initial) => {
      const filter = new EmbossFilter(n(initial, 'strength'));

      return {
        filters: [filter],
        update: (params) => {
          filter.strength = n(params, 'strength');
        },
      };
    },
  },
  bevel: {
    create: (initial) => {
      const filter = new BevelFilter({ rotation: n(initial, 'angle'), thickness: n(initial, 'thickness') });

      return {
        filters: [filter],
        update: (params) => {
          filter.rotation = n(params, 'angle');
          filter.thickness = n(params, 'thickness');
          filter.lightColor = s(params, 'light');
          filter.lightAlpha = n(params, 'lightOpacity');
          filter.shadowColor = s(params, 'shadow');
          filter.shadowAlpha = n(params, 'shadowOpacity');
        },
      };
    },
  },

  // --------------------------------------------------------------- Distort
  bulge: {
    create: (initial) => {
      // The centre is normalised (0.5, 0.5 = middle); only the radius is in pixels.
      const filter = new BulgePinchFilter({ center: { x: 0.5, y: 0.5 }, strength: n(initial, 'strength') });

      return {
        filters: [filter],
        update: (params, { width, height }) => {
          filter.strength = n(params, 'strength');
          filter.center = { x: n(params, 'centerX'), y: n(params, 'centerY') };
          filter.radius = n(params, 'radius') * Math.min(width, height);
        },
      };
    },
  },
  twist: {
    create: (initial) => {
      const filter = new TwistFilter({ angle: n(initial, 'angle') });

      return {
        filters: [filter],
        // The offset is in global (screen) pixels, so it follows the target's bounds.
        update: (params, { x, y, width, height }) => {
          filter.angle = n(params, 'angle');
          filter.offset = {
            x: x + width * n(params, 'centerX'),
            y: y + height * n(params, 'centerY'),
          };
          filter.radius = n(params, 'radius') * Math.min(width, height);
        },
      };
    },
  },
  shockwave: {
    usesTime: isAnimated,
    create: (initial) => {
      const filter = new ShockwaveFilter({
        amplitude: n(initial, 'amplitude'),
        wavelength: n(initial, 'wavelength'),
        brightness: 1,
        radius: -1,
        speed: 500,
      });

      return {
        filters: [filter],
        update: (params, { width, height }, timeMs) => {
          const reach = Math.hypot(width, height);
          const progress = isAnimated(params)
            ? (timeMs / 1000 / n(params, 'period')) % 1
            : n(params, 'progress');

          filter.amplitude = n(params, 'amplitude');
          filter.wavelength = n(params, 'wavelength');
          filter.center = { x: width * n(params, 'centerX'), y: height * n(params, 'centerY') };
          filter.time = (progress * reach) / 500;
        },
      };
    },
  },
  ripple: {
    create: (initial) => {
      const sprite = getDisplacementSprite();

      if (!sprite) {
        return { filters: [], update: () => {} };
      }

      const filter = new PIXI.DisplacementFilter({ sprite, scale: n(initial, 'amount') });

      return {
        filters: [filter],
        update: (params) => {
          filter.scale.x = n(params, 'amount');
          filter.scale.y = n(params, 'amount');
        },
      };
    },
  },
  mirror: {
    usesTime: (params) => isAnimated(params) && n(params, 'waves') > 0,
    create: (initial) => {
      const filter = new ReflectionFilter({ mirror: true, boundary: n(initial, 'boundary'), time: 0 });

      return {
        filters: [filter],
        update: (params, _geometry, timeMs) => {
          const waves = n(params, 'waves');
          const length = n(params, 'wavelength');

          filter.boundary = n(params, 'boundary');
          filter.amplitude = [waves * 0.25, waves];
          filter.waveLength = [length * 0.4, length];
          filter.alpha = [1, 1 - n(params, 'fade')];
          filter.time = isAnimated(params) ? (timeMs / 1000) * 3 : 1.5;
        },
      };
    },
  },
  rgbSplit: {
    create: () => {
      const filter = new RGBSplitFilter();

      return {
        filters: [filter],
        update: (params) => {
          const amount = n(params, 'amount');
          const radians = n(params, 'angle') * DEG;
          const x = Math.cos(radians) * amount;
          const y = Math.sin(radians) * amount;

          filter.red = { x, y };
          filter.green = { x: 0, y: 0 };
          filter.blue = { x: -x, y: -y };
          filter.padding = amount;
        },
      };
    },
  },
  glitch: {
    usesTime: isAnimated,
    create: (initial) => {
      const filter = new GlitchFilter({
        slices: Math.round(n(initial, 'slices')),
        offset: n(initial, 'offset'),
        direction: n(initial, 'angle'),
        fillMode: 2,
        seed: 0.5,
      });
      let slices = Math.round(n(initial, 'slices'));
      let lastStep = -1;

      return {
        filters: [filter],
        update: (params, _geometry, timeMs) => {
          const shift = n(params, 'colorShift');
          const nextSlices = Math.round(n(params, 'slices'));

          filter.offset = n(params, 'offset');
          filter.direction = n(params, 'angle');
          filter.red = { x: shift, y: 0 };
          filter.green = { x: 0, y: 0 };
          filter.blue = { x: -shift, y: 0 };

          // Changing the slice count re-cuts the slices, so only do it on a real change.
          if (nextSlices !== slices) {
            slices = nextSlices;
            filter.slices = nextSlices;
          }

          const step = isAnimated(params) ? flickerStep(timeMs, n(params, 'rate')) : -1;

          if (step !== lastStep) {
            lastStep = step;
            filter.seed = step < 0 ? 0.5 : stepRandom(step);

            if (step >= 0) {
              filter.refresh();
            }
          }
        },
      };
    },
  },

  // ----------------------------------------------------------------- Retro
  crt: {
    usesTime: isAnimated,
    create: () => {
      const filter = new CRTFilter({ noiseSize: 1, vignetting: 0.3, vignettingBlur: 0.3 });

      return {
        filters: [filter],
        update: (params, _geometry, timeMs) => {
          filter.curvature = n(params, 'curvature');
          filter.lineWidth = n(params, 'lineWidth');
          filter.lineContrast = n(params, 'lineContrast');
          filter.verticalLine = b(params, 'vertical');
          filter.noise = n(params, 'noise');
          filter.vignettingAlpha = n(params, 'vignette');
          filter.time = isAnimated(params) ? (timeMs / 1000) * 6 : 0;
          filter.seed = isAnimated(params) ? stepRandom(flickerStep(timeMs, 24)) : 0.5;
        },
      };
    },
  },
  oldFilm: {
    usesTime: isAnimated,
    create: () => {
      const filter = new OldFilmFilter({ noiseSize: 1, scratchWidth: 1, vignetting: 0.3, vignettingBlur: 0.3 });

      return {
        filters: [filter],
        update: (params, _geometry, timeMs) => {
          filter.sepia = n(params, 'sepia');
          filter.noise = n(params, 'noise');
          filter.scratch = n(params, 'scratch');
          filter.scratchDensity = n(params, 'scratchDensity');
          filter.vignettingAlpha = n(params, 'vignette');
          // Real film flickers at a lower rate than video frames.
          filter.seed = isAnimated(params) ? stepRandom(flickerStep(timeMs, 14)) : 0.5;
        },
      };
    },
  },
};

/** Effect types the renderer can draw. Checked against the registry in development. */
export const RENDERABLE_EFFECT_TYPES: ReadonlySet<string> = new Set(Object.keys(FACTORIES));

// ---------------------------------------------------------------------------
// Per-target cache
// ---------------------------------------------------------------------------

interface LiveEffect {
  key: string;
  type: string;
  runtime: EffectRuntime;
}

interface CacheEntry {
  /** Inputs of the last call, compared by reference (projects are immutable). */
  look: LayerLook | null | undefined;
  effects: readonly EffectInstance[] | undefined;
  resolved: ResolvedEffect[];
  structureKey: string;
  live: LiveEffect[];
  geometryKey: string;
  timeMs: number;
  usesTime: boolean;
}

const cache = new WeakMap<PIXI.Container, CacheEntry>();

const FALLBACK_SIZE = 200;

const readGeometry = (target: PIXI.Container): EffectGeometry => {
  const bounds = target.getBounds();

  return {
    x: Number.isFinite(bounds.x) ? bounds.x : 0,
    y: Number.isFinite(bounds.y) ? bounds.y : 0,
    width: Number.isFinite(bounds.width) && bounds.width > 0 ? bounds.width : FALLBACK_SIZE,
    height: Number.isFinite(bounds.height) && bounds.height > 0 ? bounds.height : FALLBACK_SIZE,
  };
};

const geometryKeyOf = (geometry: EffectGeometry): string =>
  `${geometry.x}|${geometry.y}|${geometry.width}|${geometry.height}`;

const structureKeyOf = (resolved: ResolvedEffect[]): string =>
  resolved
    .map((effect) => {
      const factory = FACTORIES[effect.type];

      return `${effect.key}:${effect.type}:${factory?.rebuildKey?.(effect.params) ?? ''}`;
    })
    .join('|');

const disposeLive = (live: LiveEffect[]) => {
  live.forEach(({ runtime }) => {
    runtime.dispose?.();
    // Filter#destroy() drops the filter's uniform and bind groups; compiled
    // programs are shared and cached by Pixi, so they are kept.
    runtime.filters.forEach((filter) => filter.destroy());
  });
};

const buildLive = (resolved: ResolvedEffect[]): LiveEffect[] => {
  const live: LiveEffect[] = [];

  resolved.forEach((effect) => {
    const factory = FACTORIES[effect.type];

    if (!factory) {
      return;
    }

    const runtime = factory.create(effect.params);

    runtime.filters.forEach((filter) => {
      // Match the surface being drawn to (the screen, or a larger export
      // target), so effects are as sharp as the rest of the picture.
      filter.resolution = 'inherit';
    });
    live.push({ key: effect.key, type: effect.type, runtime });
  });

  return live;
};

export interface ApplyEffectsOptions {
  /** Playhead time, for effects that move. */
  timeMs: number;
  /** Bounds to use instead of the target's own, e.g. the whole canvas. */
  geometry?: EffectGeometry;
}

/**
 * Applies a look and an effect stack to a display object.
 *
 * Cached per target: with the same look, stack, bounds and time nothing
 * happens; with the same stack shape only uniforms are written. An empty
 * result detaches every filter.
 */
export const applyEffects = (
  target: PIXI.Container,
  look: LayerLook | null | undefined,
  effects: readonly EffectInstance[] | undefined,
  options: ApplyEffectsOptions,
): void => {
  if (target.destroyed) {
    clearEffectCache(target);

    return;
  }

  const cached = cache.get(target);
  const sameInputs = Boolean(cached && cached.look === look && cached.effects === effects);
  const resolved = cached && sameInputs ? cached.resolved : resolveLayerEffects(look, effects);

  if (!cached && resolved.length === 0) {
    return;
  }

  const structureKey = sameInputs && cached ? cached.structureKey : structureKeyOf(resolved);
  const rebuilt = !cached || cached.structureKey !== structureKey;
  let live = cached?.live ?? [];

  if (rebuilt) {
    live = buildLive(resolved);
    target.filters = live.flatMap((entry) => entry.runtime.filters);

    if (cached) {
      disposeLive(cached.live);
    }
  }

  if (live.length === 0) {
    cache.set(target, {
      look,
      effects,
      resolved,
      structureKey,
      live,
      geometryKey: '',
      timeMs: options.timeMs,
      usesTime: false,
    });

    return;
  }

  const geometry = options.geometry ?? readGeometry(target);
  const geometryKey = geometryKeyOf(geometry);
  const usesTime = sameInputs && cached && !rebuilt
    ? cached.usesTime
    : resolved.some((effect) => FACTORIES[effect.type]?.usesTime?.(effect.params));
  const timeChanged = usesTime && cached?.timeMs !== options.timeMs;

  if (rebuilt || !sameInputs || cached?.geometryKey !== geometryKey || timeChanged) {
    const paramsByKey = new Map(resolved.map((effect) => [effect.key, effect.params]));

    live.forEach(({ key, runtime }) => {
      const params = paramsByKey.get(key);

      if (params) {
        runtime.update(params, geometry, options.timeMs);
      }
    });
  }

  cache.set(target, {
    look,
    effects,
    resolved,
    structureKey,
    live,
    geometryKey,
    timeMs: options.timeMs,
    usesTime,
  });
};

/** Whether the target's effects change with the playhead and need `applyEffects` every frame. */
export const hasTimedEffects = (target: PIXI.Container): boolean =>
  cache.get(target)?.usesTime ?? false;

/**
 * Forgets (and destroys) the filters built for a display object. Call it when
 * the object is destroyed or removed for good. A live object is left with no
 * filters.
 */
export const clearEffectCache = (target: PIXI.Container): void => {
  const cached = cache.get(target);

  if (!cached) {
    return;
  }

  cache.delete(target);

  if (!target.destroyed && cached.live.length > 0) {
    target.filters = [];
  }

  disposeLive(cached.live);
};
