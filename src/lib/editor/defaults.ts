import { v4 as uuidv4 } from 'uuid';
import {
  Asset,
  CanvasAspectRatio,
  FilterSettings,
  Layer,
  Project,
  ProviderConfig,
  Scene,
  VersionSnapshot,
} from '@/types/editor';
import { FILTER_DEFINITIONS } from '@/lib/renderer/filterDefinitions';

export const CANVAS_DIMENSIONS: Record<
  CanvasAspectRatio,
  { width: number; height: number }
> = {
  '16:9': { width: 960, height: 540 },
  '9:16': { width: 540, height: 960 },
  '1:1': { width: 720, height: 720 },
};

/** Smallest width or height, in canvas pixels, any layer may be resized to. */
export const MIN_LAYER_SIZE = 16;

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  provider: 'anthropic',
  apiKey: '',
  model: 'claude-sonnet-5-5',
};

export const createDefaultFilters = (): FilterSettings => {
  const filters = {} as FilterSettings;

  FILTER_DEFINITIONS.forEach((filter) => {
    const key = filter.key as keyof FilterSettings;
    filters[key] = filter.default as never;
  });

  return filters;
};

export const createDefaultScene = (
  aspectRatio: CanvasAspectRatio = '16:9',
): Scene => {
  const dimensions = CANVAS_DIMENSIONS[aspectRatio];

  return {
    id: uuidv4(),
    name: 'Scene 01',
    durationMs: 8000,
    aspectRatio,
    canvasWidth: dimensions.width,
    canvasHeight: dimensions.height,
    layerIds: [],
  };
};

export const createDefaultProject = (): Project => {
  const scene = createDefaultScene();
  const now = new Date().toISOString();

  return {
    id: uuidv4(),
    name: 'Signal Studio Project',
    scenes: [scene],
    currentSceneId: scene.id,
    assets: [],
    layers: [],
    selection: {
      sceneId: scene.id,
      layerId: null,
      assetId: null,
    },
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * Creates a restorable version entry for a project.
 *
 * The project is stored by reference, not cloned. This is safe because project
 * objects are treated as immutable once they are placed in the store: every
 * edit produces a new project object instead of mutating an existing one.
 */
export const createVersionSnapshot = (
  project: Project,
  label: string,
  source: 'user' | 'ai',
): VersionSnapshot => ({
  id: uuidv4(),
  label,
  source,
  createdAt: new Date().toISOString(),
  project,
});

export const createAssetLabel = (asset: Asset): string =>
  asset.kind === 'video' ? `Clip · ${asset.name}` : `Frame · ${asset.name}`;

export const getSceneById = (project: Project, sceneId: string) =>
  project.scenes.find((scene) => scene.id === sceneId) ?? project.scenes[0];

export const getCurrentScene = (project: Project): Scene =>
  getSceneById(project, project.currentSceneId);

export const getLayersForScene = (project: Project, sceneId: string): Layer[] => {
  const scene = getSceneById(project, sceneId);

  return scene.layerIds
    .map((layerId) => project.layers.find((layer) => layer.id === layerId))
    .filter((layer): layer is Layer => Boolean(layer))
    .sort((a, b) => a.zIndex - b.zIndex);
};

export const getCurrentLayers = (project: Project): Layer[] =>
  getLayersForScene(project, project.currentSceneId);

export const getLayerById = (project: Project, layerId: string) =>
  project.layers.find((layer) => layer.id === layerId);

export const getAssetById = (project: Project, assetId: string) =>
  project.assets.find((asset) => asset.id === assetId);
