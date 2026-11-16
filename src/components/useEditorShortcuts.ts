import { useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { usePlaybackStore } from '@/store/playbackStore';
import { getTimelineDurationMs } from '@/lib/editor/timeline';
import { rippleDeleteSelected, splitSelectedAtPlayhead } from '@/lib/editor/timelineActions';

/** Whether keystrokes aimed at this element belong to a text or value editor. */
const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
};

const NUDGE: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/**
 * Registers the editor's global keyboard shortcuts once, on `window`.
 *
 * - Space plays or pauses; Home/End jump to the start/end
 * - `,` and `.` step one frame back/forward (Shift: one second)
 * - S splits the selected layer at the playhead
 * - Cmd/Ctrl+Z undo; Shift+Cmd/Ctrl+Z or Ctrl+Y redo
 * - Delete/Backspace deletes the selected layer; with Shift it also closes the gap
 * - Cmd/Ctrl+D duplicates it
 * - Arrow keys nudge it by 1px (Shift: 10px), one undo step per key press
 *
 * Nothing fires while focus is in an input, textarea, select, or
 * contenteditable element, so native text editing keeps working. The handler
 * reads the store imperatively and subscribes to nothing.
 */
export const useEditorShortcuts = () => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) {
        return;
      }

      // A dialog is open: keys belong to it, not to the editor behind it.
      if (document.querySelector('[aria-modal="true"]')) {
        return;
      }

      const playback = usePlaybackStore.getState();

      // An export owns the preview; nothing else may move it or the project.
      if (playback.isLocked) {
        return;
      }

      const store = useEditorStore.getState();
      const hasModifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (!hasModifier && !event.altKey) {
        if (event.key === ' ') {
          event.preventDefault();
          playback.toggle();
          return;
        }

        if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          playback.seek(event.key === 'Home' ? 0 : getTimelineDurationMs(store.project), {
            pause: true,
          });
          return;
        }

        if (event.key === ',' || event.key === '.' || event.key === '<' || event.key === '>') {
          event.preventDefault();
          const direction = event.key === ',' || event.key === '<' ? -1 : 1;
          playback.stepFrames(direction * (event.shiftKey ? 30 : 1));
          return;
        }

        if (key === 's' && !event.shiftKey) {
          event.preventDefault();
          splitSelectedAtPlayhead();
          return;
        }
      }

      if (hasModifier && !event.altKey && key === 'z') {
        event.preventDefault();

        if (event.shiftKey) {
          store.redo();
        } else {
          store.undo();
        }
        return;
      }

      if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && key === 'y') {
        event.preventDefault();
        store.redo();
        return;
      }

      const layerId = store.project.selection.layerId;

      if (!layerId) {
        return;
      }

      if (hasModifier && !event.altKey && !event.shiftKey && key === 'd') {
        event.preventDefault();
        store.executeCommand({ type: 'duplicate_layer', layerId }, 'user');
        return;
      }

      if (hasModifier || event.altKey) {
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();

        if (event.shiftKey) {
          rippleDeleteSelected();
        } else {
          store.executeCommand({ type: 'delete_layer', layerId }, 'user');
        }
        return;
      }

      const direction = NUDGE[event.key];
      const layer = direction
        ? store.project.layers.find((entry) => entry.id === layerId)
        : undefined;

      if (direction && layer) {
        const distance = event.shiftKey ? 10 : 1;

        event.preventDefault();
        store.executeCommand(
          {
            type: 'set_layer_frame',
            layerId,
            x: layer.x + direction.x * distance,
            y: layer.y + direction.y * distance,
          },
          'user',
        );
      }
    };

    // A focused button would otherwise also "click" when Space is released,
    // for example re-running Split right after the user pressed Space to play.
    const handleKeyUp = (event: KeyboardEvent) => {
      if (
        event.key === ' ' &&
        !isEditableTarget(event.target) &&
        !document.querySelector('[aria-modal="true"]')
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
};
