import { useEditorStore } from '@/store/editorStore';
import { EditorElement } from '@/types/editor';
import { v4 as uuidv4 } from 'uuid';
import { useCallback } from 'react';

const UploadPanel = () => {
  const addElement = useEditorStore((s) => s.addElement);
  const setSelectedElement = useEditorStore((s) => s.setSelectedElement);

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
    },
    [addElement, setSelectedElement],
  );

  return (
    <div>
      <label
        style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' , color: 'black' }}
      >
        Upload Image/Video
      </label>
      <input
        type="file"
        accept="video/*,image/*"
        onChange={handleUpload}
        style={{ width: '100%', padding: '0.25rem', fontSize: '14px', color: 'black' }}
      />
    </div>
  );
};

export default UploadPanel;
