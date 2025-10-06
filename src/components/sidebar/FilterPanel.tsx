/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEditorStore } from '@/store/editorStore';
import { useCallback, useRef, useEffect } from 'react';

const FilterPanel = () => {
  const updateElement = useEditorStore((s) => s.updateElement);
  const element = useEditorStore((s) =>
    s.elements.find((el) => el.id === s.selectedElementId),
  );

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleFilterChange = useCallback((
    filter: 'brightness' | 'contrast' | 'sharpness' | 'saturation' | 'hue' | 'blur' | 'sepia' | 'grayscale' | 'invert' | 'vibrance' | 'gamma' | 'noise',
    value: number,
  ) => {
    if (!element) return;

    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set new timeout for debounced update
    debounceTimeoutRef.current = setTimeout(() => {
      updateElement(element.id, {
        filters: {
          ...element.filters,
          [filter]: value,
        },
      });
    }, 100); // 100ms debounce delay
  }, [element, updateElement]);

  const handleResetFilters = useCallback(() => {
    if (!element) return;
    
    updateElement(element.id, {
      filters: {
        brightness: 1,
        contrast: 1,
        sharpness: 0,
        saturation: 1,
        hue: 0,
        blur: 0,
        sepia: 0,
        grayscale: 0,
        invert: 0,
        vibrance: 0,
        gamma: 1,
        noise: 0,
      },
    });
  }, [element, updateElement]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

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
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">🎨 Filters</h3>
        <button
          onClick={handleResetFilters}
          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          title="Reset all filters"
        >
          🔄 Reset
        </button>
      </div>

      <div className="space-y-4 max-h-96 overflow-y-auto">
        {[
          { key: 'brightness', label: '☀️ Brightness', min: 0, max: 2, step: 0.01, default: 1, gradient: 'linear-gradient(to right, #000000, #888888, #ffffff)' },
          { key: 'contrast', label: '🔲 Contrast', min: 0, max: 2, step: 0.01, default: 1, gradient: 'linear-gradient(to right, #666666, #aaaaaa)' },
          { key: 'saturation', label: '🌈 Saturation', min: 0, max: 2, step: 0.01, default: 1, gradient: 'linear-gradient(to right, #666666, #ff6b6b, #4ecdc4)' },
          { key: 'hue', label: '🎨 Hue', min: -180, max: 180, step: 1, default: 0, gradient: 'linear-gradient(to right, #ff0000, #00ff00, #0000ff, #ff0000)' },
          { key: 'blur', label: '🌫️ Blur', min: 0, max: 1, step: 0.01, default: 0, gradient: 'linear-gradient(to right, #000000, #666666)' },
          { key: 'sepia', label: '📸 Sepia', min: 0, max: 1, step: 0.01, default: 0, gradient: 'linear-gradient(to right, #000000, #8b4513)' },
          { key: 'grayscale', label: '⚫ Grayscale', min: 0, max: 1, step: 0.01, default: 0, gradient: 'linear-gradient(to right, #000000, #666666)' },
          { key: 'invert', label: '🔄 Invert', min: 0, max: 1, step: 0.01, default: 0, gradient: 'linear-gradient(to right, #000000, #ffffff)' },
          { key: 'vibrance', label: '✨ Vibrance', min: -1, max: 1, step: 0.01, default: 0, gradient: 'linear-gradient(to right, #666666, #ff6b6b, #4ecdc4)' },
          { key: 'gamma', label: '🔆 Gamma', min: 0.5, max: 2, step: 0.01, default: 1, gradient: 'linear-gradient(to right, #000000, #888888, #ffffff)' },
          { key: 'sharpness', label: '⚡ Sharpness', min: -1, max: 1, step: 0.01, default: 0, gradient: 'linear-gradient(to right, #666666, #ffffff)' },
          { key: 'noise', label: '📺 Noise', min: 0, max: 1, step: 0.01, default: 0, gradient: 'linear-gradient(to right, #000000, #666666)' },
        ].map(({ key, label, min, max, step, default: defaultValue, gradient }) => (
          <div key={key}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-300">
                {label}
              </label>
              <span className="text-xs text-gray-500 font-mono">
                {(element.filters[key as keyof typeof element.filters] || defaultValue).toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={element.filters[key as keyof typeof element.filters] || defaultValue}
              onChange={(e) =>
                handleFilterChange(key as any, parseFloat(e.target.value))
              }
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              style={{
                background: gradient
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default FilterPanel;
