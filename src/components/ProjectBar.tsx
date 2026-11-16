'use client';

import { useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { Icon } from '@/components/icons';
import ExportDialog from '@/components/ExportDialog';

/**
 * Top bar: project name, AI provider status, undo/redo, and export.
 *
 * Keyboard shortcuts for undo and redo are registered at the page level by
 * `useEditorShortcuts`; the buttons here only mirror availability.
 */
const ProjectBar = () => {
  const projectName = useEditorStore((state) => state.project.name);
  const provider = useEditorStore((state) => state.providerConfig.provider);
  const providerValidation = useEditorStore((state) => state.providerValidation);
  const canUndo = useEditorStore((state) => state.history.length > 0);
  const canRedo = useEditorStore((state) => state.future.length > 0);
  const setProjectName = useEditorStore((state) => state.setProjectName);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const [isExportOpen, setIsExportOpen] = useState(false);

  return (
    <header className="signal-topbar">
      <div className="signal-brand">
        <div className="signal-brand__mark" aria-hidden="true">
          SS
        </div>
        <div>
          <p className="signal-kicker">Pixi canvas editor</p>
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            className="signal-project-name"
            aria-label="Project name"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="signal-topbar__meta">
        <div className="signal-chip-group">
          <span className="signal-chip signal-chip--neutral">
            {provider === 'anthropic' ? 'Claude BYOK' : 'Gemini BYOK'}
          </span>
          <span
            className={`signal-chip signal-chip--truncate ${
              providerValidation.status === 'valid'
                ? 'signal-chip--success'
                : providerValidation.status === 'invalid'
                  ? 'signal-chip--warning'
                  : 'signal-chip--neutral'
            }`}
            title={providerValidation.message}
          >
            {providerValidation.message}
          </span>
        </div>

        <div className="signal-toolbar">
          <button
            type="button"
            className="signal-button signal-button--ghost"
            disabled={!canUndo}
            title="Undo (Cmd/Ctrl+Z)"
            onClick={undo}
          >
            <Icon name="undo" />
            Undo
          </button>
          <button
            type="button"
            className="signal-button signal-button--ghost"
            disabled={!canRedo}
            title="Redo (Shift+Cmd/Ctrl+Z or Ctrl+Y)"
            onClick={redo}
          >
            <Icon name="redo" />
            Redo
          </button>
          <button
            type="button"
            className="signal-button signal-button--primary"
            title="Render the timeline to a video file"
            onClick={() => setIsExportOpen(true)}
          >
            <Icon name="export" />
            Export
          </button>
        </div>
      </div>
      {isExportOpen && <ExportDialog onClose={() => setIsExportOpen(false)} />}
    </header>
  );
};

export default ProjectBar;
