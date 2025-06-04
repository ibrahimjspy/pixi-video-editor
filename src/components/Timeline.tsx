'use client';

import { useEditorStore } from '@/store/editorStore';
import { EditorElement } from '@/types/editor';

const Timeline = () => {
  const elements = useEditorStore((state) => state.elements);
  const selectedElementId = useEditorStore((state) => state.selectedElementId);
  const setSelectedElement = useEditorStore(
    (state) => state.setSelectedElement,
  );

  const getLabel = (el: EditorElement) => {
    switch (el.type) {
      case 'image':
        return '🖼️ Image';
      case 'video':
        return '🎬 Video';
      case 'text':
        return '🔤 Text';
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
              border: '1px solid',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.2s',
              backgroundColor:
                selectedElementId === el.id ? '#3b82f6' : '#e5e7eb',
              color: selectedElementId === el.id ? '#ffffff' : '#333333',
              borderColor: selectedElementId === el.id ? '#1e40af' : '#9ca3af',
            }}
          >
            {getLabel(el)}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Timeline;
