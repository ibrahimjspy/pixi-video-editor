import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';

const { ColorMatrixFilter } = PIXI;

export const applyFilters = (
  sprite: PIXI.Sprite,
  brightness: number,
  contrast: number,
) => {
  const brightnessValue = Math.floor(255 * brightness);
  const tintColor =
    (brightnessValue << 16) | (brightnessValue << 8) | brightnessValue;

  gsap.to(sprite, {
    tint: tintColor,
    duration: 0.5,
    onUpdate: () => {
      console.log('Tweening brightness:', brightness, 'Tint color:', tintColor);
    },
  });

  const filter = new ColorMatrixFilter();
  filter.reset();
  filter.contrast(contrast, false);

  sprite.filters = [filter];
};
