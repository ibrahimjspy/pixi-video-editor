'use client';

import { useEditorStore } from '@/store/editorStore';
import { EditorElement, TextElement } from '@/types/editor';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_TEXT = 'Add your text here';

const FONTS = [
  'Arial',
  'Verdana',
  'Georgia',
  'Courier New',
  'Comic Sans MS',
  'Times New Roman',
  'Impact',
  'Trebuchet MS',
];

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
      color: '#ffffff',
      filters: {
        // Color Adjustments
        brightness: 1,
        contrast: 1,
        saturation: 1,
        hue: 0,
        vibrance: 0,
        gamma: 1,
        sepia: 0,
        grayscale: 0,
        invert: 0,
        
        // Blur & Sharpness
        blur: 0,
        sharpness: 0,
        kawaseBlur: 0,
        zoomBlur: 0,
        tiltShift: 0,
        
        // Distortion Effects
        bulgePinch: 0,
        twist: 0,
        shockwave: 0,
        displacement: 0,
        
        // Visual Effects
        glow: 0,
        outline: 0,
        dropShadow: 0,
        bevel: 0,
        emboss: 0,
        pixelate: 0,
        dot: 0,
        crossHatch: 0,
        
        // Vintage & Retro
        crt: 0,
        oldFilm: 0,
        ascii: 0,
        noise: 0,
        
        // Advanced Effects
        bloom: 0,
        godray: 0,
        reflection: 0,
        waterReflection: 0,
        rgbSplit: 0,
        colorReplace: 0,
        multiColorReplace: 0,
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
    <div>
      <h3 className="text-sm font-semibold text-white mb-3">✏️ Text Editor</h3>

      <button
        onClick={handleAddText}
        className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg font-semibold transition-all shadow-md hover:shadow-lg mb-4"
      >
        ➕ Add Text
      </button>

      {element?.type === 'text' && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-300 mb-2 block">
              Text Content
            </label>
            <input
              type="text"
              value={element.text}
              onChange={(e) => handleChange('text', e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              placeholder="Enter text..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-300 mb-2 block">
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
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-300 mb-2 block">
                Color
              </label>
              <input
                type="color"
                value={element.color}
                onChange={(e) => handleChange('color', e.target.value)}
                className="w-full h-10 bg-gray-900 border border-gray-600 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-300 mb-2 block">
              Font Family
            </label>
            <select
              value={element.fontFamily}
              onChange={(e) => handleChange('fontFamily', e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
            >
              {FONTS.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

export default TextPanel;
