import * as PIXI from 'pixi.js';
import { useEditorStore } from '@/store/editorStore';

export const makeInteractive = (sprite: PIXI.Sprite, elementId: string) => {
  const updateElement = useEditorStore.getState().updateElement;

  sprite.interactive = true;

  let isDragging = false;
  let isResizing = false;
  let startX = 0;
  let startY = 0;
  let startWidth = sprite.width;
  let startHeight = sprite.height;

  let debounceTimeout: NodeJS.Timeout | null = null;

  const debounceUpdate = (updates: Record<string, any>) => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      updateElement(elementId, updates);
    }, 100); // Adjust debounce delay as needed
  };

  const resizeHandle = new PIXI.Graphics();
  resizeHandle.beginFill(0xffffff);
  resizeHandle.drawRect(0, 0, 10, 10);
  resizeHandle.endFill();
  resizeHandle.interactive = true;
  resizeHandle.cursor = 'nwse-resize';
  resizeHandle.x = sprite.width - 10;
  resizeHandle.y = sprite.height - 10;

  resizeHandle
    .on('pointerdown', (event) => {
      isResizing = true;
      const { x, y } = event.data.global;
      startX = x;
      startY = y;
      startWidth = sprite.width;
      startHeight = sprite.height;
    })
    .on('pointermove', (event) => {
      if (isResizing) {
        const { x, y } = event.data.global;
        const deltaX = x - startX;
        const deltaY = y - startY;
        const newWidth = Math.max(50, startWidth + deltaX);
        const newHeight = Math.max(50, startHeight + deltaY);

        sprite.width = newWidth;
        sprite.height = newHeight;
        resizeHandle.x = sprite.width - 10;
        resizeHandle.y = sprite.height - 10;

        debounceUpdate({
          width: newWidth,
          height: newHeight,
        });
      }
    })
    .on('pointerup', () => (isResizing = false))
    .on('pointerupoutside', () => (isResizing = false));

  sprite.addChild(resizeHandle);

  sprite
    .on('pointerdown', (event) => {
      if (!isResizing) {
        isDragging = true;
        const { x, y } = event.data.global;
        startX = x - sprite.x;
        startY = y - sprite.y;
      }
    })
    .on('pointermove', (event) => {
      if (isDragging) {
        const { x, y } = event.data.global;
        const newX = x - startX;
        const newY = y - startY;
        sprite.x = newX;
        sprite.y = newY;

        debounceUpdate({
          x: newX,
          y: newY,
        });
      }
    })
    .on('pointerup', () => (isDragging = false))
    .on('pointerupoutside', () => (isDragging = false));
};
