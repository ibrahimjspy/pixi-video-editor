'use client';

import { useEditorStore } from '@/store/editorStore';
import { v4 as uuidv4 } from 'uuid';
import { useCallback } from 'react';

const Sidebar = () => {
  const addAsset = useEditorStore((state) => state.addAsset);
  const setSelectedAsset = useEditorStore((state) => state.setSelectedAsset);
  const updateAssetFilter = useEditorStore((state) => state.updateAssetFilter);
  const selectedAssetId = useEditorStore((state) => state.selectedAssetId);
  const assets = useEditorStore((state) => state.assets);
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId);

  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const url = URL.createObjectURL(file);
      const type = file.type.startsWith('video') ? 'video' : 'image';
      const id = uuidv4();

      addAsset({
        id,
        type,
        file,
        url,
        filters: {
          brightness: 1,
          contrast: 1,
          sharpness: 0,
        },
      });

      setSelectedAsset(id);
    },
    [addAsset, setSelectedAsset],
  );

  const handleFilterChange = useCallback(
    (filterName: 'brightness' | 'contrast' | 'sharpness', value: number) => {
      if (!selectedAssetId) return;
      updateAssetFilter(selectedAssetId, filterName, value);
    },
    [selectedAssetId, updateAssetFilter],
  );

  return (
    <div className="p-4 w-64 bg-gray-100 h-full overflow-y-auto">
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">
          Upload Image/Video
        </label>
        <input
          type="file"
          accept="video/*,image/*"
          onChange={handleUpload}
          className="w-full text-sm text-gray-700"
        />
      </div>

      {selectedAsset && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Brightness</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={selectedAsset.filters.brightness}
              onChange={(e) =>
                handleFilterChange('brightness', parseFloat(e.target.value))
              }
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Contrast</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={selectedAsset.filters.contrast}
              onChange={(e) =>
                handleFilterChange('contrast', parseFloat(e.target.value))
              }
              className="w-full"
            />
          </div>

        </div>
      )}
    </div>
  );
};

export default Sidebar;
