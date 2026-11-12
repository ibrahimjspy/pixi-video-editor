'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { RendererManager, RenderRequest } from '@/lib/renderer/RendererManager';
import { useEditorStore } from '@/store/editorStore';
import { getAssetById, getCurrentLayers, getCurrentScene } from '@/lib/editor/defaults';

/**
 * Owns the Pixi application lifecycle and keeps the active project scene in
 * sync with its canvas representation.
 *
 * Pixi initialization is asynchronous. The cancellation guard prevents a
 * completed initialization from attaching a canvas after React has unmounted
 * the component, which is common during development's strict effect checks.
 */
const VideoPreview = () => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const rendererRef = useRef<RendererManager | null>(null);
  const [available, setAvailable] = useState<{ width: number; height: number } | null>(null);

  const project = useEditorStore((state) => state.project);
  const selectLayer = useEditorStore((state) => state.selectLayer);

  const scene = getCurrentScene(project);
  const layers = getCurrentLayers(project);
  const selectedLayer = layers.find((layer) => layer.id === project.selection.layerId) ?? null;

  const assets = useMemo(() => {
    return new Map(
      project.assets.map((asset) => [asset.id, asset] as const),
    );
  }, [project.assets]);

  // Scale the canvas element down (never up) so it fits the viewport panel.
  const viewScale = available
    ? Math.min(
        1,
        available.width / scene.canvasWidth,
        available.height / scene.canvasHeight,
      )
    : 1;

  const renderRequestRef = useRef<RenderRequest>({
    scene,
    layers,
    assets,
    selectedLayerId: project.selection.layerId,
    onLayerSelect: selectLayer,
  });
  const viewScaleRef = useRef(viewScale);

  renderRequestRef.current = {
    scene,
    layers,
    assets,
    selectedLayerId: project.selection.layerId,
    onLayerSelect: selectLayer,
  };
  viewScaleRef.current = viewScale;

  /**
   * Renders the latest scene. The renderer resizes the canvas when the scene
   * size changes, and `autoDensity` then writes pixel sizes onto the canvas
   * style, so the fluid sizing is re-asserted afterwards: the wrapper div owns
   * the on-screen size and the canvas simply fills it.
   */
  const syncRenderer = useCallback(() => {
    const renderer = rendererRef.current;
    const app = appRef.current;

    if (!renderer || !app) {
      return;
    }

    renderer.renderScene(renderRequestRef.current);
    renderer.setViewScale(viewScaleRef.current);
    app.canvas.style.width = '100%';
    app.canvas.style.height = '100%';
  }, []);

  // The Pixi application is created once; scene size changes only resize it.
  useEffect(() => {
    const mount = containerRef.current;

    if (!mount) {
      return;
    }

    const app = new PIXI.Application();
    let isCancelled = false;
    let isInitialized = false;
    let renderer: RendererManager | null = null;
    const initialScene = renderRequestRef.current.scene;

    app
      .init({
        width: initialScene.canvasWidth,
        height: initialScene.canvasHeight,
        backgroundColor: 0x0e1318,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })
      .then(() => {
        isInitialized = true;

        if (isCancelled || !containerRef.current) {
          app.destroy(true, true);
          return;
        }

        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(app.canvas);
        renderer = new RendererManager(app);
        appRef.current = app;
        rendererRef.current = renderer;
        syncRenderer();
      })
      .catch((error) => {
        if (!isCancelled) {
          console.error('Pixi preview could not be initialized.', error);
        }
      });

    return () => {
      isCancelled = true;

      if (rendererRef.current === renderer) {
        rendererRef.current = null;
      }
      if (appRef.current === app) {
        appRef.current = null;
      }

      renderer?.destroy();

      if (isInitialized) {
        app.destroy(true, true);
      }
    };
  }, [syncRenderer]);

  useEffect(() => {
    syncRenderer();
  }, [assets, layers, project.selection.layerId, scene, selectLayer, viewScale, syncRenderer]);

  // Track how much room the viewport panel has for the canvas.
  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const measure = () => {
      const style = window.getComputedStyle(viewport);
      const width =
        viewport.clientWidth -
        (parseFloat(style.paddingLeft) || 0) -
        (parseFloat(style.paddingRight) || 0);
      const height =
        viewport.clientHeight -
        (parseFloat(style.paddingTop) || 0) -
        (parseFloat(style.paddingBottom) || 0);

      if (width <= 0 || height <= 0) {
        return;
      }

      setAvailable((previous) =>
        previous && previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);

    return () => observer.disconnect();
  }, []);

  const selectedAsset =
    selectedLayer && 'assetId' in selectedLayer
      ? getAssetById(project, selectedLayer.assetId)
      : null;

  return (
    <section className="signal-stage">
      <div className="signal-stage__toolbar">
        <div>
          <p className="signal-kicker">Stage</p>
          <h2>
            {scene.aspectRatio} canvas · {scene.canvasWidth}×{scene.canvasHeight}
          </h2>
        </div>
        <div className="signal-chip-group">
          <span className="signal-chip signal-chip--neutral">{layers.length} layers</span>
          <span className="signal-chip signal-chip--success">
            {selectedLayer ? selectedLayer.name : 'No selection'}
          </span>
        </div>
      </div>

      <div ref={viewportRef} className="signal-stage__viewport">
        <div className="signal-stage__backdrop" />
        <div
          ref={containerRef}
          className="signal-stage__canvas"
          style={{
            width: scene.canvasWidth * viewScale,
            height: scene.canvasHeight * viewScale,
          }}
        />
      </div>

      <div className="signal-stage__footer">
        <div className="signal-inline-stats">
          <span>Drag to move</span>
          <span>Corner handles resize · Shift frees the aspect ratio</span>
        </div>
        <div className="signal-inline-stats">
          <span>{selectedAsset?.name ?? 'Select a layer for context'}</span>
          <span>{selectedLayer?.animationPreset ?? 'No motion preset'}</span>
        </div>
      </div>
    </section>
  );
};

export default VideoPreview;
