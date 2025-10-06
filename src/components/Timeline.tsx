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
            className="w-full h-full object-cover rounded"
          />
        );
      case 'video':
        return <div className="text-2xl">🎬</div>;
      case 'text':
        return <div className="text-sm font-medium px-2 truncate">{el.text.slice(0, 15)}{el.text.length > 15 ? '...' : ''}</div>;
      default:
        return '❓';
    }
  };

  const getIcon = (el: EditorElement) => {
    switch (el.type) {
      case 'image':
        return '🖼️';
      case 'video':
        return '🎬';
      case 'text':
        return '✏️';
      default:
        return '❓';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Timeline Header */}
      <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">📽️ Timeline</span>
          <span className="text-xs text-gray-400">({elements.length} layers)</span>
        </div>
      </div>

      {/* Timeline Content */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        {elements.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            <div className="text-center">
              <div className="text-3xl mb-2">📽️</div>
              <div>No layers yet</div>
              <div className="text-xs mt-1">Upload images or videos to get started</div>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 h-full items-center">
            {elements.map((el) => {
              const isSelected = selectedElementId === el.id;
              return (
                <div
                  key={el.id}
                  onClick={() => setSelectedElement(el.id)}
                  className={`
                    relative group flex-shrink-0 w-32 h-24 rounded-lg border-2 cursor-pointer
                    transition-all duration-200 overflow-hidden
                    ${isSelected 
                      ? 'border-blue-500 bg-blue-600 shadow-lg shadow-blue-500/50 scale-105' 
                      : 'border-gray-600 bg-gray-800 hover:border-gray-500 hover:bg-gray-750'
                    }
                  `}
                >
                  {/* Content */}
                  <div className="flex items-center justify-center h-full p-2">
                    {getLabel(el)}
                  </div>

                  {/* Type Badge */}
                  <div className="absolute top-1 left-1 text-xs bg-gray-900/80 px-1.5 py-0.5 rounded backdrop-blur-sm">
                    {getIcon(el)}
                  </div>

                  {/* Delete Button */}
                  {isSelected && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteElement(el.id);
                      }}
                      className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded p-1 text-xs transition-colors"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  )}

                  {/* Hover Overlay */}
                  {!isSelected && (
                    <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/10 transition-all pointer-events-none" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Timeline;
