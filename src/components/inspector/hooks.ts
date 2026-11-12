import { useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/store/editorStore';
import { getCurrentScene } from '@/lib/editor/defaults';
import type { Layer } from '@/types/editor';

/** The id of the selected layer, or `null`. */
export const useSelectedLayerId = (): string | null =>
  useEditorStore((state) => state.project.selection.layerId);

/**
 * Subscribes to a few fields of one layer.
 *
 * `pick` must return a flat object of primitives (or stable references). The
 * component re-renders only when one of those values changes, so a slider that
 * edits another field of the same layer does not re-render it.
 *
 * @returns The picked fields, or `null` when the layer does not exist.
 */
export const useLayerFields = <T extends object>(
  layerId: string,
  pick: (layer: Layer) => T,
): T | null =>
  useEditorStore(
    useShallow((state) => {
      const layer = state.project.layers.find((entry) => entry.id === layerId);
      return layer ? pick(layer) : null;
    }),
  );

/** Size and ratio of the active scene's canvas. */
export const useCanvasSize = () =>
  useEditorStore(
    useShallow((state) => {
      const scene = getCurrentScene(state.project);

      return {
        aspectRatio: scene.aspectRatio,
        width: scene.canvasWidth,
        height: scene.canvasHeight,
      };
    }),
  );

interface GestureOptions {
  /** Pass `false` to keep the gesture out of version history. */
  snapshot?: boolean;
}

/**
 * Event handlers that end a `previewLayerPatch` gesture on a continuous
 * control, so the whole drag or key-hold becomes one undo step.
 *
 * Spread the result onto the `<input>`; call `previewLayerPatch` from its
 * `onChange`. The pointer release is observed on `window` because a slider
 * thumb is often released outside the element. Escape cancels the gesture.
 */
export const useGestureHandlers = (label: string, options?: GestureOptions) => {
  const snapshot = options?.snapshot;

  const commit = useCallback(() => {
    useEditorStore
      .getState()
      .commitLayerPatch(label, snapshot === undefined ? undefined : { snapshot });
  }, [label, snapshot]);

  const onPointerDown = useCallback(() => {
    const finish = () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      commit();
    };

    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }, [commit]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      useEditorStore.getState().cancelLayerPatch();
    }
  }, []);

  const onKeyUp = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Escape') {
        commit();
      }
    },
    [commit],
  );

  return { onPointerDown, onKeyDown, onKeyUp, onBlur: commit };
};
