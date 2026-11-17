import { v4 as uuidv4 } from 'uuid';
import {
  AiAction,
  AiPlan,
  Command,
  Layer,
  Project,
  ProviderConfig,
} from '@/types/editor';
import { getCurrentLayers, getCurrentScene } from '@/lib/editor/defaults';
import {
  MODEL_BLOCKED_COMMAND_TYPES,
  requestPlanFromProvider,
} from '@/lib/ai/providerAdapters';
import { isSupportedCommand } from '@/lib/editor/commandValidation';
import { LOOK_DEFINITIONS } from '@/lib/effects/looks';

type UnknownRecord = Record<string, unknown>;

export type PlanSource = 'provider' | 'local';

/**
 * AiPlan plus where it came from. `AiPlan` itself is owned by the shared types
 * file, so the extra fields live on this local extension. The same information
 * is always repeated as the FIRST entry of `warnings` (see the prefixes below)
 * so it survives any code path that only knows the base type.
 */
export interface SourcedAiPlan extends AiPlan {
  source: PlanSource;
  /** Set when a configured provider failed and the local planner took over. */
  providerError?: string;
}

export const PROVIDER_FAILED_WARNING_PREFIX = 'Provider failed — showing local keyword plan: ';
export const NO_PROVIDER_KEY_WARNING = 'Local keyword plan (no provider key)';

/** Returns whether a provider value is a non-array object. */
const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Converts a provider field into a clean string array. */
const readStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];

const describeAction = (entry: unknown, index: number) => {
  const type = isRecord(entry)
    ? typeof entry.type === 'string'
      ? entry.type
      : isRecord(entry.payload) && typeof entry.payload.type === 'string'
        ? entry.payload.type
        : null
    : null;

  return `Action ${index + 1}${type ? ` (${type.slice(0, 40)})` : ''}`;
};

/**
 * Normalizes untrusted provider JSON into the complete plan shape consumed by
 * React and the command store.
 *
 * Invalid actions are dropped and each one is reported as a warning naming the
 * reason. Generated IDs and statuses fill fields that providers are not asked
 * to produce directly.
 */
export const normalizeProviderPlan = (
  value: unknown,
  prompt: string,
  sessionId: string,
  project: Project,
): SourcedAiPlan => {
  if (!isRecord(value)) {
    throw new Error('Provider response was not a plan object.');
  }

  if (!Array.isArray(value.actions)) {
    throw new Error('Provider response had no "actions" array.');
  }

  const layers = getCurrentLayers(project);
  const layerById = new Map(layers.map((layer) => [layer.id, layer]));
  const dropped: string[] = [];
  const actions: AiAction[] = [];

  value.actions.forEach((entry, index) => {
    const label = describeAction(entry, index);

    if (!isRecord(entry) || !isRecord(entry.payload)) {
      dropped.push(`${label} was ignored: it has no payload object.`);
      return;
    }

    const payloadType = entry.payload.type;

    if (entry.type !== undefined && entry.type !== payloadType) {
      dropped.push(`${label} was ignored: payload.type does not match the action type.`);
      return;
    }

    if (typeof payloadType === 'string' && MODEL_BLOCKED_COMMAND_TYPES.has(payloadType)) {
      dropped.push(`${label} was ignored: ${payloadType} cannot be planned by the AI.`);
      return;
    }

    if (!isSupportedCommand(entry.payload)) {
      dropped.push(`${label} was ignored: unsupported command or invalid payload.`);
      return;
    }

    const payload: Command = entry.payload;
    const layerId = (payload as { layerId?: unknown }).layerId;

    if (typeof layerId === 'string') {
      const layer = layerById.get(layerId);

      if (!layer) {
        dropped.push(`${label} was ignored: it targets a layer that is not in this scene.`);
        return;
      }

      if (payload.type === 'trim_clip' && layer.type !== 'video') {
        dropped.push(`${label} was ignored: only video layers can be trimmed.`);
        return;
      }
    }

    actions.push({
      id: uuidv4(),
      type: payload.type,
      title: typeof entry.title === 'string' && entry.title.trim() ? entry.title : payload.type,
      reason: typeof entry.reason === 'string' ? entry.reason : 'Provider-proposed edit.',
      status: 'ready',
      destructive: payload.type === 'delete_layer' || entry.destructive === true,
      payload,
    });
  });

  return {
    id: uuidv4(),
    sessionId,
    prompt,
    summary:
      typeof value.summary === 'string' && value.summary.trim()
        ? value.summary
        : `Prepared ${actions.length} provider edit${actions.length === 1 ? '' : 's'}`,
    rationale: readStringArray(value.rationale),
    actions,
    warnings: [...dropped, ...readStringArray(value.warnings)],
    createdAt: new Date().toISOString(),
    source: 'provider',
  };
};

/**
 * Picks the layer a local plan should act on: the selected layer when there is
 * one in the active scene, otherwise the top-most image or video layer.
 * `layers` is ordered bottom-most first.
 */
const pickTargetLayer = (project: Project, layers: Layer[]): Layer | null => {
  const selectedId = project.selection?.layerId;
  const selected = selectedId ? layers.find((layer) => layer.id === selectedId) : undefined;

  if (selected) {
    return selected;
  }

  return [...layers].reverse().find((layer) => layer.type !== 'text') ?? null;
};

/** Picks the video layer a trim should apply to, or null when there is none. */
const pickVideoLayer = (target: Layer | null, layers: Layer[]): Layer | null => {
  if (target?.type === 'video') {
    return target;
  }

  return [...layers].reverse().find((layer) => layer.type === 'video') ?? null;
};

/** Returns the first double-quoted phrase in the prompt, used as literal text. */
const readQuotedText = (prompt: string) => {
  const match = prompt.match(/["“]([^"“”]{1,200})["”]/);
  return match ? match[1].trim() : null;
};

const KEYWORDS = {
  vertical: /\b(vertical|portrait|reels?|shorts|tiktok)\b|\b9\s*[:x]\s*16\b/,
  square: /\bsquare\b|\b1\s*[:x]\s*1\b/,
  landscape: /\b(landscape|horizontal|widescreen)\b|\b16\s*[:x]\s*9\b/,
  caption: /\b(captions?|subtitles?|lower[- ]third)\b/,
  headline: /\b(headline|title|hook)\b/,
  noir: /\b(noir|black[- ](and|&)[- ]white|monochrome)\b/,
  vibrant: /\b(vibrant|colou?rful|brighter|more colou?r)\b/,
  cinematic:
    /\b(cinematic|punch(y|ier)|colou?r[- ]?grad(e|ing)|film(ic)? look|movie look|moody)\b/,
  clean: /\b(clean (it )?up|polish|clean look)\b/,
  trim: /\btrim\b|\bcut (off )?the (start|intro|beginning|lead[- ]in)\b/,
  zoom: /\b(punch[- ])?zoom\b/,
  fade: /\bfade[- ]in\b|\bsoft fade\b/,
} as const;

const makeAction = (
  type: AiAction['type'],
  title: string,
  reason: string,
  payload: Command,
  destructive = false,
): AiAction => ({
  id: uuidv4(),
  type,
  title,
  reason,
  status: 'ready',
  destructive,
  payload,
});

/**
 * Builds a deterministic local plan by keyword matching.
 *
 * This is not AI: it only recognises the handful of phrases in KEYWORDS and
 * proposes nothing when none of them match.
 */
export const buildHeuristicPlan = (
  prompt: string,
  project: Project,
  sessionId: string,
): SourcedAiPlan => {
  const normalized = prompt.toLowerCase();
  const has = (keyword: keyof typeof KEYWORDS) => KEYWORDS[keyword].test(normalized);
  const scene = getCurrentScene(project);
  const layers = getCurrentLayers(project);
  const target = pickTargetLayer(project, layers);
  const quotedText = readQuotedText(prompt);
  const actions: AiAction[] = [];
  const rationale = [
    'Matched keywords in the request against a fixed set of local edits.',
    target
      ? `Layer edits target "${target.name}" (${project.selection?.layerId === target.id ? 'the selected layer' : 'the top-most media layer'}).`
      : 'There is no layer to target, so only canvas and text edits are possible.',
  ];
  const warnings: string[] = [];
  const wantsLayerEdit =
    has('noir') || has('vibrant') || has('cinematic') || has('clean') || has('zoom') || has('fade');

  if (has('vertical')) {
    actions.push(
      makeAction(
        'set_canvas_ratio',
        'Switch to vertical',
        'The request mentions a vertical or short-form format.',
        { type: 'set_canvas_ratio', aspectRatio: '9:16' },
      ),
    );
  } else if (has('square')) {
    actions.push(
      makeAction(
        'set_canvas_ratio',
        'Switch to square',
        'The request mentions a square format.',
        { type: 'set_canvas_ratio', aspectRatio: '1:1' },
      ),
    );
  } else if (has('landscape')) {
    actions.push(
      makeAction(
        'set_canvas_ratio',
        'Switch to landscape',
        'The request mentions a landscape format.',
        { type: 'set_canvas_ratio', aspectRatio: '16:9' },
      ),
    );
  }

  if (has('caption')) {
    actions.push(
      makeAction(
        'add_caption_block',
        'Add caption block',
        'The request asks for captions.',
        {
          type: 'add_caption_block',
          text: (!has('headline') && quotedText) || 'Caption text goes here.',
        },
      ),
    );

    if (!quotedText || has('headline')) {
      warnings.push('The local planner cannot write captions; the caption block contains placeholder text.');
    }
  }

  if (has('headline')) {
    actions.push(
      makeAction(
        'create_text',
        'Create headline',
        'The request asks for a headline, title, or hook.',
        {
          type: 'create_text',
          text: quotedText || 'Your headline here',
          x: Math.round(scene.canvasWidth * 0.08),
          y: Math.round(scene.canvasHeight * 0.08),
          width: Math.round(scene.canvasWidth * 0.76),
          fontSize: scene.aspectRatio === '9:16' ? 48 : 62,
        },
      ),
    );

    if (!quotedText) {
      warnings.push('The local planner cannot write copy; the headline contains placeholder text. Put the text in "quotes" to use it.');
    }
  }

  if (target) {
    // The first look whose name or id appears in the request.
    const keywordLook = has('noir')
      ? 'noir'
      : has('vibrant')
        ? 'vibrant'
        : has('cinematic')
          ? 'cinematic'
          : has('clean')
            ? 'clean'
            : null;
    const look =
      LOOK_DEFINITIONS.find((entry) => entry.id === keywordLook) ??
      LOOK_DEFINITIONS.find(
        (entry) =>
          normalized.includes(entry.label.toLowerCase()) ||
          normalized.includes(entry.id.replace(/-/g, ' ')),
      );

    if (look) {
      actions.push(
        makeAction(
          'set_look',
          `Apply ${look.label} look`,
          `The request asks for a ${look.label} look on "${target.name}".`,
          { type: 'set_look', layerId: target.id, look: look.id },
        ),
      );
    }

    if (has('zoom') || has('fade')) {
      const animation = has('zoom') ? 'punch-zoom' : 'soft-fade';

      actions.push(
        makeAction(
          'apply_animation_preset',
          animation === 'punch-zoom' ? 'Add punch zoom' : 'Add soft fade',
          `The request asks for motion on "${target.name}".`,
          { type: 'apply_animation_preset', layerId: target.id, preset: animation },
        ),
      );
    }
  } else if (wantsLayerEdit) {
    warnings.push('The request mentions a layer edit, but the scene has no layer to apply it to.');
  }

  if (has('trim')) {
    const videoLayer = pickVideoLayer(target, layers);

    if (videoLayer) {
      actions.push(
        makeAction(
          'trim_clip',
          'Trim the lead-in',
          `Removes the first 0.4s of "${videoLayer.name}". The local planner cannot choose a trim point from the footage.`,
          {
            type: 'trim_clip',
            layerId: videoLayer.id,
            trimStartMs: 400,
            trimEndMs: null,
          },
        ),
      );
    } else {
      warnings.push('The request mentions trimming, but the scene has no video layer to trim.');
    }
  }

  if (actions.length === 0) {
    warnings.push(
      'The local planner did not recognise this request. It only understands: vertical / square / landscape, captions, headline, cinematic / vibrant / noir / clean look, trim, zoom, fade in.',
    );
  }

  return {
    id: uuidv4(),
    sessionId,
    prompt,
    summary: actions.length
      ? `Prepared ${actions.length} keyword-matched edit${actions.length === 1 ? '' : 's'}`
      : 'No edit actions proposed',
    rationale,
    actions,
    warnings,
    createdAt: new Date().toISOString(),
    source: 'local',
  };
};

/**
 * Builds a provider plan when a key is configured, otherwise a local one.
 *
 * A provider failure still returns a local plan, but it is marked
 * `source: 'local'` with `providerError` set, and the failure is the first
 * warning, so the UI can never present it as an AI plan.
 */
export const buildAiPlan = async ({
  prompt,
  project,
  providerConfig,
  sessionId,
}: {
  prompt: string;
  project: Project;
  providerConfig: ProviderConfig | null;
  sessionId: string;
}): Promise<SourcedAiPlan> => {
  if (!providerConfig?.apiKey?.trim()) {
    const localPlan = buildHeuristicPlan(prompt, project, sessionId);
    localPlan.warnings.unshift(NO_PROVIDER_KEY_WARNING);
    return localPlan;
  }

  try {
    const providerPlan = await requestPlanFromProvider(providerConfig, project, prompt);

    return normalizeProviderPlan(providerPlan, prompt, sessionId, project);
  } catch (error) {
    const providerError = (
      error instanceof Error && error.message ? error.message : 'Unknown provider error.'
    )
      .split(providerConfig.apiKey.trim())
      .join('[redacted]');
    const fallbackPlan = buildHeuristicPlan(prompt, project, sessionId);

    fallbackPlan.providerError = providerError;
    fallbackPlan.warnings.unshift(`${PROVIDER_FAILED_WARNING_PREFIX}${providerError}`);
    return fallbackPlan;
  }
};

/**
 * Reviews a complete plan before client-side command execution is allowed.
 *
 * The plan comes back from the browser, so it is treated as untrusted again.
 */
export const reviewAiPlan = (plan: AiPlan) => {
  const warnings = [...plan.warnings];
  const hasInvalidActions = plan.actions.some(
    (action) =>
      !isRecord(action) ||
      !isRecord(action.payload) ||
      action.type !== action.payload.type ||
      !isSupportedCommand(action.payload),
  );
  const hasBlockedActions = plan.actions.some(
    (action) => isRecord(action) && MODEL_BLOCKED_COMMAND_TYPES.has(String(action.type)),
  );

  if (hasInvalidActions) {
    warnings.push('The plan contains malformed or mismatched commands.');
  }

  if (hasBlockedActions) {
    warnings.push('The plan contains commands that an AI plan may not run (undo, redo, export, import).');
  }

  if (plan.actions.some((action) => isRecord(action) && action.destructive === true)) {
    warnings.push('This plan contains destructive actions. Review before applying.');
  }

  if (plan.actions.length === 0) {
    warnings.push('The plan did not produce any executable actions.');
  }

  return {
    approved: plan.actions.length > 0 && !hasInvalidActions && !hasBlockedActions,
    summary: plan.summary,
    warnings,
    actionCount: plan.actions.length,
  };
};
