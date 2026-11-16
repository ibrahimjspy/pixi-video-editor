import { create } from 'zustand';
import { useEditorStore } from '@/store/editorStore';
import { getTimelineDurationMs } from '@/lib/editor/timeline';
import { getPreviewHandle } from '@/lib/renderer/previewHandle';

/**
 * The playhead and the transport (play, pause, scrub).
 *
 * This lives apart from the project store on purpose: the playhead moves 60
 * times a second during playback and is not part of the document, so it never
 * enters undo history, autosave, or snapshots.
 *
 * Time is wall-clock based: while playing, the position is the position where
 * play started plus the real time elapsed. Video elements follow this clock
 * (and are nudged back if they drift), so a slow decoder cannot stretch time.
 */
interface PlaybackStore {
  /** Playhead position in milliseconds from the start of the timeline. */
  currentMs: number;
  isPlaying: boolean;
  loop: boolean;
  /** True while an export owns the preview; transport controls are ignored. */
  isLocked: boolean;

  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** Moves the playhead. Pauses playback when `pause` is true (scrubbing). */
  seek: (ms: number, options?: { pause?: boolean }) => void;
  stepFrames: (frames: number) => void;
  setLoop: (loop: boolean) => void;
  setLocked: (locked: boolean) => void;
}

/** Frame length used for stepping with the keyboard. */
export const STEP_FRAME_MS = 1000 / 30;

const getDurationMs = () => getTimelineDurationMs(useEditorStore.getState().project);

let frameHandle: number | null = null;
let playStartedAtPerf = 0;
let playStartedAtMs = 0;
let lastTickPerf = 0;
let stalledForMs = 0;

/** Longest the clock waits for a video that is not ready before moving on. */
const MAX_STALL_MS = 4000;

const stopLoop = () => {
  if (frameHandle !== null) {
    cancelAnimationFrame(frameHandle);
    frameHandle = null;
  }
};

export const usePlaybackStore = create<PlaybackStore>((set, get) => {
  const tick = (now: number) => {
    frameHandle = null;

    const state = get();

    if (!state.isPlaying) {
      return;
    }

    // While a video on screen is loading or seeking, time stands still: the
    // start reference slides forward by exactly the time spent waiting.
    const sinceLastTick = now - lastTickPerf;
    lastTickPerf = now;

    if (stalledForMs < MAX_STALL_MS && getPreviewHandle()?.renderer.isBuffering()) {
      playStartedAtPerf += sinceLastTick;
      stalledForMs += sinceLastTick;
      frameHandle = requestAnimationFrame(tick);
      return;
    }

    if (!getPreviewHandle()?.renderer.isBuffering()) {
      stalledForMs = 0;
    }

    const duration = getDurationMs();
    const elapsed = playStartedAtMs + (now - playStartedAtPerf);

    if (elapsed >= duration) {
      if (state.loop) {
        playStartedAtPerf = now;
        playStartedAtMs = 0;
        set({ currentMs: 0 });
      } else {
        set({ currentMs: duration, isPlaying: false });
        return;
      }
    } else {
      set({ currentMs: elapsed });
    }

    frameHandle = requestAnimationFrame(tick);
  };

  const start = (fromMs: number) => {
    stopLoop();
    playStartedAtPerf = performance.now();
    playStartedAtMs = fromMs;
    lastTickPerf = playStartedAtPerf;
    stalledForMs = 0;
    frameHandle = requestAnimationFrame(tick);
  };

  return {
    currentMs: 0,
    isPlaying: false,
    loop: false,
    isLocked: false,

    play: () => {
      const state = get();

      if (state.isLocked || state.isPlaying) {
        return;
      }

      const duration = getDurationMs();
      // Pressing play at the very end starts over, as most players do.
      const from = state.currentMs >= duration - 1 ? 0 : state.currentMs;

      set({ isPlaying: true, currentMs: from });
      start(from);
    },

    pause: () => {
      stopLoop();

      if (get().isPlaying) {
        set({ isPlaying: false });
      }
    },

    toggle: () => {
      if (get().isPlaying) {
        get().pause();
      } else {
        get().play();
      }
    },

    seek: (ms, options = {}) => {
      const state = get();

      if (state.isLocked) {
        return;
      }

      const next = Math.min(Math.max(0, ms), getDurationMs());

      if (options.pause) {
        stopLoop();
        set({ currentMs: next, isPlaying: false });
        return;
      }

      set({ currentMs: next });

      if (state.isPlaying) {
        start(next);
      }
    },

    stepFrames: (frames) => {
      get().seek(get().currentMs + frames * STEP_FRAME_MS, { pause: true });
    },

    setLoop: (loop) => set({ loop }),

    setLocked: (isLocked) => {
      if (isLocked) {
        stopLoop();
        set({ isLocked, isPlaying: false });
      } else {
        set({ isLocked });
      }
    },
  };
});

/**
 * Keeps the playhead inside the timeline when edits make it shorter (for
 * example deleting the last clip while the playhead is past its end).
 */
export const startPlayheadClamp = (): (() => void) =>
  useEditorStore.subscribe((state, previous) => {
    if (state.project === previous.project) {
      return;
    }

    const { currentMs, seek } = usePlaybackStore.getState();
    const duration = getTimelineDurationMs(state.project);

    if (currentMs > duration) {
      seek(duration);
    }
  });

/**
 * Pauses playback when the tab is hidden. Browsers stop animation frames for
 * hidden tabs but let video elements keep playing, so without this the sound
 * would run on while the playhead stood still.
 */
export const startHiddenTabPause = (): (() => void) => {
  const handleVisibility = () => {
    if (document.hidden) {
      usePlaybackStore.getState().pause();
    }
  };

  document.addEventListener('visibilitychange', handleVisibility);

  return () => document.removeEventListener('visibilitychange', handleVisibility);
};
