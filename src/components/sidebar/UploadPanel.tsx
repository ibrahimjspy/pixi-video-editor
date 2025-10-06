import { useEditorStore } from '@/store/editorStore';
import { EditorElement } from '@/types/editor';
import { v4 as uuidv4 } from 'uuid';
import { useCallback, useRef } from 'react';

const UploadPanel = () => {
  const addElement = useEditorStore((s) => s.addElement);
  const setSelectedElement = useEditorStore((s) => s.setSelectedElement);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const url = URL.createObjectURL(file);
      const type = file.type.startsWith('video') ? 'video' : 'image';

      const newElement: EditorElement = {
        id: uuidv4(),
        type,
        file,
        url,
        x: 100,
        y: 100,
        width: 300,
        height: 200,
        rotation: 0,
        filters: {
          brightness: 1,
          contrast: 1,
          sharpness: 0,
        },
      } as EditorElement;

      addElement(newElement);
      setSelectedElement(newElement.id);
      
      // Reset input so same file can be uploaded again
      e.target.value = '';
    },
    [addElement, setSelectedElement],
  );

  return (
    <div>
      <h3 className="text-sm font-semibold text-white mb-3">📤 Upload Media</h3>
      
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full py-8 px-4 border-2 border-dashed border-gray-600 rounded-lg bg-gray-900/50 hover:border-blue-500 hover:bg-gray-900 transition-all cursor-pointer group"
      >
        <div className="flex flex-col items-center gap-2">
          <div className="text-4xl group-hover:scale-110 transition-transform">☁️</div>
          <div className="text-sm font-medium text-gray-300 group-hover:text-blue-400">
            Click to upload
          </div>
          <div className="text-xs text-gray-500">
            Images & Videos
          </div>
        </div>
      </button>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,image/*"
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  );
};

export default UploadPanel;
