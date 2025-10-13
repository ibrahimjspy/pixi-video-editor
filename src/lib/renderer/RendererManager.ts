/* eslint-disable @typescript-eslint/no-explicit-any */
import * as PIXI from 'pixi.js';
import { EditorElement } from '@/types/editor';
import { renderImage } from './imageProcessor';
import { renderVideo } from './videoProcessor';
import { renderText } from './textProcessor';
import { applyFilters } from './filters'; // Import the filters logic
import { FILTER_DEFINITIONS } from './filterDefinitions';

// Helper function to ensure all filters are initialized
const ensureAllFilters = (element: EditorElement) => {
  const completeFilters: any = {};
  FILTER_DEFINITIONS.forEach(filter => {
    completeFilters[filter.key] = element.filters[filter.key as keyof typeof element.filters] ?? filter.default;
  });
  return completeFilters;
};

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
          existingElement.width = element.width;
          existingElement.height = element.height;
          existingElement.rotation = element.rotation || 0;

          // Apply filters using the new logic
          if (existingElement instanceof PIXI.Sprite) {
            const filters = ensureAllFilters(element);
            applyFilters(existingElement, filters);
          }

          // Update resize handle position if it exists
          const resizeHandle = existingElement.children.find((child: any) => child.name === 'resizeHandle');
          if (resizeHandle) {
            resizeHandle.x = Math.max(0, element.width - 20);
            resizeHandle.y = Math.max(0, element.height - 20);
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
            // Update text dimensions
            existingElement.width = element.width;
            existingElement.height = element.height;
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
