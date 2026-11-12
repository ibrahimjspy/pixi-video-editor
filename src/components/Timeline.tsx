'use client';

import { useId, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { getCurrentScene } from '@/lib/editor/defaults';
import { formatSnapshotTime } from '@/lib/editor/formatting';
import { Icon, LAYER_TYPE_ICON } from '@/components/icons';
import { useLayerFields, useSelectedLayerId } from '@/components/inspector/hooks';

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
  onMove: (direction: 'forward' | 'backward') => void;
  onDragStart: (event: DragEvent<HTMLLIElement>) => void;
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
    isSelected ? 'is-active' : '',
    isDragged ? 'is-dragged' : '',
    layer.visible ? '' : 'is-hidden',
    dropEdge ? `is-drop-${dropEdge}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li
      className={className}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
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

/**
 * Bottom strip: the active scene's layers, top-most first, with selection,
 * visibility, delete, and reordering by drag and drop or by the arrow
 * buttons. Snapshots sit behind a toggle.
 *
 * The file keeps its historical name; there is no time axis here.
 */
const Timeline = () => {
  const snapshotsId = useId();
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  /** Insertion slot in display order, 0 (above the first row) to n. */
  const [dropSlot, setDropSlot] = useState<number | null>(null);

  // `layerIds` keeps its identity while a slider previews, so the list does
  // not re-render during a drag.
  const layerIds = useEditorStore((state) => getCurrentScene(state.project).layerIds);
  const selectedLayerId = useSelectedLayerId();
  const versionCount = useEditorStore((state) => state.versions.length);
  const executeCommand = useEditorStore((state) => state.executeCommand);

  // Draw order is bottom-first; the list shows the top-most layer first.
  const displayIds = useMemo(() => [...layerIds].reverse(), [layerIds]);
  const lastIndex = displayIds.length - 1;

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

  return (
    <div className={`signal-strip ${showSnapshots ? 'has-snapshots' : ''}`}>
      <section className="signal-strip__section signal-strip__section--layers">
        <div className="signal-section-title">
          <span>
            Layers <span className="signal-section-title__count">{displayIds.length}</span>
          </span>
          <button
            type="button"
            className="signal-mini-button"
            aria-expanded={showSnapshots}
            aria-controls={snapshotsId}
            onClick={() => setShowSnapshots((shown) => !shown)}
          >
            Snapshots ({versionCount})
          </button>
        </div>
        {displayIds.length === 0 ? (
          <p className="signal-empty">
            No layers yet. Imported media and text appear here, top-most first.
          </p>
        ) : (
          <ol className="signal-layer-list" aria-label="Layers, top-most first">
            {displayIds.map((layerId, displayIndex) => (
              <LayerRow
                key={layerId}
                layerId={layerId}
                isSelected={selectedLayerId === layerId}
                isFirst={displayIndex === 0}
                isLast={displayIndex === lastIndex}
                isDragged={draggedId === layerId}
                dropEdge={dropEdgeFor(displayIndex)}
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
      </section>

      {showSnapshots && <SnapshotList id={snapshotsId} />}
    </div>
  );
};

export default Timeline;
