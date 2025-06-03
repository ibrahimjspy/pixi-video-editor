import { useEffect, useRef, useState, useMemo } from 'react';
import { useEditorStore } from '@/store/editorStore';
import * as PIXI from 'pixi.js';
import { gsap } from 'gsap'; // Import GSAP for smooth transitions
const { ColorMatrixFilter } = PIXI;

const VideoPreview = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PIXI.Application | null>(null);
  const { assets, selectedAssetId } = useEditorStore();
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const selectedAsset = useMemo(() => assets.find((a) => a.id === selectedAssetId), [assets, selectedAssetId]);

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
  }, []); // Run only once on mount

  // Enable drag-and-resize functionality
  const makeInteractive = (sprite: PIXI.Sprite) => {
    sprite.interactive = true;

    let isDragging = false;
    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = sprite.width;
    let startHeight = sprite.height;

    const resizeHandle = new PIXI.Graphics();
    resizeHandle.beginFill(0xffffff);
    resizeHandle.drawRect(0, 0, 10, 10);
    resizeHandle.endFill();
    resizeHandle.interactive = true;
    resizeHandle.cursor = 'nwse-resize';
    resizeHandle.x = sprite.width - 10;
    resizeHandle.y = sprite.height - 10;

    resizeHandle
      .on('pointerdown', (event) => {
        isResizing = true;
        const { x, y } = event.data.global;
        startX = x;
        startY = y;
        startWidth = sprite.width;
        startHeight = sprite.height;
      })
      .on('pointermove', (event) => {
        if (isResizing) {
          const { x, y } = event.data.global;
          const deltaX = x - startX;
          const deltaY = y - startY;
          sprite.width = Math.max(50, startWidth + deltaX);
          sprite.height = Math.max(50, startHeight + deltaY);
          resizeHandle.x = sprite.width - 10;
          resizeHandle.y = sprite.height - 10;
        }
      })
      .on('pointerup', () => {
        isResizing = false;
      })
      .on('pointerupoutside', () => {
        isResizing = false;
      });

    sprite.addChild(resizeHandle);

    sprite
      .on('pointerdown', (event) => {
        if (!isResizing) {
          isDragging = true;
          const { x, y } = event.data.global;
          startX = x - sprite.x;
          startY = y - sprite.y;
        }
      })
      .on('pointermove', (event) => {
        if (isDragging) {
          const { x, y } = event.data.global;
          sprite.x = x - startX;
          sprite.y = y - startY;
        }
      })
      .on('pointerup', () => {
        isDragging = false;
      })
      .on('pointerupoutside', () => {
        isDragging = false;
      });
  };

  // Render selected asset
  useEffect(() => {
    if (!selectedAsset || !pixiAppRef.current) return;
    const app = pixiAppRef.current;
    app.stage.removeChildren();

    const applyBrightnessAndContrast = (sprite: PIXI.Sprite, brightness: number, contrast: number) => {
      // Smoothly transition brightness using GSAP
      const brightnessValue = Math.floor(255 * brightness);
      const tintColor = (brightnessValue << 16) | (brightnessValue << 8) | brightnessValue;

      gsap.to(sprite, {
        tint: tintColor,
        duration: 0.5, // Adjust duration for smoothness
        onUpdate: () => {
          console.log('Tweening brightness:', brightness, 'Tint color:', tintColor);
        },
      });

      // Apply contrast using ColorMatrixFilter
      const filter = new ColorMatrixFilter();
      filter.reset();
      filter.contrast(contrast, false);
      sprite.filters = [filter];
    };

    if (selectedAsset.type === 'image') {
      const image = new Image();
      image.src = selectedAsset.url;

      image
        .decode()
        .then(() => {
          const texture = PIXI.Texture.from(image);
          const sprite = new PIXI.Sprite(texture);
          sprite.width = app.screen.width;
          sprite.height = app.screen.height;

          const brightness = typeof selectedAsset.filters.brightness === 'number'
            ? Math.max(0, Math.min(selectedAsset.filters.brightness, 1))
            : 1;

          applyBrightnessAndContrast(sprite, brightness, selectedAsset.filters.contrast);
          makeInteractive(sprite);

          app.stage.addChild(sprite);
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

        const brightness = typeof selectedAsset.filters.brightness === 'number'
          ? Math.max(0, Math.min(selectedAsset.filters.brightness, 1))
          : 1;

        applyBrightnessAndContrast(sprite, brightness, selectedAsset.filters.contrast);
        makeInteractive(sprite);

        app.stage.addChild(sprite);
      });

      video.addEventListener('error', (error) => {
        console.error('Error loading video:', error);
      });
    }
  }, [selectedAsset]); // Only re-run when selectedAsset changes

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
