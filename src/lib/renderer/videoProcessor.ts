import * as PIXI from 'pixi.js';
import { VideoElement } from '@/types/editor';
import { applyFilters } from './filters';
import { makeInteractive } from './interactivity';

export const renderVideo = (
  element: VideoElement,
  app: PIXI.Application,
  videoRef: React.MutableRefObject<HTMLVideoElement | null>,
  onReady: (sprite: PIXI.Sprite) => void,
) => {
  const video = document.createElement('video');
  video.src = element.url;
  video.crossOrigin = 'anonymous';
  video.autoplay = true;
  video.loop = true;
  video.muted = true;

  videoRef.current = video;

  video.addEventListener('loadeddata', () => {
    const texture = PIXI.Texture.from(video);
    const sprite = new PIXI.Sprite(texture);

    sprite.width = app.screen.width;
    sprite.height = app.screen.height;
    sprite.x = element.x;
    sprite.y = element.y;

    // Ensure all filter values have defaults
    const filters = {
      brightness: element.filters.brightness ?? 1,
      contrast: element.filters.contrast ?? 1,
      sharpness: element.filters.sharpness ?? 0,
      saturation: element.filters.saturation ?? 1,
      hue: element.filters.hue ?? 0,
      blur: element.filters.blur ?? 0,
      sepia: element.filters.sepia ?? 0,
      grayscale: element.filters.grayscale ?? 0,
      invert: element.filters.invert ?? 0,
      vibrance: element.filters.vibrance ?? 0,
      gamma: element.filters.gamma ?? 1,
      noise: element.filters.noise ?? 0,
    };

    applyFilters(sprite, filters);
    makeInteractive(sprite, element.id);

    onReady(sprite);
  });

  video.addEventListener('error', (err) => {
    console.error('Error loading video:', err);
  });
};
