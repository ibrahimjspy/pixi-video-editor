'use client';

import { useEditorStore } from '@/store/editorStore';
import { EditorElement } from '@/types/editor';

const Timeline = () => {
  const elements = useEditorStore((state) => state.elements);
  const selectedElementId = useEditorStore((state) => state.selectedElementId);
  const setSelectedElement = useEditorStore(
    (state) => state.setSelectedElement,
  );
  const deleteElement = useEditorStore((state) => state.removeElement);

  const getLabel = (el: EditorElement) => {
    switch (el.type) {
      case 'image':
        return (
          <img
            src={el.url}
            alt="Thumbnail"
            style={{ maxWidth: '100%', maxHeight: '100%' }}
          />
        );
      case 'video':
        return '🎬 Video';
      case 'text':
        return el.text.slice(0, 4) + (el.text.length > 20 ? '...' : '');
      default:
        return '❓ Unknown';
    }
  };

  return (
    <div style={{ height: '100%', padding: '1rem', overflowX: 'auto' }}>
      <div style={{ fontSize: '14px', marginBottom: '0.5rem', color: '#666' }}>
        Timeline
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {elements.map((el) => (
          <div
            key={el.id}
            onClick={() => setSelectedElement(el.id)}
            style={{
              width: '128px',
              height: '80px',
              borderRadius: '6px',
              border: '2px solid',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.2s, border-color 0.2s',
              backgroundColor:
                selectedElementId === el.id ? '#2563eb' : '#e5e7eb',
              color: selectedElementId === el.id ? '#ffffff' : '#333333',
              borderColor: selectedElementId === el.id ? '#1d4ed8' : '#9ca3af',
              boxShadow:
                selectedElementId === el.id
                  ? '0 0 8px rgba(37, 99, 235, 0.6)'
                  : 'none',
              position: 'relative',
            }}
          >
            {getLabel(el)}
            {selectedElementId === el.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteElement(el.id);
                }}
                style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                  lineHeight: '16px',
                }}
              >
                🗑️
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Timeline;
