// Pure colour-matrix maths for the filter pipeline (no PixiJS imports so it can be unit-tested in node).
//
// A matrix is 4 rows x 5 columns in row-major order, the layout PixiJS' ColorMatrixFilter uploads as
// `uColorMatrix`: each row is [r, g, b, a, offset]. The shader works on un-premultiplied colour in the
// 0..1 range, so offsets are in 0..1 units as well.

export type ColorMatrix20 = [
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
];

/** The colour-affecting subset of FilterSettings that folds into a single matrix. */
export interface ColorAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  vibrance: number;
  hue: number;
  grayscale: number;
  sepia: number;
  invert: number;
}

// Rec. 709 luma weights.
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

/** How much of a saturation boost a full vibrance slider gives (vibrance 1 => saturation x1.5). */
export const VIBRANCE_SATURATION_GAIN = 0.5;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const identityMatrix = (): ColorMatrix20 => [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

/**
 * Compose two colour matrices: the result applies `first`, then `second`
 * (i.e. result = second x first, treating each as a 5x5 affine matrix with an implicit [0,0,0,0,1] row).
 */
export const composeMatrices = (first: ColorMatrix20, second: ColorMatrix20): ColorMatrix20 => {
  const out = identityMatrix();

  for (let row = 0; row < 4; row += 1) {
    const s = row * 5;

    for (let col = 0; col < 5; col += 1) {
      let sum = 0;

      for (let k = 0; k < 4; k += 1) {
        sum += second[s + k] * first[k * 5 + col];
      }

      if (col === 4) {
        sum += second[s + 4];
      }

      out[s + col] = sum;
    }
  }

  return out;
};

/** Linear interpolation between two matrices (t = 0 => a, t = 1 => b). */
export const lerpMatrices = (a: ColorMatrix20, b: ColorMatrix20, t: number): ColorMatrix20 => {
  const out = identityMatrix();

  for (let i = 0; i < 20; i += 1) {
    out[i] = a[i] + (b[i] - a[i]) * t;
  }

  return out;
};

/** Multiplies RGB by `amount` (1 = unchanged, 0 = black, 2 = twice as bright). */
export const brightnessMatrix = (amount: number): ColorMatrix20 => [
  amount, 0, 0, 0, 0,
  0, amount, 0, 0, 0,
  0, 0, amount, 0, 0,
  0, 0, 0, 1, 0,
];

/** Scales RGB around mid-grey (1 = unchanged, 0 = flat grey, 2 = double contrast). */
export const contrastMatrix = (amount: number): ColorMatrix20 => {
  const offset = 0.5 * (1 - amount);

  return [
    amount, 0, 0, 0, offset,
    0, amount, 0, 0, offset,
    0, 0, amount, 0, offset,
    0, 0, 0, 1, 0,
  ];
};

/** Luma-preserving saturation (1 = unchanged, 0 = greyscale, 2 = double saturation). */
export const saturationMatrix = (amount: number): ColorMatrix20 => {
  const inv = 1 - amount;
  const r = LUMA_R * inv;
  const g = LUMA_G * inv;
  const b = LUMA_B * inv;

  return [
    r + amount, g, b, 0, 0,
    r, g + amount, b, 0, 0,
    r, g, b + amount, 0, 0,
    0, 0, 0, 1, 0,
  ];
};

/** Rotates hue by `degrees` around the grey axis (same formula as PIXI.ColorMatrixFilter#hue). */
export const hueMatrix = (degrees: number): ColorMatrix20 => {
  const radians = (degrees / 180) * Math.PI;
  const cosR = Math.cos(radians);
  const sinR = Math.sin(radians);
  const w = 1 / 3;
  const sqrW = Math.sqrt(w);
  const diagonal = cosR + (1 - cosR) * w;
  const minus = w * (1 - cosR) - sqrW * sinR;
  const plus = w * (1 - cosR) + sqrW * sinR;

  return [
    diagonal, minus, plus, 0, 0,
    plus, diagonal, minus, 0, 0,
    minus, plus, diagonal, 0, 0,
    0, 0, 0, 1, 0,
  ];
};

/** Proportional greyscale: 0 = unchanged, 1 = fully desaturated. */
export const grayscaleMatrix = (amount: number): ColorMatrix20 => saturationMatrix(1 - amount);

const FULL_SEPIA: ColorMatrix20 = [
  0.393, 0.769, 0.189, 0, 0,
  0.349, 0.686, 0.168, 0, 0,
  0.272, 0.534, 0.131, 0, 0,
  0, 0, 0, 1, 0,
];

/** Proportional sepia: 0 = unchanged, 1 = full sepia tone. */
export const sepiaMatrix = (amount: number): ColorMatrix20 =>
  lerpMatrices(identityMatrix(), FULL_SEPIA, amount);

/** Proportional invert: 0 = unchanged, 0.5 = flat mid-grey, 1 = full negative. */
export const invertMatrix = (amount: number): ColorMatrix20 => {
  const scale = 1 - 2 * amount;

  return [
    scale, 0, 0, 0, amount,
    0, scale, 0, 0, amount,
    0, 0, scale, 0, amount,
    0, 0, 0, 1, 0,
  ];
};

/**
 * Folds every matrix-expressible colour adjustment into ONE matrix, applied in this order:
 * brightness -> contrast -> saturation -> vibrance -> hue -> grayscale -> sepia -> invert.
 * Returns null when every adjustment is at its identity value (no filter needed).
 *
 * Vibrance is approximated as an extra saturation multiplier of (1 + vibrance * 0.5); a colour matrix is
 * linear, so it cannot protect already-saturated colours the way a true vibrance control does.
 */
export const buildColorMatrix = (adjustments: ColorAdjustments): ColorMatrix20 | null => {
  const brightness = clamp(adjustments.brightness, 0, 2);
  const contrast = clamp(adjustments.contrast, 0, 2);
  const saturation = clamp(adjustments.saturation, 0, 2);
  const vibrance = clamp(adjustments.vibrance, -1, 1);
  const hue = clamp(adjustments.hue, -180, 180);
  const grayscale = clamp(adjustments.grayscale, 0, 1);
  const sepia = clamp(adjustments.sepia, 0, 1);
  const invert = clamp(adjustments.invert, 0, 1);

  let matrix: ColorMatrix20 | null = null;
  const push = (next: ColorMatrix20) => {
    matrix = matrix ? composeMatrices(matrix, next) : next;
  };

  if (brightness !== 1) push(brightnessMatrix(brightness));
  if (contrast !== 1) push(contrastMatrix(contrast));
  if (saturation !== 1) push(saturationMatrix(saturation));
  if (vibrance !== 0) push(saturationMatrix(1 + vibrance * VIBRANCE_SATURATION_GAIN));
  if (hue !== 0) push(hueMatrix(hue));
  if (grayscale !== 0) push(grayscaleMatrix(grayscale));
  if (sepia !== 0) push(sepiaMatrix(sepia));
  if (invert !== 0) push(invertMatrix(invert));

  return matrix;
};

/** Applies a matrix to an un-premultiplied RGBA colour in 0..1 (mirrors the shader; used for tests). */
export const applyColorMatrix = (
  matrix: ColorMatrix20,
  [r, g, b, a]: [number, number, number, number],
): [number, number, number, number] => [
  matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[3] * a + matrix[4],
  matrix[5] * r + matrix[6] * g + matrix[7] * b + matrix[8] * a + matrix[9],
  matrix[10] * r + matrix[11] * g + matrix[12] * b + matrix[13] * a + matrix[14],
  matrix[15] * r + matrix[16] * g + matrix[17] * b + matrix[18] * a + matrix[19],
];
