import * as PIXI from 'pixi.js';

// ---------------------------------------------------------------------------------------------
// Displacement map: generated once, shared by every ripple effect (never destroyed).
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
export const getDisplacementSprite = (): PIXI.Sprite | null => {
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
