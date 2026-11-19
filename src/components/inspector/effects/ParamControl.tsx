'use client';

import { memo, useEffect, useId, useRef } from 'react';
import { useEditorStore } from '@/store/editorStore';
import type { EffectParamDefinition, NumberParam } from '@/lib/effects/registry';
import type { EffectParamValue } from '@/types/editor';
import { Icon } from '@/components/icons';
import { useGestureHandlers } from '@/components/inspector/hooks';

interface ParamControlProps {
  layerId: string;
  effectId: string;
  /** Effect name, used in undo and version labels. */
  effectLabel: string;
  definition: EffectParamDefinition;
  value: EffectParamValue;
}

/** Formats a number with as many decimals as the control's step has. */
const formatNumber = (definition: NumberParam, value: number) => {
  const decimals = (String(definition.step).split('.')[1] ?? '').length;

  return `${value.toFixed(decimals)}${definition.unit ?? ''}`;
};

/**
 * One control of an effect: a slider, a colour, a switch or a choice.
 *
 * Sliders and colours preview while they move and commit a single undo step
 * when released; switches and choices are one command each. Double-click a
 * slider, or use its reset button, to return it to the default.
 */
const ParamControl = memo(function ParamControl({
  layerId,
  effectId,
  effectLabel,
  definition,
  value,
}: ParamControlProps) {
  const inputId = useId();
  const colorRef = useRef<HTMLInputElement>(null);
  const executeCommand = useEditorStore((state) => state.executeCommand);
  const previewLayerPatch = useEditorStore((state) => state.previewLayerPatch);
  const gesture = useGestureHandlers(`${effectLabel} ${definition.label}`, { snapshot: false });

  const preview = (next: EffectParamValue) =>
    previewLayerPatch(layerId, { effectParams: { [effectId]: { [definition.key]: next } } });
  const commit = (next: EffectParamValue) =>
    executeCommand(
      { type: 'update_effect', layerId, effectId, params: { [definition.key]: next } },
      'user',
    );

  // A colour picker reports every shade while it is dragged, and fires the
  // browser's own `change` event once when it closes. React's onChange is the
  // former, so the latter is listened for directly to end the gesture.
  useEffect(() => {
    const input = colorRef.current;

    if (!input) {
      return;
    }

    const finish = () =>
      useEditorStore
        .getState()
        .commitLayerPatch(`${effectLabel} ${definition.label}`, { snapshot: false });

    input.addEventListener('change', finish);

    return () => input.removeEventListener('change', finish);
  }, [definition.label, effectLabel]);

  if (definition.kind === 'number') {
    const current = typeof value === 'number' ? value : definition.default;
    const modified = Math.abs(current - definition.default) > 1e-9;
    const reset = () => {
      if (modified) {
        commit(definition.default);
      }
    };

    return (
      <div className={`signal-slider ${modified ? 'is-modified' : ''}`} title={definition.hint}>
        <div className="signal-slider__head">
          <label htmlFor={inputId}>{definition.label}</label>
          {modified && (
            <button
              type="button"
              className="signal-icon-button signal-icon-button--small"
              aria-label={`Reset ${definition.label}`}
              title={`Reset to ${formatNumber(definition, definition.default)}`}
              onClick={reset}
            >
              <Icon name="reset" size={12} />
            </button>
          )}
          <output htmlFor={inputId}>{formatNumber(definition, current)}</output>
        </div>
        <input
          id={inputId}
          type="range"
          min={definition.min}
          max={definition.max}
          step={definition.step}
          value={current}
          onChange={(event) => preview(Number(event.target.value))}
          onDoubleClick={reset}
          {...gesture}
        />
      </div>
    );
  }

  if (definition.kind === 'color') {
    const current = typeof value === 'string' ? value : definition.default;

    return (
      <div className="signal-param-row" title={definition.hint}>
        <label htmlFor={inputId}>{definition.label}</label>
        <span className="signal-param-row__value">{current}</span>
        <input
          ref={colorRef}
          id={inputId}
          className="signal-color"
          type="color"
          value={current}
          onChange={(event) => preview(event.target.value)}
          onBlur={gesture.onBlur}
        />
      </div>
    );
  }

  if (definition.kind === 'boolean') {
    const current = typeof value === 'boolean' ? value : definition.default;

    return (
      <div className="signal-param-row" title={definition.hint}>
        <label htmlFor={inputId}>{definition.label}</label>
        <button
          id={inputId}
          type="button"
          role="switch"
          className="signal-switch"
          aria-checked={current}
          onClick={() => commit(!current)}
        >
          <span className="signal-switch__thumb" />
        </button>
      </div>
    );
  }

  const current = typeof value === 'string' ? value : definition.default;

  return (
    <div className="signal-param-row" title={definition.hint}>
      <label htmlFor={inputId}>{definition.label}</label>
      <select
        id={inputId}
        className="signal-input signal-param-row__select"
        value={current}
        onChange={(event) => commit(event.target.value)}
      >
        {definition.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
});

export default ParamControl;
