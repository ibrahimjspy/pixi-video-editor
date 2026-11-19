import { LayerPatch, LayerType } from '@/types/editor';
import { MIN_CLIP_MS, snapToPoints } from '@/lib/editor/timeline';

export type ClipDragMode = 'move' | 'left' | 'right';

/** A clip as it was when the drag began. */
export interface ClipOrigin {
  type: LayerType;
  startMs: number;
  endMs: number;
  trimStartMs: number;
  trimEndMs: number | null;
  /** Length of the whole source file, for video clips. */
  assetDurationMs?: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/**
 * Turns a horizontal drag of `deltaMs` into the layer patch it means.
 *
 * - `move` slides the clip without changing what it plays.
 * - `left` and `right` trim an edge. For a video the trim never goes past the
 *   ends of the source file, and the clip's content stays put on the timeline:
 *   dragging the left edge in drops the beginning, it does not slide the clip.
 *
 * The result is always complete for the mode (a video trim carries both trim
 * points), so applying it is deterministic whatever the layer held before.
 */
export const computeClipDragPatch = (
  mode: ClipDragMode,
  origin: ClipOrigin,
  deltaMs: number,
  snapPoints: readonly number[],
  thresholdMs: number,
): LayerPatch => {
  const length = origin.endMs - origin.startMs;
  const snap = (value: number) => snapToPoints(value, snapPoints, thresholdMs);

  if (mode === 'move') {
    const wanted = Math.max(0, origin.startMs + deltaMs);
    const candidates = [snap(wanted), snap(wanted + length) - length].filter(
      (candidate) => candidate !== wanted,
    );
    const best = candidates.length
      ? candidates.reduce((a, b) => (Math.abs(a - wanted) <= Math.abs(b - wanted) ? a : b))
      : wanted;

    return { startMs: Math.round(Math.max(0, best)) };
  }

  const isVideo = origin.type === 'video';
  const sourceEndMs =
    origin.trimEndMs ?? origin.assetDurationMs ?? origin.trimStartMs + length;

  if (mode === 'left') {
    const earliest = isVideo ? Math.max(0, origin.startMs - origin.trimStartMs) : 0;
    const startMs = Math.round(
      clamp(snap(origin.startMs + deltaMs), earliest, origin.endMs - MIN_CLIP_MS),
    );

    return isVideo
      ? {
          startMs,
          trimStartMs: origin.trimStartMs + (startMs - origin.startMs),
          trimEndMs: sourceEndMs,
        }
      : { startMs, durationMs: origin.endMs - startMs };
  }

  const latest =
    isVideo && origin.assetDurationMs !== undefined
      ? origin.startMs + (origin.assetDurationMs - origin.trimStartMs)
      : Number.POSITIVE_INFINITY;
  const endMs = Math.round(
    clamp(snap(origin.endMs + deltaMs), origin.startMs + MIN_CLIP_MS, latest),
  );

  return isVideo
    ? { trimStartMs: origin.trimStartMs, trimEndMs: origin.trimStartMs + (endMs - origin.startMs) }
    : { durationMs: endMs - origin.startMs };
};
