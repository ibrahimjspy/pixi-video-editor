import { useEditorStore } from '@/store/editorStore';
import { usePlaybackStore } from '@/store/playbackStore';
import { canSplitSpanAt, getProjectLayerSpan } from '@/lib/editor/timeline';

/**
 * Timeline edits that combine the project (which layer is selected) with the
 * playhead (where to cut). Used by both the toolbar and the keyboard so they
 * cannot disagree about what is allowed.
 */

/** The selected layer, if the playhead is far enough inside it to split there. */
export const getSplittableLayerId = (): string | null => {
  const { project } = useEditorStore.getState();
  const layerId = project.selection.layerId;
  const layer = project.layers.find((entry) => entry.id === layerId);

  if (!layer) {
    return null;
  }

  const atMs = Math.round(usePlaybackStore.getState().currentMs);

  return canSplitSpanAt(getProjectLayerSpan(project, layer), atMs) ? layer.id : null;
};

/** Cuts the selected layer at the playhead. Returns whether a cut was made. */
export const splitSelectedAtPlayhead = (): boolean => {
  const layerId = getSplittableLayerId();

  if (!layerId) {
    return false;
  }

  useEditorStore
    .getState()
    .executeCommand(
      { type: 'split_layer', layerId, atMs: Math.round(usePlaybackStore.getState().currentMs) },
      'user',
    );

  return true;
};

/** Deletes the selected layer and closes the gap it leaves. */
export const rippleDeleteSelected = (): boolean => {
  const layerId = useEditorStore.getState().project.selection.layerId;

  if (!layerId) {
    return false;
  }

  useEditorStore.getState().executeCommand({ type: 'delete_layer', layerId, ripple: true }, 'user');

  return true;
};
