'use client';

import { useEffect, useId, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { usePlaybackStore } from '@/store/playbackStore';
import { LOOK_CATEGORIES, LOOK_DEFINITIONS } from '@/lib/effects/looks';
import type { LookCategory } from '@/lib/effects/looks';
import { renderLookThumbnails } from '@/lib/effects/lookThumbnails';
import type { LookThumbnails } from '@/lib/effects/lookThumbnails';
import type { LayerLook, LayerType } from '@/types/editor';
import { useGestureHandlers } from '@/components/inspector/hooks';

interface LookPickerProps {
  layerId: string;
  layerType: LayerType;
  look: LayerLook | null;
}

type CategoryTab = LookCategory | 'All';

const CATEGORY_TABS: readonly CategoryTab[] = ['All', ...LOOK_CATEGORIES];

/** How long the playhead must rest before thumbnails are redrawn. */
const SETTLE_MS = 350;

/** How often to retry while the layer's picture is still loading. */
const RETRY_MS = 700;
const MAX_RETRIES = 6;

/**
 * Live thumbnails of every look on the layer's current picture.
 *
 * Redrawn when the layer changes and, for anything that changes over time,
 * when the paused playhead comes to rest. Nothing is drawn during playback.
 */
const useLookThumbnails = (layerId: string, layerType: LayerType): LookThumbnails | null => {
  const [thumbnails, setThumbnails] = useState<LookThumbnails | null>(null);
  const isPlaying = usePlaybackStore((state) => state.isPlaying);
  const isLocked = usePlaybackStore((state) => state.isLocked);
  // A still image looks the same at every time, so it ignores the playhead.
  const timeKey = usePlaybackStore((state) =>
    layerType === 'image' ? 0 : Math.round(state.currentMs / 100),
  );

  useEffect(() => {
    if (isPlaying || isLocked) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;

    const run = async () => {
      const result = await renderLookThumbnails(layerId, () => !cancelled);

      if (cancelled) {
        return;
      }

      if (result) {
        setThumbnails(result);
      } else if (attempts < MAX_RETRIES) {
        attempts += 1;
        timer = setTimeout(run, RETRY_MS);
      }
    };

    timer = setTimeout(run, SETTLE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [layerId, timeKey, isPlaying, isLocked]);

  return thumbnails;
};

/**
 * The look library for one layer: a grid of looks previewed on the layer's
 * own picture, and an intensity slider for the chosen one. Clicking the
 * chosen look again removes it.
 */
const LookPicker = ({ layerId, layerType, look }: LookPickerProps) => {
  const intensityId = useId();
  const [category, setCategory] = useState<CategoryTab>('All');
  const executeCommand = useEditorStore((state) => state.executeCommand);
  const previewLayerPatch = useEditorStore((state) => state.previewLayerPatch);
  const gesture = useGestureHandlers('Look intensity', { snapshot: false });
  const thumbnails = useLookThumbnails(layerId, layerType);

  const visible = LOOK_DEFINITIONS.filter(
    (definition) => category === 'All' || definition.category === category,
  );
  const intensity = look?.intensity ?? 1;

  return (
    <div className="signal-looks">
      <div className="signal-tabs signal-tabs--wrap" role="group" aria-label="Look category">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className="signal-tabs__tab"
            aria-pressed={category === tab}
            onClick={() => setCategory(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="signal-looks__grid" role="group" aria-label="Looks">
        <button
          type="button"
          className="signal-look"
          aria-pressed={!look}
          title="No look"
          onClick={() => executeCommand({ type: 'set_look', layerId, look: null }, 'user')}
        >
          <span className="signal-look__thumb">
            {thumbnails ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL rendered in the browser
              <img src={thumbnails.original} alt="" />
            ) : null}
          </span>
          <span className="signal-look__name">None</span>
        </button>
        {visible.map((definition) => {
          const isActive = look?.id === definition.id;
          const src = thumbnails?.byLookId[definition.id];

          return (
            <button
              key={definition.id}
              type="button"
              className="signal-look"
              aria-pressed={isActive}
              title={definition.description}
              onClick={() =>
                executeCommand(
                  { type: 'set_look', layerId, look: isActive ? null : definition.id },
                  'user',
                )
              }
            >
              <span className="signal-look__thumb">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL rendered in the browser
                  <img src={src} alt="" />
                ) : null}
              </span>
              <span className="signal-look__name">{definition.label}</span>
            </button>
          );
        })}
      </div>

      {look && (
        <div className="signal-slider">
          <div className="signal-slider__head">
            <label htmlFor={intensityId}>Look intensity</label>
            <output htmlFor={intensityId}>{Math.round(intensity * 100)}%</output>
          </div>
          <input
            id={intensityId}
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={intensity}
            onChange={(event) =>
              previewLayerPatch(layerId, { lookIntensity: Number(event.target.value) })
            }
            onDoubleClick={() =>
              executeCommand({ type: 'set_look', layerId, look: look.id, intensity: 1 }, 'user')
            }
            {...gesture}
          />
        </div>
      )}
    </div>
  );
};

export default LookPicker;
