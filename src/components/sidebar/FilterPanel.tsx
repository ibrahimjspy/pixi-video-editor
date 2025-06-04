import { useEditorStore } from '@/store/editorStore';

const FilterPanel = () => {
  const selectedElementId = useEditorStore((s) => s.selectedElementId);
  const updateElement = useEditorStore((s) => s.updateElement);
  const element = useEditorStore((s) =>
    s.elements.find((el) => el.id === s.selectedElementId),
  );

  if (!element || (element.type !== 'image' && element.type !== 'video'))
    return null;

  const handleFilterChange = (
    filter: 'brightness' | 'contrast' | 'sharpness',
    value: number,
  ) => {
    updateElement(element.id, {
      filters: {
        ...element.filters,
        [filter]: value,
      },
    });
  };

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'black' }}>
        Filters
      </div>

      {(['brightness', 'contrast'] as const).map((filter) => (
        <div key={filter} style={{ marginBottom: '1rem', color: 'black' }}>
          <label
            style={{
              fontSize: '13px',
              display: 'block',
              marginBottom: '0.25rem',
              color: 'black',
            }}
          >
            {filter.charAt(0).toUpperCase() + filter.slice(1)}
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.01"
            value={element.filters[filter]}
            onChange={(e) =>
              handleFilterChange(filter, parseFloat(e.target.value))
            }
            style={{ width: '100%' }}
          />
        </div>
      ))}
    </div>
  );
};

export default FilterPanel;
