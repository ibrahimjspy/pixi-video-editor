// Filter definitions with categories, search terms, and configurations
export interface FilterDefinition {
  key: string;
  label: string;
  emoji: string;
  category: 'Color' | 'Blur' | 'Distortion' | 'Effects' | 'Vintage' | 'Advanced';
  min: number;
  max: number;
  step: number;
  default: number;
  gradient: string;
  description: string;
  searchTerms: string[];
}

export const FILTER_DEFINITIONS: FilterDefinition[] = [
  // Color Adjustments
  {
    key: 'brightness',
    label: 'Brightness',
    emoji: '☀️',
    category: 'Color',
    min: 0,
    max: 2,
    step: 0.01,
    default: 1,
    gradient: 'linear-gradient(to right, #000000, #888888, #ffffff)',
    description: 'Adjust the overall brightness of the image',
    searchTerms: ['bright', 'light', 'dark', 'exposure', 'luminance']
  },
  {
    key: 'contrast',
    label: 'Contrast',
    emoji: '🔲',
    category: 'Color',
    min: 0,
    max: 2,
    step: 0.01,
    default: 1,
    gradient: 'linear-gradient(to right, #666666, #aaaaaa)',
    description: 'Adjust the contrast between light and dark areas',
    searchTerms: ['contrast', 'difference', 'range', 'dynamic']
  },
  {
    key: 'saturation',
    label: 'Saturation',
    emoji: '🌈',
    category: 'Color',
    min: 0,
    max: 2,
    step: 0.01,
    default: 1,
    gradient: 'linear-gradient(to right, #666666, #ff6b6b, #4ecdc4)',
    description: 'Control the intensity of colors',
    searchTerms: ['saturation', 'color', 'vivid', 'muted', 'chroma']
  },
  {
    key: 'hue',
    label: 'Hue',
    emoji: '🎨',
    category: 'Color',
    min: -180,
    max: 180,
    step: 1,
    default: 0,
    gradient: 'linear-gradient(to right, #ff0000, #00ff00, #0000ff, #ff0000)',
    description: 'Shift the color spectrum',
    searchTerms: ['hue', 'color shift', 'tint', 'color wheel']
  },
  {
    key: 'vibrance',
    label: 'Vibrance',
    emoji: '✨',
    category: 'Color',
    min: -1,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #666666, #ff6b6b, #4ecdc4)',
    description: 'Enhance mid-tone saturation',
    searchTerms: ['vibrance', 'pop', 'enhance', 'mid-tone']
  },
  {
    key: 'gamma',
    label: 'Gamma',
    emoji: '🔆',
    category: 'Color',
    min: 0.5,
    max: 2,
    step: 0.01,
    default: 1,
    gradient: 'linear-gradient(to right, #000000, #888888, #ffffff)',
    description: 'Adjust mid-tone brightness',
    searchTerms: ['gamma', 'mid-tone', 'curve', 'correction']
  },
  {
    key: 'sepia',
    label: 'Sepia',
    emoji: '📸',
    category: 'Color',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #8b4513)',
    description: 'Apply vintage brown tone',
    searchTerms: ['sepia', 'vintage', 'brown', 'antique', 'old']
  },
  {
    key: 'grayscale',
    label: 'Grayscale',
    emoji: '⚫',
    category: 'Color',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #666666)',
    description: 'Convert to black and white',
    searchTerms: ['grayscale', 'black', 'white', 'monochrome', 'bw']
  },
  {
    key: 'invert',
    label: 'Invert',
    emoji: '🔄',
    category: 'Color',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #ffffff)',
    description: 'Invert all colors',
    searchTerms: ['invert', 'negative', 'reverse', 'opposite']
  },

  // Blur & Sharpness
  {
    key: 'blur',
    label: 'Blur',
    emoji: '🌫️',
    category: 'Blur',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #666666)',
    description: 'Apply Gaussian blur',
    searchTerms: ['blur', 'soft', 'focus', 'gaussian']
  },
  {
    key: 'sharpness',
    label: 'Sharpness',
    emoji: '⚡',
    category: 'Blur',
    min: -1,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #666666, #ffffff)',
    description: 'Enhance or reduce sharpness',
    searchTerms: ['sharp', 'crisp', 'unsharp', 'mask']
  },
  {
    key: 'kawaseBlur',
    label: 'Kawase Blur',
    emoji: '🌀',
    category: 'Blur',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #666666)',
    description: 'Advanced blur with better performance',
    searchTerms: ['kawase', 'advanced', 'performance', 'blur']
  },
  {
    key: 'zoomBlur',
    label: 'Zoom Blur',
    emoji: '🔍',
    category: 'Blur',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #666666)',
    description: 'Radial blur effect',
    searchTerms: ['zoom', 'radial', 'motion', 'speed']
  },
  {
    key: 'tiltShift',
    label: 'Tilt Shift',
    emoji: '📷',
    category: 'Blur',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #666666)',
    description: 'Miniature effect with selective focus',
    searchTerms: ['tilt', 'shift', 'miniature', 'selective', 'focus']
  },

  // Distortion Effects
  {
    key: 'bulgePinch',
    label: 'Bulge/Pinch',
    emoji: '🔴',
    category: 'Distortion',
    min: -1,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #ff0000, #000000, #00ff00)',
    description: 'Create bulge or pinch distortion',
    searchTerms: ['bulge', 'pinch', 'distort', 'lens', 'fish eye']
  },
  {
    key: 'twist',
    label: 'Twist',
    emoji: '🌪️',
    category: 'Distortion',
    min: -1,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #ff0000, #000000, #00ff00)',
    description: 'Spiral distortion effect',
    searchTerms: ['twist', 'spiral', 'rotate', 'swirl']
  },
  {
    key: 'shockwave',
    label: 'Shockwave',
    emoji: '💥',
    category: 'Distortion',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #ff0000)',
    description: 'Explosion-like distortion',
    searchTerms: ['shockwave', 'explosion', 'wave', 'ripple']
  },
  {
    key: 'displacement',
    label: 'Displacement',
    emoji: '🌊',
    category: 'Distortion',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #666666)',
    description: 'Texture-based displacement',
    searchTerms: ['displacement', 'warp', 'texture', 'map']
  },

  // Visual Effects
  {
    key: 'glow',
    label: 'Glow',
    emoji: '✨',
    category: 'Effects',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #ffff00)',
    description: 'Add glowing effect around edges',
    searchTerms: ['glow', 'halo', 'aura', 'light', 'bright']
  },
  {
    key: 'outline',
    label: 'Outline',
    emoji: '📐',
    category: 'Effects',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #ffffff)',
    description: 'Detect and highlight edges',
    searchTerms: ['outline', 'edge', 'detection', 'border', 'contour']
  },
  {
    key: 'dropShadow',
    label: 'Drop Shadow',
    emoji: '🌑',
    category: 'Effects',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #666666)',
    description: 'Add shadow behind the object',
    searchTerms: ['shadow', 'drop', 'depth', 'elevation']
  },
  {
    key: 'bevel',
    label: 'Bevel',
    emoji: '🔲',
    category: 'Effects',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #ffffff)',
    description: 'Create 3D beveled edges',
    searchTerms: ['bevel', '3d', 'emboss', 'raised', 'relief']
  },
  {
    key: 'emboss',
    label: 'Emboss',
    emoji: '🏔️',
    category: 'Effects',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #ffffff)',
    description: 'Create embossed texture effect',
    searchTerms: ['emboss', 'texture', 'raised', 'relief', '3d']
  },
  {
    key: 'pixelate',
    label: 'Pixelate',
    emoji: '🔲',
    category: 'Effects',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #666666)',
    description: 'Create pixelated effect',
    searchTerms: ['pixel', 'block', 'mosaic', 'retro', '8bit']
  },
  {
    key: 'dot',
    label: 'Dot',
    emoji: '⚫',
    category: 'Effects',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #666666)',
    description: 'Halftone dot pattern',
    searchTerms: ['dot', 'halftone', 'screen', 'print', 'newspaper']
  },
  {
    key: 'crossHatch',
    label: 'Cross Hatch',
    emoji: '✏️',
    category: 'Effects',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #666666)',
    description: 'Crosshatch shading effect',
    searchTerms: ['crosshatch', 'hatch', 'shading', 'sketch', 'drawing']
  },

  // Vintage & Retro
  {
    key: 'crt',
    label: 'CRT',
    emoji: '📺',
    category: 'Vintage',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #00ff00)',
    description: 'Old CRT monitor effect',
    searchTerms: ['crt', 'monitor', 'retro', 'vintage', 'scanline']
  },
  {
    key: 'oldFilm',
    label: 'Old Film',
    emoji: '🎬',
    category: 'Vintage',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #8b4513)',
    description: 'Vintage film with scratches and noise',
    searchTerms: ['film', 'old', 'vintage', 'scratch', 'noise', 'movie']
  },
  {
    key: 'ascii',
    label: 'ASCII',
    emoji: '💻',
    category: 'Vintage',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #ffffff)',
    description: 'Convert to ASCII characters',
    searchTerms: ['ascii', 'text', 'character', 'terminal', 'code']
  },
  {
    key: 'noise',
    label: 'Noise',
    emoji: '📺',
    category: 'Vintage',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #666666)',
    description: 'Add random noise/grain',
    searchTerms: ['noise', 'grain', 'static', 'tv', 'interference']
  },

  // Advanced Effects
  {
    key: 'bloom',
    label: 'Bloom',
    emoji: '🌟',
    category: 'Advanced',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #ffff00)',
    description: 'Advanced bloom lighting effect',
    searchTerms: ['bloom', 'light', 'bright', 'hdr', 'glow']
  },
  {
    key: 'godray',
    label: 'God Ray',
    emoji: '☀️',
    category: 'Advanced',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #ffff00)',
    description: 'Volumetric light rays',
    searchTerms: ['godray', 'ray', 'light', 'volumetric', 'sunbeam']
  },
  {
    key: 'reflection',
    label: 'Reflection',
    emoji: '🪞',
    category: 'Advanced',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #666666)',
    description: 'Add reflective surface',
    searchTerms: ['reflection', 'mirror', 'surface', 'water', 'glass']
  },
  {
    key: 'waterReflection',
    label: 'Water Reflection',
    emoji: '🌊',
    category: 'Advanced',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #0066cc)',
    description: 'Water-like reflection with ripples',
    searchTerms: ['water', 'ripple', 'wave', 'reflection', 'liquid']
  },
  {
    key: 'rgbSplit',
    label: 'RGB Split',
    emoji: '🌈',
    category: 'Advanced',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #ff0000)',
    description: 'Chromatic aberration effect',
    searchTerms: ['rgb', 'split', 'chromatic', 'aberration', 'glitch']
  },
  {
    key: 'colorReplace',
    label: 'Color Replace',
    emoji: '🎨',
    category: 'Advanced',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #ff0000)',
    description: 'Replace specific colors',
    searchTerms: ['color', 'replace', 'swap', 'change', 'hue']
  },
  {
    key: 'multiColorReplace',
    label: 'Multi Color Replace',
    emoji: '🎭',
    category: 'Advanced',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    gradient: 'linear-gradient(to right, #000000, #ff0000)',
    description: 'Replace multiple colors at once',
    searchTerms: ['multi', 'color', 'replace', 'multiple', 'batch']
  }
];

export const FILTER_CATEGORIES = [
  'Color',
  'Blur', 
  'Distortion',
  'Effects',
  'Vintage',
  'Advanced'
] as const;

export type FilterCategory = typeof FILTER_CATEGORIES[number];
