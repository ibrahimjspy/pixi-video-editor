export type AssetKind = 'image' | 'video';

export type LayerType = AssetKind | 'text';

export type CanvasAspectRatio = '16:9' | '9:16' | '1:1';

export interface FilterSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  vibrance: number;
  gamma: number;
  sepia: number;
  grayscale: number;
  invert: number;
  blur: number;
  sharpness: number;
  kawaseBlur: number;
  zoomBlur: number;
  tiltShift: number;
  bulgePinch: number;
  twist: number;
  shockwave: number;
  displacement: number;
  glow: number;
  outline: number;
  dropShadow: number;
  bevel: number;
  emboss: number;
  pixelate: number;
  dot: number;
  crossHatch: number;
  crt: number;
  oldFilm: number;
  ascii: number;
  noise: number;
  bloom: number;
  godray: number;
  reflection: number;
  waterReflection: number;
  rgbSplit: number;
  colorReplace: number;
  multiColorReplace: number;
}

export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  url: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
  importedAt: string;
}

export interface LayerFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface BaseLayer extends LayerFrame {
  id: string;
  name: string;
  type: LayerType;
  zIndex: number;
  visible: boolean;
  muted: boolean;
  filters: FilterSettings;
  opacity: number;
  blendMode?: string;
  animationPreset?: string | null;
  /**
   * Timeline groundwork: when the layer starts inside its scene. No playback
   * behaviour reads this yet; it is populated so a later time engine has data.
   */
  startMs?: number;
  /** Timeline groundwork: how long the layer stays on screen. */
  durationMs?: number;
}

export interface ImageLayer extends BaseLayer {
  type: 'image';
  assetId: string;
}

export interface VideoLayer extends BaseLayer {
  type: 'video';
  assetId: string;
  trimStartMs: number;
  trimEndMs: number | null;
}

export interface TextLayer extends BaseLayer {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  align: 'left' | 'center' | 'right';
}

export type Layer = ImageLayer | VideoLayer | TextLayer;

export type FilterPresetName =
  | 'clean'
  | 'cinematic'
  | 'vibrant'
  | 'noir'
  | 'spotlight';

/**
 * A partial edit to one layer.
 *
 * Identity and ordering fields (`id`, `type`, `zIndex`, `assetId`) are
 * deliberately absent. `filters` is merged onto the layer's current filters
 * instead of replacing them. Text-only and video-only fields are ignored when
 * the target layer is of another type.
 */
export type LayerPatch = Partial<LayerFrame> &
  Partial<
    Pick<
      BaseLayer,
      | 'name'
      | 'visible'
      | 'muted'
      | 'opacity'
      | 'blendMode'
      | 'animationPreset'
      | 'startMs'
      | 'durationMs'
    >
  > &
  Partial<Pick<TextLayer, 'text' | 'fontSize' | 'fontFamily' | 'color' | 'align'>> &
  Partial<Pick<VideoLayer, 'trimStartMs' | 'trimEndMs'>> & {
    filters?: Partial<FilterSettings>;
  };

export interface Scene {
  id: string;
  name: string;
  durationMs: number;
  aspectRatio: CanvasAspectRatio;
  canvasWidth: number;
  canvasHeight: number;
  layerIds: string[];
}

export interface Selection {
  sceneId: string | null;
  layerId: string | null;
  assetId: string | null;
}

export interface Project {
  id: string;
  name: string;
  scenes: Scene[];
  currentSceneId: string;
  assets: Asset[];
  layers: Layer[];
  selection: Selection;
  createdAt: string;
  updatedAt: string;
}

export type ProviderKind = 'anthropic' | 'gemini';

export interface AnthropicConfig {
  provider: 'anthropic';
  apiKey: string;
  model: string;
}

export interface GeminiConfig {
  provider: 'gemini';
  apiKey: string;
  model: string;
}

export type ProviderConfig = AnthropicConfig | GeminiConfig;

/**
 * Every command type is also a valid AI action type. Deriving the union keeps
 * the planner, tool contracts, and command executor from drifting apart.
 */
export type AiActionType = Command['type'];

export interface AiAction {
  id: string;
  type: AiActionType;
  title: string;
  reason: string;
  status: 'pending' | 'ready' | 'applied' | 'failed';
  destructive?: boolean;
  payload: Command;
}

export interface AiPlan {
  id: string;
  sessionId: string;
  prompt: string;
  summary: string;
  rationale: string[];
  actions: AiAction[];
  warnings: string[];
  createdAt: string;
}

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface ToolResult {
  commandId: string;
  type: Command['type'];
  ok: boolean;
  summary: string;
  warnings: string[];
}

export interface VersionSnapshot {
  id: string;
  label: string;
  createdAt: string;
  source: 'user' | 'ai';
  project: Project;
}

export interface CommandRecord {
  id: string;
  source: 'user' | 'ai';
  createdAt: string;
  command: Command;
  result: ToolResult;
}

export type Command =
  | {
      type: 'import_asset';
      asset: Asset;
      placeOnCanvas?: boolean;
    }
  | {
      type: 'create_text';
      text: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      fontSize?: number;
      color?: string;
      fontFamily?: string;
    }
  | {
      type: 'set_canvas_ratio';
      aspectRatio: CanvasAspectRatio;
    }
  | {
      type: 'move_layer';
      layerId: string;
      x: number;
      y: number;
    }
  | {
      type: 'resize_layer';
      layerId: string;
      width: number;
      height: number;
    }
  | {
      type: 'trim_clip';
      layerId: string;
      trimStartMs: number;
      trimEndMs: number | null;
    }
  | {
      type: 'reorder_layer';
      layerId: string;
      toIndex: number;
    }
  | {
      type: 'apply_filter_preset';
      layerId: string;
      preset: FilterPresetName;
    }
  | {
      type: 'set_style_params';
      layerId: string;
      params: Partial<
        Pick<Layer, 'opacity' | 'rotation'> & {
          color: string;
          fontSize: number;
          fontFamily: string;
        }
      >;
    }
  | {
      type: 'add_caption_block';
      text: string;
    }
  | {
      type: 'apply_animation_preset';
      layerId: string;
      preset: 'drift-in' | 'punch-zoom' | 'soft-fade';
    }
  | {
      type: 'mute_or_hide_layer';
      layerId: string;
      muted?: boolean;
      visible?: boolean;
    }
  | {
      type: 'delete_layer';
      layerId: string;
    }
  | {
      /** Sets any subset of a layer's frame as one undoable edit. */
      type: 'set_layer_frame';
      layerId: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      rotation?: number;
    }
  | {
      /** Merges individual filter values onto the layer's current filters. */
      type: 'set_filters';
      layerId: string;
      filters: Partial<FilterSettings>;
    }
  | {
      type: 'reset_filters';
      layerId: string;
    }
  | {
      /** Edits the content or typography of a text layer. */
      type: 'update_text';
      layerId: string;
      text?: string;
      fontSize?: number;
      fontFamily?: string;
      color?: string;
      align?: TextLayer['align'];
    }
  | {
      type: 'duplicate_layer';
      layerId: string;
    }
  | {
      type: 'rename_layer';
      layerId: string;
      name: string;
    }
  | {
      /**
       * Generic layer edit. Also the audit record written when a transient
       * slider gesture is committed from the store.
       */
      type: 'patch_layer';
      layerId: string;
      patch: LayerPatch;
    }
  | {
      type: 'undo';
    }
  | {
      type: 'redo';
    }
  | {
      type: 'export_preview';
      format: 'mp4' | 'webm' | 'png-sequence';
    };
