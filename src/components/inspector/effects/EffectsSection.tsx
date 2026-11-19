'use client';

import { useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/store/editorStore';
import { useEffectsClipboard } from '@/store/effectsClipboard';
import { getLookDefinition } from '@/lib/effects/looks';
import { Icon } from '@/components/icons';
import Section from '@/components/inspector/Section';
import EffectBrowser from '@/components/inspector/effects/EffectBrowser';
import EffectCard from '@/components/inspector/effects/EffectCard';
import LookPicker from '@/components/inspector/effects/LookPicker';

interface EffectsSectionProps {
  layerId: string;
}

/**
 * A layer's look and effect stack.
 *
 * The look is applied first, then the effects from top to bottom. Effects can
 * be added from the catalogue, folded, switched off, reordered and removed,
 * and the whole treatment can be copied to another layer.
 */
const EffectsSection = ({ layerId }: EffectsSectionProps) => {
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const executeCommand = useEditorStore((state) => state.executeCommand);
  const layer = useEditorStore(
    useShallow((state) => {
      const entry = state.project.layers.find((candidate) => candidate.id === layerId);

      return entry
        ? { name: entry.name, type: entry.type, look: entry.look ?? null, effects: entry.effects }
        : null;
    }),
  );
  const clip = useEffectsClipboard((state) => state.clip);
  const copy = useEffectsClipboard((state) => state.copy);

  const toggleOpen = useCallback((effectId: string) => {
    setOpenIds((current) => {
      const next = new Set(current);

      if (!next.delete(effectId)) {
        next.add(effectId);
      }

      return next;
    });
  }, []);

  if (!layer) {
    return null;
  }

  const { effects, look } = layer;
  const activeCount = effects.filter((effect) => effect.enabled).length + (look ? 1 : 0);
  const hasTreatment = effects.length > 0 || Boolean(look);
  const lookLabel = look ? getLookDefinition(look.id)?.label : undefined;

  const addEffect = (type: string) => {
    executeCommand({ type: 'add_effect', layerId, effect: type }, 'user');
    setIsBrowsing(false);

    // Unfold the effect that was just added, which is the last in the stack.
    const added = useEditorStore
      .getState()
      .project.layers.find((entry) => entry.id === layerId)
      ?.effects.at(-1);

    if (added) {
      setOpenIds((current) => new Set(current).add(added.id));
    }
  };

  const paste = () => {
    if (!clip) {
      return;
    }

    executeCommand(
      {
        type: 'set_effects',
        layerId,
        effects: clip.effects.map(({ type, params, enabled }) => ({ type, params, enabled })),
        look: clip.look,
      },
      'user',
    );
  };

  return (
    <Section
      title={layer.type === 'adjustment' ? 'Look & effects (everything below)' : 'Look & effects'}
      badge={
        activeCount > 0 ? (
          <span
            className="signal-badge"
            title={[lookLabel ? `${lookLabel} look` : null, `${effects.length} effect(s)`]
              .filter(Boolean)
              .join(', ')}
          >
            {activeCount} active
          </span>
        ) : undefined
      }
    >
      <div className="signal-button-row" role="group" aria-label="Effect actions">
        <button
          type="button"
          className="signal-mini-button"
          disabled={!hasTreatment}
          title="Copy this layer's look and effects"
          onClick={() => copy({ from: layer.name, look, effects })}
        >
          <Icon name="copy" size={13} /> Copy
        </button>
        <button
          type="button"
          className="signal-mini-button"
          disabled={!clip}
          title={
            clip
              ? `Replace this layer's look and effects with the ones copied from ${clip.from}`
              : 'Copy the look and effects of a layer first'
          }
          onClick={paste}
        >
          <Icon name="paste" size={13} /> Paste
        </button>
        <button
          type="button"
          className="signal-mini-button signal-mini-button--danger"
          disabled={!hasTreatment}
          onClick={() => executeCommand({ type: 'clear_effects', layerId }, 'user')}
        >
          Clear all
        </button>
      </div>

      <p className="signal-filter-list__heading">Look</p>
      <LookPicker layerId={layerId} layerType={layer.type} look={look} />

      <p className="signal-filter-list__heading">Effects</p>
      {effects.length === 0 ? (
        <p className="signal-note">
          No effects yet. Add one below; effects are applied in order, after the look.
        </p>
      ) : (
        <ol className="signal-effect-list">
          {effects.map((effect, index) => (
            <EffectCard
              key={effect.id}
              layerId={layerId}
              effect={effect}
              index={index}
              count={effects.length}
              isOpen={openIds.has(effect.id)}
              onToggleOpen={toggleOpen}
            />
          ))}
        </ol>
      )}

      {isBrowsing ? (
        <EffectBrowser onPick={addEffect} onClose={() => setIsBrowsing(false)} />
      ) : (
        <button
          type="button"
          className="signal-mini-button signal-effect-add"
          onClick={() => setIsBrowsing(true)}
        >
          <Icon name="plus" size={13} /> Add effect
        </button>
      )}
    </Section>
  );
};

export default EffectsSection;
