'use client';

import { useEditorStore } from '@/store/editorStore';
import { EditorElement, TextElement } from '@/types/editor';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_TEXT = 'Add your text here';

const TextPanel = () => {
  const addElement = useEditorStore((s) => s.addElement);
  const updateElement = useEditorStore((s) => s.updateElement);
  const selectedElementId = useEditorStore((s) => s.selectedElementId);
  const setSelectedElement = useEditorStore((s) => s.setSelectedElement);
  const element = useEditorStore((s) =>
    s.elements.find((el) => el.id === selectedElementId),
  );

  const handleAddText = () => {
    const newText: TextElement = {
      id: uuidv4(),
      type: 'text',
      text: DEFAULT_TEXT,
      x: 100,
      y: 100,
      width: 300,
      height: 100,
      rotation: 0,
      fontSize: 32,
      fontFamily: 'Arial',
      color: '#000000',
      filters: {
        brightness: 1,
        contrast: 1,
        sharpness: 0,
      },
    };

    addElement(newText);
    setSelectedElement(newText.id);
  };

  const handleChange = (key: keyof TextElement, value: any) => {
    if (!element || element.type !== 'text') return;
    updateElement(element.id, { [key]: value });
  };

  return (
    <div style={{ color: 'black' }}>
      <div
        style={{
          fontWeight: 600,
          marginBottom: '0.5rem',
          color: 'black',
        }}
      >
        Text
      </div>

      <button
        onClick={handleAddText}
        style={{
          marginBottom: '1rem',
          padding: '0.5rem',
          width: '100%',
          backgroundColor: '#3b82f6',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        ➕ Add Text
      </button>

      {element?.type === 'text' && (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <div>
            <label
              style={{
                fontSize: '13px',
                display: 'block',
                marginBottom: '0.25rem',
              }}
            >
              Text
            </label>
            <input
              type="text"
              value={element.text}
              onChange={(e) => handleChange('text', e.target.value)}
              style={{ width: '100%', padding: '0.25rem', fontSize: '14px' }}
            />
          </div>

          <div>
            <label
              style={{
                fontSize: '13px',
                display: 'block',
                marginBottom: '0.25rem',
              }}
            >
              Font Size
            </label>
            <input
              type="number"
              min={8}
              max={200}
              value={element.fontSize}
              onChange={(e) =>
                handleChange('fontSize', parseInt(e.target.value))
              }
              style={{ width: '100%', padding: '0.25rem', fontSize: '14px' }}
            />
          </div>

          <div>
            <label
              style={{
                fontSize: '13px',
                display: 'block',
                marginBottom: '0.25rem',
              }}
            >
              Font Family
            </label>
            <select
              value={element.fontFamily}
              onChange={(e) => handleChange('fontFamily', e.target.value)}
              style={{ width: '100%', padding: '0.25rem', fontSize: '14px' }}
            >
              <option value="Arial">Arial</option>
              <option value="Verdana">Verdana</option>
              <option value="Georgia">Georgia</option>
              <option value="Courier New">Courier New</option>
              <option value="Comic Sans MS">Comic Sans MS</option>
            </select>
          </div>

          <div>
            <label
              style={{
                fontSize: '13px',
                display: 'block',
                marginBottom: '0.25rem',
              }}
            >
              Color
            </label>
            <input
              type="color"
              value={element.color}
              onChange={(e) => handleChange('color', e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default TextPanel;
