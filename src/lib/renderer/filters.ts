import * as PIXI from 'pixi.js';
import {
  AdjustmentFilter,
  AdvancedBloomFilter,
  AsciiFilter,
  BevelFilter,
  BulgePinchFilter,
  ColorReplaceFilter,
  ConvolutionFilter,
  CrossHatchFilter,
  CRTFilter,
  DotFilter,
  DropShadowFilter,
  EmbossFilter,
  GlowFilter,
  GodrayFilter,
  KawaseBlurFilter,
  MultiColorReplaceFilter,
  OldFilmFilter,
  OutlineFilter,
  PixelateFilter,
  ReflectionFilter,
  RGBSplitFilter,
  ShockwaveFilter,
  TiltShiftFilter,
  TwistFilter,
  ZoomBlurFilter,
} from 'pixi-filters';

import { buildColorMatrix } from '@/lib/renderer/filterColorMatrix';
import { FILTER_DEFINITIONS } from '@/lib/renderer/filterDefinitions';
import type { FilterSettings } from '@/types/editor';

type FilterKey = keyof FilterSettings;

/** Global-space bounds of the filtered object, read at apply time. */
interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Re-positions a size/position dependent filter (centre, radius, texel size...) for new bounds. */
type GeometrySync = (geometry: Geometry) => void;

interface CacheEntry {
  key: string;
  filters: PIXI.Filter[];
  geometrySyncs: GeometrySync[];
  geometryKey: string;
}

interface FilterSpec {
  key: FilterKey;
  min: number;
  max: number;
  default: number;
}

const FILTER_SPECS: FilterSpec[] = FILTER_DEFINITIONS.map((definition) => ({
  key: definition.key as FilterKey,
  min: definition.min,
  max: definition.max,
  default: definition.default,
}));

const SPEC_BY_KEY = new Map<FilterKey, FilterSpec>(FILTER_SPECS.map((spec) => [spec.key, spec]));

const filterCache = new WeakMap<PIXI.Container, CacheEntry>();

/** Value for a key: falls back to the definition default when missing/NaN and clamps to [min, max]. */
const readValue = (filters: FilterSettings, key: FilterKey): number => {
  const spec = SPEC_BY_KEY.get(key);
  const raw = filters?.[key];
  const fallback = spec ? spec.default : 0;
  const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;

  return spec ? Math.max(spec.min, Math.min(spec.max, value)) : value;
};

/** Cheap cache key: every value in definition order. */
const settingsKey = (filters: FilterSettings): string =>
  FILTER_SPECS.map((spec) => readValue(filters, spec.key)).join('|');

/** True when every setting is at its definition default, i.e. no filter would be attached. */
export const isDefaultFilters = (filters: FilterSettings | null | undefined): boolean => {
  if (!filters) {
    return true;
  }

  return FILTER_SPECS.every((spec) => readValue(filters, spec.key) === spec.default);
};

const FALLBACK_SIZE = 200;

const readGeometry = (target: PIXI.Container): Geometry => {
  const bounds = target.getBounds();
  const width = Number.isFinite(bounds.width) && bounds.width > 0 ? bounds.width : FALLBACK_SIZE;
  const height = Number.isFinite(bounds.height) && bounds.height > 0 ? bounds.height : FALLBACK_SIZE;

  return {
    x: Number.isFinite(bounds.x) ? bounds.x : 0,
    y: Number.isFinite(bounds.y) ? bounds.y : 0,
    width,
    height,
  };
};

const geometryKeyOf = (geometry: Geometry): string =>
  `${geometry.x}|${geometry.y}|${geometry.width}|${geometry.height}`;

// ---------------------------------------------------------------------------------------------
// Displacement map: generated once, shared by every DisplacementFilter (never destroyed).
// ---------------------------------------------------------------------------------------------

const DISPLACEMENT_MAP_SIZE = 256;
const DISPLACEMENT_GRID = 8;

let displacementSprite: PIXI.Sprite | null = null;

/** Small deterministic PRNG so the map (and therefore exports) look the same on every load. */
const createRandom = (seed: number) => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Tileable smooth value noise in 0..1 sampled at pixel (x, y). */
const sampleValueNoise = (grid: number[], x: number, y: number): number => {
  const cell = DISPLACEMENT_MAP_SIZE / DISPLACEMENT_GRID;
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx) % DISPLACEMENT_GRID;
  const y0 = Math.floor(gy) % DISPLACEMENT_GRID;
  const x1 = (x0 + 1) % DISPLACEMENT_GRID;
  const y1 = (y0 + 1) % DISPLACEMENT_GRID;
  const fx = gx - Math.floor(gx);
  const fy = gy - Math.floor(gy);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = grid[y0 * DISPLACEMENT_GRID + x0] * (1 - sx) + grid[y0 * DISPLACEMENT_GRID + x1] * sx;
  const bottom = grid[y1 * DISPLACEMENT_GRID + x0] * (1 - sx) + grid[y1 * DISPLACEMENT_GRID + x1] * sx;

  return top * (1 - sy) + bottom * sy;
};

/**
 * Lazily builds the shared displacement map: a tileable smooth-noise texture whose red channel drives
 * the X offset and green channel the Y offset. Returns null outside the browser (SSR).
 */
const getDisplacementSprite = (): PIXI.Sprite | null => {
  if (displacementSprite) {
    return displacementSprite;
  }

  if (typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = DISPLACEMENT_MAP_SIZE;
  canvas.height = DISPLACEMENT_MAP_SIZE;
  const context = canvas.getContext('2d');

  if (!context) {
    return null;
  }

  const random = createRandom(1337);
  const cells = DISPLACEMENT_GRID * DISPLACEMENT_GRID;
  const gridX = Array.from({ length: cells }, () => random());
  const gridY = Array.from({ length: cells }, () => random());
  const image = context.createImageData(DISPLACEMENT_MAP_SIZE, DISPLACEMENT_MAP_SIZE);

  for (let y = 0; y < DISPLACEMENT_MAP_SIZE; y += 1) {
    for (let x = 0; x < DISPLACEMENT_MAP_SIZE; x += 1) {
      const index = (y * DISPLACEMENT_MAP_SIZE + x) * 4;
      image.data[index] = Math.round(sampleValueNoise(gridX, x, y) * 255);
      image.data[index + 1] = Math.round(sampleValueNoise(gridY, x, y) * 255);
      image.data[index + 2] = 128;
      image.data[index + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);

  const texture = PIXI.Texture.from(canvas);
  texture.source.addressMode = 'repeat';
  displacementSprite = new PIXI.Sprite(texture);

  return displacementSprite;
};

// ---------------------------------------------------------------------------------------------
// Filter construction
// ---------------------------------------------------------------------------------------------

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

const buildFilters = (
  settings: FilterSettings,
): { filters: PIXI.Filter[]; geometrySyncs: GeometrySync[] } => {
  const filters: PIXI.Filter[] = [];
  const geometrySyncs: GeometrySync[] = [];
  const value = (key: FilterKey) => readValue(settings, key);

  // --- Colour: brightness/contrast/saturation/vibrance/hue/grayscale/sepia/invert fold into ONE matrix.
  const colorMatrix = buildColorMatrix({
    brightness: value('brightness'),
    contrast: value('contrast'),
    saturation: value('saturation'),
    vibrance: value('vibrance'),
    hue: value('hue'),
    grayscale: value('grayscale'),
    sepia: value('sepia'),
    invert: value('invert'),
  });

  if (colorMatrix) {
    const colorMatrixFilter = new PIXI.ColorMatrixFilter();
    colorMatrixFilter.matrix = colorMatrix;
    filters.push(colorMatrixFilter);
  }

  // Gamma is non-linear so it cannot live in the matrix; it runs as its own pass right after it.
  const gamma = value('gamma');
  if (gamma !== 1) {
    filters.push(new AdjustmentFilter({ gamma }));
  }

  // --- Blur & sharpness
  const sharpness = value('sharpness');
  if (sharpness !== 0) {
    const convolution = new ConvolutionFilter({ matrix: sharpnessKernel(sharpness) });
    filters.push(convolution);
    // ConvolutionFilter samples neighbours at 1/width, 1/height: keep that at one pixel of the target.
    geometrySyncs.push(({ width, height }) => {
      convolution.width = width;
      convolution.height = height;
    });
  }

  const blur = value('blur');
  if (blur > 0) {
    filters.push(new PIXI.BlurFilter({ strength: blur * 10 }));
  }

  const kawaseBlur = value('kawaseBlur');
  if (kawaseBlur > 0) {
    filters.push(new KawaseBlurFilter({ strength: kawaseBlur * 5 }));
  }

  const zoomBlur = value('zoomBlur');
  if (zoomBlur > 0) {
    const zoom = new ZoomBlurFilter({ strength: zoomBlur * 0.3 });
    filters.push(zoom);
    // Centre is in pixels of the filtered area.
    geometrySyncs.push(({ width, height }) => {
      zoom.center = { x: width / 2, y: height / 2 };
    });
  }

  const tiltShift = value('tiltShift');
  if (tiltShift > 0) {
    const tilt = new TiltShiftFilter({ blur: tiltShift * 20 });
    filters.push(tilt);
    // Horizontal in-focus band through the middle; blur ramps up over half the height.
    geometrySyncs.push(({ width, height }) => {
      tilt.start = { x: 0, y: height / 2 };
      tilt.end = { x: width, y: height / 2 };
      tilt.gradientBlur = Math.max(1, height / 2);
      tilt.updateDelta();
    });
  }

  // --- Distortion
  const bulgePinch = value('bulgePinch');
  if (bulgePinch !== 0) {
    // BulgePinchFilter's centre is already normalised (0.5, 0.5 = middle); only the radius is in pixels.
    const bulge = new BulgePinchFilter({ center: { x: 0.5, y: 0.5 }, strength: bulgePinch });
    filters.push(bulge);
    geometrySyncs.push(({ width, height }) => {
      bulge.radius = Math.min(width, height) / 2;
    });
  }

  const twist = value('twist');
  if (twist !== 0) {
    const twistFilter = new TwistFilter({ angle: twist * 10 });
    filters.push(twistFilter);
    // TwistFilter's offset is in global (screen) pixels, so it follows the target's bounds centre.
    geometrySyncs.push(({ x, y, width, height }) => {
      twistFilter.offset = { x: x + width / 2, y: y + height / 2 };
      twistFilter.radius = Math.min(width, height) / 2;
    });
  }

  const shockwave = value('shockwave');
  if (shockwave > 0) {
    const shock = new ShockwaveFilter({
      amplitude: shockwave * 30,
      brightness: 1 + shockwave * 0.2,
      radius: -1,
    });
    filters.push(shock);
    // Static ring (no ticker drives `time`): frozen halfway between the centre and the nearest edge.
    geometrySyncs.push(({ width, height }) => {
      const size = Math.min(width, height);
      shock.center = { x: width / 2, y: height / 2 };
      shock.wavelength = Math.max(20, size * 0.4);
      shock.time = (size * 0.25) / shock.speed;
    });
  }

  const displacement = value('displacement');
  if (displacement > 0) {
    const mapSprite = getDisplacementSprite();

    if (mapSprite) {
      filters.push(new PIXI.DisplacementFilter({ sprite: mapSprite, scale: displacement * 40 }));
    }
  }

  // --- Visual effects
  const glow = value('glow');
  if (glow > 0) {
    filters.push(new GlowFilter({ distance: 15, outerStrength: glow * 4, innerStrength: glow * 2 }));
  }

  const outline = value('outline');
  if (outline > 0) {
    filters.push(new OutlineFilter({ thickness: outline * 4 }));
  }

  const dropShadow = value('dropShadow');
  if (dropShadow > 0) {
    filters.push(new DropShadowFilter({ blur: dropShadow * 5, alpha: dropShadow }));
  }

  const bevel = value('bevel');
  if (bevel > 0) {
    filters.push(new BevelFilter({ thickness: bevel * 3 }));
  }

  const emboss = value('emboss');
  if (emboss > 0) {
    filters.push(new EmbossFilter(emboss * 2));
  }

  const pixelate = value('pixelate');
  if (pixelate > 0) {
    filters.push(new PixelateFilter(Math.max(1, pixelate * 20)));
  }

  const dot = value('dot');
  if (dot > 0) {
    // DotFilter always produces a full black & white halftone; the slider sets the dot size
    // (higher DotFilter scale = finer dots, so the mapping is inverted).
    filters.push(new DotFilter({ scale: 1.5 - dot }));
  }

  if (value('crossHatch') > 0) {
    // ON/OFF: pixi-filters' CrossHatchFilter has no uniforms at all (fixed 10px hatch, fixed thresholds),
    // so there is nothing a scalar could drive. Any value > 0 enables it.
    filters.push(new CrossHatchFilter());
  }

  // --- Vintage & retro
  const crt = value('crt');
  if (crt > 0) {
    filters.push(
      new CRTFilter({
        curvature: crt * 2,
        lineWidth: crt * 2,
        lineContrast: crt * 0.3,
        vignettingAlpha: crt,
      }),
    );
  }

  const oldFilm = value('oldFilm');
  if (oldFilm > 0) {
    filters.push(
      new OldFilmFilter({
        sepia: oldFilm * 0.3,
        noise: oldFilm * 0.3,
        noiseSize: 1,
        scratch: oldFilm * 0.5,
        scratchDensity: oldFilm * 0.3,
        scratchWidth: Math.max(1, oldFilm * 2),
        vignettingAlpha: oldFilm,
      }),
    );
  }

  const ascii = value('ascii');
  if (ascii > 0) {
    filters.push(new AsciiFilter({ size: Math.max(2, ascii * 8) }));
  }

  const noise = value('noise');
  if (noise > 0) {
    // Static grain: the seed is fixed so the pattern does not flicker between rebuilds/exports.
    filters.push(new PIXI.NoiseFilter({ noise: noise * 0.6, seed: 0.5 }));
  }

  // --- Advanced
  const bloom = value('bloom');
  if (bloom > 0) {
    // `brightness` multiplies the ORIGINAL image, so it must stay at 1; only the bloom layer scales.
    filters.push(new AdvancedBloomFilter({ threshold: 0.5, bloomScale: bloom * 1.5, brightness: 1 }));
  }

  const godray = value('godray');
  if (godray > 0) {
    filters.push(
      new GodrayFilter({ angle: 30, gain: godray * 0.5, lacunarity: 2, alpha: godray, time: 0 }),
    );
  }

  const reflection = value('reflection');
  if (reflection > 0) {
    // Flat mirror: the slider grows the mirrored band from the bottom edge up to half the height.
    filters.push(
      new ReflectionFilter({
        mirror: true,
        boundary: 1 - reflection * 0.5,
        amplitude: [0, 0],
        waveLength: [30, 100],
        alpha: [0.9, 0.4],
      }),
    );
  }

  const waterReflection = value('waterReflection');
  if (waterReflection > 0) {
    // Same mirrored band but rippled: wave amplitude grows with the slider. The ripple is a frozen
    // frame (`time` is constant) because nothing in the filter pipeline advances time.
    filters.push(
      new ReflectionFilter({
        mirror: true,
        boundary: 1 - waterReflection * 0.5,
        amplitude: [2 + waterReflection * 10, 10 + waterReflection * 30],
        waveLength: [20, 80],
        alpha: [1, 0.6],
        time: 1.5,
      }),
    );
  }

  const rgbSplit = value('rgbSplit');
  if (rgbSplit > 0) {
    filters.push(
      new RGBSplitFilter({
        red: { x: rgbSplit * 5, y: 0 },
        green: { x: -rgbSplit * 5, y: 0 },
        blue: { x: rgbSplit * 2, y: 0 },
      }),
    );
  }

  const colorReplace = value('colorReplace');
  if (colorReplace > 0) {
    // FilterSettings carries no colours, so the pair is fixed (black -> red); the slider is the tolerance.
    filters.push(
      new ColorReplaceFilter({
        originalColor: 0x000000,
        targetColor: 0xff0000,
        tolerance: colorReplace,
      }),
    );
  }

  const multiColorReplace = value('multiColorReplace');
  if (multiColorReplace > 0) {
    // Fixed pairs (black -> red, white -> blue); the slider is the shared tolerance.
    filters.push(
      new MultiColorReplaceFilter({
        replacements: [
          [0x000000, 0xff0000],
          [0xffffff, 0x0000ff],
        ],
        tolerance: multiColorReplace,
      }),
    );
  }

  return { filters, geometrySyncs };
};

/**
 * Releases filter instances built by this module. Filter#destroy() drops the filter's uniform groups
 * and bind groups; the compiled GL/GPU programs are shared and cached by Pixi, so they are kept.
 * The shared displacement-map sprite/texture is not owned by the filter and survives.
 */
const destroyFilters = (filters: PIXI.Filter[]) => {
  for (const filter of filters) {
    filter.destroy();
  }
};

const hasAttachedFilters = (target: PIXI.Container): boolean => {
  const current = target.filters;

  return Array.isArray(current) ? current.length > 0 : Boolean(current);
};

const syncGeometry = (target: PIXI.Container, entry: CacheEntry) => {
  if (entry.geometrySyncs.length === 0) {
    return;
  }

  const geometry = readGeometry(target);
  const geometryKey = geometryKeyOf(geometry);

  if (geometryKey === entry.geometryKey) {
    return;
  }

  entry.geometryKey = geometryKey;

  for (const sync of entry.geometrySyncs) {
    sync(geometry);
  }
};

/**
 * Applies the layer's filter settings to any display object (Sprite, Text, Container...).
 *
 * Cached per target: when the settings are unchanged since the last call nothing is rebuilt and
 * `target.filters` is not touched (only centre/radius of size-dependent filters are refreshed if the
 * target moved or resized). Default settings attach no filter at all.
 */
export const applyFilters = (target: PIXI.Container, filters: FilterSettings): void => {
  if (target.destroyed) {
    clearFilterCache(target);

    return;
  }

  const key = settingsKey(filters);
  const cached = filterCache.get(target);

  if (cached && cached.key === key) {
    syncGeometry(target, cached);

    return;
  }

  const built = isDefaultFilters(filters) ? { filters: [], geometrySyncs: [] } : buildFilters(filters);
  const entry: CacheEntry = { key, ...built, geometryKey: '' };

  syncGeometry(target, entry);

  if (entry.filters.length > 0) {
    target.filters = entry.filters;
  } else if (cached ? cached.filters.length > 0 : hasAttachedFilters(target)) {
    // Pixi's typings do not accept null here; an empty array removes the filter effect just the same.
    target.filters = [];
  }

  filterCache.set(target, entry);

  if (cached) {
    destroyFilters(cached.filters);
  }
};

/**
 * Forgets (and destroys) the filters cached for a display object. Call it when the object is destroyed
 * or removed for good. If the object is still alive its filters are detached first.
 */
export const clearFilterCache = (target: PIXI.Container): void => {
  const cached = filterCache.get(target);

  if (!cached) {
    return;
  }

  filterCache.delete(target);

  if (!target.destroyed && cached.filters.length > 0) {
    target.filters = [];
  }

  destroyFilters(cached.filters);
};
