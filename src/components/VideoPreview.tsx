import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import * as PIXI from 'pixi.js';
const { ColorMatrixFilter } = PIXI;

const VideoPreview = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PIXI.Application | null>(null);
  const { assets, selectedAssetId } = useEditorStore();
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const selectedAsset = assets.find((a) => a.id === selectedAssetId);

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Initialize PixiJS application once
  useEffect(() => {
    if (!canvasRef.current) return;

    const app = new PIXI.Application();
    pixiAppRef.current = app;

    app
      .init({
        width: 800,
        height: 450,
        backgroundColor: 0x000000,
      })
      .then(() => {
        const canvas = app.canvas;
        if (canvasRef.current && canvas) {
          canvasRef.current.innerHTML = '';
          canvasRef.current.appendChild(canvas);
        }
      });

    return () => {
      app.destroy(true, { children: true });
    };
  }, []);

  // Render selected asset
  useEffect(() => {
    if (!selectedAsset || !pixiAppRef.current) return;
    const app = pixiAppRef.current;
    app.stage.removeChildren();

    if (selectedAsset.type === 'image') {
      const image = new Image();
      image.src = selectedAsset.url;

      image
        .decode()
        .then(() => {
          const texture = PIXI.Texture.from(image); // Use Texture.from to create a texture from the image
          const sprite = new PIXI.Sprite(texture);
          sprite.width = app.screen.width;
          sprite.height = app.screen.height;

          // Simulate brightness using the tint property
          const brightness = typeof selectedAsset.filters.brightness === 'number'
            ? Math.max(0, Math.min(selectedAsset.filters.brightness, 1)) // Clamp brightness between 0 and 1
            : 1;

          const brightnessValue = Math.floor(255 * brightness); // Convert brightness to a 0-255 scale
          const tintColor = (brightnessValue << 16) | (brightnessValue << 8) | brightnessValue; // RGB color
          sprite.tint = tintColor;

          console.log('Applying brightness via tint:', brightness, 'Tint color:', tintColor);

          // Apply contrast using ColorMatrixFilter
          const filter = new ColorMatrixFilter();
          filter.reset();
          filter.contrast(selectedAsset.filters.contrast, false);
          sprite.filters = [filter];

          app.stage.addChild(sprite);

          console.log('Sprite filters:', sprite.filters);
          console.log('App stage children:', app.stage.children);
        })
        .catch((error) => {
          console.error('Error decoding image:', error);
        });
    } else if (selectedAsset.type === 'video') {
      const video = document.createElement('video');
      video.src = selectedAsset.url;
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

        // Simulate brightness using the tint property
        const brightness = typeof selectedAsset.filters.brightness === 'number'
          ? Math.max(0, Math.min(selectedAsset.filters.brightness, 1)) // Clamp brightness between 0 and 1
          : 1;

        const brightnessValue = Math.floor(255 * brightness); // Convert brightness to a 0-255 scale
        const tintColor = (brightnessValue << 16) | (brightnessValue << 8) | brightnessValue; // RGB color
        sprite.tint = tintColor;

        console.log('Applying brightness via tint:', brightness, 'Tint color:', tintColor);

        // Apply contrast using ColorMatrixFilter
        const filter = new ColorMatrixFilter();
        filter.reset();
        filter.contrast(selectedAsset.filters.contrast, false);
        sprite.filters = [filter];

        app.stage.addChild(sprite);

        console.log('Sprite filters:', sprite.filters);
        console.log('App stage children:', app.stage.children);
      });

      video.addEventListener('error', (error) => {
        console.error('Error loading video:', error);
      });
    }
  }, [selectedAsset]);

  return (
    <div className="flex flex-col justify-center items-center h-full">
      <div ref={canvasRef} className="w-[800px] h-[450px] bg-black" />
      {selectedAsset?.type === 'video' && (
        <button
          onClick={togglePlayPause}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
      )}
    </div>
  );
};

export default VideoPreview;
