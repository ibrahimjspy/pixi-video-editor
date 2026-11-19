import * as PIXI from 'pixi.js';
import { AdjustmentLayer, Asset, EffectInstance, Layer, LayerFrame, LayerType, Scene } from '@/types/editor';
import { loadImageSprite } from '@/lib/renderer/imageProcessor';
import { createTextDisplay, updateTextDisplay } from '@/lib/renderer/textProcessor';
import {
  loadVideoSprite,
  releaseVideoElement,
  VideoDriver,
} from '@/lib/renderer/videoProcessor';
import { applyEffects, clearEffectCache, hasTimedEffects } from '@/lib/renderer/effects';
import { InteractionController, LayerDisplay } from '@/lib/renderer/interactivity';
import {
  getLayerSpan,
  getLayerVolume,
  getVideoSourceTimeMs,
  isSpanActiveAt,
  LayerSpan,
} from '@/lib/editor/timeline';

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
  driver: VideoDriver | null;
  /** Set when the browser refused to play this element with sound. */
  forcedMute: boolean;
}

/** An image/video layer whose asset has not finished loading yet. */
interface PendingLoad {
  assetUrl: string;
  cancel: () => void;
  /** Settles after the load succeeded (and the layer was added) or failed. */
  done: Promise<void>;
}

/** A video is decoded this long before its clip starts, so playback is gapless. */
const VIDEO_PRELOAD_MS = 2500;

/** A video stays decoded this long after its clip ends, for cheap scrubbing back. */
const VIDEO_KEEP_MS = 1500;

/** How far a playing video may drift from the playhead before it is re-seeked. */
const VIDEO_DRIFT_S = 0.25;

/** Canvas colour behind every layer. Exports clear to the same colour. */
export const STAGE_BACKGROUND_COLOR = 0x0e1318;

/** Stable empty stack, so an inactive adjustment layer compares equal frame to frame. */
const NO_EFFECTS: readonly EffectInstance[] = [];

/**
 * Applies a layer's state to its display object. Used for both creation and
 * updates so every property (including rotation) is handled in one place.
 *
 * `frame` defaults to the layer itself; a drag passes its in-flight frame.
 * `active` is whether the playhead is inside the layer's time span, and
 * `timeMs` is the playhead position, which moving effects read.
 */
export const applyLayerState = (
  display: LayerDisplay,
  layer: Layer,
  frame: LayerFrame = layer,
  active: boolean = true,
  timeMs: number = 0,
) => {
  display.label = layer.id;
  display.position.set(frame.x, frame.y);
  display.rotation = frame.rotation;
  display.alpha = layer.opacity;
  display.visible = layer.visible && active;
  display.zIndex = layer.zIndex;

  if (layer.type === 'text') {
    if (display instanceof PIXI.Text) {
      updateTextDisplay(display, layer, frame.width);
    }
  } else {
    display.width = frame.width;
    display.height = frame.height;
  }

  applyEffects(display, layer.look, layer.effects, { timeMs });
};

/**
 * Keeps the Pixi stage in sync with the editor's layers and the playhead.
 *
 * Display objects are tracked per layer id rather than looked up on the
 * stage, and asset loads are tracked separately so a layer that is re-rendered,
 * changed or deleted while its asset decodes never ends up duplicated or
 * orphaned.
 *
 * Time: `setTime` shows only the layers whose span contains the playhead, and
 * drives each video element (play, pause, seek, volume). Video elements are
 * created only shortly before they are needed, so a project cut into many
 * pieces of one large file never holds many decoders at once.
 *
 * Adjustment layers have no display object. Each one owns a group container
 * that holds everything beneath it, and the layer's effects are applied to
 * that group, so they colour the combined picture rather than single layers.
 */
export class RendererManager {
  private readonly app: PIXI.Application;
  private readonly interaction: InteractionController;
  private readonly records = new Map<string, DisplayRecord>();
  private readonly pending = new Map<string, PendingLoad>();
  /** Layer id -> asset URL that failed, so a broken asset is not retried every render. */
  private readonly failed = new Map<string, string>();
  /** Adjustment layer id -> the container holding everything beneath it. */
  private readonly groups = new Map<string, PIXI.Container>();
  /** Solid canvas colour, so adjustment layers also affect empty areas. */
  private readonly backdrop = new PIXI.Graphics();
  private layersById = new Map<string, Layer>();
  private assets = new Map<string, Asset>();
  private sceneDurationMs = 0;
  private contentEndMs = 0;
  private request: RenderRequest | null = null;
  private onLayerSelect: RenderRequest['onLayerSelect'] = () => {};
  private selectedLayerId: string | null = null;
  private timeMs = 0;
  private playing = false;
  private exporting = false;
  private destroyed = false;

  constructor(app: PIXI.Application) {
    this.app = app;
    this.backdrop.label = 'backdrop';
    this.backdrop.zIndex = -1;
    this.backdrop.eventMode = 'none';
    app.stage.addChild(this.backdrop);
    this.interaction = new InteractionController(app, {
      getLayer: (layerId) => this.layersById.get(layerId),
      getDisplay: (layerId) => this.records.get(layerId)?.display,
      applyFrame: (layerId, frame) => {
        const record = this.records.get(layerId);
        const layer = this.layersById.get(layerId);

        if (record && layer) {
          applyLayerState(record.display, layer, frame, this.isActive(layer), this.displayTime());
        }
      },
      onSelect: (layerId) => this.onLayerSelect(layerId),
    });
  }

  renderScene(request: RenderRequest) {
    if (this.destroyed) {
      return;
    }

    this.request = request;
    this.onLayerSelect = request.onLayerSelect;
    this.selectedLayerId = request.selectedLayerId;
    this.assets = request.assets;
    this.sceneDurationMs = request.scene.durationMs;
    this.layersById = new Map(request.layers.map((layer) => [layer.id, layer] as const));
    this.contentEndMs = request.layers.reduce(
      (latest, layer) => Math.max(latest, this.spanOf(layer).endMs),
      0,
    );

    const { screen } = this.app;
    if (
      screen.width !== request.scene.canvasWidth ||
      screen.height !== request.scene.canvasHeight
    ) {
      this.app.renderer.resize(request.scene.canvasWidth, request.scene.canvasHeight);
    }

    this.backdrop
      .clear()
      .rect(0, 0, request.scene.canvasWidth, request.scene.canvasHeight)
      .fill({ color: STAGE_BACKGROUND_COLOR });

    this.reconcile();
  }

  /**
   * Moves the playhead. Cheap enough to call every frame: it only toggles
   * visibility and drives video elements, and falls back to a full
   * reconcile when a video needs to be loaded or released.
   */
  setTime(timeMs: number, playing: boolean) {
    if (this.destroyed) {
      return;
    }

    this.timeMs = timeMs;
    this.playing = playing;

    if (this.exporting || !this.request) {
      return;
    }

    if (this.needsReconcile()) {
      this.reconcile();
      return;
    }

    let visibilityChanged = false;

    for (const [layerId, record] of this.records) {
      const layer = this.layersById.get(layerId);

      if (!layer) {
        continue;
      }

      const visible = layer.visible && this.isActive(layer);

      if (record.display.visible !== visible) {
        record.display.visible = visible;
        visibilityChanged = true;
      }

      // Effects that move (grain, glitch, light rays...) follow the playhead.
      if (visible && hasTimedEffects(record.display)) {
        applyEffects(record.display, layer.look, layer.effects, { timeMs: this.displayTime() });
      }

      this.driveVideo(record, layer);
    }

    this.syncGroupEffects();

    if (visibilityChanged) {
      this.interaction.refresh();
    }
  }

  /**
   * Whether a video that should be on screen right now is not ready to show
   * frames: still loading, mid-seek, or waiting for data. The playback clock
   * holds while this is true, the way a player shows "buffering", so a heavy
   * file makes playback wait instead of chasing a clock it cannot catch.
   */
  isBuffering(): boolean {
    if (this.destroyed || this.exporting) {
      return false;
    }

    for (const layer of this.layersById.values()) {
      if (layer.type !== 'video' || !layer.visible || !this.isActive(layer)) {
        continue;
      }

      if (this.pending.has(layer.id)) {
        return true;
      }

      const video = this.records.get(layer.id)?.video;

      if (video && !video.ended && (video.seeking || video.readyState < video.HAVE_FUTURE_DATA)) {
        return true;
      }
    }

    return false;
  }

  /** Forwards the canvas element's CSS scale so selection UI stays legible. */
  setViewScale(scale: number) {
    if (!this.destroyed) {
      this.interaction.setViewScale(scale);
    }
  }

  /**
   * Takes the stage over for a frame-exact render: playback stops, the
   * selection overlay is hidden, and `renderFrameAt` becomes the only thing
   * that moves time.
   */
  beginExport() {
    this.exporting = true;
    this.playing = false;
    this.interaction.setSuspended(true);

    for (const record of this.records.values()) {
      record.video?.pause();
    }
  }

  /** Hands the stage back to normal playback at the given time. */
  endExport(timeMs: number) {
    this.exporting = false;
    this.timeMs = timeMs;
    this.interaction.setSuspended(false);
    this.reconcile();
  }

  /**
   * Puts the stage in the exact state of one instant: loads the videos that
   * are needed, seeks each visible one to the right source frame, and waits
   * until the frames are decoded. Call `beginExport` first.
   */
  async renderFrameAt(timeMs: number): Promise<void> {
    this.timeMs = timeMs;
    this.reconcile();

    await Promise.all([...this.pending.values()].map((load) => load.done));

    if (this.destroyed) {
      return;
    }

    this.reconcile();

    const seeks: Promise<void>[] = [];

    for (const [layerId, record] of this.records) {
      const layer = this.layersById.get(layerId);

      if (layer?.type === 'video' && record.driver && this.isActive(layer)) {
        const span = this.spanOf(layer);
        seeks.push(record.driver.seekExact(getVideoSourceTimeMs(layer, span, timeMs) / 1000));
      }
    }

    await Promise.all(seeks);

    for (const [layerId, record] of this.records) {
      const layer = this.layersById.get(layerId);

      if (layer?.type === 'video' && record.display instanceof PIXI.Sprite && this.isActive(layer)) {
        record.display.texture.source.update();
      }
    }
  }

  /**
   * Draws a small copy of what a layer shows right now, without its look or
   * effects, for previewing looks. Image and video layers give their source
   * frame; other layers give the whole canvas (for an adjustment layer,
   * without that layer's own treatment).
   *
   * @returns A canvas `maxWidth` wide, or null when nothing can be drawn yet.
   */
  captureLayerSource(layerId: string, maxWidth: number): HTMLCanvasElement | null {
    const layer = this.layersById.get(layerId);

    if (this.destroyed || this.exporting || !layer || !this.request) {
      return null;
    }

    const record = this.records.get(layerId);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      return null;
    }

    if (record && record.display instanceof PIXI.Sprite) {
      const source = record.video ?? (record.display.texture.source.resource as CanvasImageSource);
      const aspect = layer.width > 0 && layer.height > 0 ? layer.height / layer.width : 9 / 16;

      canvas.width = maxWidth;
      canvas.height = Math.max(1, Math.round(maxWidth * aspect));

      try {
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
      } catch {
        return null;
      }

      return canvas;
    }

    const { canvasWidth, canvasHeight } = this.request.scene;
    const group = this.groups.get(layerId);

    canvas.width = maxWidth;
    canvas.height = Math.max(1, Math.round((maxWidth * canvasHeight) / canvasWidth));

    // Take the picture without the selection outline and, for an adjustment
    // layer, without the treatment that is about to be previewed.
    this.interaction.setSuspended(true);

    if (group) {
      applyEffects(group, null, NO_EFFECTS, { timeMs: this.displayTime() });
    }

    try {
      const shot = this.app.renderer.extract.canvas({
        target: this.app.stage,
        frame: new PIXI.Rectangle(0, 0, canvasWidth, canvasHeight),
        resolution: maxWidth / canvasWidth,
        clearColor: STAGE_BACKGROUND_COLOR,
      });

      context.drawImage(shot as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    } catch (error) {
      console.error('[capture] Could not draw the canvas for look previews.', error);
      return null;
    } finally {
      this.interaction.setSuspended(false);
      this.syncGroupEffects();
    }

    return canvas;
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

    for (const group of this.groups.values()) {
      clearEffectCache(group);
      group.destroy();
    }
    this.groups.clear();
    this.backdrop.destroy();

    this.layersById.clear();
  }

  private spanOf(layer: Layer): LayerSpan {
    return getLayerSpan(
      layer,
      layer.type === 'video' ? this.assets.get(layer.assetId)?.durationMs : undefined,
      this.sceneDurationMs,
    );
  }

  /**
   * The time actually shown. The very end of the timeline belongs to no layer
   * (spans are end-exclusive), so the last frame is shown for it.
   */
  private displayTime(): number {
    return Math.min(this.timeMs, Math.max(0, this.contentEndMs - 1));
  }

  private isActive(layer: Layer): boolean {
    return isSpanActiveAt(this.spanOf(layer), this.displayTime());
  }

  /** Whether a video layer should currently own a decoder. */
  private isVideoWanted(layer: Layer): boolean {
    if (layer.type !== 'video') {
      return true;
    }

    const span = this.spanOf(layer);
    const time = this.displayTime();

    return time >= span.startMs - VIDEO_PRELOAD_MS && time < span.endMs + VIDEO_KEEP_MS;
  }

  private assetUrlFor(layer: Layer): string | null {
    return layer.type === 'image' || layer.type === 'video'
      ? this.assets.get(layer.assetId)?.url ?? null
      : null;
  }

  /** True when the set of loaded videos no longer matches what time requires. */
  private needsReconcile(): boolean {
    for (const layer of this.layersById.values()) {
      if (layer.type !== 'video') {
        continue;
      }

      const wanted = this.isVideoWanted(layer);
      const held = this.records.has(layer.id) || this.pending.has(layer.id);

      if (wanted !== held && !(wanted && this.failed.has(layer.id))) {
        return true;
      }
    }

    return false;
  }

  /** Brings records, loads and display state in line with the latest request. */
  private reconcile() {
    if (!this.request || this.destroyed) {
      return;
    }

    const { layers } = this.request;

    // Drop anything whose layer is gone, now points at a different source, or
    // is a video that time no longer needs.
    for (const [layerId, record] of this.records) {
      const layer = this.layersById.get(layerId);

      if (
        !layer ||
        layer.type !== record.kind ||
        this.assetUrlFor(layer) !== record.assetUrl ||
        !this.isVideoWanted(layer)
      ) {
        this.removeRecord(layerId);
      }
    }

    for (const [layerId, load] of this.pending) {
      const layer = this.layersById.get(layerId);

      if (!layer || this.assetUrlFor(layer) !== load.assetUrl || !this.isVideoWanted(layer)) {
        this.pending.delete(layerId);
        load.cancel();
      }
    }

    for (const [layerId, assetUrl] of this.failed) {
      const layer = this.layersById.get(layerId);

      if (!layer || this.assetUrlFor(layer) !== assetUrl) {
        this.failed.delete(layerId);
      }
    }

    for (const layer of layers) {
      const record = this.records.get(layer.id);

      if (record) {
        this.refreshRecord(record, layer, this.interaction.getDragFrame(layer.id) ?? layer);
        continue;
      }

      if (layer.type === 'adjustment') {
        continue;
      }

      if (layer.type === 'text') {
        this.addRecord(layer, {
          kind: 'text',
          display: createTextDisplay(layer),
          assetUrl: null,
          video: null,
          driver: null,
          forcedMute: false,
        });
        continue;
      }

      const assetUrl = this.assetUrlFor(layer);

      if (
        assetUrl &&
        this.isVideoWanted(layer) &&
        !this.pending.has(layer.id) &&
        !this.failed.has(layer.id)
      ) {
        this.startLoad(layer.id, layer.type, assetUrl);
      }
    }

    this.arrangeStage();
    this.interaction.sync(this.selectedLayerId);
  }

  /** Adjustment layers of the current request, bottom-most first. */
  private adjustmentLayers(): AdjustmentLayer[] {
    return [...this.layersById.values()]
      .filter((layer): layer is AdjustmentLayer => layer.type === 'adjustment')
      .sort((a, b) => a.zIndex - b.zIndex);
  }

  /**
   * Puts every display object under the right parent: the group of the
   * nearest adjustment layer above it, or the stage when there is none.
   * Groups nest the same way, so a higher adjustment layer also affects the
   * result of a lower one. Draw order inside each parent follows `zIndex`.
   */
  private arrangeStage() {
    const adjustments = this.adjustmentLayers();
    const stage = this.app.stage;

    for (const layer of adjustments) {
      if (!this.groups.has(layer.id)) {
        const group = new PIXI.Container();
        group.label = `adjustment:${layer.id}`;
        group.sortableChildren = true;
        this.groups.set(layer.id, group);
      }
    }

    const parentFor = (zIndex: number): PIXI.Container => {
      const above = adjustments.find((layer) => layer.zIndex > zIndex);

      return above ? this.groups.get(above.id) ?? stage : stage;
    };
    const place = (node: PIXI.Container, zIndex: number) => {
      const parent = parentFor(zIndex);

      if (node.parent !== parent) {
        parent.addChild(node);
      }
    };

    place(this.backdrop, -1);

    for (const [layerId, record] of this.records) {
      const layer = this.layersById.get(layerId);

      if (layer) {
        place(record.display, layer.zIndex);
      }
    }

    for (const layer of adjustments) {
      const group = this.groups.get(layer.id);

      if (group) {
        group.zIndex = layer.zIndex;
        place(group, layer.zIndex);
      }
    }

    // Groups whose adjustment layer is gone are empty by now.
    for (const [layerId, group] of this.groups) {
      if (this.layersById.get(layerId)?.type !== 'adjustment') {
        this.groups.delete(layerId);
        clearEffectCache(group);
        group.removeFromParent();
        group.destroy();
      }
    }

    this.syncGroupEffects();
  }

  /** Applies each adjustment layer's look and effects to its group. */
  private syncGroupEffects() {
    if (this.groups.size === 0 || !this.request) {
      return;
    }

    const { canvasWidth, canvasHeight } = this.request.scene;
    const geometry = { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
    const timeMs = this.displayTime();

    for (const [layerId, group] of this.groups) {
      const layer = this.layersById.get(layerId);
      const on = Boolean(layer && layer.visible && this.isActive(layer));

      // The whole canvas is filtered, not just the area the layers cover.
      if (
        !group.filterArea ||
        group.filterArea.width !== canvasWidth ||
        group.filterArea.height !== canvasHeight
      ) {
        group.filterArea = new PIXI.Rectangle(0, 0, canvasWidth, canvasHeight);
      }

      applyEffects(group, on ? layer?.look : null, on ? layer?.effects : NO_EFFECTS, {
        timeMs,
        geometry,
      });
    }
  }

  private refreshRecord(record: DisplayRecord, layer: Layer, frame: LayerFrame) {
    applyLayerState(record.display, layer, frame, this.isActive(layer), this.displayTime());
    this.driveVideo(record, layer);
  }

  /**
   * Makes a video element match the playhead: playing in step while its clip
   * is on screen, parked on the right frame otherwise, with audio following
   * the layer's mute, visibility and volume.
   */
  private driveVideo(record: DisplayRecord, layer: Layer) {
    const { driver } = record;

    if (!driver || layer.type !== 'video' || this.exporting) {
      return;
    }

    const video = driver.video;
    const span = this.spanOf(layer);
    const time = this.displayTime();
    const active = isSpanActiveAt(span, time);
    // Each new play is a fresh chance to play with sound: the refusal that
    // set `forcedMute` only holds until the user has interacted with the page.
    if (active && this.playing && video.paused) {
      record.forcedMute = false;
    }

    const audible = active && layer.visible && !layer.muted && !record.forcedMute;
    const volume = getLayerVolume(layer);

    if (video.muted !== !audible) {
      video.muted = !audible;
    }

    if (video.volume !== volume) {
      video.volume = volume;
    }

    const sourceSeconds = getVideoSourceTimeMs(layer, span, time) / 1000;

    if (active && this.playing) {
      if (video.paused) {
        if (Math.abs(video.currentTime - sourceSeconds) > 0.1) {
          driver.seek(sourceSeconds);
        }

        this.startPlayback(record);
      } else if (!driver.isBusy && Math.abs(video.currentTime - sourceSeconds) > VIDEO_DRIFT_S) {
        driver.seek(sourceSeconds);
      }

      return;
    }

    if (!video.paused) {
      video.pause();
    }

    // Parked or scrubbing. A clip the playhead has already left needs no frame.
    if (time < span.endMs) {
      driver.seek(sourceSeconds);
    }
  }

  private startPlayback(record: DisplayRecord) {
    const video = record.video;

    if (!video) {
      return;
    }

    video.play().catch((error: unknown) => {
      // Browsers refuse sound before the first click. Picture still plays.
      if (error instanceof DOMException && error.name === 'NotAllowedError' && !record.forcedMute) {
        record.forcedMute = true;
        video.muted = true;
        video.play().catch(() => {});
      }
    });
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

    const entry: PendingLoad = { assetUrl, cancel, done: Promise.resolve() };
    this.pending.set(layerId, entry);

    // The load is stale if it was cancelled, superseded or the manager died.
    const isCurrent = () => !this.destroyed && this.pending.get(layerId) === entry;

    entry.done = ready
      .then((sprite) => {
        const record: DisplayRecord = {
          kind,
          display: sprite,
          assetUrl,
          video,
          driver: video ? new VideoDriver(video) : null,
          forcedMute: false,
        };
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
    this.refreshRecord(record, layer, layer);
    this.interaction.attach(record.display, layer.id);
    this.records.set(layer.id, record);
    this.app.stage.addChild(record.display);
    this.arrangeStage();
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
    const { display, video, driver } = record;

    display.removeFromParent();
    clearEffectCache(display);
    driver?.dispose();

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
