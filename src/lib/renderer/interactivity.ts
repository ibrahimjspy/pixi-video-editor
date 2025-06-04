import * as PIXI from 'pixi.js';

export const makeInteractive = (sprite: PIXI.Sprite) => {
  sprite.interactive = true;

  let isDragging = false;
  let isResizing = false;
  let startX = 0;
  let startY = 0;
  let startWidth = sprite.width;
  let startHeight = sprite.height;

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
        sprite.width = Math.max(50, startWidth + deltaX);
        sprite.height = Math.max(50, startHeight + deltaY);
        resizeHandle.x = sprite.width - 10;
        resizeHandle.y = sprite.height - 10;
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
        sprite.x = x - startX;
        sprite.y = y - startY;
      }
    })
    .on('pointerup', () => (isDragging = false))
    .on('pointerupoutside', () => (isDragging = false));
};
