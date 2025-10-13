import * as PIXI from 'pixi.js';
import { useEditorStore } from '@/store/editorStore';

export const makeInteractive = (sprite: PIXI.Sprite | PIXI.Text, elementId: string) => {
  const updateElement = useEditorStore.getState().updateElement;

  sprite.interactive = true;

  let isDragging = false;
  let isResizing = false;
  let startX = 0;
  let startY = 0;
  let startWidth = sprite.width;
  let startHeight = sprite.height;

  let debounceTimeout: NodeJS.Timeout | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const debounceUpdate = (updates: Record<string, any>) => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      updateElement(elementId, updates);
    }, 16); // ~60fps for smooth updates
  };

  const resizeHandle = new PIXI.Graphics();
  // Create a more visible resize handle like CapCut
  resizeHandle.rect(0, 0, 20, 20);
  resizeHandle.fill({ color: 0x3b82f6, alpha: 0 }); // Initially transparent
  resizeHandle.stroke({ color: 0xffffff, width: 2 }); // White border
  resizeHandle.eventMode = 'static';
  resizeHandle.cursor = 'nwse-resize';
  resizeHandle.name = 'resizeHandle'; // Add name for tracking
  resizeHandle.alpha = 0; // Start invisible
  
  // Position in bottom-right corner (relative to sprite bounds)
  // Make sure the handle is positioned correctly relative to sprite dimensions
  const handleX = Math.max(0, sprite.width - 20);
  const handleY = Math.max(0, sprite.height - 20);
  resizeHandle.x = handleX;
  resizeHandle.y = handleY;

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
        
        // Calculate new dimensions with minimum constraints
        const newWidth = Math.max(20, startWidth + deltaX);
        const newHeight = Math.max(20, startHeight + deltaY);

        // Update sprite dimensions immediately for smooth visual feedback
        sprite.width = newWidth;
        sprite.height = newHeight;
        
        // Update resize handle position to stay in bottom-right corner
        const newHandleX = Math.max(0, newWidth - 20);
        const newHandleY = Math.max(0, newHeight - 20);
        resizeHandle.x = newHandleX;
        resizeHandle.y = newHandleY;

        // For text elements, update word wrap width
        if (sprite instanceof PIXI.Text) {
          sprite.style.wordWrapWidth = newWidth;
        }

        // Update store immediately for canvas editing (no debounce)
        updateElement(elementId, {
          width: newWidth,
          height: newHeight,
        });
      }
    })
    .on('pointerup', () => {
      isResizing = false;
      resizeHandle.alpha = 0; // Hide after resize
    })
    .on('pointerupoutside', () => {
      isResizing = false;
      resizeHandle.alpha = 0; // Hide after resize
    });

  sprite.addChild(resizeHandle);

  // Show resize handle on hover with smooth transition
  sprite.on('pointerover', () => {
    resizeHandle.alpha = 1.0; // Fully visible on hover
  });

  // Hide resize handle when not hovering
  sprite.on('pointerout', () => {
    if (!isResizing) {
      resizeHandle.alpha = 0;
    }
  });

  // Keep handle visible while resizing
  resizeHandle.on('pointerover', () => {
    resizeHandle.alpha = 1.0;
  });

  resizeHandle.on('pointerout', () => {
    if (!isResizing) {
      resizeHandle.alpha = 0;
    }
  });

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

        // Update store immediately for canvas editing (no debounce)
        updateElement(elementId, {
          x: newX,
          y: newY,
        });
      }
    })
    .on('pointerup', () => (isDragging = false))
    .on('pointerupoutside', () => (isDragging = false));
};
