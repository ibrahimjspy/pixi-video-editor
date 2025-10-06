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
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-6 py-3 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
        {/* Aspect Ratio */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-300">Canvas:</label>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
            className="px-3 py-1.5 bg-gray-700 text-white rounded-lg text-sm font-medium border border-gray-600 hover:bg-gray-600 transition-colors cursor-pointer"
          >
            {Object.keys(ASPECT_RATIOS).map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>{elements.length} elements</span>
          <span>{width}×{height}px</span>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div
          ref={canvasRef}
          style={{
            width,
            height,
            background: 'repeating-conic-gradient(#2a2a2a 0% 25%, #1a1a1a 0% 50%) 50% / 20px 20px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        />
      </div>

      {/* Bottom Controls */}
      <div className="px-6 py-3 bg-gray-800 border-t border-gray-700 flex items-center justify-between">
        <div className="text-xs text-gray-400">
          {selectedElement ? (
            <>
              Selected: <span className="text-blue-400 font-semibold">{selectedElement.type}</span>
            </>
          ) : (
            'No element selected'
          )}
        </div>

        {/* Video Controls */}
        {selectedElement?.type === 'video' && (
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlayPause}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {isPlaying ? '⏸️ Pause' : '▶️ Play'}
            </button>
          </div>
        )}

        <div className="text-xs text-gray-500">
          💡 Click elements to select • Drag to move
        </div>
      </div>
    </div>
  );
};

export default VideoPreview;
