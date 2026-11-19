'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DragEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { usePlaybackStore } from '@/store/playbackStore';
import { getCurrentScene } from '@/lib/editor/defaults';
import { formatSnapshotTime } from '@/lib/editor/formatting';
import { formatTimecode, getTimelineDurationMs } from '@/lib/editor/timeline';
import { getSplittableLayerId, rippleDeleteSelected, splitSelectedAtPlayhead } from '@/lib/editor/timelineActions';
import { Icon, LAYER_TYPE_ICON } from '@/components/icons';
import { useLayerFields, useSelectedLayerId } from '@/components/inspector/hooks';
import TimelineClip from '@/components/timeline/TimelineClip';

/** Marks a drag as a layer reorder, so file drops are never mistaken for one. */
const LAYER_DRAG_TYPE = 'application/x-signal-layer';

const isLayerDrag = (event: DragEvent<HTMLElement>) =>
  Array.from(event.dataTransfer.types).includes(LAYER_DRAG_TYPE);

interface LayerRowProps {
  layerId: string;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  isDragged: boolean;
  /** Where the drop indicator is drawn on this row, if anywhere. */
  dropEdge: 'before' | 'after' | null;
  pxPerSecond: number;
  trackWidth: number;
  onScrub: (event: ReactPointerEvent<HTMLElement>) => void;
  onMove: (direction: 'forward' | 'backward') => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
  onDrop: (event: DragEvent<HTMLLIElement>) => void;
}

/**
 * One layer in the list. It subscribes to its own name, type, and visibility,
 * so editing another field of the layer does not re-render it.
 */
const LayerRow = ({
  layerId,
  isSelected,
  isFirst,
  isLast,
  isDragged,
  dropEdge,
  pxPerSecond,
  trackWidth,
  onScrub,
  onMove,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: LayerRowProps) => {
  const selectLayer = useEditorStore((state) => state.selectLayer);
  const executeCommand = useEditorStore((state) => state.executeCommand);
  const layer = useLayerFields(layerId, (entry) => ({
    name: entry.name,
    type: entry.type,
    visible: entry.visible,
  }));

  if (!layer) {
    return null;
  }

  const className = [
    'signal-layer',
    'signal-tl__row',
    isSelected ? 'is-active' : '',
    isDragged ? 'is-dragged' : '',
    layer.visible ? '' : 'is-hidden',
    dropEdge ? `is-drop-${dropEdge}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={className} onDragOver={onDragOver} onDrop={onDrop}>
      <div
        className="signal-tl__label"
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
      <span className="signal-layer__grip" aria-hidden="true" title="Drag to reorder">
        <Icon name="grip" />
      </span>
      <button
        type="button"
        className="signal-layer__select"
        aria-pressed={isSelected}
        onClick={() => selectLayer(layerId)}
      >
        <Icon name={LAYER_TYPE_ICON[layer.type]} />
        <span className="signal-layer__name">{layer.name}</span>
        <small>{layer.type}</small>
      </button>
      <button
        type="button"
        className="signal-icon-button"
        aria-label={`Move ${layer.name} forward`}
        title="Move forward"
        disabled={isFirst}
        onClick={() => onMove('forward')}
      >
        <Icon name="arrow-up" />
      </button>
      <button
        type="button"
        className="signal-icon-button"
        aria-label={`Move ${layer.name} backward`}
        title="Move backward"
        disabled={isLast}
        onClick={() => onMove('backward')}
      >
        <Icon name="arrow-down" />
      </button>
      <button
        type="button"
        className="signal-icon-button"
        aria-label={`${layer.name} visible`}
        aria-pressed={layer.visible}
        title={layer.visible ? 'Hide layer' : 'Show layer'}
        onClick={() =>
          executeCommand(
            { type: 'mute_or_hide_layer', layerId, visible: !layer.visible },
            'user',
          )
        }
      >
        <Icon name={layer.visible ? 'eye' : 'eye-off'} />
      </button>
      <button
        type="button"
        className="signal-icon-button signal-icon-button--danger"
        aria-label={`Delete ${layer.name}`}
        title="Delete layer"
        onClick={() => executeCommand({ type: 'delete_layer', layerId }, 'user')}
      >
        <Icon name="trash" />
      </button>
      </div>
      <div className="signal-tl__lane" style={{ width: trackWidth }} onPointerDown={onScrub}>
        <TimelineClip layerId={layerId} pxPerSecond={pxPerSecond} isSelected={isSelected} />
      </div>
    </li>
  );
};

/** Restorable project snapshots, newest first. */
const SnapshotList = ({ id }: { id: string }) => {
  const versions = useEditorStore((state) => state.versions);
  const restoreVersion = useEditorStore((state) => state.restoreVersion);

  return (
    <section id={id} className="signal-strip__section signal-strip__section--snapshots">
      <div className="signal-section-title">
        <span>Snapshots</span>
        <span>{versions.length}</span>
      </div>
      <div className="signal-version-list">
        {versions.map((version) => (
          <button
            key={version.id}
            type="button"
            className="signal-version-item"
            title="Restore the project to this snapshot (undoable)"
            onClick={() => restoreVersion(version.id)}
          >
            <strong>{version.label}</strong>
            <small suppressHydrationWarning>
              {version.source === 'ai' ? 'AI · ' : ''}
              {formatSnapshotTime(version.createdAt)} UTC
            </small>
          </button>
        ))}
      </div>
    </section>
  );
};

/** Zoom limits, in pixels per second of timeline. */
const MIN_PX_PER_SECOND = 8;
const MAX_PX_PER_SECOND = 480;
const DEFAULT_PX_PER_SECOND = 80;

/** Width in pixels of the sticky layer-label column, measured from the page. */
const getLabelWidth = (scroller: HTMLElement): number =>
  scroller.querySelector<HTMLElement>('.signal-tl__corner')?.getBoundingClientRect().width ?? 0;

/** Empty space after the last clip, in pixels, so the end stays reachable. */
const TRACK_TAIL_PX = 120;

/** Spacing candidates for ruler labels, in seconds. */
const TICK_STEPS_S = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

const formatTick = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  const text = Number.isInteger(rest) ? String(rest).padStart(2, '0') : rest.toFixed(1).padStart(4, '0');

  return `${minutes}:${text}`;
};

/** The current time and total length, updated as the playhead moves. */
const Timecode = ({ durationMs }: { durationMs: number }) => {
  const currentMs = usePlaybackStore((state) => state.currentMs);

  return (
    <span className="signal-tl__timecode" aria-label="Playhead position">
      <strong>{formatTimecode(currentMs)}</strong>
      <span> / {formatTimecode(durationMs)}</span>
    </span>
  );
};

/** The head of the playhead, drawn inside the ruler. */
const RulerMarker = ({ pxPerSecond }: { pxPerSecond: number }) => {
  const currentMs = usePlaybackStore((state) => state.currentMs);

  return (
    <span
      className="signal-tl__marker"
      style={{ left: (currentMs / 1000) * pxPerSecond }}
      aria-hidden="true"
    />
  );
};

/** The vertical line marking the current time. */
const Playhead = ({ pxPerSecond }: { pxPerSecond: number }) => {
  const currentMs = usePlaybackStore((state) => state.currentMs);

  return (
    <div
      className="signal-tl__playhead"
      style={{ left: `calc(var(--signal-tl-label) + ${(currentMs / 1000) * pxPerSecond}px)` }}
      aria-hidden="true"
    />
  );
};

interface TransportProps {
  durationMs: number;
  pxPerSecond: number;
  onZoom: (pxPerSecond: number) => void;
  onFit: () => void;
  showSnapshots: boolean;
  snapshotsId: string;
  versionCount: number;
  onToggleSnapshots: () => void;
}

/** Play controls, timecode, edit buttons and zoom. */
const Transport = ({
  durationMs,
  pxPerSecond,
  onZoom,
  onFit,
  showSnapshots,
  snapshotsId,
  versionCount,
  onToggleSnapshots,
}: TransportProps) => {
  const isPlaying = usePlaybackStore((state) => state.isPlaying);
  const loop = usePlaybackStore((state) => state.loop);
  const isLocked = usePlaybackStore((state) => state.isLocked);
  const toggle = usePlaybackStore((state) => state.toggle);
  const seek = usePlaybackStore((state) => state.seek);
  const stepFrames = usePlaybackStore((state) => state.stepFrames);
  const setLoop = usePlaybackStore((state) => state.setLoop);
  const selectedLayerId = useSelectedLayerId();
  // The selector reads both stores, but only a change of its boolean result
  // re-renders the bar, so playback does not redraw every button each frame.
  const canSplit = usePlaybackStore(() => getSplittableLayerId() !== null);

  return (
    <div className="signal-tl__bar">
      <div className="signal-tl__group">
        <button
          type="button"
          className="signal-icon-button"
          aria-label="Go to start"
          title="Go to start (Home)"
          disabled={isLocked}
          onClick={() => seek(0, { pause: true })}
        >
          <Icon name="step-back" />
        </button>
        <button
          type="button"
          className="signal-icon-button signal-icon-button--play"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          aria-pressed={isPlaying}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          disabled={isLocked}
          onClick={toggle}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} />
        </button>
        <button
          type="button"
          className="signal-icon-button"
          aria-label="Go to end"
          title="Go to end (End)"
          disabled={isLocked}
          onClick={() => seek(durationMs, { pause: true })}
        >
          <Icon name="step-forward" />
        </button>
        <button
          type="button"
          className="signal-icon-button"
          aria-label="Loop playback"
          aria-pressed={loop}
          title="Loop playback"
          onClick={() => setLoop(!loop)}
        >
          <Icon name="loop" />
        </button>
        <Timecode durationMs={durationMs} />
      </div>

      <div className="signal-tl__group">
        <button
          type="button"
          className="signal-mini-button"
          disabled={isLocked}
          title="Previous frame (,)"
          onClick={() => stepFrames(-1)}
        >
          −1f
        </button>
        <button
          type="button"
          className="signal-mini-button"
          disabled={isLocked}
          title="Next frame (.)"
          onClick={() => stepFrames(1)}
        >
          +1f
        </button>
        <button
          type="button"
          className="signal-mini-button"
          disabled={!canSplit || isLocked}
          title={
            canSplit
              ? 'Cut the selected layer at the playhead (S)'
              : 'Select a layer and place the playhead inside it to split'
          }
          onClick={splitSelectedAtPlayhead}
        >
          <Icon name="split" />
          Split
        </button>
        <button
          type="button"
          className="signal-mini-button"
          disabled={!selectedLayerId || isLocked}
          title="Delete the selected layer and close the gap (Shift+Delete)"
          onClick={rippleDeleteSelected}
        >
          <Icon name="ripple" />
          Ripple
        </button>
      </div>

      <div className="signal-tl__group signal-tl__group--end">
        <button
          type="button"
          className="signal-mini-button"
          aria-expanded={showSnapshots}
          aria-controls={snapshotsId}
          onClick={onToggleSnapshots}
        >
          Snapshots ({versionCount})
        </button>
        <label className="signal-tl__zoom" title="Zoom (Ctrl/Cmd + scroll)">
          <input
            type="range"
            min={MIN_PX_PER_SECOND}
            max={MAX_PX_PER_SECOND}
            step={1}
            value={pxPerSecond}
            aria-label="Timeline zoom"
            onChange={(event) => onZoom(Number(event.target.value))}
          />
        </label>
        <button type="button" className="signal-mini-button" title="Fit the whole timeline" onClick={onFit}>
          Fit
        </button>
      </div>
    </div>
  );
};

/** Time labels and tick marks, spaced so labels never crowd each other. */
const Ruler = ({ durationMs, pxPerSecond }: { durationMs: number; pxPerSecond: number }) => {
  const stepSeconds = TICK_STEPS_S.find((step) => step * pxPerSecond >= 72) ?? 600;
  const ticks: number[] = [];
  const endSeconds = durationMs / 1000 + TRACK_TAIL_PX / pxPerSecond;

  for (let seconds = 0; seconds <= endSeconds; seconds += stepSeconds) {
    ticks.push(Math.round(seconds * 1000) / 1000);
  }

  return (
    <>
      {ticks.map((seconds) => (
        <span
          key={seconds}
          className="signal-tl__tick"
          style={{ left: seconds * pxPerSecond }}
        >
          <small>{formatTick(seconds)}</small>
        </span>
      ))}
    </>
  );
};

/**
 * Bottom strip: a real timeline. Each layer is a row with a clip bar placed
 * and sized by its start and length; the playhead can be dragged or clicked on
 * the ruler, and clips can be moved, trimmed, and split. Layer controls (select,
 * reorder, hide, delete) sit in the left column of each row.
 */
const Timeline = () => {
  const snapshotsId = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [pxPerSecond, setPxPerSecond] = useState(DEFAULT_PX_PER_SECOND);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  /** Insertion slot in display order, 0 (above the first row) to n. */
  const [dropSlot, setDropSlot] = useState<number | null>(null);

  // `layerIds` keeps its identity while a slider previews, so the list does
  // not re-render during a drag.
  const layerIds = useEditorStore((state) => getCurrentScene(state.project).layerIds);
  const durationMs = useEditorStore((state) => getTimelineDurationMs(state.project));
  const selectedLayerId = useSelectedLayerId();
  const versionCount = useEditorStore((state) => state.versions.length);
  const executeCommand = useEditorStore((state) => state.executeCommand);
  const seek = usePlaybackStore((state) => state.seek);

  // Draw order is bottom-first; the list shows the top-most layer first.
  const displayIds = useMemo(() => [...layerIds].reverse(), [layerIds]);
  const lastIndex = displayIds.length - 1;
  const trackWidth = (durationMs / 1000) * pxPerSecond + TRACK_TAIL_PX;

  const fit = useCallback(() => {
    const scroller = scrollerRef.current;

    if (!scroller) {
      return;
    }

    const labelWidth = getLabelWidth(scroller);
    const room = scroller.clientWidth - labelWidth - TRACK_TAIL_PX / 2;
    const next = Math.round(room / (durationMs / 1000));

    setPxPerSecond(Math.min(MAX_PX_PER_SECOND, Math.max(MIN_PX_PER_SECOND, next)));
    scroller.scrollLeft = 0;
  }, [durationMs]);

  // Start zoomed to fit the first time the timeline has something to show.
  const hasFitted = useRef(false);
  useEffect(() => {
    if (!hasFitted.current && displayIds.length > 0) {
      hasFitted.current = true;
      fit();
    }
  }, [displayIds.length, fit]);

  // Keep the playhead in view while playing.
  useEffect(
    () =>
      usePlaybackStore.subscribe((state, previous) => {
        const scroller = scrollerRef.current;

        if (!scroller || !state.isPlaying || state.currentMs === previous.currentMs) {
          return;
        }

        const labelWidth = getLabelWidth(scroller);
        const x = (state.currentMs / 1000) * pxPerSecond;
        const visibleStart = scroller.scrollLeft;
        const visibleEnd = scroller.scrollLeft + scroller.clientWidth - labelWidth;

        if (x < visibleStart || x > visibleEnd - 24) {
          scroller.scrollLeft = Math.max(0, x - 48);
        }
      }),
    [pxPerSecond],
  );

  const reorder = (layerId: string, displayIndex: number) =>
    executeCommand(
      { type: 'reorder_layer', layerId, toIndex: lastIndex - displayIndex },
      'user',
    );

  const endDrag = () => {
    setDraggedId(null);
    setDropSlot(null);
  };

  const handleDragOver = (event: DragEvent<HTMLLIElement>, displayIndex: number) => {
    if (!isLayerDrag(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const bounds = event.currentTarget.getBoundingClientRect();
    const isLowerHalf = event.clientY > bounds.top + bounds.height / 2;
    setDropSlot(displayIndex + (isLowerHalf ? 1 : 0));
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!isLayerDrag(event)) {
      return;
    }

    event.preventDefault();

    const from = draggedId ? displayIds.indexOf(draggedId) : -1;

    if (draggedId && from !== -1 && dropSlot !== null) {
      // Removing the dragged row shifts every slot below it up by one.
      const target = dropSlot > from ? dropSlot - 1 : dropSlot;

      if (target !== from) {
        reorder(draggedId, target);
      }
    }

    endDrag();
  };

  const dropEdgeFor = (displayIndex: number): LayerRowProps['dropEdge'] => {
    if (draggedId === null || dropSlot === null) {
      return null;
    }

    if (dropSlot === displayIndex) {
      return 'before';
    }

    return displayIndex === lastIndex && dropSlot === displayIds.length ? 'after' : null;
  };

  /** Starts a scrub: the playhead follows the pointer until it is released. */
  const beginScrub = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    const lane = event.currentTarget;
    const rect = lane.getBoundingClientRect();
    const timeAt = (clientX: number) => ((clientX - rect.left) / pxPerSecond) * 1000;

    event.preventDefault();
    lane.setPointerCapture(event.pointerId);
    seek(timeAt(event.clientX), { pause: true });

    const move = (moveEvent: PointerEvent) => seek(timeAt(moveEvent.clientX), { pause: true });
    const end = () => {
      lane.removeEventListener('pointermove', move);
      lane.removeEventListener('pointerup', end);
      lane.removeEventListener('pointercancel', end);
    };

    lane.addEventListener('pointermove', move);
    lane.addEventListener('pointerup', end);
    lane.addEventListener('pointercancel', end);
  };

  // Ctrl/Cmd + scroll zooms the timeline. React registers wheel listeners as
  // passive, which cannot stop the browser's own page zoom, so this one is
  // attached directly.
  useEffect(() => {
    const scroller = scrollerRef.current;

    if (!scroller) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      event.preventDefault();
      setPxPerSecond((current) =>
        Math.min(
          MAX_PX_PER_SECOND,
          Math.max(MIN_PX_PER_SECOND, Math.round(current * (event.deltaY < 0 ? 1.15 : 1 / 1.15))),
        ),
      );
    };

    scroller.addEventListener('wheel', handleWheel, { passive: false });

    return () => scroller.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div className={`signal-strip signal-tl ${showSnapshots ? 'has-snapshots' : ''}`}>
      <section className="signal-tl__main">
        <Transport
          durationMs={durationMs}
          pxPerSecond={pxPerSecond}
          onZoom={setPxPerSecond}
          onFit={fit}
          showSnapshots={showSnapshots}
          snapshotsId={snapshotsId}
          versionCount={versionCount}
          onToggleSnapshots={() => setShowSnapshots((shown) => !shown)}
        />

        <div ref={scrollerRef} className="signal-tl__scroller">
          <div className="signal-tl__content" style={{ width: `calc(var(--signal-tl-label) + ${trackWidth}px)` }}>
            <div className="signal-tl__ruler-row">
              <div className="signal-tl__corner">
                Layers <span className="signal-section-title__count">{displayIds.length}</span>
              </div>
              <div
                className="signal-tl__ruler"
                style={{ width: trackWidth }}
                onPointerDown={beginScrub}
                title="Click or drag to move the playhead"
              >
                <Ruler durationMs={durationMs} pxPerSecond={pxPerSecond} />
                <RulerMarker pxPerSecond={pxPerSecond} />
              </div>
            </div>

            {displayIds.length === 0 ? (
              <p className="signal-empty signal-tl__empty">
                No layers yet. Imported media and text appear here as clips on a timeline.
              </p>
            ) : (
              <ol className="signal-tl__rows" aria-label="Layers, top-most first">
                {displayIds.map((layerId, displayIndex) => (
                  <LayerRow
                    key={layerId}
                    layerId={layerId}
                    isSelected={selectedLayerId === layerId}
                    isFirst={displayIndex === 0}
                    isLast={displayIndex === lastIndex}
                    isDragged={draggedId === layerId}
                    dropEdge={dropEdgeFor(displayIndex)}
                    pxPerSecond={pxPerSecond}
                    trackWidth={trackWidth}
                    onScrub={beginScrub}
                    onMove={(direction) =>
                      reorder(layerId, displayIndex + (direction === 'forward' ? -1 : 1))
                    }
                    onDragStart={(event) => {
                      event.dataTransfer.setData(LAYER_DRAG_TYPE, layerId);
                      event.dataTransfer.effectAllowed = 'move';
                      setDraggedId(layerId);
                    }}
                    onDragOver={(event) => handleDragOver(event, displayIndex)}
                    onDragEnd={endDrag}
                    onDrop={handleDrop}
                  />
                ))}
              </ol>
            )}

            <Playhead pxPerSecond={pxPerSecond} />
          </div>
        </div>
      </section>

      {showSnapshots && <SnapshotList id={snapshotsId} />}
    </div>
  );
};

export default Timeline;
