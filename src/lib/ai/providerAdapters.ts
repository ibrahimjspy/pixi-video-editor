import { Project, ProviderConfig } from '@/types/editor';
import {
  createDefaultFilters,
  getAssetById,
  getCurrentLayers,
  getCurrentScene,
} from '@/lib/editor/defaults';
import { TOOL_CONTRACTS } from '@/lib/editor/toolContracts';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5-5';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

const anthropicModels = [DEFAULT_ANTHROPIC_MODEL, 'claude-opus-5-5', 'claude-haiku-5-5'];
/** Suggestions only: Gemini IDs change often, so the model field stays free text. */
const geminiModels = [DEFAULT_GEMINI_MODEL, 'gemini-1.5-pro'];

const PLAN_REQUEST_TIMEOUT_MS = 60_000;
const VERIFY_REQUEST_TIMEOUT_MS = 10_000;
const ANTHROPIC_MAX_TOKENS = 4096;

export const MAX_PROMPT_LENGTH = 4000;

/**
 * Commands the model must never plan. They either need data the model cannot
 * produce (an uploaded asset), or act on history/export rather than the scene.
 */
export const MODEL_BLOCKED_COMMAND_TYPES: ReadonlySet<string> = new Set([
  'undo',
  'redo',
  'export_preview',
  'import_asset',
]);

/**
 * Extra payload rules for commands whose example cannot show every allowed
 * value. Only notes whose command exists in TOOL_CONTRACTS are advertised.
 */
const PAYLOAD_NOTES: Record<string, string> = {
  create_text: 'Only "text" is required; x, y, width, height, fontSize, color (hex), fontFamily are optional.',
  set_canvas_ratio: 'aspectRatio must be one of "16:9", "9:16", "1:1".',
  trim_clip: 'Only for layers whose type is "video". Times are milliseconds; trimEndMs may be null for "until the end".',
  reorder_layer: 'toIndex is the 0-based position in the layer list, where 0 is the bottom-most layer.',
  apply_filter_preset: 'preset must be one of "clean", "cinematic", "vibrant", "noir", "spotlight".',
  set_style_params:
    'params may contain opacity (0-1), rotation, and for text layers color (hex), fontSize, fontFamily. Omit params you do not change.',
  apply_animation_preset: 'preset must be one of "drift-in", "punch-zoom", "soft-fade".',
  mute_or_hide_layer: 'Provide "visible" and/or "muted" booleans.',
};

export const getProviderModelOptions = (provider: ProviderConfig['provider']) =>
  provider === 'anthropic' ? anthropicModels : geminiModels;

export const getDefaultModel = (provider: ProviderConfig['provider']) =>
  provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_GEMINI_MODEL;

/** Returns whether an Anthropic model id is a retired one this app used to default to. */
export const isStaleAnthropicModel = (model: string) => {
  const id = model.trim().toLowerCase();
  return id === '' || /^claude-(2|instant|3)(-|$)/.test(id);
};

/**
 * Returns the model id to actually send. Blank ids and known-retired Anthropic
 * ids (the old store default) are replaced with the current default; anything
 * else the user typed is passed through untouched.
 */
export const resolveModelId = (provider: ProviderConfig['provider'], model: string) => {
  const trimmed = (model ?? '').trim().replace(/^models\//, '');

  if (provider === 'anthropic') {
    return isStaleAnthropicModel(trimmed) ? DEFAULT_ANTHROPIC_MODEL : trimmed;
  }

  return trimmed || DEFAULT_GEMINI_MODEL;
};

/** Removes the API key from any text that may reach logs or the browser. */
const redactKey = (text: string, apiKey: string) =>
  apiKey ? text.split(apiKey).join('[redacted]') : text;

/** Reads `error.message` from a provider error body without ever throwing. */
const readProviderError = async (response: Response, apiKey: string) => {
  let detail = '';

  try {
    const body: unknown = await response.json();
    if (isRecord(body)) {
      if (isRecord(body.error) && typeof body.error.message === 'string') {
        detail = body.error.message;
      } else if (typeof body.message === 'string') {
        detail = body.message;
      }
    }
  } catch {
    // Non-JSON error body: the status code is all we can report.
  }

  return redactKey(detail.slice(0, 500), apiKey);
};

const describeNetworkError = (error: unknown) => {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return 'request timed out';
  }

  return 'network error';
};

const anthropicHeaders = (apiKey: string) => ({
  'x-api-key': apiKey,
  'anthropic-version': '2023-06-01',
});

export interface ProviderValidationResult {
  ok: boolean;
  /** True only when the provider itself accepted or rejected the key. */
  verified: boolean;
  message: string;
}

const checkKeyFormat = (config: ProviderConfig): { ok: boolean; message: string } => {
  if (config.provider === 'anthropic') {
    return config.apiKey.startsWith('sk-ant-')
      ? { ok: true, message: 'Anthropic key format looks right' }
      : { ok: false, message: 'Anthropic keys usually start with sk-ant-.' };
  }

  return config.apiKey.startsWith('AIza')
    ? { ok: true, message: 'Gemini key format looks right' }
    : { ok: false, message: 'Gemini API keys usually start with AIza.' };
};

/** Returns the model ids listed by a provider's models endpoint, if readable. */
const readModelIds = async (response: Response, provider: ProviderConfig['provider']) => {
  try {
    const body: unknown = await response.json();
    const list = isRecord(body) ? (provider === 'anthropic' ? body.data : body.models) : null;

    if (!Array.isArray(list)) {
      return null;
    }

    return list.flatMap((entry): string[] => {
      if (!isRecord(entry)) {
        return [];
      }
      const id = provider === 'anthropic' ? entry.id : entry.name;
      return typeof id === 'string' ? [id.replace(/^models\//, '')] : [];
    });
  } catch {
    return null;
  }
};

/**
 * Verifies a provider key with a cheap authenticated "list models" request.
 *
 * Falls back to a prefix check, clearly labelled as unverified, when the
 * provider cannot be reached. The key is never echoed in the result.
 */
export const validateProviderConfig = async (
  config: ProviderConfig,
): Promise<ProviderValidationResult> => {
  const apiKey = config.apiKey.trim();

  if (!apiKey) {
    return { ok: false, verified: false, message: 'API key is required.' };
  }

  const providerLabel = config.provider === 'anthropic' ? 'Anthropic' : 'Gemini';
  const format = checkKeyFormat({ ...config, apiKey });
  const model = resolveModelId(config.provider, config.model);

  let response: Response;

  try {
    response =
      config.provider === 'anthropic'
        ? await fetch('https://api.anthropic.com/v1/models?limit=1000', {
            method: 'GET',
            headers: anthropicHeaders(apiKey),
            signal: AbortSignal.timeout(VERIFY_REQUEST_TIMEOUT_MS),
          })
        : await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
            method: 'GET',
            headers: { 'x-goog-api-key': apiKey },
            signal: AbortSignal.timeout(VERIFY_REQUEST_TIMEOUT_MS),
          });
  } catch (error) {
    return {
      ok: format.ok,
      verified: false,
      message: format.ok
        ? `${format.message} (format only, not verified: ${describeNetworkError(error)} reaching ${providerLabel}).`
        : `${format.message} Could not reach ${providerLabel} to verify (${describeNetworkError(error)}).`,
    };
  }

  if (response.ok) {
    const modelIds = await readModelIds(response, config.provider);
    const modelMissing = modelIds !== null && modelIds.length > 0 && !modelIds.includes(model);

    return {
      ok: true,
      verified: true,
      message: modelMissing
        ? `${providerLabel} key verified, but model "${model}" is not in this key's model list.`
        : `${providerLabel} key verified.`,
    };
  }

  const detail = await readProviderError(response, apiKey);
  const rejected =
    response.status === 401 ||
    response.status === 403 ||
    (config.provider === 'gemini' && response.status === 400);

  if (rejected) {
    return {
      ok: false,
      verified: true,
      message: `${providerLabel} rejected this key (HTTP ${response.status})${detail ? `: ${detail}` : '.'}`,
    };
  }

  return {
    ok: format.ok,
    verified: false,
    message: `${format.message} (format only, not verified: ${providerLabel} returned HTTP ${response.status}).`,
  };
};

/**
 * Extracts the outermost JSON object from model text.
 *
 * Tolerates ```json fences and prose around the object. Braces inside JSON
 * strings are skipped so they cannot end the object early.
 */
export const extractJson = (content: string): unknown => {
  const fenced = content.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  const candidates = fenced ? [fenced[1], content] : [content];

  for (const candidate of candidates) {
    const start = candidate.indexOf('{');

    if (start === -1) {
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < candidate.length; index += 1) {
      const char = candidate[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;

        if (depth === 0) {
          try {
            return JSON.parse(candidate.slice(start, index + 1)) as unknown;
          } catch {
            break;
          }
        }
      }
    }
  }

  throw new Error('Provider response did not contain a valid JSON object.');
};

const round = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) / 100 : value;

/**
 * Builds the compact project description sent to the model.
 *
 * Only the active scene is described. Asset URLs (blob: URLs), timestamps and
 * default filter values are deliberately left out.
 */
export const summarizeProject = (project: Project) => {
  const scene = getCurrentScene(project);
  const layers = getCurrentLayers(project);
  const defaultFilters = createDefaultFilters() as unknown as Record<string, unknown>;
  const selectedLayerId = project.selection?.layerId ?? null;

  return {
    projectName: project.name,
    canvas: {
      width: scene.canvasWidth,
      height: scene.canvasHeight,
      aspectRatio: scene.aspectRatio,
      durationMs: scene.durationMs,
    },
    selectedLayerId: layers.some((layer) => layer.id === selectedLayerId) ? selectedLayerId : null,
    /** Ordered bottom-most first; the array index is the layer's reorder index. */
    layers: layers.map((layer, index) => {
      const summary: UnknownRecord = {
        index,
        id: layer.id,
        name: layer.name,
        type: layer.type,
        x: round(layer.x),
        y: round(layer.y),
        width: round(layer.width),
        height: round(layer.height),
        rotation: round(layer.rotation),
        opacity: round(layer.opacity),
        visible: layer.visible,
      };

      if (layer.muted) {
        summary.muted = true;
      }

      if (layer.animationPreset) {
        summary.animationPreset = layer.animationPreset;
      }

      if (layer.type === 'text') {
        summary.text = layer.text;
        summary.fontSize = layer.fontSize;
        summary.fontFamily = layer.fontFamily;
        summary.color = layer.color;
        summary.align = layer.align;
      } else {
        const asset = getAssetById(project, layer.assetId);

        if (asset) {
          summary.asset = {
            name: asset.name,
            kind: asset.kind,
            ...(typeof asset.durationMs === 'number' ? { durationMs: asset.durationMs } : {}),
          };
        }

        if (layer.type === 'video') {
          summary.trimStartMs = layer.trimStartMs;
          summary.trimEndMs = layer.trimEndMs;
        }
      }

      const filters = Object.entries((layer.filters ?? {}) as unknown as Record<string, unknown>).filter(
        ([key, value]) => typeof value === 'number' && value !== defaultFilters[key],
      );

      if (filters.length > 0) {
        summary.filters = Object.fromEntries(filters.map(([key, value]) => [key, round(value)]));
      }

      return summary;
    }),
  };
};

/** Returns the contracts the model is allowed to plan with, read at call time. */
export const getPlannableContracts = () =>
  TOOL_CONTRACTS.filter((contract) => !MODEL_BLOCKED_COMMAND_TYPES.has(contract.type));

/**
 * Builds the system prompt from the live tool contracts so the model always
 * sees exactly the commands the editor can validate and execute.
 */
export const buildSystemPrompt = (project: Project) => {
  const scene = getCurrentScene(project);
  const contracts = getPlannableContracts();
  const blocked = [...MODEL_BLOCKED_COMMAND_TYPES].join(', ');

  const commandList = contracts
    .map((contract) => {
      const note = PAYLOAD_NOTES[contract.type];

      return [
        `- ${contract.type}${contract.destructive ? ' (destructive)' : ''}: ${contract.description}`,
        `  payload example: ${JSON.stringify(contract.payloadExample)}`,
        ...(note ? [`  rules: ${note}`] : []),
      ].join('\n');
    })
    .join('\n');

  return [
    'You plan edits for a canvas-based video editor. You do not edit anything yourself: you return a plan made of typed commands, which the user reviews and the editor then validates and executes.',
    '',
    'The user message is JSON with two fields: "request" (what the user wants) and "project" (the current scene: canvas size, layers ordered bottom-most first, and the selected layer id).',
    '',
    '## Response format',
    'Respond with one JSON object and nothing else: no prose, no markdown fences. Shape:',
    '{"summary": string, "rationale": string[], "warnings": string[], "actions": [{"type": string, "title": string, "reason": string, "destructive": boolean, "payload": object}]}',
    '- "summary" is one short sentence describing the plan.',
    '- "actions" are executed in order. Each "type" must be one of the commands below, and "payload.type" must be exactly equal to the action "type".',
    '- "payload" must follow the shape of that command\'s payload example. Use the same field names and value types; do not add fields that are not shown or described.',
    '- If the request cannot be done with these commands, return an empty "actions" array and explain why in "warnings". Never invent a command.',
    '',
    '## Commands',
    commandList,
    '',
    '## Rules',
    `- Never plan these commands, they are reserved for the user: ${blocked}.`,
    '- Every "layerId" must be an "id" copied from the layers in the provided project. The ids in the payload examples are placeholders. Layers created earlier in the same plan have no id yet, so do not reference them.',
    '- When the request says "this", "it" or "the selected layer", it means the layer whose id is "selectedLayerId". If that is null, prefer the top-most image or video layer.',
    `- Coordinates and sizes are canvas pixels. The canvas is ${scene.canvasWidth} x ${scene.canvasHeight} (${scene.aspectRatio}); x and y are measured from its top-left corner. Keep layers inside the canvas unless the request says otherwise.`,
    '- If you change the canvas ratio, later coordinates in the same plan refer to the new canvas size.',
    '- Mark an action "destructive": true when it removes content.',
    '- Plan only what the request asks for. Do not add extra polish steps.',
  ].join('\n');
};

/** Builds the compact JSON user message for a planning request. */
export const buildUserMessage = (project: Project, prompt: string) =>
  JSON.stringify({ request: prompt, project: summarizeProject(project) });

const requestAnthropicPlan = async (
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
) => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...anthropicHeaders(apiKey),
    },
    body: JSON.stringify({
      model,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
    signal: AbortSignal.timeout(PLAN_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await readProviderError(response, apiKey);
    throw new Error(
      `Anthropic request failed (HTTP ${response.status})${detail ? `: ${detail}` : '.'}`,
    );
  }

  const payload: unknown = await response.json();

  if (!isRecord(payload)) {
    throw new Error('Anthropic response was not JSON.');
  }

  if (payload.stop_reason === 'max_tokens') {
    throw new Error(
      `Anthropic response was cut off at the ${ANTHROPIC_MAX_TOKENS}-token output limit, so the plan is incomplete. Try a narrower request.`,
    );
  }

  if (payload.stop_reason === 'refusal') {
    throw new Error('Anthropic declined to answer this request.');
  }

  const text = (Array.isArray(payload.content) ? payload.content : [])
    .flatMap((block): string[] =>
      isRecord(block) && block.type === 'text' && typeof block.text === 'string'
        ? [block.text]
        : [],
    )
    .join('');

  if (!text.trim()) {
    throw new Error('Anthropic response contained no text.');
  }

  return extractJson(text);
};

const requestGeminiPlan = async (
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
) => {
  if (!/^[\w.-]+$/.test(model)) {
    throw new Error('Gemini model id may only contain letters, digits, ".", "-" and "_".');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(PLAN_REQUEST_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    const detail = await readProviderError(response, apiKey);
    throw new Error(
      `Gemini request failed (HTTP ${response.status})${detail ? `: ${detail}` : '.'}`,
    );
  }

  const payload: unknown = await response.json();
  const candidate =
    isRecord(payload) && Array.isArray(payload.candidates) ? payload.candidates[0] : null;

  if (!isRecord(candidate)) {
    const blockReason =
      isRecord(payload) && isRecord(payload.promptFeedback)
        ? payload.promptFeedback.blockReason
        : null;
    throw new Error(
      typeof blockReason === 'string'
        ? `Gemini blocked this request (${blockReason}).`
        : 'Gemini response contained no candidates.',
    );
  }

  if (candidate.finishReason === 'MAX_TOKENS') {
    throw new Error(
      'Gemini response was cut off at its output limit, so the plan is incomplete. Try a narrower request.',
    );
  }

  const parts = isRecord(candidate.content) && Array.isArray(candidate.content.parts)
    ? candidate.content.parts
    : [];
  const text = parts
    .flatMap((part): string[] =>
      isRecord(part) && part.thought !== true && typeof part.text === 'string' ? [part.text] : [],
    )
    .join('');

  if (!text.trim()) {
    throw new Error(
      typeof candidate.finishReason === 'string'
        ? `Gemini response contained no text (finish reason: ${candidate.finishReason}).`
        : 'Gemini response contained no text.',
    );
  }

  return extractJson(text);
};

/**
 * Asks the configured provider for a plan and returns its raw, untrusted JSON.
 *
 * @throws With a user-presentable message (never containing the API key) when
 * the provider cannot be reached, rejects the request, or returns no JSON.
 */
export const requestPlanFromProvider = async (
  providerConfig: ProviderConfig,
  project: Project,
  prompt: string,
): Promise<unknown> => {
  const apiKey = providerConfig.apiKey.trim();
  const model = resolveModelId(providerConfig.provider, providerConfig.model);
  const systemPrompt = buildSystemPrompt(project);
  const userMessage = buildUserMessage(project, prompt);
  const providerLabel = providerConfig.provider === 'anthropic' ? 'Anthropic' : 'Gemini';

  try {
    return providerConfig.provider === 'anthropic'
      ? await requestAnthropicPlan(apiKey, model, systemPrompt, userMessage)
      : await requestGeminiPlan(apiKey, model, systemPrompt, userMessage);
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error(`${providerLabel} request timed out after ${PLAN_REQUEST_TIMEOUT_MS / 1000}s.`);
    }

    if (error instanceof TypeError) {
      // fetch() network failures surface as TypeError with low-level detail.
      throw new Error(`Could not reach ${providerLabel} (network error).`);
    }

    throw new Error(
      redactKey(error instanceof Error ? error.message : `${providerLabel} request failed.`, apiKey),
    );
  }
};
