import type { EffectParams } from '@/types/editor';

/**
 * The look library: named colour treatments built from the same effects the
 * user can add by hand. A look is applied before the layer's own effect stack
 * and blended in with one intensity slider.
 */

export const LOOK_CATEGORIES = ['Film', 'Vivid', 'Mood', 'Mono', 'Retro'] as const;

export type LookCategory = (typeof LOOK_CATEGORIES)[number];

export interface LookDefinition {
  id: string;
  label: string;
  category: LookCategory;
  description: string;
  effects: ReadonlyArray<{ type: string; params: EffectParams }>;
}

const grade = (params: EffectParams) => ({ type: 'colorAdjust', params });
const vignette = (amount: number, size = 0.35) => ({
  type: 'vignette',
  params: { amount, size, softness: 0.5 },
});
const grain = (amount: number) => ({ type: 'grain', params: { amount, animated: true } });
const duotone = (shadows: string, highlights: string, amount: number) => ({
  type: 'duotone',
  params: { shadows, highlights, amount },
});

export const LOOK_DEFINITIONS: LookDefinition[] = [
  // ------------------------------------------------------------------ Film
  {
    id: 'cinematic',
    label: 'Cinematic',
    category: 'Film',
    description: 'Deep contrast, slightly muted colour, dark corners.',
    effects: [
      grade({ brightness: 0.96, contrast: 1.2, saturation: 0.9, temperature: 0.06, gamma: 0.95 }),
      vignette(0.35),
    ],
  },
  {
    id: 'teal-orange',
    label: 'Teal & Orange',
    category: 'Film',
    description: 'Blockbuster grade: cool shadows, warm highlights.',
    effects: [
      grade({ contrast: 1.14, saturation: 1.12 }),
      duotone('#0b3a4a', '#ffb070', 0.3),
    ],
  },
  {
    id: 'warm-film',
    label: 'Warm Film',
    category: 'Film',
    description: 'Golden, soft and slightly faded, like warm print stock.',
    effects: [
      grade({ contrast: 1.06, saturation: 1.05, temperature: 0.32, tint: 0.06, fade: 0.2 }),
      grain(0.08),
    ],
  },
  {
    id: 'cool-film',
    label: 'Cool Film',
    category: 'Film',
    description: 'Clean greens and blues with gentle contrast.',
    effects: [
      grade({ contrast: 1.08, saturation: 0.96, temperature: -0.22, tint: -0.1, fade: 0.12 }),
      grain(0.06),
    ],
  },
  {
    id: 'faded',
    label: 'Faded',
    category: 'Film',
    description: 'Lifted blacks and washed colour.',
    effects: [grade({ contrast: 0.9, saturation: 0.78, fade: 0.55, temperature: 0.08 })],
  },
  {
    id: 'bleach-bypass',
    label: 'Bleach Bypass',
    category: 'Film',
    description: 'Harsh contrast with most of the colour drained.',
    effects: [grade({ contrast: 1.38, saturation: 0.45, brightness: 0.98 }), grain(0.1)],
  },
  {
    id: 'golden-hour',
    label: 'Golden Hour',
    category: 'Film',
    description: 'Low sun: warm, glowing highlights.',
    effects: [
      grade({ brightness: 1.05, contrast: 1.08, saturation: 1.15, temperature: 0.5, tint: 0.08 }),
      { type: 'bloom', params: { intensity: 0.45, threshold: 0.6, blur: 8 } },
    ],
  },

  // ----------------------------------------------------------------- Vivid
  {
    id: 'clean',
    label: 'Clean',
    category: 'Vivid',
    description: 'A light, neutral polish.',
    effects: [grade({ contrast: 1.06, saturation: 1.04, vibrance: 0.1 })],
  },
  {
    id: 'vibrant',
    label: 'Vibrant',
    category: 'Vivid',
    description: 'Bright, saturated and lively.',
    effects: [grade({ brightness: 1.06, contrast: 1.12, saturation: 1.26, vibrance: 0.35 })],
  },
  {
    id: 'punchy',
    label: 'Punchy',
    category: 'Vivid',
    description: 'Strong contrast and crisp detail.',
    effects: [
      grade({ contrast: 1.3, saturation: 1.15, gamma: 0.94 }),
      { type: 'sharpen', params: { amount: 0.3 } },
    ],
  },
  {
    id: 'fresh',
    label: 'Fresh',
    category: 'Vivid',
    description: 'Airy and bright with a cool tint.',
    effects: [grade({ brightness: 1.1, contrast: 1.02, saturation: 1.1, temperature: -0.12, fade: 0.1 })],
  },
  {
    id: 'pop',
    label: 'Pop',
    category: 'Vivid',
    description: 'Candy-bright colour for social clips.',
    effects: [
      grade({ brightness: 1.04, contrast: 1.18, saturation: 1.45, vibrance: 0.5 }),
      { type: 'bloom', params: { intensity: 0.25, threshold: 0.7, blur: 5 } },
    ],
  },

  // ------------------------------------------------------------------ Mood
  {
    id: 'dreamy',
    label: 'Dreamy',
    category: 'Mood',
    description: 'Soft glow, low contrast, warm haze.',
    effects: [
      grade({ brightness: 1.06, contrast: 0.9, saturation: 1.05, temperature: 0.14, fade: 0.22 }),
      { type: 'bloom', params: { intensity: 0.9, threshold: 0.4, blur: 10 } },
    ],
  },
  {
    id: 'moody-blue',
    label: 'Moody Blue',
    category: 'Mood',
    description: 'Dark, cold and quiet.',
    effects: [
      grade({ brightness: 0.9, contrast: 1.16, saturation: 0.8, temperature: -0.4, gamma: 0.92 }),
      vignette(0.45),
    ],
  },
  {
    id: 'night',
    label: 'Night',
    category: 'Mood',
    description: 'Day-for-night: dim and blue.',
    effects: [
      grade({ brightness: 0.72, contrast: 1.1, saturation: 0.6, temperature: -0.6 }),
      vignette(0.55, 0.45),
    ],
  },
  {
    id: 'sunset',
    label: 'Sunset',
    category: 'Mood',
    description: 'Purple shadows melting into orange light.',
    effects: [grade({ contrast: 1.08, saturation: 1.1 }), duotone('#3a1c71', '#ffaf7b', 0.45)],
  },
  {
    id: 'cyber',
    label: 'Cyber',
    category: 'Mood',
    description: 'Neon magenta and cyan.',
    effects: [
      grade({ contrast: 1.2, saturation: 1.2 }),
      duotone('#12063b', '#00f0ff', 0.4),
      { type: 'colorOverlay', params: { color: '#ff2bd6', amount: 0.1 } },
    ],
  },
  {
    id: 'spotlight',
    label: 'Spotlight',
    category: 'Mood',
    description: 'Bright centre, heavy dark edges.',
    effects: [grade({ brightness: 1.08, contrast: 1.16 }), vignette(0.8, 0.5)],
  },

  // ------------------------------------------------------------------ Mono
  {
    id: 'noir',
    label: 'Noir',
    category: 'Mono',
    description: 'High-contrast black and white.',
    effects: [
      { type: 'blackWhite', params: { amount: 1 } },
      grade({ brightness: 0.95, contrast: 1.3 }),
      vignette(0.4),
    ],
  },
  {
    id: 'soft-mono',
    label: 'Soft Mono',
    category: 'Mono',
    description: 'Gentle, low-contrast black and white.',
    effects: [{ type: 'blackWhite', params: { amount: 1 } }, grade({ contrast: 0.94, fade: 0.25 })],
  },
  {
    id: 'silver',
    label: 'Silver',
    category: 'Mono',
    description: 'Grainy, contrasty press-photo black and white.',
    effects: [
      { type: 'blackWhite', params: { amount: 1 } },
      grade({ contrast: 1.2, brightness: 1.03 }),
      grain(0.2),
    ],
  },
  {
    id: 'sepia-tone',
    label: 'Sepia',
    category: 'Mono',
    description: 'Warm brown antique print.',
    effects: [{ type: 'sepia', params: { amount: 0.9 } }, grade({ contrast: 1.05, fade: 0.15 })],
  },

  // ----------------------------------------------------------------- Retro
  {
    id: 'vhs',
    label: 'VHS',
    category: 'Retro',
    description: 'Home-video tape: colour bleed, scan lines, static.',
    effects: [
      grade({ contrast: 0.95, saturation: 1.15, fade: 0.2 }),
      { type: 'rgbSplit', params: { amount: 3, angle: 0 } },
      {
        type: 'crt',
        params: { lineContrast: 0.2, lineWidth: 2, curvature: 0, noise: 0.2, vignette: 0.3, vertical: false, animated: true },
      },
    ],
  },
  {
    id: 'super-8',
    label: 'Super 8',
    category: 'Retro',
    description: 'Scratched, flickering home-movie film.',
    effects: [
      grade({ contrast: 1.05, saturation: 0.9, temperature: 0.25 }),
      {
        type: 'oldFilm',
        params: { sepia: 0.25, noise: 0.25, scratch: 0.5, scratchDensity: 0.3, vignette: 0.6, animated: true },
      },
    ],
  },
  {
    id: 'arcade',
    label: 'Arcade',
    category: 'Retro',
    description: 'Chunky pixels on a curved tube screen.',
    effects: [
      grade({ contrast: 1.15, saturation: 1.3 }),
      { type: 'pixelate', params: { size: 5 } },
      {
        type: 'crt',
        params: { lineContrast: 0.35, lineWidth: 3, curvature: 2.5, noise: 0.05, vignette: 0.4, vertical: false, animated: true },
      },
    ],
  },
];

const LOOKS_BY_ID = new Map(LOOK_DEFINITIONS.map((look) => [look.id, look]));

export const getLookDefinition = (id: string): LookDefinition | undefined => LOOKS_BY_ID.get(id);

export const isLookId = (id: unknown): id is string =>
  typeof id === 'string' && LOOKS_BY_ID.has(id);
