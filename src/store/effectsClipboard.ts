import { create } from 'zustand';
import type { EffectInstance, LayerLook } from '@/types/editor';

/** A copied look and effect stack, ready to paste onto another layer. */
export interface EffectsClip {
  /** Name of the layer the treatment was copied from, for the paste tooltip. */
  from: string;
  look: LayerLook | null;
  effects: EffectInstance[];
}

interface EffectsClipboardStore {
  clip: EffectsClip | null;
  copy: (clip: EffectsClip) => void;
}

/**
 * Editor-wide clipboard for effects. It is not part of the project, so it
 * stays out of undo history and autosave.
 */
export const useEffectsClipboard = create<EffectsClipboardStore>((set) => ({
  clip: null,
  copy: (clip) => set({ clip }),
}));
