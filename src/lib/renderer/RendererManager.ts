import * as PIXI from 'pixi.js';
import { Asset, Layer, LayerFrame, LayerType, Scene } from '@/types/editor';
import { loadImageSprite } from '@/lib/renderer/imageProcessor';
import { createTextDisplay, updateTextDisplay } from '@/lib/renderer/textProcessor';
import {
  loadVideoSprite,
  releaseVideoElement,
  VideoDriver,
} from '@/lib/renderer/videoProcessor';
import { applyFilters, clearFilterCache } from '@/lib/renderer/filters';
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

/**
 * Applies a layer's state to its display object. Used for both creation and
 * updates so every property (including rotation) is handled in one place.
 *
 * `frame` defaults to the layer itself; a drag passes its in-flight frame.
 * `active` is whether the playhead is inside the layer's time span.
 */
export const applyLayerState = (
  display: LayerDisplay,
  layer: Layer,
  frame: LayerFrame = layer,
  active: boolean = true,
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

  applyFilters(display, layer.filters);
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
 */
export class RendererManager {
  private readonly app: PIXI.Application;
  private readonly interaction: InteractionController;
  private readonly records = new Map<string, DisplayRecord>();
  private readonly pending = new Map<string, PendingLoad>();
  /** Layer id -> asset URL that failed, so a broken asset is not retried every render. */
  private readonly failed = new Map<string, string>();
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
    this.interaction = new InteractionController(app, {
      getLayer: (layerId) => this.layersById.get(layerId),
      getDisplay: (layerId) => this.records.get(layerId)?.display,
      applyFrame: (layerId, frame) => {
        const record = this.records.get(layerId);
        const layer = this.layersById.get(layerId);

        if (record && layer) {
          applyLayerState(record.display, layer, frame, this.isActive(layer));
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

      this.driveVideo(record, layer);
    }

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
    return layer.type === 'text' ? null : this.assets.get(layer.assetId)?.url ?? null;
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

    this.interaction.sync(this.selectedLayerId);
  }

  private refreshRecord(record: DisplayRecord, layer: Layer, frame: LayerFrame) {
    applyLayerState(record.display, layer, frame, this.isActive(layer));
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
    clearFilterCache(display);
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
