'use client';

import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import * as PIXI from 'pixi.js';
import { RendererManager } from '@/lib/renderer/RendererManager';

const ASPECT_RATIOS = {
  '16:9': { width: 800, height: 450 },
  '9:16': { width: 450, height: 800 },
};

type AspectRatio = keyof typeof ASPECT_RATIOS;

const VideoPreview = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PIXI.Application | null>(null);
  const rendererRef = useRef<RendererManager | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');

  const { width, height } = ASPECT_RATIOS[aspectRatio];

  const elements = useEditorStore((state) => state.elements);
  const selectedElementId = useEditorStore((state) => state.selectedElementId);
  const selectedElement = elements.find((el) => el.id === selectedElementId);

  // Setup Pixi
  useEffect(() => {
    if (!canvasRef.current) return;

    const app = new PIXI.Application();
    pixiAppRef.current = app;

    app
      .init({
        width,
        height,
        backgroundColor: 0x000000,
      })
      .then(() => {
        const canvas = app.canvas;
        if (canvasRef.current && canvas) {
          canvasRef.current.innerHTML = '';
          canvasRef.current.appendChild(canvas);
        }

        rendererRef.current = new RendererManager(app);
        rendererRef.current.renderAll(elements, videoRef); // initial render
      });

    return () => {
      app.destroy(true, { children: true });
    };
  }, [width, height]);

  // Re-render all elements when elements array changes
  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.renderAll(elements, videoRef);
  }, [elements]);

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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '2rem',
        height: '100%',
        background: 'linear-gradient(135deg, #e5e7eb, #f3f4f6)',
      }}
    >
      {/* Aspect Ratio Selector */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ marginRight: '0.5rem', fontWeight: 500 }}>
          Aspect Ratio:
        </label>
        <select
          value={aspectRatio}
          onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
          style={{
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            border: '1px solid #ccc',
            backgroundColor: 'black',
            color: 'white',
          }}
        >
          {Object.keys(ASPECT_RATIOS).map((ratio) => (
            <option key={ratio} value={ratio} style={{ color: '#333' }}>
              {ratio}
            </option>
          ))}
        </select>
      </div>

      {/* Canvas Preview */}
      <div
        ref={canvasRef}
        style={{
          width,
          height,
          background:
            'repeating-conic-gradient(#d1d5db 0% 25%, #e5e7eb 0% 50%) 50% / 20px 20px',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}
      />

      {/* Play/Pause button for video */}
      {selectedElement?.type === 'video' && (
        <button
          onClick={togglePlayPause}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#3b82f6',
            color: '#fff',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
      )}
    </div>
  );
};

export default VideoPreview;
