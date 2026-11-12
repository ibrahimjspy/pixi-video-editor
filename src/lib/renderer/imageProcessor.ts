import * as PIXI from 'pixi.js';

/**
 * Decodes an image asset and wraps it in a sprite with its own texture.
 *
 * The sprite is returned unplaced: the RendererManager decides whether the
 * layer is still wanted once decoding finishes and applies its latest state.
 */
export const loadImageSprite = async (url: string): Promise<PIXI.Sprite> => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;

  await image.decode();

  return new PIXI.Sprite(PIXI.Texture.from(image));
};
