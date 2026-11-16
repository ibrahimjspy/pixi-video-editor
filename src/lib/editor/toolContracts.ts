import { AiActionType, Command } from '@/types/editor';

export interface ToolContract {
  type: AiActionType;
  title: string;
  description: string;
  destructive?: boolean;
  payloadExample: Command;
}

export const TOOL_CONTRACTS: ToolContract[] = [
  {
    type: 'import_asset',
    title: 'Import Asset',
    description: 'Register uploaded media and optionally place it onto the canvas.',
    payloadExample: {
      type: 'import_asset',
      asset: {
        id: 'asset-demo',
        kind: 'video',
        name: 'launch.mp4',
        url: 'blob:asset-demo',
        mimeType: 'video/mp4',
        importedAt: new Date().toISOString(),
      },
      placeOnCanvas: true,
    },
  },
  {
    type: 'create_text',
    title: 'Create Text',
    description: 'Create a new headline, caption, or text overlay on the active scene.',
    payloadExample: {
      type: 'create_text',
      text: 'Launch day is live',
      x: 84,
      y: 96,
      width: 620,
      height: 120,
      fontSize: 56,
      color: '#f4ecd8',
    },
  },
  {
    type: 'set_canvas_ratio',
    title: 'Set Canvas Ratio',
    description: 'Switch the project canvas to a supported format like 9:16 or 1:1.',
    payloadExample: {
      type: 'set_canvas_ratio',
      aspectRatio: '9:16',
    },
  },
  {
    type: 'move_layer',
    title: 'Move Layer',
    description: 'Reposition the selected layer on the Pixi canvas.',
    payloadExample: {
      type: 'move_layer',
      layerId: 'layer-demo',
      x: 64,
      y: 84,
    },
  },
  {
    type: 'resize_layer',
    title: 'Resize Layer',
    description: 'Resize a layer while keeping the edit auditable.',
    payloadExample: {
      type: 'resize_layer',
      layerId: 'layer-demo',
      width: 480,
      height: 320,
    },
  },
  {
    type: 'set_layer_frame',
    title: 'Set Layer Frame',
    description:
      'Set any of x, y, width, height, and rotation on a layer in one undoable step. Prefer this over separate move and resize calls.',
    payloadExample: {
      type: 'set_layer_frame',
      layerId: 'layer-demo',
      x: 64,
      y: 84,
      width: 480,
      height: 320,
    },
  },
  {
    type: 'trim_clip',
    title: 'Trim Clip',
    description:
      'Trim a video layer to a range of its source file. The layer is shortened on the timeline to match.',
    payloadExample: {
      type: 'trim_clip',
      layerId: 'layer-demo',
      trimStartMs: 500,
      trimEndMs: 5200,
    },
  },
  {
    type: 'reorder_layer',
    title: 'Reorder Layer',
    description: 'Change draw order inside the active scene.',
    payloadExample: {
      type: 'reorder_layer',
      layerId: 'layer-demo',
      toIndex: 0,
    },
  },
  {
    type: 'apply_filter_preset',
    title: 'Apply Filter Preset',
    description: 'Apply a reusable visual treatment without exposing dozens of sliders.',
    payloadExample: {
      type: 'apply_filter_preset',
      layerId: 'layer-demo',
      preset: 'cinematic',
    },
  },
  {
    type: 'set_filters',
    title: 'Set Filters',
    description:
      'Merge individual filter values onto a layer. Keys must be known filter names; values are clamped to each filter range.',
    payloadExample: {
      type: 'set_filters',
      layerId: 'layer-demo',
      filters: {
        brightness: 1.1,
        blur: 0.2,
      },
    },
  },
  {
    type: 'reset_filters',
    title: 'Reset Filters',
    description: 'Return every filter on a layer to its default value.',
    payloadExample: {
      type: 'reset_filters',
      layerId: 'layer-demo',
    },
  },
  {
    type: 'set_style_params',
    title: 'Set Style Params',
    description: 'Change text and layer presentation details through typed params.',
    payloadExample: {
      type: 'set_style_params',
      layerId: 'layer-demo',
      params: {
        rotation: 0,
        opacity: 0.95,
      },
    },
  },
  {
    type: 'update_text',
    title: 'Update Text',
    description: 'Change the content, font, size, colour, or alignment of a text layer.',
    payloadExample: {
      type: 'update_text',
      layerId: 'layer-demo',
      text: 'Launch day is live',
      fontSize: 64,
      align: 'center',
    },
  },
  {
    type: 'patch_layer',
    title: 'Patch Layer',
    description:
      'Change several properties of one layer at once (frame, opacity, visibility, name, text, trim, filters). Use a more specific tool when one fits.',
    payloadExample: {
      type: 'patch_layer',
      layerId: 'layer-demo',
      patch: {
        opacity: 0.8,
        filters: {
          contrast: 1.1,
        },
      },
    },
  },
  {
    type: 'add_caption_block',
    title: 'Add Caption Block',
    description: 'Create a lower-third caption styled for social video.',
    payloadExample: {
      type: 'add_caption_block',
      text: 'This workflow is AI-directed but fully reversible.',
    },
  },
  {
    type: 'apply_animation_preset',
    title: 'Apply Animation Preset',
    description: 'Assign a motion preset for later playback or export execution.',
    payloadExample: {
      type: 'apply_animation_preset',
      layerId: 'layer-demo',
      preset: 'punch-zoom',
    },
  },
  {
    type: 'mute_or_hide_layer',
    title: 'Mute Or Hide Layer',
    description: 'Temporarily disable a layer without deleting it.',
    payloadExample: {
      type: 'mute_or_hide_layer',
      layerId: 'layer-demo',
      visible: false,
    },
  },
  {
    type: 'duplicate_layer',
    title: 'Duplicate Layer',
    description: 'Copy a layer, place the copy directly above the original, and select it.',
    payloadExample: {
      type: 'duplicate_layer',
      layerId: 'layer-demo',
    },
  },
  {
    type: 'rename_layer',
    title: 'Rename Layer',
    description: 'Give a layer a new display name.',
    payloadExample: {
      type: 'rename_layer',
      layerId: 'layer-demo',
      name: 'Hero shot',
    },
  },
  {
    type: 'delete_layer',
    title: 'Delete Layer',
    description: 'Delete a layer and preserve the change in version history.',
    destructive: true,
    payloadExample: {
      type: 'delete_layer',
      layerId: 'layer-demo',
    },
  },
  {
    type: 'split_layer',
    title: 'Split Layer',
    description:
      'Cut a layer in two at a timeline position. Works for video, image and text layers.',
    payloadExample: {
      type: 'split_layer',
      layerId: 'layer-demo',
      atMs: 3000,
    },
  },
  {
    type: 'undo',
    title: 'Undo',
    description: 'Move the project back one command in history.',
    payloadExample: {
      type: 'undo',
    },
  },
  {
    type: 'redo',
    title: 'Redo',
    description: 'Re-apply the next command in history.',
    payloadExample: {
      type: 'redo',
    },
  },
  {
    type: 'export_preview',
    title: 'Export Preview',
    description: 'Request an export in a supported preview format.',
    payloadExample: {
      type: 'export_preview',
      format: 'mp4',
    },
  },
];
