'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '@/store/editorStore';
import { getCurrentLayers, getCurrentScene } from '@/lib/editor/defaults';
import { formatTimecode, getTimelineDurationMs } from '@/lib/editor/timeline';
import {
  exportProject,
  ExportOptions,
  ExportProgress,
  ExportResult,
  isExportSupported,
} from '@/lib/export/exportProject';
import { Icon } from '@/components/icons';

type ExportState =
  | { status: 'idle' }
  | { status: 'running'; progress: ExportProgress }
  | { status: 'done'; result: ExportResult; url: string }
  | { status: 'error'; message: string };

const PHASE_LABELS: Record<ExportProgress['phase'], string> = {
  audio: 'Mixing audio',
  video: 'Rendering frames',
  finishing: 'Finishing the file',
};

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

/**
 * Export settings and progress. The preview is locked while an export runs
 * (the transport, shortcuts and this dialog's backdrop all ignore input), so
 * the project cannot change under the encoder.
 */
const ExportDialog = ({ onClose }: { onClose: () => void }) => {
  const project = useEditorStore((state) => state.project);
  const [options, setOptions] = useState<ExportOptions>({ format: 'mp4', scale: 2, fps: 30 });
  const [state, setState] = useState<ExportState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  const scene = getCurrentScene(project);
  const layerCount = getCurrentLayers(project).length;
  const durationMs = getTimelineDurationMs(project);
  const width = scene.canvasWidth * options.scale;
  const height = scene.canvasHeight * options.scale;
  const frames = Math.ceil((durationMs / 1000) * options.fps);
  const isRunning = state.status === 'running';
  const supported = isExportSupported();

  // Closing mid-export cancels it; a finished file's URL is released.
  useEffect(
    () => () => {
      abortRef.current?.abort();

      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isRunning) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKey);

    return () => window.removeEventListener('keydown', handleKey);
  }, [isRunning, onClose]);

  const start = async () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setState({
      status: 'running',
      progress: { phase: 'audio', fraction: 0, frame: 0, totalFrames: frames },
    });

    try {
      const result = await exportProject({
        project: useEditorStore.getState().project,
        options,
        signal: controller.signal,
        onProgress: (progress) => setState({ status: 'running', progress }),
      });
      const url = URL.createObjectURL(result.blob);

      urlRef.current = url;
      setState({ status: 'done', result, url });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setState({ status: 'idle' });
        return;
      }

      console.error('Export failed', error);
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'The export failed.',
      });
    }
  };

  const update = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  // Rendered at the page root: the top bar's backdrop blur would otherwise
  // become the dialog's containing block and clip it to the bar.
  return createPortal(
    <div className="signal-modal" role="presentation">
      <div
        className="signal-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
      >
        <div className="signal-modal__header">
          <h2 id="export-title">Export video</h2>
          <button
            type="button"
            className="signal-icon-button"
            aria-label="Close"
            disabled={isRunning}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {!supported && (
          <p className="signal-note signal-note--warning">
            This browser cannot encode video. Use a recent Chrome, Edge or Safari.
          </p>
        )}

        <div className="signal-modal__grid">
          <label>
            <span>Size</span>
            <select
              value={options.scale}
              disabled={isRunning}
              onChange={(event) => update('scale', Number(event.target.value) as ExportOptions['scale'])}
            >
              <option value={1}>
                {scene.canvasWidth}×{scene.canvasHeight} (canvas size)
              </option>
              <option value={2}>
                {scene.canvasWidth * 2}×{scene.canvasHeight * 2} (2×)
              </option>
              <option value={4}>
                {scene.canvasWidth * 4}×{scene.canvasHeight * 4} (4×)
              </option>
            </select>
          </label>
          <label>
            <span>Frame rate</span>
            <select
              value={options.fps}
              disabled={isRunning}
              onChange={(event) => update('fps', Number(event.target.value) as ExportOptions['fps'])}
            >
              <option value={24}>24 fps</option>
              <option value={30}>30 fps</option>
              <option value={60}>60 fps</option>
            </select>
          </label>
          <label>
            <span>Format</span>
            <select
              value={options.format}
              disabled={isRunning}
              onChange={(event) => update('format', event.target.value as ExportOptions['format'])}
            >
              <option value="mp4">MP4 (H.264 + AAC)</option>
              <option value="webm">WebM (VP9 + Opus)</option>
            </select>
          </label>
        </div>

        <p className="signal-note">
          {width}×{height} · {formatTimecode(durationMs)} · {frames} frames. Every frame is rendered
          exactly, so the file does not depend on how fast this computer is, but long or large
          exports take a while. Keep this tab open.
        </p>

        {state.status === 'running' && (
          <div className="signal-progress" role="status" aria-live="polite">
            <div className="signal-progress__bar">
              <span style={{ width: `${Math.round(state.progress.fraction * 100)}%` }} />
            </div>
            <small>
              {PHASE_LABELS[state.progress.phase]}
              {state.progress.phase === 'video'
                ? ` · frame ${state.progress.frame} of ${state.progress.totalFrames}`
                : ''}{' '}
              · {Math.round(state.progress.fraction * 100)}%
            </small>
          </div>
        )}

        {state.status === 'error' && (
          <p className="signal-note signal-note--warning" role="alert">
            {state.message}
          </p>
        )}

        {state.status === 'done' && (
          <p className="signal-note" role="status">
            Done: {state.result.width}×{state.result.height}, {state.result.frames} frames,{' '}
            {formatBytes(state.result.blob.size)} ({state.result.videoCodec}
            {state.result.audioCodec ? ` + ${state.result.audioCodec}` : ', no audio'}).
          </p>
        )}

        <div className="signal-modal__actions">
          {state.status === 'done' && (
            <a className="signal-button signal-button--primary" href={state.url} download={state.result.filename}>
              <Icon name="export" />
              Download {state.result.filename}
            </a>
          )}
          {isRunning ? (
            <button
              type="button"
              className="signal-button signal-button--ghost"
              onClick={() => abortRef.current?.abort()}
            >
              Cancel export
            </button>
          ) : (
            <>
              <button
                type="button"
                className="signal-button signal-button--primary"
                disabled={!supported || layerCount === 0}
                title={layerCount === 0 ? 'Add something to the timeline first' : undefined}
                onClick={() => void start()}
              >
                {state.status === 'done' ? 'Export again' : 'Start export'}
              </button>
              <button type="button" className="signal-button signal-button--ghost" onClick={onClose}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ExportDialog;
