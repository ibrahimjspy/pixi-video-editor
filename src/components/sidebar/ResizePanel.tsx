'use client';

import { useState, useEffect, useCallback } from 'react';
import { useEditorStore } from '@/store/editorStore';

const ResizePanel = () => {
  const { elements, selectedElementId, updateElement } = useEditorStore();
  const selectedElement = elements.find((el) => el.id === selectedElementId);
  
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [lockAspectRatio, setLockAspectRatio] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  // Update local state when selected element changes
  useEffect(() => {
    if (selectedElement) {
      setWidth(selectedElement.width);
      setHeight(selectedElement.height);
      setIsUpdating(false);
    } else {
      setWidth(0);
      setHeight(0);
    }
  }, [selectedElement]);

  // Sync with element dimensions when they change externally (e.g., canvas dragging)
  useEffect(() => {
    if (selectedElement && !isUpdating) {
      setWidth(selectedElement.width);
      setHeight(selectedElement.height);
    }
  }, [selectedElement?.width, selectedElement?.height, isUpdating]);

  // Throttled update function
  const debouncedUpdate = useCallback(
    (() => {
      let timeoutId: NodeJS.Timeout;
      return (updates: { width?: number; height?: number }) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          if (selectedElementId && !isUpdating) {
            updateElement(selectedElementId, updates);
          }
        }, 150);
      };
    })(),
    [selectedElementId, updateElement, isUpdating]
  );

  const handleWidthChange = (newWidth: number) => {
    setIsUpdating(true);
    setWidth(newWidth);
    
    if (lockAspectRatio && selectedElement?.originalWidth && selectedElement?.originalHeight) {
      const aspectRatio = selectedElement.originalWidth / selectedElement.originalHeight;
      const newHeight = Math.round(newWidth / aspectRatio);
      setHeight(newHeight);
      debouncedUpdate({ width: newWidth, height: newHeight });
    } else {
      debouncedUpdate({ width: newWidth });
    }
  };

  const handleHeightChange = (newHeight: number) => {
    setIsUpdating(true);
    setHeight(newHeight);
    
    if (lockAspectRatio && selectedElement?.originalWidth && selectedElement?.originalHeight) {
      const aspectRatio = selectedElement.originalWidth / selectedElement.originalHeight;
      const newWidth = Math.round(newHeight * aspectRatio);
      setWidth(newWidth);
      debouncedUpdate({ width: newWidth, height: newHeight });
    } else {
      debouncedUpdate({ height: newHeight });
    }
  };

  const resetToOriginal = () => {
    if (selectedElement?.originalWidth && selectedElement?.originalHeight) {
      setWidth(selectedElement.originalWidth);
      setHeight(selectedElement.originalHeight);
      updateElement(selectedElementId!, {
        width: selectedElement.originalWidth,
        height: selectedElement.originalHeight,
      });
    }
  };

  const fitToCanvas = () => {
    if (selectedElement) {
      const canvasWidth = 800; // From VideoPreview component
      const canvasHeight = 450;
      const elementAspectRatio = selectedElement.originalWidth && selectedElement.originalHeight 
        ? selectedElement.originalWidth / selectedElement.originalHeight 
        : selectedElement.width / selectedElement.height;
      
      let newWidth, newHeight;
      if (elementAspectRatio > canvasWidth / canvasHeight) {
        newWidth = Math.min(canvasWidth * 0.8, selectedElement.width);
        newHeight = newWidth / elementAspectRatio;
      } else {
        newHeight = Math.min(canvasHeight * 0.8, selectedElement.height);
        newWidth = newHeight * elementAspectRatio;
      }
      
      setWidth(newWidth);
      setHeight(newHeight);
      updateElement(selectedElementId!, { width: newWidth, height: newHeight });
    }
  };

  if (!selectedElement) {
    return null;
  }

  const originalWidth = selectedElement.originalWidth || selectedElement.width;
  const originalHeight = selectedElement.originalHeight || selectedElement.height;
  const widthPercentage = Math.round((width / originalWidth) * 100);
  const heightPercentage = Math.round((height / originalHeight) * 100);

  return (
    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Resize</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 capitalize">{selectedElement.type}</span>
          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
        </div>
      </div>

      {/* Current Dimensions */}
      <div className="bg-gray-700/50 rounded-lg p-3">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-gray-400">Width</div>
            <div className="text-white font-mono">{Math.round(width)}px</div>
            <div className="text-gray-500">{widthPercentage}%</div>
          </div>
          <div>
            <div className="text-gray-400">Height</div>
            <div className="text-white font-mono">{Math.round(height)}px</div>
            <div className="text-gray-500">{heightPercentage}%</div>
          </div>
        </div>
      </div>

      {/* Width Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-300">Width</label>
          <input
            type="number"
            value={Math.round(width)}
            onChange={(e) => handleWidthChange(Number(e.target.value))}
            className="w-16 px-2 py-1 bg-gray-700 text-white text-xs rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
            min="50"
            max="2000"
          />
        </div>
        <input
          type="range"
          min="50"
          max="2000"
          value={width}
          onChange={(e) => handleWidthChange(Number(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
        />
      </div>

      {/* Height Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-300">Height</label>
          <input
            type="number"
            value={Math.round(height)}
            onChange={(e) => handleHeightChange(Number(e.target.value))}
            className="w-16 px-2 py-1 bg-gray-700 text-white text-xs rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
            min="50"
            max="2000"
          />
        </div>
        <input
          type="range"
          min="50"
          max="2000"
          value={height}
          onChange={(e) => handleHeightChange(Number(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
        />
      </div>

      {/* Aspect Ratio Lock */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-300">Lock Aspect Ratio</label>
        <button
          onClick={() => setLockAspectRatio(!lockAspectRatio)}
          className={`p-2 rounded-lg transition-colors ${
            lockAspectRatio
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
          title={lockAspectRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
        >
          {lockAspectRatio ? '🔒' : '🔓'}
        </button>
      </div>

      {/* Preset Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={resetToOriginal}
          disabled={!selectedElement.originalWidth || !selectedElement.originalHeight}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white text-xs rounded-lg transition-colors"
        >
          Reset Original
        </button>
        <button
          onClick={fitToCanvas}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg transition-colors"
        >
          Fit Canvas
        </button>
      </div>
    </div>
  );
};

export default ResizePanel;
