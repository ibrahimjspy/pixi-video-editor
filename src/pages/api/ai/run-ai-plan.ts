import type { NextApiRequest, NextApiResponse } from 'next';
import { buildAiPlan } from '@/lib/ai/planner';
import { MAX_PROMPT_LENGTH } from '@/lib/ai/providerAdapters';
import { Project, ProviderConfig } from '@/types/editor';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Checks the parts of a project the planner reads before trusting its type. */
const isProjectLike = (value: unknown): value is Project =>
  isRecord(value) &&
  typeof value.currentSceneId === 'string' &&
  Array.isArray(value.scenes) &&
  value.scenes.length > 0 &&
  value.scenes.every(
    (scene) =>
      isRecord(scene) &&
      typeof scene.id === 'string' &&
      Array.isArray(scene.layerIds) &&
      typeof scene.canvasWidth === 'number' &&
      typeof scene.canvasHeight === 'number',
  ) &&
  Array.isArray(value.layers) &&
  value.layers.every((layer) => isRecord(layer) && typeof layer.id === 'string') &&
  Array.isArray(value.assets) &&
  (value.selection === undefined || isRecord(value.selection));

/**
 * Reads an optional provider config. Returns null for "no provider", or a
 * string describing why the supplied config is unusable.
 */
const readProviderConfig = (value: unknown): ProviderConfig | null | string => {
  if (value === null || value === undefined) {
    return null;
  }

  if (!isRecord(value)) {
    return 'providerConfig must be an object or null';
  }

  if (value.provider !== 'anthropic' && value.provider !== 'gemini') {
    return 'providerConfig.provider must be "anthropic" or "gemini"';
  }

  if (typeof value.apiKey !== 'string' || value.apiKey.length > 512) {
    return 'providerConfig.apiKey must be a string of at most 512 characters';
  }

  if (typeof value.model !== 'string' || value.model.length > 200) {
    return 'providerConfig.model must be a string of at most 200 characters';
  }

  return { provider: value.provider, apiKey: value.apiKey, model: value.model };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  try {
    const body: unknown = req.body;

    if (!isRecord(body)) {
      res.status(400).json({ message: 'A JSON body is required' });
      return;
    }

    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';

    if (!prompt || !sessionId) {
      res.status(400).json({ message: 'prompt and sessionId are required' });
      return;
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      res.status(400).json({
        message: `prompt is too long (${prompt.length} characters, limit ${MAX_PROMPT_LENGTH})`,
      });
      return;
    }

    if (sessionId.length > 100) {
      res.status(400).json({ message: 'sessionId is too long' });
      return;
    }

    if (!isProjectLike(body.project)) {
      res.status(400).json({ message: 'project is missing or malformed' });
      return;
    }

    const providerConfig = readProviderConfig(body.providerConfig);

    if (typeof providerConfig === 'string') {
      res.status(400).json({ message: providerConfig });
      return;
    }

    const plan = await buildAiPlan({
      prompt,
      project: body.project,
      providerConfig,
      sessionId,
    });

    res.status(200).json(plan);
  } catch {
    // The error is deliberately not logged or echoed: it may reference request data.
    res.status(500).json({ message: 'AI planning failed unexpectedly.' });
  }
}
