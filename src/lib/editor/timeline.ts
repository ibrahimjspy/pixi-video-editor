import { Layer, Project, VideoLayer } from '@/types/editor';
import { getAssetById, getCurrentLayers, getCurrentScene } from '@/lib/editor/defaults';
import { MIN_TRIM_DURATION_MS } from '@/lib/editor/layerPatch';

/**
 * Pure time maths for the timeline: where a layer sits in time, which source
 * frame a video layer shows, and how long the whole project runs.
 *
 * Nothing here touches the DOM or the store, so the preview, the timeline UI,
 * and the exporter all agree on the same answers.
 */

/** Shortest clip a split or edge drag may leave behind. */
export const MIN_CLIP_MS = MIN_TRIM_DURATION_MS;

/** How long an image or text layer lasts when nothing else says. */
export const FALLBACK_CLIP_MS = 5000;

export interface LayerSpan {
  startMs: number;
  /** Exclusive: the layer is gone at this instant. */
  endMs: number;
}

export const getLayerVolume = (layer: Layer): number =>
  layer.type === 'video' ? Math.min(1, Math.max(0, layer.volume ?? 1)) : 0;

/** Length of a video layer's trimmed source range, or null if it is unknown. */
export const getVideoSourceLengthMs = (
  layer: VideoLayer,
  assetDurationMs: number | undefined,
): number | null => {
  const end = layer.trimEndMs ?? assetDurationMs ?? null;

  return end === null ? null : Math.max(0, end - layer.trimStartMs);
};

/**
 * Where a layer lives on the timeline.
 *
 * Video layers last exactly as long as their trimmed source range; every
 * other layer uses its stored `durationMs`.
 */
export const getLayerSpan = (
  layer: Layer,
  assetDurationMs: number | undefined,
  fallbackDurationMs: number = FALLBACK_CLIP_MS,
): LayerSpan => {
  const startMs = Math.max(0, layer.startMs ?? 0);

  if (layer.type === 'video') {
    const length = getVideoSourceLengthMs(layer, assetDurationMs);

    return { startMs, endMs: startMs + (length ?? layer.durationMs ?? fallbackDurationMs) };
  }

  return { startMs, endMs: startMs + (layer.durationMs ?? fallbackDurationMs) };
};

/** `getLayerSpan` for a layer that belongs to a project. */
export const getProjectLayerSpan = (project: Project, layer: Layer): LayerSpan =>
  getLayerSpan(
    layer,
    layer.type === 'video' ? getAssetById(project, layer.assetId)?.durationMs : undefined,
    getCurrentScene(project).durationMs,
  );

export const isSpanActiveAt = (span: LayerSpan, timeMs: number): boolean =>
  timeMs >= span.startMs && timeMs < span.endMs;

/**
 * The position inside the source file, in milliseconds, that a video layer
 * shows at a timeline time. Clamped to the trimmed range, so a time outside
 * the layer yields its first or last frame.
 */
export const getVideoSourceTimeMs = (
  layer: VideoLayer,
  span: LayerSpan,
  timeMs: number,
): number => {
  const offset = Math.min(Math.max(0, timeMs - span.startMs), span.endMs - span.startMs);

  return layer.trimStartMs + offset;
};

/**
 * Total project length: the end of the last layer in the active scene, or the
 * scene's own length when it has no layers. Never shorter than one second.
 */
export const getTimelineDurationMs = (project: Project): number => {
  const scene = getCurrentScene(project);
  const layers = getCurrentLayers(project);

  if (layers.length === 0) {
    return Math.max(1000, scene.durationMs);
  }

  const end = layers.reduce(
    (latest, layer) => Math.max(latest, getProjectLayerSpan(project, layer).endMs),
    0,
  );

  return Math.max(1000, Math.round(end));
};

/** Whether a split at `atMs` would leave both halves at least `MIN_CLIP_MS` long. */
export const canSplitSpanAt = (span: LayerSpan, atMs: number): boolean =>
  atMs - span.startMs >= MIN_CLIP_MS && span.endMs - atMs >= MIN_CLIP_MS;

/** `01:23.45` style timecode with centiseconds, or `1:02:03.45` past an hour. */
export const formatTimecode = (timeMs: number): string => {
  const safe = Math.max(0, Math.round(timeMs));
  const centis = Math.floor((safe % 1000) / 10);
  const totalSeconds = Math.floor(safe / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const two = (value: number) => String(value).padStart(2, '0');

  return hours > 0
    ? `${hours}:${two(minutes)}:${two(seconds)}.${two(centis)}`
    : `${two(minutes)}:${two(seconds)}.${two(centis)}`;
};

/**
 * Pulls `valueMs` onto the nearest of `points` when one is within
 * `thresholdMs`; otherwise returns it unchanged.
 */
export const snapToPoints = (
  valueMs: number,
  points: readonly number[],
  thresholdMs: number,
): number => {
  let best = valueMs;
  let bestDistance = thresholdMs;

  for (const point of points) {
    const distance = Math.abs(point - valueMs);

    if (distance <= bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }

  return best;
};
