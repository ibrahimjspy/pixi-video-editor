'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import type { TextLayer } from '@/types/editor';
import { Icon } from '@/components/icons';
import type { IconName } from '@/components/icons';
import NumberField from '@/components/inspector/NumberField';
import Section from '@/components/inspector/Section';
import { useLayerFields } from '@/components/inspector/hooks';

interface TextSectionProps {
  layerId: string;
}

/** Font stacks offered in the family menu. The first two are the app's own. */
const FONT_FAMILIES: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Space Grotesk', value: 'Space Grotesk, sans-serif' },
  { label: 'IBM Plex Sans', value: 'IBM Plex Sans, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Impact', value: 'Impact, "Arial Narrow Bold", sans-serif' },
];

const ALIGNMENTS: ReadonlyArray<{
  value: TextLayer['align'];
  label: string;
  icon: IconName;
}> = [
  { value: 'left', label: 'Align left', icon: 'align-left' },
  { value: 'center', label: 'Align centre', icon: 'align-center' },
  { value: 'right', label: 'Align right', icon: 'align-right' },
];

/**
 * Normalises `#rgb` or `#rrggbb` (with or without the hash) to lower-case
 * `#rrggbb`, or returns `null` when the text is not a hex colour.
 */
const parseHexColor = (text: string): string | null => {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());

  if (!match) {
    return null;
  }

  const digits = match[1].toLowerCase();

  return `#${
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits
  }`;
};

interface ColorSwatchProps {
  layerId: string;
  color: string;
}

/**
 * Native colour picker that previews while the user drags inside it and
 * commits one undo step when the picker closes or loses focus.
 */
const ColorSwatch = ({ layerId, color }: ColorSwatchProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewLayerPatch = useEditorStore((state) => state.previewLayerPatch);
  const commitLayerPatch = useEditorStore((state) => state.commitLayerPatch);

  // React's onChange on a colour input fires for every picker movement; the
  // native `change` event is the one that marks the picker closing.
  useEffect(() => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    const commit = () => commitLayerPatch('Text colour');
    input.addEventListener('change', commit);

    return () => input.removeEventListener('change', commit);
  }, [commitLayerPatch]);

  return (
    <input
      ref={inputRef}
      type="color"
      aria-label="Pick text colour"
      value={parseHexColor(color) ?? '#ffffff'}
      onChange={(event) => previewLayerPatch(layerId, { color: event.target.value })}
      onBlur={() => commitLayerPatch('Text colour')}
    />
  );
};

/**
 * Content and typography of a text layer.
 *
 * Typing and dragging in the colour picker preview live and become one undo
 * step when the control loses focus (or the picker closes). Discrete controls
 * commit immediately through `update_text`.
 */
const TextSection = ({ layerId }: TextSectionProps) => {
  const textId = useId();
  const familyId = useId();
  const hexId = useId();
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const executeCommand = useEditorStore((state) => state.executeCommand);
  const previewLayerPatch = useEditorStore((state) => state.previewLayerPatch);
  const commitLayerPatch = useEditorStore((state) => state.commitLayerPatch);
  const cancelLayerPatch = useEditorStore((state) => state.cancelLayerPatch);
  const layer = useLayerFields(layerId, (entry) =>
    entry.type === 'text'
      ? {
          isText: true,
          text: entry.text,
          fontSize: entry.fontSize,
          fontFamily: entry.fontFamily,
          color: entry.color,
          align: entry.align,
        }
      : { isText: false, text: '', fontSize: 0, fontFamily: '', color: '', align: 'left' as const },
  );

  if (!layer || !layer.isText) {
    return null;
  }

  const update = (
    fields: Partial<Pick<TextLayer, 'fontSize' | 'fontFamily' | 'color' | 'align'>>,
  ) => executeCommand({ type: 'update_text', layerId, ...fields }, 'user');

  const commitHex = () => {
    if (hexDraft === null) {
      return;
    }

    const color = parseHexColor(hexDraft);
    setHexDraft(null);

    if (color && color !== layer.color.toLowerCase()) {
      update({ color });
    }
  };

  const hasListedFamily = FONT_FAMILIES.some((font) => font.value === layer.fontFamily);

  return (
    <Section title="Text">
      <div className="signal-field">
        <label htmlFor={textId}>Content</label>
        <textarea
          id={textId}
          className="signal-input signal-input--multiline"
          rows={3}
          value={layer.text}
          onChange={(event) => previewLayerPatch(layerId, { text: event.target.value })}
          onBlur={() => commitLayerPatch('Edit text')}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              cancelLayerPatch();
            }
          }}
        />
      </div>

      <div className="signal-field-grid">
        <div className="signal-field">
          <label htmlFor={familyId}>Font</label>
          <select
            id={familyId}
            className="signal-input"
            value={layer.fontFamily}
            onChange={(event) => update({ fontFamily: event.target.value })}
          >
            {!hasListedFamily && <option value={layer.fontFamily}>{layer.fontFamily}</option>}
            {FONT_FAMILIES.map((font) => (
              <option key={font.value} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>
        </div>
        <NumberField
          label="Size"
          unit="px"
          min={1}
          max={512}
          value={layer.fontSize}
          onCommit={(fontSize) => update({ fontSize })}
        />
      </div>

      <div className="signal-field-grid">
        <div className="signal-field">
          <label htmlFor={hexId}>Colour</label>
          <div className="signal-color">
            <ColorSwatch layerId={layerId} color={layer.color} />
            <input
              id={hexId}
              className="signal-input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={7}
              value={hexDraft ?? layer.color}
              onChange={(event) => setHexDraft(event.target.value)}
              onBlur={commitHex}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                } else if (event.key === 'Escape') {
                  setHexDraft(null);
                }
              }}
            />
          </div>
        </div>
        <div className="signal-field">
          <span className="signal-field__label">Alignment</span>
          <div className="signal-segmented" role="group" aria-label="Text alignment">
            {ALIGNMENTS.map((alignment) => (
              <button
                key={alignment.value}
                type="button"
                className="signal-segmented__item"
                aria-pressed={layer.align === alignment.value}
                aria-label={alignment.label}
                title={alignment.label}
                onClick={() => update({ align: alignment.value })}
              >
                <Icon name={alignment.icon} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
};

export default TextSection;
