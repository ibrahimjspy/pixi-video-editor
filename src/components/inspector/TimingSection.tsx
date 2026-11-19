'use client';

import { useEditorStore } from '@/store/editorStore';
import { getAssetById, getCurrentScene } from '@/lib/editor/defaults';
import { getLayerSpan, MIN_CLIP_MS } from '@/lib/editor/timeline';
import NumberField from '@/components/inspector/NumberField';
import Section from '@/components/inspector/Section';

interface TimingSectionProps {
  layerId: string;
}

const toSeconds = (milliseconds: number) => milliseconds / 1000;

const toMilliseconds = (seconds: number) => Math.round(seconds * 1000);

/**
 * When a layer appears and how long it stays, in seconds. The same values can
 * be changed by dragging the clip on the timeline; these fields are for exact
 * numbers. For a video, changing the duration trims the end of the clip.
 */
const TimingSection = ({ layerId }: TimingSectionProps) => {
  const executeCommand = useEditorStore((state) => state.executeCommand);
  const layer = useEditorStore((state) => state.project.layers.find((entry) => entry.id === layerId));
  const asset = useEditorStore((state) =>
    layer && (layer.type === 'image' || layer.type === 'video')
      ? getAssetById(state.project, layer.assetId)
      : undefined,
  );
  const fallbackMs = useEditorStore((state) => getCurrentScene(state.project).durationMs);

  if (!layer) {
    return null;
  }

  const span = getLayerSpan(layer, asset?.durationMs, fallbackMs);
  const durationMs = span.endMs - span.startMs;
  // A video cannot play past the end of its source file.
  const maxDurationMs =
    layer.type === 'video' && asset?.durationMs !== undefined
      ? asset.durationMs - layer.trimStartMs
      : undefined;

  return (
    <Section title="Timing">
      <div className="signal-field-grid">
        <NumberField
          label="Start"
          unit="s"
          step={0.1}
          min={0}
          value={toSeconds(span.startMs)}
          onCommit={(seconds) =>
            executeCommand(
              { type: 'patch_layer', layerId, patch: { startMs: toMilliseconds(seconds) } },
              'user',
            )
          }
        />
        <NumberField
          label="Duration"
          unit="s"
          step={0.1}
          min={toSeconds(MIN_CLIP_MS)}
          max={maxDurationMs === undefined ? undefined : toSeconds(maxDurationMs)}
          value={toSeconds(durationMs)}
          onCommit={(seconds) =>
            executeCommand(
              { type: 'patch_layer', layerId, patch: { durationMs: toMilliseconds(seconds) } },
              'user',
            )
          }
        />
      </div>
      <p className="signal-note">Ends at {toSeconds(span.endMs).toFixed(2)}s on the timeline.</p>
    </Section>
  );
};

export default TimingSection;
