// types/editor.ts
export type ElementType = 'image' | 'video' | 'text';

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  filters: {
    brightness: number;
    contrast: number;
    sharpness: number;
  };
}

export interface ImageElement extends BaseElement {
  type: 'image';
  file: File;
  url: string;
}

export interface VideoElement extends BaseElement {
  type: 'video';
  file: File;
  url: string;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
}

export type EditorElement = ImageElement | VideoElement | TextElement;
