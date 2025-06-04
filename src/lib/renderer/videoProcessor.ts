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

    const brightness =
      typeof element.filters.brightness === 'number'
        ? Math.max(0, Math.min(element.filters.brightness, 1))
        : 1;

    applyFilters(sprite, brightness, element.filters.contrast);
    makeInteractive(sprite);

    onReady(sprite);
  });

  video.addEventListener('error', (err) => {
    console.error('Error loading video:', err);
  });
};
