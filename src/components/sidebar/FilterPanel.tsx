/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEditorStore } from '@/store/editorStore';
import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { FILTER_DEFINITIONS, FILTER_CATEGORIES, FilterCategory } from '@/lib/renderer/filterDefinitions';

const FilterPanel = () => {
  const updateElement = useEditorStore((s) => s.updateElement);
  const element = useEditorStore((s) =>
    s.elements.find((el) => el.id === s.selectedElementId),
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory | 'All'>('All');
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleFilterChange = useCallback((
    filter: string,
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
    
    const resetFilters: any = {};
    FILTER_DEFINITIONS.forEach(filter => {
      resetFilters[filter.key] = filter.default;
    });
    
    updateElement(element.id, {
      filters: resetFilters,
    });
  }, [element, updateElement]);

  // Filter definitions based on search and category
  const filteredFilters = useMemo(() => {
    return FILTER_DEFINITIONS.filter(filter => {
      const matchesSearch = searchTerm === '' || 
        filter.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        filter.searchTerms.some(term => term.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesCategory = selectedCategory === 'All' || filter.category === selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, selectedCategory]);

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

      {/* Search Bar */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="🔍 Search filters..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Category Filter */}
      <div className="mb-3">
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setSelectedCategory('All')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              selectedCategory === 'All' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            All
          </button>
          {FILTER_CATEGORIES.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                selectedCategory === category 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Count */}
      <div className="mb-3 text-xs text-gray-400">
        {filteredFilters.length} filter{filteredFilters.length !== 1 ? 's' : ''} found
      </div>

      <div className="space-y-4 max-h-96 overflow-y-auto">
        {filteredFilters.map((filter) => (
          <div key={filter.key}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-300">
                  {filter.emoji} {filter.label}
                </label>
                <span className="text-xs text-gray-500">{filter.description}</span>
              </div>
              <span className="text-xs text-gray-500 font-mono">
                {(element.filters[filter.key as keyof typeof element.filters] || filter.default).toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={filter.min}
              max={filter.max}
              step={filter.step}
              value={element.filters[filter.key as keyof typeof element.filters] || filter.default}
              onChange={(e) =>
                handleFilterChange(filter.key, parseFloat(e.target.value))
              }
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              style={{
                background: filter.gradient
              }}
            />
          </div>
        ))}
        
        {filteredFilters.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <div className="text-2xl mb-2">🔍</div>
            <div className="text-sm">No filters found</div>
            <div className="text-xs">Try a different search term or category</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FilterPanel;
