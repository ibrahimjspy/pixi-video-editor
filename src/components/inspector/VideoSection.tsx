'use client';

import { useEditorStore } from '@/store/editorStore';
import { Icon } from '@/components/icons';
import NumberField from '@/components/inspector/NumberField';
import Section from '@/components/inspector/Section';
import { useLayerFields } from '@/components/inspector/hooks';

interface VideoSectionProps {
  layerId: string;
}

const toSeconds = (milliseconds: number) => milliseconds / 1000;

const toMilliseconds = (seconds: number) => Math.round(seconds * 1000);

/**
 * Audio and trim settings of a video layer.
 *
 * Trim points are saved on the layer through `trim_clip`, but nothing in the
 * preview reads them yet, and the section says so.
 */
const VideoSection = ({ layerId }: VideoSectionProps) => {
  const executeCommand = useEditorStore((state) => state.executeCommand);
  const layer = useLayerFields(layerId, (entry) =>
    entry.type === 'video'
      ? {
          isVideo: true,
          muted: entry.muted,
          trimStartMs: entry.trimStartMs,
          trimEndMs: entry.trimEndMs,
          assetId: entry.assetId,
        }
      : { isVideo: false, muted: false, trimStartMs: 0, trimEndMs: null, assetId: '' },
  );
  const assetId = layer?.assetId ?? '';
  const durationMs = useEditorStore(
    (state) => state.project.assets.find((asset) => asset.id === assetId)?.durationMs,
  );

  if (!layer || !layer.isVideo) {
    return null;
  }

  const trim = (trimStartMs: number, trimEndMs: number | null) =>
    executeCommand({ type: 'trim_clip', layerId, trimStartMs, trimEndMs }, 'user');

  const endMs = layer.trimEndMs ?? durationMs ?? null;
  const maxSeconds = durationMs === undefined ? undefined : toSeconds(durationMs);
  const isTrimmed =
    layer.trimStartMs !== 0 || (layer.trimEndMs !== null && layer.trimEndMs !== durationMs);

  return (
    <Section title="Video">
      <div className="signal-button-row">
        <button
          type="button"
          className="signal-mini-button"
          aria-pressed={layer.muted}
          onClick={() =>
            executeCommand({ type: 'mute_or_hide_layer', layerId, muted: !layer.muted }, 'user')
          }
        >
          <Icon name={layer.muted ? 'volume-off' : 'volume'} />
          {layer.muted ? 'Muted' : 'Mute'}
        </button>
        <span className="signal-section__meta">
          {durationMs === undefined
            ? 'Duration unknown'
            : `Source length ${toSeconds(durationMs).toFixed(2)}s`}
        </span>
      </div>

      <div className="signal-field-grid">
        <NumberField
          label="Trim start"
          unit="s"
          step={0.1}
          min={0}
          max={maxSeconds}
          value={toSeconds(layer.trimStartMs)}
          onCommit={(seconds) => trim(toMilliseconds(seconds), layer.trimEndMs)}
        />
        <NumberField
          label="Trim end"
          unit="s"
          step={0.1}
          min={0}
          max={maxSeconds}
          placeholder="end"
          value={endMs === null ? null : toSeconds(endMs)}
          onCommit={(seconds) => trim(layer.trimStartMs, toMilliseconds(seconds))}
        />
      </div>

      <div className="signal-button-row">
        <button
          type="button"
          className="signal-mini-button"
          disabled={!isTrimmed}
          onClick={() => trim(0, durationMs ?? null)}
        >
          Clear trim
        </button>
      </div>

      <p className="signal-note">
        Trim is stored, not yet applied to playback: the preview always plays the whole clip.
      </p>
    </Section>
  );
};

export default VideoSection;
