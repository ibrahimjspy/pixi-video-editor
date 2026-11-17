export type AssetKind = 'image' | 'video';

export type LayerType = AssetKind | 'text' | 'adjustment';

export type CanvasAspectRatio = '16:9' | '9:16' | '1:1';

/** A single value of an effect control: a number, a colour or option, or a switch. */
export type EffectParamValue = number | string | boolean;

export type EffectParams = Record<string, EffectParamValue>;

/**
 * One effect in a layer's stack. `type` names an entry of the effect registry
 * (`src/lib/effects/registry.ts`); `params` holds that effect's controls.
 */
export interface EffectInstance {
  id: string;
  type: string;
  enabled: boolean;
  params: EffectParams;
}

/** A named look from the look library, blended in at `intensity` (0 to 1). */
export interface LayerLook {
  id: string;
  intensity: number;
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
  /** Effects applied in order, after the look. */
  effects: EffectInstance[];
  /** Colour look applied before the effect stack. */
  look?: LayerLook | null;
  opacity: number;
  blendMode?: string;
  animationPreset?: string | null;
  /** When the layer first appears on the timeline, in milliseconds. Defaults to 0. */
  startMs?: number;
  /**
   * How long the layer stays on the timeline. For video layers this always
   * equals the trimmed source length (`trimEndMs - trimStartMs`).
   */
  durationMs?: number;
}

export interface ImageLayer extends BaseLayer {
  type: 'image';
  assetId: string;
}

export interface VideoLayer extends BaseLayer {
  type: 'video';
  assetId: string;
  /** Where playback begins inside the source file, in milliseconds. */
  trimStartMs: number;
  /** Where playback ends inside the source file. `null` means the end of the file. */
  trimEndMs: number | null;
  /** Playback volume from 0 to 1. Missing means full volume. */
  volume?: number;
}

export interface TextLayer extends BaseLayer {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  align: 'left' | 'center' | 'right';
}

/**
 * A layer with no picture of its own: its look and effects are applied to
 * everything beneath it, for as long as it lasts on the timeline.
 */
export interface AdjustmentLayer extends BaseLayer {
  type: 'adjustment';
}

export type Layer = ImageLayer | VideoLayer | TextLayer | AdjustmentLayer;

/** A layer that shows an imported image or video. */
export type MediaLayer = ImageLayer | VideoLayer;

/**
 * A partial edit to one layer.
 *
 * Identity and ordering fields (`id`, `type`, `zIndex`, `assetId`) are
 * deliberately absent. `effectParams` and `effectEnabled` are keyed by effect
 * id and merged onto the matching effects in the layer's stack; ids that are
 * not in the stack are ignored. Text-only and video-only fields are ignored
 * when the target layer is of another type.
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
  Partial<Pick<VideoLayer, 'trimStartMs' | 'trimEndMs' | 'volume'>> & {
    effectParams?: Record<string, EffectParams>;
    effectEnabled?: Record<string, boolean>;
    lookIntensity?: number;
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
      /**
       * Closes the gap the layer leaves: layers that start at or after its end
       * move earlier by its length.
       */
      ripple?: boolean;
    }
  | {
      /**
       * Cuts a layer in two at a timeline position. The first part keeps the
       * layer's id; the second part is a new layer placed directly above it.
       */
      type: 'split_layer';
      layerId: string;
      atMs: number;
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
      /** Adds an effect to a layer's stack. `effect` is a registry type id. */
      type: 'add_effect';
      layerId: string;
      effect: string;
      params?: EffectParams;
      /** Position in the stack. Defaults to the end (applied last). */
      index?: number;
    }
  | {
      /** Changes controls of one effect, and/or switches it on or off. */
      type: 'update_effect';
      layerId: string;
      effectId: string;
      params?: EffectParams;
      enabled?: boolean;
    }
  | {
      type: 'remove_effect';
      layerId: string;
      effectId: string;
    }
  | {
      type: 'reorder_effect';
      layerId: string;
      effectId: string;
      toIndex: number;
    }
  | {
      /**
       * Replaces a layer's whole effect stack, and its look when `look` is
       * given. Used to paste effects from another layer.
       */
      type: 'set_effects';
      layerId: string;
      effects: Array<{ type: string; params?: EffectParams; enabled?: boolean }>;
      look?: { id: string; intensity?: number } | null;
    }
  | {
      /** Removes every effect and the look from a layer. */
      type: 'clear_effects';
      layerId: string;
    }
  | {
      /** Sets or removes (`look: null`) a layer's look. */
      type: 'set_look';
      layerId: string;
      look: string | null;
      intensity?: number;
    }
  | {
      /** Adds a layer whose effects apply to everything beneath it. */
      type: 'add_adjustment_layer';
      name?: string;
      startMs?: number;
      durationMs?: number;
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
