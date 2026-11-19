'use client';

import { useEffect } from 'react';
import ProjectBar from '@/components/ProjectBar';
import AssetShelf from '@/components/AssetShelf';
import VideoPreview from '@/components/VideoPreview';
import Timeline from '@/components/Timeline';
import RightPanel from '@/components/inspector/RightPanel';
import { useEditorShortcuts } from '@/components/useEditorShortcuts';
import { useEditorStore } from '@/store/editorStore';
import { startHiddenTabPause, startPlayheadClamp } from '@/store/playbackStore';

/**
 * The one restore of the saved project for this page load. Kept at module
 * level so React's development double-invoke of effects cannot start a second
 * restore that races the first.
 */
let hydration: Promise<boolean> | null = null;

export default function Home() {
  useEditorShortcuts();

  useEffect(() => startPlayheadClamp(), []);
  useEffect(() => startHiddenTabPause(), []);

  // Restore the saved project first, then start saving. Starting autosave
  // earlier could overwrite the saved project with the empty default one.
  useEffect(() => {
    let isActive = true;
    let stopAutosave: (() => void) | null = null;

    hydration ??= useEditorStore.getState().hydrateFromStorage();

    void hydration.then(() => {
      if (isActive) {
        stopAutosave = useEditorStore.getState().startAutosave();
      }
    });

    return () => {
      isActive = false;
      stopAutosave?.();
    };
  }, []);

  return (
    <main className="signal-shell">
      <div className="signal-shell__glow signal-shell__glow--one" />
      <div className="signal-shell__glow signal-shell__glow--two" />
      <ProjectBar />

      <div className="signal-workspace">
        <AssetShelf />
        <div className="signal-workspace__center">
          <VideoPreview />
          <Timeline />
        </div>
        <RightPanel />
      </div>
    </main>
  );
}
