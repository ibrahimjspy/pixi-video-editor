/* eslint-disable @typescript-eslint/no-explicit-any */
import * as PIXI from 'pixi.js';
import {
  GlowFilter,
  OutlineFilter,
  DropShadowFilter,
  BevelFilter,
  EmbossFilter,
  PixelateFilter,
  DotFilter,
  CrossHatchFilter,
  CRTFilter,
  OldFilmFilter,
  AsciiFilter,
  AdvancedBloomFilter,
  GodrayFilter,
  ReflectionFilter,
  RGBSplitFilter,
  ColorReplaceFilter,
  MultiColorReplaceFilter,
  KawaseBlurFilter,
  ZoomBlurFilter,
  TiltShiftFilter,
  BulgePinchFilter,
  TwistFilter,
  ShockwaveFilter,
  SimplexNoiseFilter
} from 'pixi-filters';

const { ColorMatrixFilter, BlurFilter, DisplacementFilter } = PIXI;

export const applyFilters = (
  sprite: PIXI.Sprite,
  filters: {
    // Color Adjustments
    brightness: number;
    contrast: number;
    saturation: number;
    hue: number;
    vibrance: number;
    gamma: number;
    sepia: number;
    grayscale: number;
    invert: number;
    
    // Blur & Sharpness
    blur: number;
    sharpness: number;
    kawaseBlur: number;
    zoomBlur: number;
    tiltShift: number;
    
    // Distortion Effects
    bulgePinch: number;
    twist: number;
    shockwave: number;
    displacement: number;
    
    // Visual Effects
    glow: number;
    outline: number;
    dropShadow: number;
    bevel: number;
    emboss: number;
    pixelate: number;
    dot: number;
    crossHatch: number;
    
    // Vintage & Retro
    crt: number;
    oldFilm: number;
    ascii: number;
    noise: number;
    
    // Advanced Effects
    bloom: number;
    godray: number;
    reflection: number;
    waterReflection: number;
    rgbSplit: number;
    colorReplace: number;
    multiColorReplace: number;
  },
) => {
  const appliedFilters: PIXI.Filter[] = [];

  // Create color matrix filter for all color effects
  const colorMatrixFilter = new ColorMatrixFilter();
  colorMatrixFilter.reset();

  // Apply brightness using ColorMatrixFilter (more reliable than tint)
  if (filters.brightness !== 1) {
    const brightnessValue = Math.max(0, Math.min(filters.brightness, 2));
    colorMatrixFilter.brightness(brightnessValue, false);
  }

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
    colorMatrixFilter.sepia(false);
  }

  // Apply grayscale (clamp to safe range)
  if (filters.grayscale > 0) {
    const grayscaleValue = Math.max(0, Math.min(filters.grayscale, 1));
    colorMatrixFilter.greyscale(grayscaleValue, false);
  }

  // Apply invert (clamp to safe range)
  if (filters.invert > 0) {
    colorMatrixFilter.negative(false);
  }

  // Apply vibrance (enhanced saturation for mid-tones) - using custom matrix
  if (filters.vibrance !== 0) {
    const vibranceValue = Math.max(-1, Math.min(filters.vibrance, 1));
    // Custom vibrance matrix approximation
    const matrix = [
      1 + vibranceValue * 0.3, 0, 0, 0, 0,
      0, 1 + vibranceValue * 0.3, 0, 0, 0,
      0, 0, 1 + vibranceValue * 0.3, 0, 0,
      0, 0, 0, 1, 0,
    ];
    colorMatrixFilter.matrix = matrix as any;
  }

  // Apply gamma correction (clamp to safe range) - using custom matrix
  if (filters.gamma !== 1) {
    const gammaValue = Math.max(0.5, Math.min(filters.gamma, 2));
    // Custom gamma matrix approximation
    const matrix = [
      Math.pow(gammaValue, 0.5), 0, 0, 0, 0,
      0, Math.pow(gammaValue, 0.5), 0, 0, 0,
      0, 0, Math.pow(gammaValue, 0.5), 0, 0,
      0, 0, 0, 1, 0,
    ];
    colorMatrixFilter.matrix = matrix as any;
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
    colorMatrixFilter.matrix = matrix as any;
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
    colorMatrixFilter.matrix = matrix as any;
  }

  appliedFilters.push(colorMatrixFilter);

  // Apply blur filter - clamp to safe range
  if (filters.blur > 0) {
    const blurValue = Math.max(0, Math.min(filters.blur, 1));
    const blurFilter = new BlurFilter();
    blurFilter.blur = blurValue * 10; // Scale blur amount
    appliedFilters.push(blurFilter);
  }

  // Apply Kawase Blur
  if (filters.kawaseBlur > 0) {
    const kawaseValue = Math.max(0, Math.min(filters.kawaseBlur, 1));
    const kawaseFilter = new KawaseBlurFilter(kawaseValue * 5);
    appliedFilters.push(kawaseFilter);
  }

  // Apply Zoom Blur
  if (filters.zoomBlur > 0) {
    const zoomValue = Math.max(0, Math.min(filters.zoomBlur, 1));
    const zoomFilter = new ZoomBlurFilter();
    zoomFilter.strength = zoomValue * 0.1;
    appliedFilters.push(zoomFilter);
  }

  // Apply Tilt Shift
  if (filters.tiltShift > 0) {
    const tiltValue = Math.max(0, Math.min(filters.tiltShift, 1));
    const tiltFilter = new TiltShiftFilter();
    tiltFilter.blur = tiltValue * 20;
    appliedFilters.push(tiltFilter);
  }

  // Apply Bulge/Pinch
  if (filters.bulgePinch !== 0) {
    const bulgeValue = Math.max(-1, Math.min(filters.bulgePinch, 1));
    const bulgeFilter = new BulgePinchFilter();
    bulgeFilter.radius = 200;
    bulgeFilter.strength = bulgeValue;
    appliedFilters.push(bulgeFilter);
  }

  // Apply Twist
  if (filters.twist !== 0) {
    const twistValue = Math.max(-1, Math.min(filters.twist, 1));
    const twistFilter = new TwistFilter();
    twistFilter.radius = 200;
    twistFilter.angle = twistValue * 10;
    appliedFilters.push(twistFilter);
  }

  // Apply Shockwave
  if (filters.shockwave > 0) {
    const shockValue = Math.max(0, Math.min(filters.shockwave, 1));
    const shockFilter = new ShockwaveFilter();
    shockFilter.amplitude = shockValue * 30;
    shockFilter.wavelength = 30;
    shockFilter.brightness = shockValue;
    appliedFilters.push(shockFilter);
  }

  // Apply Displacement
  if (filters.displacement > 0) {
    const dispValue = Math.max(0, Math.min(filters.displacement, 1));
    // Create a simple texture for displacement
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const texture = PIXI.Texture.from(canvas);
    const dispSprite = new PIXI.Sprite(texture);
    const dispFilter = new DisplacementFilter(dispSprite, dispValue * 20);
    appliedFilters.push(dispFilter);
  }

  // Apply Glow
  if (filters.glow > 0) {
    const glowValue = Math.max(0, Math.min(filters.glow, 1));
    const glowFilter = new GlowFilter();
    glowFilter.distance = 15;
    glowFilter.outerStrength = glowValue * 4;
    glowFilter.innerStrength = glowValue * 2;
    appliedFilters.push(glowFilter);
  }

  // Apply Outline
  if (filters.outline > 0) {
    const outlineValue = Math.max(0, Math.min(filters.outline, 1));
    const outlineFilter = new OutlineFilter();
    outlineFilter.thickness = outlineValue * 4;
    appliedFilters.push(outlineFilter);
  }

  // Apply Drop Shadow
  if (filters.dropShadow > 0) {
    const shadowValue = Math.max(0, Math.min(filters.dropShadow, 1));
    const shadowFilter = new DropShadowFilter();
    shadowFilter.blur = shadowValue * 5;
    shadowFilter.alpha = shadowValue;
    appliedFilters.push(shadowFilter);
  }

  // Apply Bevel
  if (filters.bevel > 0) {
    const bevelValue = Math.max(0, Math.min(filters.bevel, 1));
    const bevelFilter = new BevelFilter();
    bevelFilter.thickness = bevelValue * 3;
    appliedFilters.push(bevelFilter);
  }

  // Apply Emboss
  if (filters.emboss > 0) {
    const embossValue = Math.max(0, Math.min(filters.emboss, 1));
    const embossFilter = new EmbossFilter();
    embossFilter.strength = embossValue * 2;
    appliedFilters.push(embossFilter);
  }

  // Apply Pixelate
  if (filters.pixelate > 0) {
    const pixelValue = Math.max(0, Math.min(filters.pixelate, 1));
    const pixelFilter = new PixelateFilter();
    pixelFilter.size = Math.max(1, pixelValue * 20);
    appliedFilters.push(pixelFilter);
  }

  // Apply Dot
  if (filters.dot > 0) {
    const dotValue = Math.max(0, Math.min(filters.dot, 1));
    const dotFilter = new DotFilter();
    dotFilter.scale = dotValue * 0.5;
    appliedFilters.push(dotFilter);
  }

  // Apply Cross Hatch
  if (filters.crossHatch > 0) {
    const hatchFilter = new CrossHatchFilter();
    // CrossHatchFilter doesn't have a blend property, using default settings
    appliedFilters.push(hatchFilter);
  }

  // Apply CRT
  if (filters.crt > 0) {
    const crtValue = Math.max(0, Math.min(filters.crt, 1));
    const crtFilter = new CRTFilter();
    crtFilter.curvature = crtValue * 2;
    crtFilter.lineWidth = crtValue * 2;
    crtFilter.lineContrast = crtValue * 0.3;
    appliedFilters.push(crtFilter);
  }

  // Apply Old Film
  if (filters.oldFilm > 0) {
    const filmValue = Math.max(0, Math.min(filters.oldFilm, 1));
    const filmFilter = new OldFilmFilter();
    filmFilter.sepia = filmValue * 0.3;
    filmFilter.noise = filmValue * 0.3;
    filmFilter.noiseSize = 1;
    filmFilter.scratch = filmValue * 0.5;
    filmFilter.scratchDensity = filmValue * 0.3;
    filmFilter.scratchWidth = filmValue * 0.1;
    appliedFilters.push(filmFilter);
  }

  // Apply ASCII
  if (filters.ascii > 0) {
    const asciiValue = Math.max(0, Math.min(filters.ascii, 1));
    const asciiFilter = new AsciiFilter();
    asciiFilter.size = Math.max(2, asciiValue * 8);
    appliedFilters.push(asciiFilter);
  }

  // Apply Noise (community version)
  if (filters.noise > 0) {
    const noiseFilter = new SimplexNoiseFilter();
    // SimplexNoiseFilter doesn't have a noise property, using default settings
    appliedFilters.push(noiseFilter);
  }

  // Apply Bloom
  if (filters.bloom > 0) {
    const bloomValue = Math.max(0, Math.min(filters.bloom, 1));
    const bloomFilter = new AdvancedBloomFilter();
    bloomFilter.threshold = 0.5;
    bloomFilter.bloomScale = bloomValue;
    bloomFilter.brightness = bloomValue;
    appliedFilters.push(bloomFilter);
  }

  // Apply God Ray
  if (filters.godray > 0) {
    const rayValue = Math.max(0, Math.min(filters.godray, 1));
    const rayFilter = new GodrayFilter();
    rayFilter.angle = 30;
    rayFilter.gain = rayValue * 0.5;
    rayFilter.lacunarity = 2;
    rayFilter.time = 0;
    appliedFilters.push(rayFilter);
  }

  // Apply Reflection
  if (filters.reflection > 0) {
    const reflectFilter = new ReflectionFilter();
    // ReflectionFilter properties may not be directly settable
    appliedFilters.push(reflectFilter);
  }

  // Apply Water Reflection (using regular ReflectionFilter)
  if (filters.waterReflection > 0) {
    const waterFilter = new ReflectionFilter();
    // ReflectionFilter properties may not be directly settable
    appliedFilters.push(waterFilter);
  }

  // Apply RGB Split
  if (filters.rgbSplit > 0) {
    const rgbValue = Math.max(0, Math.min(filters.rgbSplit, 1));
    const rgbFilter = new RGBSplitFilter();
    rgbFilter.red.x = rgbValue * 5;
    rgbFilter.green.x = -rgbValue * 5;
    rgbFilter.blue.x = rgbValue * 2;
    appliedFilters.push(rgbFilter);
  }

  // Apply Color Replace
  if (filters.colorReplace > 0) {
    const colorValue = Math.max(0, Math.min(filters.colorReplace, 1));
    const colorFilter = new ColorReplaceFilter(0x000000, 0xff0000, colorValue);
    appliedFilters.push(colorFilter);
  }

  // Apply Multi Color Replace
  if (filters.multiColorReplace > 0) {
    const multiFilter = new MultiColorReplaceFilter([
      [0x000000, 0xff0000]
    ]);
    appliedFilters.push(multiFilter);
  }

  sprite.filters = appliedFilters;
};
