'use client';

import { useId, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/store/editorStore';
import { getCurrentScene } from '@/lib/editor/defaults';
import { Icon, LAYER_TYPE_ICON } from '@/components/icons';
import Section from '@/components/inspector/Section';
import { useLayerFields } from '@/components/inspector/hooks';

interface LayerSectionProps {
  layerId: string;
}

/** Name, visibility, stacking order, duplicate, and delete for one layer. */
const LayerSection = ({ layerId }: LayerSectionProps) => {
  const nameId = useId();
  const [draftName, setDraftName] = useState<string | null>(null);
  const executeCommand = useEditorStore((state) => state.executeCommand);
  const layer = useLayerFields(layerId, (entry) => ({
    name: entry.name,
    type: entry.type,
    visible: entry.visible,
  }));
  const order = useEditorStore(
    useShallow((state) => {
      const layerIds = getCurrentScene(state.project).layerIds;
      return { index: layerIds.indexOf(layerId), count: layerIds.length };
    }),
  );

  if (!layer) {
    return null;
  }

  const commitName = () => {
    if (draftName === null) {
      return;
    }

    const name = draftName.trim();
    setDraftName(null);

    if (name && name !== layer.name) {
      executeCommand({ type: 'rename_layer', layerId, name }, 'user');
    }
  };

  const reorder = (toIndex: number) =>
    executeCommand({ type: 'reorder_layer', layerId, toIndex }, 'user');

  const isTop = order.index === -1 || order.index >= order.count - 1;
  const isBottom = order.index <= 0;

  return (
    <Section
      title="Layer"
      badge={
        <span className="signal-section__meta">
          <Icon name={LAYER_TYPE_ICON[layer.type]} size={13} /> {layer.type}
        </span>
      }
    >
      <div className="signal-field">
        <label htmlFor={nameId}>Name</label>
        <input
          id={nameId}
          className="signal-input"
          type="text"
          autoComplete="off"
          value={draftName ?? layer.name}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              setDraftName(null);
            }
          }}
        />
      </div>

      <div className="signal-button-row">
        <button
          type="button"
          className="signal-mini-button"
          aria-pressed={layer.visible}
          onClick={() =>
            executeCommand(
              { type: 'mute_or_hide_layer', layerId, visible: !layer.visible },
              'user',
            )
          }
        >
          <Icon name={layer.visible ? 'eye' : 'eye-off'} />
          {layer.visible ? 'Visible' : 'Hidden'}
        </button>
        <button
          type="button"
          className="signal-mini-button"
          title="Duplicate layer (Cmd/Ctrl+D)"
          onClick={() => executeCommand({ type: 'duplicate_layer', layerId }, 'user')}
        >
          <Icon name="duplicate" />
          Duplicate
        </button>
        <button
          type="button"
          className="signal-mini-button signal-mini-button--danger"
          title="Delete layer (Delete)"
          onClick={() => executeCommand({ type: 'delete_layer', layerId }, 'user')}
        >
          <Icon name="trash" />
          Delete
        </button>
      </div>

      <div className="signal-button-row" role="group" aria-label="Stacking order">
        <button
          type="button"
          className="signal-mini-button"
          disabled={isTop}
          onClick={() => reorder(order.count - 1)}
        >
          <Icon name="to-front" />
          To front
        </button>
        <button
          type="button"
          className="signal-mini-button"
          disabled={isTop}
          onClick={() => reorder(order.index + 1)}
        >
          <Icon name="arrow-up" />
          Forward
        </button>
        <button
          type="button"
          className="signal-mini-button"
          disabled={isBottom}
          onClick={() => reorder(order.index - 1)}
        >
          <Icon name="arrow-down" />
          Backward
        </button>
        <button
          type="button"
          className="signal-mini-button"
          disabled={isBottom}
          onClick={() => reorder(0)}
        >
          <Icon name="to-back" />
          To back
        </button>
      </div>
    </Section>
  );
};

export default LayerSection;
