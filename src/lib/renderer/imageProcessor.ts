import * as PIXI from 'pixi.js';
import { ImageElement } from '@/types/editor';
import { applyFilters } from './filters';
import { makeInteractive } from './interactivity';

export const renderImage = (
  element: ImageElement,
  app: PIXI.Application,
  onReady: (sprite: PIXI.Sprite) => void,
) => {
  const image = new Image();
  image.src = element.url;

  image
    .decode()
    .then(() => {
      const texture = PIXI.Texture.from(image);
      const sprite = new PIXI.Sprite(texture);

      sprite.width = app.screen.width;
      sprite.height = app.screen.height;
      sprite.x = element.x;
      sprite.y = element.y;

      const brightness =
        typeof element.filters.brightness === 'number'
          ? Math.max(0, Math.min(element.filters.brightness, 1))
          : 1;

      applyFilters(sprite, brightness, element.filters.contrast);
      makeInteractive(sprite, element.id);

      onReady(sprite);
    })
    .catch((err) => {
      console.error('Error decoding image:', err);
    });
};
