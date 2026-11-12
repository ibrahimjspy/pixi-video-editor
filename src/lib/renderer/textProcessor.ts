import * as PIXI from 'pixi.js';
import { TextLayer } from '@/types/editor';

const ALIGN_FACTOR: Record<TextLayer['align'], number> = {
  left: 0,
  center: 0.5,
  right: 1,
};

/** Creates an unplaced text display object for a layer. */
export const createTextDisplay = (layer: TextLayer): PIXI.Text =>
  new PIXI.Text({
    text: layer.text,
    style: {
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      fill: layer.color,
      align: layer.align,
      wordWrap: true,
      wordWrapWidth: layer.width,
    },
  });

/**
 * Updates text content and style in place, touching only what changed so an
 * unchanged layer does not trigger a re-rasterise.
 *
 * `boxWidth` is the layer's wrap width. Width/height are never set on the
 * display object: that would scale the glyphs instead of re-wrapping them.
 */
export const updateTextDisplay = (
  text: PIXI.Text,
  layer: TextLayer,
  boxWidth: number,
) => {
  const style = text.style;

  if (text.text !== layer.text) {
    text.text = layer.text;
  }
  if (style.fontFamily !== layer.fontFamily) {
    style.fontFamily = layer.fontFamily;
  }
  if (style.fontSize !== layer.fontSize) {
    style.fontSize = layer.fontSize;
  }
  if (style.fill !== layer.color) {
    style.fill = layer.color;
  }
  if (style.align !== layer.align) {
    style.align = layer.align;
  }
  if (style.wordWrapWidth !== boxWidth) {
    style.wordWrapWidth = boxWidth;
  }

  // Pixi aligns lines within the widest line, not within the wrap width, so
  // shift the glyphs inside the layer box. Using the pivot keeps the layer's
  // top-left as the rotation origin.
  const inset = (boxWidth - text.width) * ALIGN_FACTOR[layer.align];
  text.pivot.set(-inset, 0);

  // Make the whole box draggable, not just the glyph bounds.
  const hitArea = text.hitArea instanceof PIXI.Rectangle ? text.hitArea : new PIXI.Rectangle();
  hitArea.x = -inset;
  hitArea.y = 0;
  hitArea.width = boxWidth;
  hitArea.height = text.height;
  text.hitArea = hitArea;
};
