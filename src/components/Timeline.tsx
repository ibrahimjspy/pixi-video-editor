'use client';

import { useEditorStore } from '@/store/editorStore';
import classNames from 'classnames';

const Timeline = () => {
  const { assets, selectedAssetId, setSelectedAsset } = useEditorStore();

  return (
    <div className="h-full p-4 overflow-x-auto">
      <div className="text-sm mb-2 text-gray-600">Timeline</div>
      <div className="flex space-x-2">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className={classNames(
              'w-32 h-20 rounded border flex items-center justify-center cursor-pointer transition',
              selectedAssetId === asset.id
                ? 'bg-blue-500 text-white border-blue-700'
                : 'bg-gray-200 text-gray-700 border-gray-400 hover:bg-gray-300',
            )}
            onClick={() => setSelectedAsset(asset.id)}
          >
            {asset.type === 'video' ? '🎬 Video' : '🖼️ Image'}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Timeline;
