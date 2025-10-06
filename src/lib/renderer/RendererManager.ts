/* eslint-disable @typescript-eslint/no-explicit-any */
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
    const existingElements = new Map<string, any>();

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

          // Apply filters using the new logic
          if (existingElement instanceof PIXI.Sprite) {
            const filters = {
              brightness: element.filters.brightness ?? 1,
              contrast: element.filters.contrast ?? 1,
              sharpness: element.filters.sharpness ?? 0,
              saturation: element.filters.saturation ?? 1,
              hue: element.filters.hue ?? 0,
              blur: element.filters.blur ?? 0,
              sepia: element.filters.sepia ?? 0,
              grayscale: element.filters.grayscale ?? 0,
              invert: element.filters.invert ?? 0,
              vibrance: element.filters.vibrance ?? 0,
              gamma: element.filters.gamma ?? 1,
              noise: element.filters.noise ?? 0,
            };
            applyFilters(existingElement, filters);
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
            this.app.stage.addChild(sprite);
          });
        } else if (element.type === 'video') {
          renderVideo(element, this.app, videoRef, (sprite) => {
            sprite.name = element.id; // Assign a unique name for tracking
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
