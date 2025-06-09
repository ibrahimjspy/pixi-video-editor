import * as PIXI from 'pixi.js';
import { EditorElement } from '@/types/editor';
import { renderImage } from './imageProcessor';
import { renderVideo } from './videoProcessor';
import { renderText } from './textProcessor';
import { applyFilters } from './filters'; // Import the filters logic

export class RendererManager {
  private app: PIXI.Application;

  constructor(app: PIXI.Application) {
    this.app = app;
  }

  renderAll(
    elements: EditorElement[],
    videoRef: React.MutableRefObject<HTMLVideoElement | null>,
  ) {
    const existingElements = new Map<string, PIXI.DisplayObject>();

    // Store existing elements by their IDs
    for (const child of this.app.stage.children) {
      if (child.name) {
        existingElements.set(child.name, child);
      }
    }

    for (const element of elements) {
      if (existingElements.has(element.id)) {
        // Update existing element properties
        const existingElement = existingElements.get(element.id);
        if (existingElement) {
          existingElement.x = element.x;
          existingElement.y = element.y;
          existingElement.rotation = element.rotation || 0;

          // Apply filters using the existing logic
          if (existingElement instanceof PIXI.Sprite) {
            applyFilters(
              existingElement,
              element.filters.brightness,
              element.filters.contrast,
            );
          }

          if (element.type === 'text' && existingElement instanceof PIXI.Text) {
            existingElement.text = element.text;
            existingElement.style = new PIXI.TextStyle({
              fontFamily: element.fontFamily || 'Arial',
              fontSize: element.fontSize || 32,
              fill: element.color || '#000000',
              align: 'center',
              wordWrap: true,
              wordWrapWidth: element.width || this.app.screen.width,
            });
          }
        }
      } else {
        // Render new elements
        if (element.type === 'image') {
          renderImage(element, this.app, (sprite) => {
            sprite.name = element.id; // Assign a unique name for tracking
            applyFilters(
              sprite,
              element.filters.brightness,
              element.filters.contrast,
            );
            this.app.stage.addChild(sprite);
          });
        } else if (element.type === 'video') {
          renderVideo(element, this.app, videoRef, (sprite) => {
            sprite.name = element.id; // Assign a unique name for tracking
            applyFilters(
              sprite,
              element.filters.brightness,
              element.filters.contrast,
            );
            this.app.stage.addChild(sprite);
          });
        } else if (element.type === 'text') {
          renderText(element, this.app, (text) => {
            text.name = element.id; // Assign a unique name for tracking
            this.app.stage.addChild(text);
          });
        }
      }
    }

    // Remove elements that are no longer in the `elements` array
    for (const [id, displayObject] of existingElements) {
      if (!elements.find((element) => element.id === id)) {
        this.app.stage.removeChild(displayObject);
      }
    }
  }
}
