import { useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';

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
 * - Cmd/Ctrl+Z undo; Shift+Cmd/Ctrl+Z or Ctrl+Y redo
 * - Delete/Backspace deletes the selected layer
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

      const store = useEditorStore.getState();
      const hasModifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

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
        store.executeCommand({ type: 'delete_layer', layerId }, 'user');
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

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
};
