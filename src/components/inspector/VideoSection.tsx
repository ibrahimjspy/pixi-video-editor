'use client';

import { useId } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { Icon } from '@/components/icons';
import NumberField from '@/components/inspector/NumberField';
import Section from '@/components/inspector/Section';
import { useGestureHandlers, useLayerFields } from '@/components/inspector/hooks';

interface VideoSectionProps {
  layerId: string;
}

const toSeconds = (milliseconds: number) => milliseconds / 1000;

const toMilliseconds = (seconds: number) => Math.round(seconds * 1000);

/**
 * Audio and trim settings of a video layer.
 *
 * Trim points choose which part of the source file plays. They shorten or
 * lengthen the clip on the timeline to match, so trimming here and dragging a
 * clip's edge on the timeline are the same edit.
 */
const VideoSection = ({ layerId }: VideoSectionProps) => {
  const volumeId = useId();
  const volumeGesture = useGestureHandlers('Volume');
  const previewLayerPatch = useEditorStore((state) => state.previewLayerPatch);
  const executeCommand = useEditorStore((state) => state.executeCommand);
  const layer = useLayerFields(layerId, (entry) =>
    entry.type === 'video'
      ? {
          isVideo: true,
          muted: entry.muted,
          volume: entry.volume ?? 1,
          trimStartMs: entry.trimStartMs,
          trimEndMs: entry.trimEndMs,
          assetId: entry.assetId,
        }
      : { isVideo: false, muted: false, volume: 1, trimStartMs: 0, trimEndMs: null, assetId: '' },
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

      <div className="signal-slider">
        <div className="signal-slider__head">
          <label htmlFor={volumeId}>Volume</label>
          <output htmlFor={volumeId}>{layer.muted ? 'Muted' : `${Math.round(layer.volume * 100)}%`}</output>
        </div>
        <input
          id={volumeId}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={layer.volume}
          disabled={layer.muted}
          onChange={(event) => previewLayerPatch(layerId, { volume: Number(event.target.value) })}
          {...volumeGesture}
        />
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
        Trim controls which part of the file plays; the clip on the timeline changes length to
        match. Audio plays while the timeline plays and is included in exports.
      </p>
    </Section>
  );
};

export default VideoSection;
