import * as PIXI from 'pixi.js';
import { MIN_LAYER_SIZE } from '@/lib/editor/defaults';
import { useEditorStore } from '@/store/editorStore';
import { Layer, LayerFrame } from '@/types/editor';

/** Display objects that can represent a layer on the stage. */
export type LayerDisplay = PIXI.Sprite | PIXI.Text;

/**
 * What the interaction controller needs from the renderer. Keeping this narrow
 * lets the controller stay unaware of loading, filters and asset handling.
 */
export interface InteractionHost {
  /** Latest store state for a layer, or undefined once it has been removed. */
  getLayer: (layerId: string) => Layer | undefined;
  /** The layer's display object, or undefined while its asset is loading. */
  getDisplay: (layerId: string) => LayerDisplay | undefined;
  /** Writes a frame straight onto the display object (no store round trip). */
  applyFrame: (layerId: string, frame: LayerFrame) => void;
  /** Requests a selection change; null clears the selection. */
  onSelect: (layerId: string | null) => void;
}

/** A resize handle, identified by which side of each axis it sits on. */
interface Corner {
  sx: -1 | 1;
  sy: -1 | 1;
  cursor: string;
}

type ResizeMode = 'free' | 'locked' | 'width';

interface DragState {
  layerId: string;
  pointerId: number;
  /** null means the body is being moved. */
  corner: Corner | null;
  pointerStart: PIXI.Point;
  start: LayerFrame;
  current: LayerFrame;
  isText: boolean;
  /** True once a transient frame has been pushed to the store. */
  dirty: boolean;
}

const CORNERS: Corner[] = [
  { sx: -1, sy: -1, cursor: 'nwse-resize' },
  { sx: 1, sy: -1, cursor: 'nesw-resize' },
  { sx: -1, sy: 1, cursor: 'nesw-resize' },
  { sx: 1, sy: 1, cursor: 'nwse-resize' },
];

const ACCENT = 0x76e0d2;
const HANDLE_SIZE = 10;
const HANDLE_HIT_SIZE = 20;
const MIN_SIZE = MIN_LAYER_SIZE;

const toFrame = (source: LayerFrame): LayerFrame => ({
  x: source.x,
  y: source.y,
  width: source.width,
  height: source.height,
  rotation: source.rotation,
});

const framesEqual = (a: LayerFrame, b: LayerFrame) =>
  a.x === b.x &&
  a.y === b.y &&
  a.width === b.width &&
  a.height === b.height &&
  a.rotation === b.rotation;

/**
 * Computes the frame produced by dragging one corner by a stage-space delta.
 * The opposite corner stays pinned, including for rotated layers (layers
 * rotate around their top-left, so the origin has to be shifted to compensate).
 */
const resizeFrame = (
  start: LayerFrame,
  deltaX: number,
  deltaY: number,
  corner: Corner,
  mode: ResizeMode,
): LayerFrame => {
  const cos = Math.cos(start.rotation);
  const sin = Math.sin(start.rotation);
  const localX = deltaX * cos + deltaY * sin;
  const localY = -deltaX * sin + deltaY * cos;

  let width = start.width + corner.sx * localX;
  let height = mode === 'width' ? start.height : start.height + corner.sy * localY;

  if (mode === 'locked' && start.width > 0 && start.height > 0) {
    const scale = Math.max(
      width / start.width,
      height / start.height,
      MIN_SIZE / Math.min(start.width, start.height),
    );
    width = start.width * scale;
    height = start.height * scale;
  } else {
    width = Math.max(MIN_SIZE, width);
    height = mode === 'width' ? start.height : Math.max(MIN_SIZE, height);
  }

  const offsetX = corner.sx < 0 ? start.width - width : 0;
  const offsetY = corner.sy < 0 ? start.height - height : 0;

  return {
    x: start.x + offsetX * cos - offsetY * sin,
    y: start.y + offsetX * sin + offsetY * cos,
    width,
    height,
    rotation: start.rotation,
  };
};

/**
 * Owns canvas selection and direct manipulation.
 *
 * The selection outline and resize handles live in a single overlay container
 * on the stage, above every layer and in canvas coordinates, so they never
 * inherit a layer's scale or filters. Dragging a layer body always moves it;
 * resizing only happens through the corner handles. Pointer move/up are
 * tracked on the window so a fast drag cannot outrun the display object.
 */
export class InteractionController {
  private readonly app: PIXI.Application;
  private readonly host: InteractionHost;
  private readonly overlay = new PIXI.Container();
  private readonly outline = new PIXI.Graphics();
  private readonly handles: PIXI.Graphics[] = [];
  private selectedLayerId: string | null = null;
  private drag: DragState | null = null;
  private viewScale = 1;
  private destroyed = false;

  constructor(app: PIXI.Application, host: InteractionHost) {
    this.app = app;
    this.host = host;

    this.overlay.label = 'selectionOverlay';
    this.overlay.zIndex = Number.MAX_SAFE_INTEGER;
    this.overlay.visible = false;

    // The outline must not swallow clicks meant for the layer underneath.
    this.outline.eventMode = 'none';
    this.overlay.addChild(this.outline);

    for (const corner of CORNERS) {
      const handle = new PIXI.Graphics();
      handle
        .rect(-HANDLE_SIZE / 2, -HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
        .fill({ color: 0x0e1318 })
        .stroke({ color: ACCENT, width: 2 });
      handle.hitArea = new PIXI.Rectangle(
        -HANDLE_HIT_SIZE / 2,
        -HANDLE_HIT_SIZE / 2,
        HANDLE_HIT_SIZE,
        HANDLE_HIT_SIZE,
      );
      handle.eventMode = 'static';
      handle.cursor = corner.cursor;
      handle.on('pointerdown', (event) => this.onHandlePointerDown(event, corner));
      this.handles.push(handle);
      this.overlay.addChild(handle);
    }

    const stage = app.stage;
    stage.sortableChildren = true;
    stage.eventMode = 'static';
    // app.screen is resized in place by the renderer, so this stays in sync.
    stage.hitArea = app.screen;
    stage.on('pointerdown', this.onStagePointerDown);
    stage.addChild(this.overlay);
  }

  /** Makes a layer's display object selectable and draggable. */
  attach(display: LayerDisplay, layerId: string) {
    display.eventMode = 'static';
    display.cursor = 'move';
    display.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      this.host.onSelect(layerId);
      this.selectedLayerId = layerId;
      this.beginDrag(event, layerId, null);
      this.refresh();
    });
  }

  /** Syncs the overlay with the store's selection after a render. */
  sync(selectedLayerId: string | null) {
    this.selectedLayerId = selectedLayerId;
    this.refresh();
  }

  /**
   * Tells the overlay how much the canvas element is scaled down by CSS so
   * the outline and handles keep a constant on-screen size.
   */
  setViewScale(scale: number) {
    this.viewScale = scale > 0 ? scale : 1;
    this.refresh();
  }

  /** The in-flight frame for a layer being dragged, if any. */
  getDragFrame(layerId: string): LayerFrame | null {
    return this.drag && this.drag.layerId === layerId ? this.drag.current : null;
  }

  /** Drops any drag on a layer that is about to be removed. */
  release(layerId: string) {
    if (this.drag && this.drag.layerId === layerId) {
      this.endDrag(false);
    }
  }

  /** Redraws the outline and handles around the selected layer. */
  refresh() {
    if (this.destroyed) {
      return;
    }

    const layerId = this.selectedLayerId;
    const layer = layerId ? this.host.getLayer(layerId) : undefined;

    if (!layerId || !layer || !layer.visible) {
      this.overlay.visible = false;
      return;
    }

    const frame = this.getDragFrame(layerId) ?? layer;
    const display = this.host.getDisplay(layerId);
    // Text height is whatever the wrapped glyphs need, not the stored height.
    const height = layer.type === 'text' && display ? display.height : frame.height;
    const unit = 1 / this.viewScale;

    this.overlay.visible = true;
    this.overlay.position.set(frame.x, frame.y);
    this.overlay.rotation = frame.rotation;

    this.outline
      .clear()
      .rect(0, 0, frame.width, height)
      .fill({ color: ACCENT, alpha: 0.05 })
      .stroke({ color: ACCENT, width: 2 * unit, alpha: 0.9 });

    CORNERS.forEach((corner, index) => {
      const handle = this.handles[index];
      handle.position.set(
        corner.sx < 0 ? 0 : frame.width,
        corner.sy < 0 ? 0 : height,
      );
      handle.scale.set(unit);
    });
  }

  /** Removes the overlay and every listener this controller registered. */
  destroy() {
    if (this.destroyed) {
      return;
    }

    this.endDrag(false);
    this.destroyed = true;

    const stage = this.app.stage;
    if (stage) {
      stage.off('pointerdown', this.onStagePointerDown);
      stage.removeChild(this.overlay);
    }

    this.overlay.destroy({ children: true });
  }

  private onStagePointerDown = (event: PIXI.FederatedPointerEvent) => {
    // Only a press that hit nothing but the stage itself clears the selection.
    if (event.target === this.app.stage && event.button === 0) {
      this.host.onSelect(null);
      this.sync(null);
    }
  };

  private onHandlePointerDown(event: PIXI.FederatedPointerEvent, corner: Corner) {
    if (event.button !== 0 || !this.selectedLayerId) {
      return;
    }

    event.stopPropagation();
    this.beginDrag(event, this.selectedLayerId, corner);
  }

  private beginDrag(
    event: PIXI.FederatedPointerEvent,
    layerId: string,
    corner: Corner | null,
  ) {
    const layer = this.host.getLayer(layerId);

    if (!layer || this.drag) {
      return;
    }

    const start = toFrame(layer);

    this.drag = {
      layerId,
      pointerId: event.pointerId,
      corner,
      pointerStart: event.global.clone(),
      start,
      current: start,
      isText: layer.type === 'text',
      dirty: false,
    };

    window.addEventListener('pointermove', this.onWindowPointerMove);
    window.addEventListener('pointerup', this.onWindowPointerUp);
    window.addEventListener('pointercancel', this.onWindowPointerCancel);
  }

  private onWindowPointerMove = (event: PointerEvent) => {
    const drag = this.drag;

    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    // Maps client coordinates to canvas space, accounting for CSS scaling.
    const point = new PIXI.Point();
    this.app.renderer.events.mapPositionToPoint(point, event.clientX, event.clientY);

    const deltaX = point.x - drag.pointerStart.x;
    const deltaY = point.y - drag.pointerStart.y;

    if (drag.corner) {
      // Images and video keep their aspect ratio unless Shift is held; text
      // only changes its wrap width.
      const mode: ResizeMode = drag.isText ? 'width' : event.shiftKey ? 'free' : 'locked';
      drag.current = resizeFrame(drag.start, deltaX, deltaY, drag.corner, mode);
    } else {
      drag.current = {
        ...drag.start,
        x: drag.start.x + deltaX,
        y: drag.start.y + deltaY,
      };
    }

    this.host.applyFrame(drag.layerId, drag.current);
    this.refresh();

    if (drag.dirty || !framesEqual(drag.current, drag.start)) {
      drag.dirty = true;
      useEditorStore.getState().setTransientFrame(drag.layerId, drag.current);
    }
  };

  private onWindowPointerUp = (event: PointerEvent) => {
    if (this.drag && event.pointerId === this.drag.pointerId) {
      this.endDrag(true);
    }
  };

  private onWindowPointerCancel = (event: PointerEvent) => {
    if (this.drag && event.pointerId === this.drag.pointerId) {
      this.endDrag(false);
    }
  };

  /**
   * Finishes the active drag. A committed drag writes one frame to the store;
   * a cancelled one snaps the display object back. A plain click (no change)
   * never touches history.
   */
  private endDrag(commit: boolean) {
    const drag = this.drag;

    if (!drag) {
      return;
    }

    this.drag = null;
    window.removeEventListener('pointermove', this.onWindowPointerMove);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
    window.removeEventListener('pointercancel', this.onWindowPointerCancel);

    const store = useEditorStore.getState();
    const changed = !framesEqual(drag.current, drag.start);

    if (commit && changed) {
      // commitLayerFrame also clears the transient frame.
      store.commitLayerFrame(drag.layerId, drag.current);
    } else {
      if (changed) {
        this.host.applyFrame(drag.layerId, drag.start);
      }
      if (drag.dirty) {
        store.clearTransientFrame(drag.layerId);
      }
    }

    this.refresh();
  }
}
