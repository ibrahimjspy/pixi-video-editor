'use client';

import { memo, useId } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { getDefaultParams, getEffectDefinition } from '@/lib/effects/registry';
import type { EffectInstance } from '@/types/editor';
import { Icon } from '@/components/icons';
import ParamControl from '@/components/inspector/effects/ParamControl';

interface EffectCardProps {
  layerId: string;
  effect: EffectInstance;
  index: number;
  count: number;
  isOpen: boolean;
  onToggleOpen: (effectId: string) => void;
}

/**
 * One effect in a layer's stack: a header to fold, switch, reorder and remove
 * it, and its controls underneath. Memoised on the effect object, so dragging
 * a slider re-renders only the card it belongs to.
 */
const EffectCard = memo(function EffectCard({
  layerId,
  effect,
  index,
  count,
  isOpen,
  onToggleOpen,
}: EffectCardProps) {
  const bodyId = useId();
  const executeCommand = useEditorStore((state) => state.executeCommand);
  const definition = getEffectDefinition(effect.type);

  if (!definition) {
    return null;
  }

  const defaults = getDefaultParams(definition);
  const isModified = definition.params.some((param) => effect.params[param.key] !== defaults[param.key]);
  const move = (toIndex: number) =>
    executeCommand({ type: 'reorder_effect', layerId, effectId: effect.id, toIndex }, 'user');

  return (
    <li className={`signal-effect ${effect.enabled ? '' : 'is-off'} ${isOpen ? 'is-open' : ''}`}>
      <div className="signal-effect__head">
        <button
          type="button"
          className="signal-effect__toggle"
          aria-expanded={isOpen}
          aria-controls={bodyId}
          onClick={() => onToggleOpen(effect.id)}
        >
          <Icon name="chevron" size={13} />
          <span className="signal-effect__name">{definition.label}</span>
          <span className="signal-effect__category">{definition.category}</span>
        </button>
        <button
          type="button"
          className="signal-icon-button signal-icon-button--small"
          aria-label={`Move ${definition.label} earlier`}
          title="Apply earlier"
          disabled={index === 0}
          onClick={() => move(index - 1)}
        >
          <Icon name="arrow-up" size={12} />
        </button>
        <button
          type="button"
          className="signal-icon-button signal-icon-button--small"
          aria-label={`Move ${definition.label} later`}
          title="Apply later"
          disabled={index >= count - 1}
          onClick={() => move(index + 1)}
        >
          <Icon name="arrow-down" size={12} />
        </button>
        <button
          type="button"
          role="switch"
          className="signal-switch"
          aria-checked={effect.enabled}
          aria-label={`${definition.label} on`}
          title={effect.enabled ? 'Switch off' : 'Switch on'}
          onClick={() =>
            executeCommand(
              { type: 'update_effect', layerId, effectId: effect.id, enabled: !effect.enabled },
              'user',
            )
          }
        >
          <span className="signal-switch__thumb" />
        </button>
        <button
          type="button"
          className="signal-icon-button signal-icon-button--small signal-icon-button--danger"
          aria-label={`Remove ${definition.label}`}
          title="Remove effect"
          onClick={() => executeCommand({ type: 'remove_effect', layerId, effectId: effect.id }, 'user')}
        >
          <Icon name="trash" size={12} />
        </button>
      </div>

      {isOpen && (
        <div id={bodyId} className="signal-effect__body">
          {definition.params.length === 0 ? (
            <p className="signal-note">This effect has no controls.</p>
          ) : (
            definition.params.map((param) => (
              <ParamControl
                key={param.key}
                layerId={layerId}
                effectId={effect.id}
                effectLabel={definition.label}
                definition={param}
                value={effect.params[param.key] ?? param.default}
              />
            ))
          )}
          {isModified && (
            <button
              type="button"
              className="signal-mini-button signal-effect__reset"
              onClick={() =>
                executeCommand(
                  { type: 'update_effect', layerId, effectId: effect.id, params: defaults },
                  'user',
                )
              }
            >
              <Icon name="reset" size={12} /> Reset {definition.label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </li>
  );
});

export default EffectCard;
