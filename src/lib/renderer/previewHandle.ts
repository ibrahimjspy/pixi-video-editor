import type * as PIXI from 'pixi.js';
import type { RendererManager } from '@/lib/renderer/RendererManager';

/**
 * The live preview's Pixi application and renderer, shared with code that
 * lives outside the preview component (the exporter). The preview component
 * owns the lifecycle and sets this to null when it unmounts.
 */
export interface PreviewHandle {
  app: PIXI.Application;
  renderer: RendererManager;
}

let current: PreviewHandle | null = null;

export const setPreviewHandle = (handle: PreviewHandle | null) => {
  current = handle;
};

export const getPreviewHandle = (): PreviewHandle | null => current;
