'use client';

import { useId, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/store/editorStore';
import { MIN_LAYER_SIZE } from '@/lib/editor/defaults';
import type { LayerFrame } from '@/types/editor';
import { Icon } from '@/components/icons';
import NumberField from '@/components/inspector/NumberField';
import Section from '@/components/inspector/Section';
import {
  useCanvasSize,
  useGestureHandlers,
  useLayerFields,
} from '@/components/inspector/hooks';

interface TransformSectionProps {
  layerId: string;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

const toDegrees = (radians: number) => (radians * 180) / Math.PI;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Position, size, rotation, and opacity of one layer.
 *
 * Numeric fields commit as one `set_layer_frame` each. While the layer is
 * being dragged on the canvas the fields show the live transient frame.
 */
const TransformSection = ({ layerId }: TransformSectionProps) => {
  const opacityId = useId();
  const executeCommand = useEditorStore((state) => state.executeCommand);
  const previewLayerPatch = useEditorStore((state) => state.previewLayerPatch);
  const canvas = useCanvasSize();
  const layer = useLayerFields(layerId, (entry) => ({
    type: entry.type,
    x: entry.x,
    y: entry.y,
    width: entry.width,
    height: entry.height,
    rotation: entry.rotation,
    opacity: entry.opacity,
    assetId: entry.type === 'text' ? null : entry.assetId,
  }));
  const transientFrame = useEditorStore(
    (state): LayerFrame | undefined => state.transientFrameByLayerId[layerId],
  );
  const assetId = layer?.assetId ?? null;
  const assetSize = useEditorStore(
    useShallow((state) => {
      const asset = assetId
        ? state.project.assets.find((entry) => entry.id === assetId)
        : undefined;

      return { width: asset?.width ?? null, height: asset?.height ?? null };
    }),
  );
  // Media keeps its proportions by default; text boxes are free-form.
  const [isAspectLocked, setIsAspectLocked] = useState(layer ? layer.type !== 'text' : false);
  const opacityGesture = useGestureHandlers('Opacity');

  if (!layer) {
    return null;
  }

  const frame: LayerFrame = transientFrame ?? layer;
  const ratio = frame.height > 0 ? frame.width / frame.height : 1;

  const setFrame = (next: Partial<LayerFrame>) =>
    executeCommand({ type: 'set_layer_frame', layerId, ...next }, 'user');

  const setWidth = (width: number) =>
    setFrame(
      isAspectLocked
        ? { width, height: Math.max(MIN_LAYER_SIZE, round2(width / ratio)) }
        : { width },
    );

  const setHeight = (height: number) =>
    setFrame(
      isAspectLocked
        ? { height, width: Math.max(MIN_LAYER_SIZE, round2(height * ratio)) }
        : { height },
    );

  /** Resizes to `width`×`height` and centres the result on the canvas. */
  const placeCentered = (width: number, height: number) =>
    setFrame({
      width: round2(width),
      height: round2(height),
      x: round2((canvas.width - width) / 2),
      y: round2((canvas.height - height) / 2),
    });

  const scaleToCanvas = (mode: 'fit' | 'fill') => {
    const scaleX = canvas.width / frame.width;
    const scaleY = canvas.height / frame.height;
    const scale = mode === 'fit' ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);

    placeCentered(frame.width * scale, frame.height * scale);
  };

  const resetSize = () => {
    if (!assetSize.width || !assetSize.height) {
      return;
    }

    const scale = Math.min(
      1,
      canvas.width / assetSize.width,
      canvas.height / assetSize.height,
    );
    const width = round2(assetSize.width * scale);
    const height = round2(assetSize.height * scale);

    // Keep the layer where it is: resize around its current centre.
    setFrame({
      width,
      height,
      x: round2(frame.x + (frame.width - width) / 2),
      y: round2(frame.y + (frame.height - height) / 2),
    });
  };

  const hasNaturalSize = Boolean(assetSize.width && assetSize.height);

  return (
    <Section title="Transform">
      <div className="signal-field-grid">
        <NumberField label="X" unit="px" value={frame.x} onCommit={(x) => setFrame({ x })} />
        <NumberField label="Y" unit="px" value={frame.y} onCommit={(y) => setFrame({ y })} />
        <NumberField
          label="W"
          unit="px"
          min={MIN_LAYER_SIZE}
          value={frame.width}
          onCommit={setWidth}
        />
        <NumberField
          label="H"
          unit="px"
          min={MIN_LAYER_SIZE}
          value={frame.height}
          onCommit={setHeight}
        />
        <NumberField
          label="Rotation"
          unit="deg"
          precision={1}
          value={toDegrees(frame.rotation)}
          onCommit={(degrees) => setFrame({ rotation: toRadians(degrees) })}
        />
        <div className="signal-field">
          <span className="signal-field__label">Proportions</span>
          <button
            type="button"
            className="signal-mini-button"
            aria-pressed={isAspectLocked}
            aria-label="Lock proportions"
            title="Keep the current width-to-height ratio when editing W or H"
            onClick={() => setIsAspectLocked((locked) => !locked)}
          >
            <Icon name={isAspectLocked ? 'lock' : 'unlock'} />
            {isAspectLocked ? 'Locked' : 'Free'}
          </button>
        </div>
      </div>

      <div className="signal-slider">
        <div className="signal-slider__head">
          <label htmlFor={opacityId}>Opacity</label>
          <output htmlFor={opacityId}>{Math.round(layer.opacity * 100)}%</output>
        </div>
        <input
          id={opacityId}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={layer.opacity}
          onChange={(event) =>
            previewLayerPatch(layerId, { opacity: Number(event.target.value) })
          }
          {...opacityGesture}
        />
      </div>

      <div className="signal-button-row">
        <button
          type="button"
          className="signal-mini-button"
          title="Scale to fit inside the canvas and centre"
          onClick={() => scaleToCanvas('fit')}
        >
          Fit to canvas
        </button>
        <button
          type="button"
          className="signal-mini-button"
          title="Scale to cover the whole canvas and centre"
          onClick={() => scaleToCanvas('fill')}
        >
          Fill canvas
        </button>
        <button
          type="button"
          className="signal-mini-button"
          onClick={() =>
            setFrame({
              x: round2((canvas.width - frame.width) / 2),
              y: round2((canvas.height - frame.height) / 2),
            })
          }
        >
          Center
        </button>
        <button
          type="button"
          className="signal-mini-button"
          disabled={!hasNaturalSize}
          title={
            hasNaturalSize
              ? `Restore the media's natural size (${assetSize.width}×${assetSize.height}), capped to the canvas`
              : 'Only media layers have a natural size'
          }
          onClick={resetSize}
        >
          Reset size
        </button>
      </div>
    </Section>
  );
};

export default TransformSection;
