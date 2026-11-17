import * as PIXI from 'pixi.js';
import { LOOK_DEFINITIONS } from '@/lib/effects/looks';
import { applyEffects, clearEffectCache } from '@/lib/renderer/effects';
import { getPreviewHandle } from '@/lib/renderer/previewHandle';

/** Width of a look thumbnail in pixels. Height follows the layer's shape. */
const THUMBNAIL_WIDTH = 144;

/** Looks rendered between yields to the browser, so the UI stays responsive. */
const BATCH_SIZE = 5;

export interface LookThumbnails {
  /** The layer's picture with no look, as a data URL. */
  original: string;
  /** Look id -> data URL of the picture with that look at full intensity. */
  byLookId: Record<string, string>;
}

/** Hands control back to the browser between batches. */
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Renders the layer's current picture once per look, using the live
 * preview's renderer, so each thumbnail shows exactly what the look does.
 *
 * @param isCurrent - Checked between batches; return false to abandon the run.
 * @returns The thumbnails, or null when the preview is not ready, an export
 * is running, or the run was abandoned.
 */
export const renderLookThumbnails = async (
  layerId: string,
  isCurrent: () => boolean,
): Promise<LookThumbnails | null> => {
  const handle = getPreviewHandle();
  const source = handle?.renderer.captureLayerSource(layerId, THUMBNAIL_WIDTH);

  if (!handle || !source) {
    return null;
  }

  const { app } = handle;
  const frame = new PIXI.Rectangle(0, 0, source.width, source.height);
  const texture = PIXI.Texture.from(source);
  const sprite = new PIXI.Sprite(texture);
  // Filters on a child are always honoured when its parent is drawn to a texture.
  const holder = new PIXI.Container();
  holder.addChild(sprite);

  const byLookId: Record<string, string> = {};

  try {
    for (let index = 0; index < LOOK_DEFINITIONS.length; index += 1) {
      if (index > 0 && index % BATCH_SIZE === 0) {
        await pause();
      }

      // The preview may have been torn down or handed to an export meanwhile.
      if (!isCurrent() || getPreviewHandle() !== handle) {
        return null;
      }

      const look = LOOK_DEFINITIONS[index];

      applyEffects(sprite, { id: look.id, intensity: 1 }, undefined, {
        timeMs: 0,
        geometry: { x: 0, y: 0, width: source.width, height: source.height },
      });

      const rendered = app.renderer.extract.canvas({ target: holder, frame, resolution: 1 });

      byLookId[look.id] = (rendered as HTMLCanvasElement).toDataURL('image/jpeg', 0.72);
    }

    return { original: source.toDataURL('image/jpeg', 0.72), byLookId };
  } catch (error) {
    console.error('[looks] Could not render look thumbnails.', error);

    return null;
  } finally {
    clearEffectCache(sprite);
    holder.destroy({ children: true });
    texture.destroy(true);
  }
};
