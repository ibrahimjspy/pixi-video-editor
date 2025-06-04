import { useEditorStore } from '@/store/editorStore';

const TextPanel = () => {
  const selectedElementId = useEditorStore((s) => s.selectedElementId);
  const updateElement = useEditorStore((s) => s.updateElement);
  const element = useEditorStore((s) =>
    s.elements.find((el) => el.id === s.selectedElementId),
  );

  if (!element || element.type !== 'text') return null;

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'black' }}>
        Text Properties
      </div>
      <div style={{ marginBottom: '1rem', color: 'black' }}>
        <label
          style={{
            fontSize: '13px',
            display: 'block',
            marginBottom: '0.25rem',
          }}
        >
          Content
        </label>
        <input
          type="text"
          value={element.text}
          onChange={(e) => updateElement(element.id, { text: e.target.value })}
          style={{
            width: '100%',
            padding: '0.3rem',
            borderRadius: '4px',
            border: '1px solid #ccc',
            fontSize: '14px',
          }}
        />
      </div>
    </div>
  );
};

export default TextPanel;
