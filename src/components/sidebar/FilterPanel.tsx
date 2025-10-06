import { useEditorStore } from '@/store/editorStore';

const FilterPanel = () => {
  const selectedElementId = useEditorStore((s) => s.selectedElementId);
  const updateElement = useEditorStore((s) => s.updateElement);
  const element = useEditorStore((s) =>
    s.elements.find((el) => el.id === s.selectedElementId),
  );

  const handleFilterChange = (
    filter: 'brightness' | 'contrast' | 'sharpness',
    value: number,
  ) => {
    if (!element) return;
    updateElement(element.id, {
      filters: {
        ...element.filters,
        [filter]: value,
      },
    });
  };

  if (!element || (element.type !== 'image' && element.type !== 'video')) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">🎨 Filters</h3>
        <div className="text-xs text-gray-500 text-center py-4">
          Select an image or video to apply filters
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-white mb-3">🎨 Filters</h3>

      <div className="space-y-4">
        {(['brightness', 'contrast'] as const).map((filter) => (
          <div key={filter}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-300">
                {filter === 'brightness' ? '☀️ Brightness' : '🔲 Contrast'}
              </label>
              <span className="text-xs text-gray-500 font-mono">
                {element.filters[filter].toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={element.filters[filter]}
              onChange={(e) =>
                handleFilterChange(filter, parseFloat(e.target.value))
              }
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              style={{
                background: filter === 'brightness' 
                  ? 'linear-gradient(to right, #000000, #888888, #ffffff)'
                  : 'linear-gradient(to right, #666666, #aaaaaa)'
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default FilterPanel;
