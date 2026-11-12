'use client';

import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { AiPlan } from '@/types/editor';
import {
  NO_PROVIDER_KEY_WARNING,
  PROVIDER_FAILED_WARNING_PREFIX,
} from '@/lib/ai/planner';
import type { SourcedAiPlan } from '@/lib/ai/planner';
import {
  MAX_PROMPT_LENGTH,
  getDefaultModel,
  getProviderModelOptions,
  isStaleAnthropicModel,
  resolveModelId,
} from '@/lib/ai/providerAdapters';
import { useEditorStore } from '@/store/editorStore';
import { TOOL_CONTRACTS } from '@/lib/editor/toolContracts';
import { formatSnapshotTime } from '@/lib/editor/formatting';

/**
 * Reads a JSON API response and converts non-success responses into errors the
 * editor can surface without leaving its controls in a permanent loading state.
 *
 * @param input - Same-origin API route to request.
 * @param init - Fetch options including the request method and JSON body.
 * @returns The decoded JSON payload.
 * @throws When the response is not successful or has no usable JSON message.
 */
const requestJson = async <Payload,>(
  input: string,
  init: RequestInit,
): Promise<Payload> => {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => null) as
    | (Payload & { message?: string })
    | null;

  if (!response.ok || payload === null) {
    throw new Error(payload?.message || `Request failed with ${response.status}.`);
  }

  return payload;
};

const PROMPT_PLACEHOLDER =
  'e.g. Make this clip vertical for Reels, add captions, and give it a punchier cinematic look.';

type ActionOutcome = 'applied' | 'failed' | 'unknown';

interface ApplyReport {
  summary: string;
  items: Array<{
    id: string;
    title: string;
    type: string;
    outcome: ActionOutcome;
    detail: string;
  }>;
}

interface PlanOrigin {
  kind: 'provider' | 'local-no-key' | 'local-provider-failed' | 'unknown';
  providerError?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Works out where a plan came from. Reads the `source` / `providerError`
 * fields the planner adds, and falls back to the first-warning convention.
 */
const readPlanOrigin = (plan: AiPlan): PlanOrigin => {
  const { source, providerError } = plan as Partial<SourcedAiPlan>;
  const firstWarning = plan.warnings[0] ?? '';

  if (providerError || firstWarning.startsWith(PROVIDER_FAILED_WARNING_PREFIX)) {
    return {
      kind: 'local-provider-failed',
      providerError:
        providerError ?? firstWarning.slice(PROVIDER_FAILED_WARNING_PREFIX.length),
    };
  }

  if (firstWarning === NO_PROVIDER_KEY_WARNING || source === 'local') {
    return { kind: 'local-no-key' };
  }

  return source === 'provider' ? { kind: 'provider' } : { kind: 'unknown' };
};

/** Warnings without the leading origin marker, which is shown as a banner. */
const readPlanWarnings = (plan: AiPlan) => {
  const firstWarning = plan.warnings[0] ?? '';

  return firstWarning.startsWith(PROVIDER_FAILED_WARNING_PREFIX) ||
    firstWarning === NO_PROVIDER_KEY_WARNING
    ? plan.warnings.slice(1)
    : plan.warnings;
};

/**
 * Reads per-action results if `executePlan` returns them, in any of the shapes
 * `Result[]`, `{ results: Result[] }` where each result has a boolean `ok`.
 * Returns null when the store returns nothing usable (its original signature).
 */
const readReturnedResults = (returned: unknown, actionCount: number) => {
  const list = Array.isArray(returned)
    ? returned
    : isRecord(returned) && Array.isArray(returned.results)
      ? returned.results
      : null;

  if (!list || list.length !== actionCount) {
    return null;
  }

  const results = list.map((entry) => {
    const result = isRecord(entry) && isRecord(entry.result) ? entry.result : entry;

    return isRecord(result) && typeof result.ok === 'boolean'
      ? {
          ok: result.ok,
          summary: typeof result.summary === 'string' ? result.summary : '',
        }
      : null;
  });

  return results.every((result) => result !== null) ? results : null;
};

/**
 * Provides provider setup, AI plan review, execution trace, and version restore
 * controls for the active project.
 */
const AIRail = () => {
  const project = useEditorStore((state) => state.project);
  const providerConfig = useEditorStore((state) => state.providerConfig);
  const providerValidation = useEditorStore((state) => state.providerValidation);
  const aiSessionId = useEditorStore((state) => state.aiSessionId);
  const aiMessages = useEditorStore((state) => state.aiMessages);
  const draftPlan = useEditorStore((state) => state.draftPlan);
  const commandLog = useEditorStore((state) => state.commandLog);
  const versions = useEditorStore((state) => state.versions);
  const setProviderConfig = useEditorStore((state) => state.setProviderConfig);
  const setProviderValidation = useEditorStore((state) => state.setProviderValidation);
  const setAiSessionId = useEditorStore((state) => state.setAiSessionId);
  const addAiMessage = useEditorStore((state) => state.addAiMessage);
  const setDraftPlan = useEditorStore((state) => state.setDraftPlan);
  const executePlan = useEditorStore((state) => state.executePlan);
  const restoreVersion = useEditorStore((state) => state.restoreVersion);
  const seedSystemMessage = useEditorStore((state) => state.seedSystemMessage);

  const [prompt, setPrompt] = useState('');
  const [keyVerified, setKeyVerified] = useState(false);
  const [applyReport, setApplyReport] = useState<ApplyReport | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    seedSystemMessage();
  }, [seedSystemMessage]);

  // The store default may still be a retired Anthropic model id; swap it for
  // the current default so the field shows what will actually be sent.
  useEffect(() => {
    if (
      providerConfig.provider === 'anthropic' &&
      isStaleAnthropicModel(providerConfig.model)
    ) {
      setProviderConfig({ model: getDefaultModel('anthropic') });
    }
  }, [providerConfig.provider, providerConfig.model, setProviderConfig]);

  const latestVersions = useMemo(() => versions.slice(0, 4), [versions]);
  const modelOptions = getProviderModelOptions(providerConfig.provider);
  const hasApiKey = providerConfig.apiKey.trim().length > 0;
  const trimmedPrompt = prompt.trim();
  const promptTooLong = trimmedPrompt.length > MAX_PROMPT_LENGTH;
  const canGenerate = !isPlanning && trimmedPrompt.length > 0 && !promptTooLong;
  const planOrigin = draftPlan ? readPlanOrigin(draftPlan) : null;
  const planWarnings = draftPlan ? readPlanWarnings(draftPlan) : [];
  const canApply = Boolean(draftPlan && draftPlan.actions.length > 0) && !isApplying;

  const ensureSession = async () => {
    if (aiSessionId) {
      return aiSessionId;
    }

    const payload = await requestJson<{ sessionId: string }>('/api/ai/create-session', {
      method: 'POST',
    });
    setAiSessionId(payload.sessionId);
    return payload.sessionId;
  };

  const handleValidateProvider = async () => {
    if (isValidating) {
      return;
    }

    setIsValidating(true);
    setRequestError(null);

    try {
      const payload = await requestJson<{ ok: boolean; verified?: boolean; message: string }>(
        '/api/ai/validate-provider-key',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            providerConfig: {
              ...providerConfig,
              model: resolveModelId(providerConfig.provider, providerConfig.model),
            },
          }),
        },
      );
      setKeyVerified(payload.ok && payload.verified === true);
      setProviderValidation({
        status: payload.ok ? 'valid' : 'invalid',
        message: payload.message,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provider validation failed.';
      setKeyVerified(false);
      setProviderValidation({ status: 'invalid', message });
      setRequestError(message);
    } finally {
      setIsValidating(false);
    }
  };

  const handleGeneratePlan = async () => {
    if (!canGenerate) {
      return;
    }

    setIsPlanning(true);
    setRequestError(null);
    setApplyReport(null);
    addAiMessage({
      role: 'user',
      content: trimmedPrompt,
    });

    try {
      const sessionId = await ensureSession();
      const plan = await requestJson<SourcedAiPlan>('/api/ai/run-ai-plan', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          sessionId,
          project,
          // A key that is present is used even if it was not verified first;
          // a provider failure is then reported on the plan itself.
          providerConfig: hasApiKey
            ? {
                ...providerConfig,
                apiKey: providerConfig.apiKey.trim(),
                model: resolveModelId(providerConfig.provider, providerConfig.model),
              }
            : null,
        }),
      });

      setDraftPlan(plan);

      const origin = readPlanOrigin(plan);
      const warnings = readPlanWarnings(plan);
      const originLine =
        origin.kind === 'local-provider-failed'
          ? `${PROVIDER_FAILED_WARNING_PREFIX}${origin.providerError}`
          : origin.kind === 'local-no-key'
            ? `${NO_PROVIDER_KEY_WARNING}.`
            : '';

      addAiMessage({
        role: 'assistant',
        content: [
          originLine,
          plan.summary,
          warnings.length ? `Warnings: ${warnings.join(' ')}` : '',
        ]
          .filter(Boolean)
          .join(' '),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI planning failed.';
      setRequestError(message);
      addAiMessage({ role: 'assistant', content: `Planning failed: ${message}` });
    } finally {
      setIsPlanning(false);
    }
  };

  const handleApplyPlan = async () => {
    if (!draftPlan || draftPlan.actions.length === 0 || isApplying) {
      return;
    }

    setIsApplying(true);
    setRequestError(null);

    try {
      const review = await requestJson<{ approved: boolean; warnings: string[] }>(
        '/api/ai/confirm-ai-plan',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({ plan: draftPlan }),
        },
      );

      if (review.approved) {
        const plan = draftPlan;
        const knownLogIds = new Set(
          useEditorStore.getState().commandLog.map((entry) => entry.id),
        );
        // `executePlan` currently returns nothing; a newer store may return
        // per-action results, so whatever comes back is inspected defensively.
        const returned: unknown = (executePlan as (plan: AiPlan) => unknown)(plan);
        const returnedResults = readReturnedResults(returned, plan.actions.length);
        const newLogEntries = useEditorStore
          .getState()
          .commandLog.filter((entry) => entry.source === 'ai' && !knownLogIds.has(entry.id));

        setApplyReport({
          summary: plan.summary,
          items: plan.actions.map((action, index) => {
            const returnedResult = returnedResults?.[index];

            if (returnedResult) {
              return {
                id: action.id,
                title: action.title,
                type: action.type,
                outcome: returnedResult.ok ? 'applied' : 'failed',
                detail: returnedResult.summary,
              };
            }

            // Fall back to the command log: claim the first new entry that
            // recorded this exact command.
            const serialized = JSON.stringify(action.payload);
            const logIndex = newLogEntries.findIndex(
              (entry) =>
                entry.command === action.payload ||
                JSON.stringify(entry.command) === serialized,
            );
            const [logEntry] = logIndex === -1 ? [] : newLogEntries.splice(logIndex, 1);

            return {
              id: action.id,
              title: action.title,
              type: action.type,
              outcome: logEntry ? (logEntry.result.ok ? 'applied' : 'failed') : 'unknown',
              detail: logEntry
                ? [logEntry.result.summary, ...logEntry.result.warnings].filter(Boolean).join(' ')
                : 'The editor did not report a result for this action.',
            };
          }),
        });
      } else {
        addAiMessage({
          role: 'assistant',
          content: review.warnings.join(' '),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Plan confirmation failed.';
      setRequestError(message);
      addAiMessage({ role: 'assistant', content: `Apply failed: ${message}` });
    } finally {
      setIsApplying(false);
    }
  };

  const updateProviderConfig = (
    config: Parameters<typeof setProviderConfig>[0],
  ) => {
    setProviderConfig(config);
    setKeyVerified(false);
    setRequestError(null);
    setProviderValidation({
      status: 'idle',
      message: 'Not verified yet.',
    });
  };

  const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleGeneratePlan();
    }
  };

  return (
    <aside className="signal-panel signal-panel--ai">
      <div className="signal-panel__header">
        <div>
          <p className="signal-kicker">AI rail</p>
          <h2>Plan, inspect, apply</h2>
        </div>
        <span className="signal-chip signal-chip--success">
          {TOOL_CONTRACTS.length} tools
        </span>
      </div>

      <section className="signal-card">
        <div className="signal-provider-grid">
          <label>
            <span>Provider</span>
            <select
              value={providerConfig.provider}
              onChange={(event) =>
                updateProviderConfig({
                  provider: event.target.value as typeof providerConfig.provider,
                  model: getDefaultModel(
                    event.target.value as typeof providerConfig.provider,
                  ),
                })
              }
            >
              <option value="anthropic">Claude</option>
              <option value="gemini">Gemini</option>
            </select>
          </label>

          <label>
            <span>Model</span>
            <input
              value={providerConfig.model}
              list="signal-model-options"
              spellCheck={false}
              autoComplete="off"
              onChange={(event) =>
                updateProviderConfig({
                  model: event.target.value,
                })
              }
            />
            <datalist id="signal-model-options">
              {modelOptions.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
            <small>
              {providerConfig.provider === 'gemini'
                ? 'Free text. The suggestions may be out of date: type the exact model id from Google AI Studio.'
                : 'Free text. Pick a suggestion or type any Claude model id.'}
            </small>
          </label>

          <label className="signal-provider-grid__full">
            <span>API key</span>
            <input
              type="password"
              autoComplete="off"
              value={providerConfig.apiKey}
              placeholder="Bring your own key"
              onChange={(event) =>
                updateProviderConfig({
                  apiKey: event.target.value,
                })
              }
            />
          </label>
        </div>

        <div className="signal-inline-controls">
          <button
            className="signal-button signal-button--ghost"
            onClick={handleValidateProvider}
            disabled={isValidating || !hasApiKey}
          >
            {isValidating ? 'Verifying…' : 'Verify key'}
          </button>
          <span
            className={`signal-chip ${
              providerValidation.status === 'valid'
                ? keyVerified
                  ? 'signal-chip--success'
                  : 'signal-chip--neutral'
                : providerValidation.status === 'invalid'
                  ? 'signal-chip--warning'
                  : 'signal-chip--neutral'
            }`}
          >
            {providerValidation.message}
          </span>
        </div>
      </section>

      {requestError && (
        <p className="signal-request-error" role="alert">
          {requestError}
        </p>
      )}

      <section className="signal-card">
        <p className="signal-card__eyebrow">Prompt the editor</p>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={handlePromptKeyDown}
          placeholder={PROMPT_PLACEHOLDER}
          aria-label="Prompt"
          className="signal-textarea"
          rows={6}
        />
        <p className="signal-empty">
          {promptTooLong
            ? `Prompt is too long: ${trimmedPrompt.length} / ${MAX_PROMPT_LENGTH} characters.`
            : hasApiKey
              ? 'Cmd/Ctrl + Enter to generate.'
              : 'Cmd/Ctrl + Enter to generate. No provider key: plans come from the local keyword matcher.'}
        </p>
        <div className="signal-inline-controls">
          <button
            className="signal-button signal-button--primary"
            onClick={handleGeneratePlan}
            disabled={!canGenerate}
          >
            {isPlanning ? 'Planning…' : 'Generate plan'}
          </button>
          <button
            className="signal-button signal-button--secondary"
            disabled={!canApply}
            onClick={handleApplyPlan}
          >
            {isApplying ? 'Applying…' : 'Apply approved plan'}
          </button>
        </div>
      </section>

      <section className="signal-card signal-card--list">
        <div className="signal-section-title">
          <span>Conversation</span>
          <span>{aiMessages.length}</span>
        </div>
        <div className="signal-message-list">
          {aiMessages.map((message) => (
            <article key={message.id} className={`signal-message signal-message--${message.role}`}>
              <span>{message.role}</span>
              <p>{message.content}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="signal-card signal-card--list">
        <div className="signal-section-title">
          <span>Draft plan</span>
          <span>{draftPlan?.actions.length ?? 0} actions</span>
        </div>
        {!draftPlan ? (
          applyReport ? (
            <div className="signal-plan">
              <p className="signal-plan__summary">
                Applied: {applyReport.summary} (
                {applyReport.items.filter((item) => item.outcome === 'applied').length} of{' '}
                {applyReport.items.length} succeeded)
              </p>
              <div className="signal-plan__actions">
                {applyReport.items.map((item) => (
                  <article key={item.id} className="signal-action">
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </div>
                    <span
                      className={`signal-chip ${
                        item.outcome === 'applied'
                          ? 'signal-chip--success'
                          : item.outcome === 'failed'
                            ? 'signal-chip--warning'
                            : 'signal-chip--neutral'
                      }`}
                    >
                      {item.outcome === 'applied'
                        ? 'Applied'
                        : item.outcome === 'failed'
                          ? 'Failed'
                          : 'No result'}{' '}
                      · {item.type}
                    </span>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <p className="signal-empty">
              Generate a plan to see structured actions, rationale, and warnings.
            </p>
          )
        ) : (
          <div className="signal-plan">
            {planOrigin?.kind === 'local-provider-failed' && (
              <p className="signal-request-error" role="alert" style={{ margin: 0 }}>
                {PROVIDER_FAILED_WARNING_PREFIX}
                {planOrigin.providerError}
              </p>
            )}
            {planOrigin?.kind === 'local-no-key' && (
              <p className="signal-request-error" role="status" style={{ margin: 0 }}>
                {NO_PROVIDER_KEY_WARNING}. This is not an AI plan.
              </p>
            )}
            {planOrigin?.kind === 'provider' && (
              <div className="signal-plan__warnings">
                <span className="signal-chip signal-chip--success">
                  Provider plan ·{' '}
                  {resolveModelId(providerConfig.provider, providerConfig.model)}
                </span>
              </div>
            )}
            <p className="signal-plan__summary">{draftPlan.summary}</p>
            {draftPlan.actions.length === 0 && (
              <p className="signal-empty">This plan has no actions, so there is nothing to apply.</p>
            )}
            <div className="signal-plan__warnings">
              {planWarnings.map((warning, index) => (
                <span key={`${index}-${warning}`} className="signal-chip signal-chip--warning">
                  {warning}
                </span>
              ))}
            </div>
            <div className="signal-plan__actions">
              {draftPlan.actions.map((action) => (
                <article key={action.id} className="signal-action">
                  <div>
                    <strong>{action.title}</strong>
                    <p>{action.reason}</p>
                  </div>
                  <span className="signal-chip signal-chip--neutral">{action.type}</span>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="signal-card signal-card--list">
        <div className="signal-section-title">
          <span>Tool trace</span>
          <span>{commandLog.length}</span>
        </div>
        <div className="signal-log-list">
          {commandLog.length === 0 ? (
            <p className="signal-empty">Applied commands will appear here.</p>
          ) : (
            commandLog.slice(0, 6).map((entry) => (
              <article key={entry.id} className="signal-log-item">
                <strong>{entry.result.summary}</strong>
                <small>
                  {entry.source} · {entry.command.type}
                </small>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="signal-card signal-card--list">
        <div className="signal-section-title">
          <span>Version history</span>
          <span>{versions.length}</span>
        </div>
        <div className="signal-version-list">
          {latestVersions.map((version) => (
            <button
              key={version.id}
              className="signal-version-item"
              onClick={() => restoreVersion(version.id)}
            >
              <strong>{version.label}</strong>
              <small suppressHydrationWarning>
                {version.source} · {formatSnapshotTime(version.createdAt)} UTC
              </small>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
};

export default AIRail;
