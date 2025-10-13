// types/editor.ts
export type ElementType = 'image' | 'video' | 'text';

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  originalWidth?: number;
  originalHeight?: number;
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
  };
}

export interface ImageElement extends BaseElement {
  type: 'image';
  file: File;
  url: string;
}

export interface VideoElement extends BaseElement {
  type: 'video';
  file: File;
  url: string;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
}

export type EditorElement = ImageElement | VideoElement | TextElement;
