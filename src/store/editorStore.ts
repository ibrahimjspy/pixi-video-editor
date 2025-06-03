// store/editorStore.ts
import { create } from 'zustand';

export type AssetType = 'video' | 'image';

export interface Asset {
  id: string;
  type: AssetType;
  file: File;
  url: string;
  filters: {
    brightness: number;
    contrast: number;
    sharpness: number;
  };
}

interface EditorState {
  assets: Asset[];
  selectedAssetId: string | null;
  addAsset: (asset: Asset) => void;
  setSelectedAsset: (id: string) => void;
  updateFilters: (id: string, filters: Partial<Asset['filters']>) => void;
  updateAssetFilter: (
    id: string,
    filterName: keyof Asset['filters'],
    value: number,
  ) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  assets: [],
  selectedAssetId: null,
  addAsset: (asset) => set((state) => ({ assets: [...state.assets, asset] })),
  setSelectedAsset: (id) => set({ selectedAssetId: id }),
  updateFilters: (id, filters) =>
    set((state) => ({
      assets: state.assets.map((a) =>
        a.id === id ? { ...a, filters: { ...a.filters, ...filters } } : a,
      ),
    })),
  updateAssetFilter: (id, filterName, value) =>
    set((state) => ({
      assets: state.assets.map((a) =>
        a.id === id
          ? { ...a, filters: { ...a.filters, [filterName]: value } }
          : a,
      ),
    })),
}));
