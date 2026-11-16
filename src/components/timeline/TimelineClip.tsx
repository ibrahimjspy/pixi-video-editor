'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { usePlaybackStore } from '@/store/playbackStore';
import { getAssetById, getCurrentScene } from '@/lib/editor/defaults';
import { getLayerSpan, getProjectLayerSpan } from '@/lib/editor/timeline';
import { ClipDragMode, computeClipDragPatch } from '@/lib/editor/clipDrag';
import Waveform from '@/components/timeline/Waveform';

interface TimelineClipProps {
  layerId: string;
  pxPerSecond: number;
  isSelected: boolean;
}

/** How close, in screen pixels, an edge must come to snap to a neighbour. */
const SNAP_DISTANCE_PX = 8;

/** Movement below this many pixels is a click, not a drag. */
const DRAG_START_PX = 3;

const GESTURE_LABELS: Record<ClipDragMode, string> = {
  move: 'Move clip',
  left: 'Trim clip start',
  right: 'Trim clip end',
};

/**
 * One layer's bar on the timeline. Drag the body to move it in time, drag
 * either edge to trim it. Each drag is a single undo step, and edges snap to
 * the playhead, the start of the timeline, and other clips' edges.
 */
const TimelineClip = ({ layerId, pxPerSecond, isSelected }: TimelineClipProps) => {
  const layer = useEditorStore((state) => state.project.layers.find((entry) => entry.id === layerId));
  const asset = useEditorStore((state) =>
    layer && layer.type !== 'text' ? getAssetById(state.project, layer.assetId) : undefined,
  );
  const fallbackMs = useEditorStore((state) => getCurrentScene(state.project).durationMs);

  if (!layer) {
    return null;
  }

  const span = getLayerSpan(layer, asset?.durationMs, fallbackMs);
  const left = (span.startMs / 1000) * pxPerSecond;
  const width = Math.max(4, ((span.endMs - span.startMs) / 1000) * pxPerSecond);

  const beginGesture = (event: ReactPointerEvent<HTMLElement>, mode: ClipDragMode) => {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    const store = useEditorStore.getState();
    store.selectLayer(layerId);

    const origin = {
      type: layer.type,
      startMs: span.startMs,
      endMs: span.endMs,
      trimStartMs: layer.type === 'video' ? layer.trimStartMs : 0,
      trimEndMs: layer.type === 'video' ? layer.trimEndMs : null,
      assetDurationMs: asset?.durationMs,
    };
    const { project } = store;
    const snapPoints = [
      0,
      usePlaybackStore.getState().currentMs,
      ...project.layers.flatMap((other) => {
        if (other.id === layerId) {
          return [];
        }

        const otherSpan = getProjectLayerSpan(project, other);

        return [otherSpan.startMs, otherSpan.endMs];
      }),
    ];
    const thresholdMs = (SNAP_DISTANCE_PX / pxPerSecond) * 1000;
    const startX = event.clientX;
    let moved = false;

    const handleMove = (moveEvent: PointerEvent) => {
      if (!moved && Math.abs(moveEvent.clientX - startX) < DRAG_START_PX) {
        return;
      }

      moved = true;

      const deltaMs = ((moveEvent.clientX - startX) / pxPerSecond) * 1000;
      // Holding Alt turns snapping off for fine placement.
      const patch = computeClipDragPatch(
        mode,
        origin,
        deltaMs,
        moveEvent.altKey ? [] : snapPoints,
        thresholdMs,
      );

      useEditorStore.getState().previewLayerPatch(layerId, patch);
    };

    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
      window.removeEventListener('keydown', handleKey, true);

      if (moved) {
        const current = useEditorStore.getState();

        if (commit) {
          current.commitLayerPatch(GESTURE_LABELS[mode]);
        } else {
          current.cancelLayerPatch();
        }
      }
    };

    const handleUp = () => finish(true);
    const handleCancel = () => finish(false);
    const handleKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') {
        keyEvent.stopPropagation();
        finish(false);
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    window.addEventListener('keydown', handleKey, true);
  };

  const className = [
    'signal-clip',
    `signal-clip--${layer.type}`,
    isSelected ? 'is-selected' : '',
    layer.visible ? '' : 'is-hidden',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      style={{ left, width }}
      role="button"
      tabIndex={-1}
      aria-label={`${layer.name} clip`}
      title={`${layer.name} · ${(span.startMs / 1000).toFixed(2)}s to ${(span.endMs / 1000).toFixed(2)}s`}
      onPointerDown={(event) => beginGesture(event, 'move')}
    >
      {layer.type === 'video' && asset && (
        <Waveform
          assetId={asset.id}
          url={asset.url}
          fromMs={layer.trimStartMs}
          toMs={layer.trimStartMs + (span.endMs - span.startMs)}
          width={width}
          height={26}
          muted={layer.muted || !layer.visible}
        />
      )}
      <span className="signal-clip__name">{layer.name}</span>
      <span
        className="signal-clip__edge signal-clip__edge--left"
        onPointerDown={(event) => beginGesture(event, 'left')}
      />
      <span
        className="signal-clip__edge signal-clip__edge--right"
        onPointerDown={(event) => beginGesture(event, 'right')}
      />
    </div>
  );
};

export default TimelineClip;
