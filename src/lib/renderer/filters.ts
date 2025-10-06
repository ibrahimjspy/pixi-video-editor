import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';

const { ColorMatrixFilter, BlurFilter } = PIXI;

export const applyFilters = (
  sprite: PIXI.Sprite,
  filters: {
    brightness: number;
    contrast: number;
    sharpness: number;
    saturation: number;
    hue: number;
    blur: number;
    sepia: number;
    grayscale: number;
    invert: number;
    vibrance: number;
    gamma: number;
    noise: number;
  },
) => {
  const appliedFilters: PIXI.Filter[] = [];

  // Apply brightness using tint (original method with safe clamping)
  const clampedBrightness = Math.max(0, Math.min(filters.brightness, 2));
  const brightnessValue = Math.floor(255 * clampedBrightness);
  const tintColor =
    (brightnessValue << 16) | (brightnessValue << 8) | brightnessValue;

  gsap.to(sprite, {
    tint: tintColor,
    duration: 0.3,
    onUpdate: () => {
      // Apply brightness tint
    },
  });

  // Create color matrix filter for other effects
  const colorMatrixFilter = new ColorMatrixFilter();
  colorMatrixFilter.reset();

  // Apply contrast (clamp to safe range)
  if (filters.contrast !== 1) {
    const contrastValue = Math.max(0, Math.min(filters.contrast, 2));
    colorMatrixFilter.contrast(contrastValue, false);
  }

  // Apply saturation (clamp to safe range)
  if (filters.saturation !== 1) {
    const saturationValue = Math.max(0, Math.min(filters.saturation, 2));
    colorMatrixFilter.saturate(saturationValue, false);
  }

  // Apply hue rotation (clamp to safe range)
  if (filters.hue !== 0) {
    const hueValue = Math.max(-180, Math.min(filters.hue, 180));
    colorMatrixFilter.hue(hueValue, false);
  }

  // Apply sepia (clamp to safe range)
  if (filters.sepia > 0) {
    const sepiaValue = Math.max(0, Math.min(filters.sepia, 1));
    colorMatrixFilter.sepia(sepiaValue, false);
  }

  // Apply grayscale (clamp to safe range)
  if (filters.grayscale > 0) {
    const grayscaleValue = Math.max(0, Math.min(filters.grayscale, 1));
    colorMatrixFilter.greyscale(grayscaleValue, false);
  }

  // Apply invert (clamp to safe range)
  if (filters.invert > 0) {
    const invertValue = Math.max(0, Math.min(filters.invert, 1));
    colorMatrixFilter.negative(invertValue, false);
  }

  // Apply vibrance (enhanced saturation for mid-tones)
  if (filters.vibrance !== 0) {
    const vibranceValue = Math.max(-1, Math.min(filters.vibrance, 1));
    colorMatrixFilter.vibrance(vibranceValue, false);
  }

  // Apply gamma correction (clamp to safe range)
  if (filters.gamma !== 1) {
    const gammaValue = Math.max(0.5, Math.min(filters.gamma, 2));
    colorMatrixFilter.gamma(gammaValue, false);
  }

  // Apply noise (using a custom matrix) - clamp to safe range
  if (filters.noise > 0) {
    const noiseValue = Math.max(0, Math.min(filters.noise, 1));
    const noiseAmount = noiseValue * 0.1;
    const matrix = [
      1, 0, 0, 0, noiseAmount * (Math.random() - 0.5),
      0, 1, 0, 0, noiseAmount * (Math.random() - 0.5),
      0, 0, 1, 0, noiseAmount * (Math.random() - 0.5),
      0, 0, 0, 1, 0,
    ];
    colorMatrixFilter.matrix = matrix;
  }

  // Apply sharpness (using unsharp mask approximation) - clamp to safe range
  if (filters.sharpness !== 0) {
    const sharpnessValue = Math.max(-1, Math.min(filters.sharpness, 1));
    const sharpnessAmount = sharpnessValue * 0.5;
    const matrix = [
      -sharpnessAmount, -sharpnessAmount, -sharpnessAmount, 0, 0,
      -sharpnessAmount, 1 + 8 * sharpnessAmount, -sharpnessAmount, 0, 0,
      -sharpnessAmount, -sharpnessAmount, -sharpnessAmount, 0, 0,
      0, 0, 0, 1, 0,
    ];
    colorMatrixFilter.matrix = matrix;
  }

  appliedFilters.push(colorMatrixFilter);

  // Apply blur filter - clamp to safe range
  if (filters.blur > 0) {
    const blurValue = Math.max(0, Math.min(filters.blur, 1));
    const blurFilter = new BlurFilter();
    blurFilter.blur = blurValue * 10; // Scale blur amount
    appliedFilters.push(blurFilter);
  }

  sprite.filters = appliedFilters;
};
