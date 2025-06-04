import * as PIXI from 'pixi.js';
import { EditorElement } from '@/types/editor';
import { renderImage } from './imageProcessor';
import { renderVideo } from './videoProcessor';

export class RendererManager {
  private app: PIXI.Application;

  constructor(app: PIXI.Application) {
    this.app = app;
  }

  render(
    element: EditorElement,
    videoRef: React.MutableRefObject<HTMLVideoElement | null>,
  ) {
    this.app.stage.removeChildren();

    if (element.type === 'image') {
      renderImage(element, this.app, (sprite) => {
        this.app.stage.addChild(sprite);
      });
    } else if (element.type === 'video') {
      renderVideo(element, this.app, videoRef, (sprite) => {
        this.app.stage.addChild(sprite);
      });
    }
  }
}
