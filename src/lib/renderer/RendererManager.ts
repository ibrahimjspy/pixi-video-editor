import * as PIXI from 'pixi.js';
import { Asset, Layer, LayerFrame, LayerType, Scene } from '@/types/editor';
import { loadImageSprite } from '@/lib/renderer/imageProcessor';
import { createTextDisplay, updateTextDisplay } from '@/lib/renderer/textProcessor';
import { loadVideoSprite, releaseVideoElement } from '@/lib/renderer/videoProcessor';
import { applyFilters, clearFilterCache } from '@/lib/renderer/filters';
import { InteractionController, LayerDisplay } from '@/lib/renderer/interactivity';

export interface RenderRequest {
  scene: Scene;
  layers: Layer[];
  assets: Map<string, Asset>;
  selectedLayerId: string | null;
  onLayerSelect: (layerId: string | null) => void;
}

/** Everything the renderer owns for one layer that is on the stage. */
interface DisplayRecord {
  kind: LayerType;
  display: LayerDisplay;
  /** Source URL for image/video layers; null for text. */
  assetUrl: string | null;
  /** Backing element for video layers, released when the layer goes away. */
  video: HTMLVideoElement | null;
}

/** An image/video layer whose asset has not finished loading yet. */
interface PendingLoad {
  assetUrl: string;
  cancel: () => void;
}

/**
 * Applies a layer's state to its display object. Used for both creation and
 * updates so every property (including rotation) is handled in one place.
 *
 * `frame` defaults to the layer itself; a drag passes its in-flight frame.
 */
export const applyLayerState = (
  display: LayerDisplay,
  layer: Layer,
  frame: LayerFrame = layer,
) => {
  display.label = layer.id;
  display.position.set(frame.x, frame.y);
  display.rotation = frame.rotation;
  display.alpha = layer.opacity;
  display.visible = layer.visible;
  display.zIndex = layer.zIndex;

  if (layer.type === 'text') {
    if (display instanceof PIXI.Text) {
      updateTextDisplay(display, layer, frame.width);
    }
  } else {
    display.width = frame.width;
    display.height = frame.height;
  }

  applyFilters(display, layer.filters);
};

/**
 * Keeps the Pixi stage in sync with the editor's layers.
 *
 * Display objects are tracked per layer id rather than looked up on the
 * stage, and asset loads are tracked separately so a layer that is re-rendered,
 * changed or deleted while its asset decodes never ends up duplicated or
 * orphaned.
 */
export class RendererManager {
  private readonly app: PIXI.Application;
  private readonly interaction: InteractionController;
  private readonly records = new Map<string, DisplayRecord>();
  private readonly pending = new Map<string, PendingLoad>();
  /** Layer id -> asset URL that failed, so a broken asset is not retried every render. */
  private readonly failed = new Map<string, string>();
  private layersById = new Map<string, Layer>();
  private onLayerSelect: RenderRequest['onLayerSelect'] = () => {};
  private selectedLayerId: string | null = null;
  private destroyed = false;

  constructor(app: PIXI.Application) {
    this.app = app;
    this.interaction = new InteractionController(app, {
      getLayer: (layerId) => this.layersById.get(layerId),
      getDisplay: (layerId) => this.records.get(layerId)?.display,
      applyFrame: (layerId, frame) => {
        const record = this.records.get(layerId);
        const layer = this.layersById.get(layerId);

        if (record && layer) {
          applyLayerState(record.display, layer, frame);
        }
      },
      onSelect: (layerId) => this.onLayerSelect(layerId),
    });
  }

  renderScene({ scene, layers, assets, selectedLayerId, onLayerSelect }: RenderRequest) {
    if (this.destroyed) {
      return;
    }

    this.onLayerSelect = onLayerSelect;
    this.selectedLayerId = selectedLayerId;
    this.layersById = new Map(layers.map((layer) => [layer.id, layer] as const));

    const { screen } = this.app;
    if (screen.width !== scene.canvasWidth || screen.height !== scene.canvasHeight) {
      this.app.renderer.resize(scene.canvasWidth, scene.canvasHeight);
    }

    const assetUrlFor = (layer: Layer) =>
      layer.type === 'text' ? null : assets.get(layer.assetId)?.url ?? null;

    // Drop anything whose layer is gone or now points at a different source.
    for (const [layerId, record] of this.records) {
      const layer = this.layersById.get(layerId);

      if (!layer || layer.type !== record.kind || assetUrlFor(layer) !== record.assetUrl) {
        this.removeRecord(layerId);
      }
    }

    for (const [layerId, load] of this.pending) {
      const layer = this.layersById.get(layerId);

      if (!layer || assetUrlFor(layer) !== load.assetUrl) {
        this.pending.delete(layerId);
        load.cancel();
      }
    }

    for (const [layerId, assetUrl] of this.failed) {
      const layer = this.layersById.get(layerId);

      if (!layer || assetUrlFor(layer) !== assetUrl) {
        this.failed.delete(layerId);
      }
    }

    for (const layer of layers) {
      const record = this.records.get(layer.id);

      if (record) {
        applyLayerState(
          record.display,
          layer,
          this.interaction.getDragFrame(layer.id) ?? layer,
        );
        continue;
      }

      if (layer.type === 'text') {
        this.addRecord(layer, {
          kind: 'text',
          display: createTextDisplay(layer),
          assetUrl: null,
          video: null,
        });
        continue;
      }

      const assetUrl = assetUrlFor(layer);

      if (assetUrl && !this.pending.has(layer.id) && !this.failed.has(layer.id)) {
        this.startLoad(layer.id, layer.type, assetUrl);
      }
    }

    this.interaction.sync(selectedLayerId);
  }

  /** Forwards the canvas element's CSS scale so selection UI stays legible. */
  setViewScale(scale: number) {
    if (!this.destroyed) {
      this.interaction.setViewScale(scale);
    }
  }

  /**
   * Releases every display object, video element, pending load and listener.
   * Call before destroying the Pixi application.
   */
  destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    for (const load of this.pending.values()) {
      load.cancel();
    }
    this.pending.clear();
    this.failed.clear();

    this.interaction.destroy();

    for (const layerId of [...this.records.keys()]) {
      this.removeRecord(layerId);
    }

    this.layersById.clear();
  }

  /** Kicks off an image/video load and registers it as pending for the layer. */
  private startLoad(layerId: string, kind: 'image' | 'video', assetUrl: string) {
    let video: HTMLVideoElement | null = null;
    let ready: Promise<PIXI.Sprite>;
    let cancel = () => {};

    if (kind === 'video') {
      const load = loadVideoSprite(assetUrl);
      video = load.video;
      ready = load.ready;
      cancel = load.cancel;
    } else {
      ready = loadImageSprite(assetUrl);
    }

    const entry: PendingLoad = { assetUrl, cancel };
    this.pending.set(layerId, entry);

    // The load is stale if it was cancelled, superseded or the manager died.
    const isCurrent = () => !this.destroyed && this.pending.get(layerId) === entry;

    ready
      .then((sprite) => {
        const record: DisplayRecord = { kind, display: sprite, assetUrl, video };
        // Read the layer as it is now, not as it was when the load started.
        const layer = this.layersById.get(layerId);

        if (!isCurrent() || !layer) {
          this.disposeRecord(record);
          return;
        }

        this.pending.delete(layerId);
        this.addRecord(layer, record);
        this.interaction.sync(this.selectedLayerId);
      })
      .catch((error) => {
        if (!isCurrent()) {
          return;
        }

        this.pending.delete(layerId);
        this.failed.set(layerId, assetUrl);
        cancel();
        console.error(`Error loading ${kind} asset`, error);
      });
  }

  private addRecord(layer: Layer, record: DisplayRecord) {
    applyLayerState(record.display, layer);
    this.interaction.attach(record.display, layer.id);
    this.records.set(layer.id, record);
    this.app.stage.addChild(record.display);
  }

  private removeRecord(layerId: string) {
    const record = this.records.get(layerId);

    if (!record) {
      return;
    }

    this.interaction.release(layerId);
    this.records.delete(layerId);
    this.disposeRecord(record);
  }

  /** Destroys a display object along with the texture and media behind it. */
  private disposeRecord(record: DisplayRecord) {
    const { display, video } = record;

    display.removeFromParent();
    clearFilterCache(display);

    if (display instanceof PIXI.Sprite) {
      // Each image/video layer owns its texture, so take it down too.
      display.destroy({ texture: true, textureSource: true });
    } else {
      display.destroy();
    }

    if (video) {
      releaseVideoElement(video);
    }
  }
}
