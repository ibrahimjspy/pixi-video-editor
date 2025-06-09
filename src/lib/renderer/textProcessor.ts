import * as PIXI from 'pixi.js';
import { TextElement } from '@/types/editor';
import { makeInteractive } from './interactivity';

export const renderText = (
  element: TextElement,
  app: PIXI.Application,
  onReady: (text: PIXI.Text) => void,
) => {
  const style = new PIXI.TextStyle({
    fontFamily: element.fontFamily || 'Arial',
    fontSize: element.fontSize || 32,
    fill: element.color || '#000000',
    align: 'center',
    wordWrap: true,
    wordWrapWidth: element.width || app.screen.width,
  });

  const text = new PIXI.Text(element.text, style);

  text.x = element.x;
  text.y = element.y;
  text.rotation = element.rotation || 0;

  // Ensure the text is interactive and draggable
  makeInteractive(text, element.id);

  // Set zIndex to ensure text is above other elements
  text.zIndex = 10; // Adjust as needed to ensure proper layering
  app.stage.sortableChildren = true; // Enable sorting by zIndex
  app.stage.addChild(text);

  onReady(text);
};
