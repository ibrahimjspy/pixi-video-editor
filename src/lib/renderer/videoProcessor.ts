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
      // Color Adjustments
      brightness: element.filters.brightness ?? 1,
      contrast: element.filters.contrast ?? 1,
      saturation: element.filters.saturation ?? 1,
      hue: element.filters.hue ?? 0,
      vibrance: element.filters.vibrance ?? 0,
      gamma: element.filters.gamma ?? 1,
      sepia: element.filters.sepia ?? 0,
      grayscale: element.filters.grayscale ?? 0,
      invert: element.filters.invert ?? 0,
      
      // Blur & Sharpness
      blur: element.filters.blur ?? 0,
      sharpness: element.filters.sharpness ?? 0,
      kawaseBlur: element.filters.kawaseBlur ?? 0,
      zoomBlur: element.filters.zoomBlur ?? 0,
      tiltShift: element.filters.tiltShift ?? 0,
      
      // Distortion Effects
      bulgePinch: element.filters.bulgePinch ?? 0,
      twist: element.filters.twist ?? 0,
      shockwave: element.filters.shockwave ?? 0,
      displacement: element.filters.displacement ?? 0,
      
      // Visual Effects
      glow: element.filters.glow ?? 0,
      outline: element.filters.outline ?? 0,
      dropShadow: element.filters.dropShadow ?? 0,
      bevel: element.filters.bevel ?? 0,
      emboss: element.filters.emboss ?? 0,
      pixelate: element.filters.pixelate ?? 0,
      dot: element.filters.dot ?? 0,
      crossHatch: element.filters.crossHatch ?? 0,
      
      // Vintage & Retro
      crt: element.filters.crt ?? 0,
      oldFilm: element.filters.oldFilm ?? 0,
      ascii: element.filters.ascii ?? 0,
      noise: element.filters.noise ?? 0,
      
      // Advanced Effects
      bloom: element.filters.bloom ?? 0,
      godray: element.filters.godray ?? 0,
      reflection: element.filters.reflection ?? 0,
      waterReflection: element.filters.waterReflection ?? 0,
      rgbSplit: element.filters.rgbSplit ?? 0,
      colorReplace: element.filters.colorReplace ?? 0,
      multiColorReplace: element.filters.multiColorReplace ?? 0,
    };

    applyFilters(sprite, filters);
    makeInteractive(sprite, element.id);

    onReady(sprite);
  });

  video.addEventListener('error', (err) => {
    console.error('Error loading video:', err);
  });
};
