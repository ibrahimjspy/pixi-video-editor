import { FilterPresetName, FilterSettings } from '@/types/editor';

/** Preset names in the order they should be offered in menus. */
export const FILTER_PRESET_NAMES: readonly FilterPresetName[] = [
  'clean',
  'cinematic',
  'vibrant',
  'noir',
  'spotlight',
];

/**
 * Filter values each preset changes away from the defaults.
 *
 * A preset is always applied on top of default filters, never on top of the
 * layer's current filters, so switching presets does not accumulate. Only list
 * values that differ from the default. Effect filters such as `sepia`,
 * `grayscale`, `blur`, `glow`, and `dropShadow` are proportional 0..1
 * intensities, so small values are light touches.
 */
export const FILTER_PRESETS: Record<FilterPresetName, Partial<FilterSettings>> = {
  clean: {
    contrast: 1.05,
    saturation: 1.02,
  },
  cinematic: {
    brightness: 0.94,
    contrast: 1.18,
    saturation: 0.92,
    sepia: 0.08,
  },
  vibrant: {
    brightness: 1.08,
    contrast: 1.12,
    saturation: 1.24,
    vibrance: 0.32,
  },
  noir: {
    brightness: 0.95,
    contrast: 1.25,
    grayscale: 1,
  },
  spotlight: {
    brightness: 1.1,
    contrast: 1.14,
    glow: 0.24,
    dropShadow: 0.18,
  },
};
