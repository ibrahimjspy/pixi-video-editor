/* eslint-disable @typescript-eslint/no-explicit-any */
// store/editorStore.ts
import { create } from 'zustand';
import { EditorElement } from '@/types/editor';

interface EditorState {
  elements: EditorElement[];
  selectedElementId: string | null;
  addElement: (element: EditorElement) => void;
  updateElement: (id: string, updates: Partial<EditorElement>) => void;
  removeElement: (id: string) => void;
  setSelectedElement: (id: string | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  elements: [],
  selectedElementId: null,
  addElement: (element) =>
    set((state) => ({ elements: [...state.elements, element] })),
  updateElement: (id, updates) =>
    set((state: any) => ({
      elements: state.elements.map((el: any) =>
        el.id === id
          ? { ...el, ...updates, type: el.type } // Ensure type is not overwritten
          : el,
      ),
    })),
  removeElement: (id) =>
    set((state) => ({
      elements: state.elements.filter((el) => el.id !== id),
      selectedElementId:
        state.selectedElementId === id ? null : state.selectedElementId,
    })),
  setSelectedElement: (id) => set({ selectedElementId: id }),
}));
