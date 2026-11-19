'use client';

import { useEditorStore } from '@/store/editorStore';
import { CANVAS_DIMENSIONS } from '@/lib/editor/defaults';
import type { CanvasAspectRatio } from '@/types/editor';
import Section from '@/components/inspector/Section';
import { useCanvasSize } from '@/components/inspector/hooks';

const RATIOS = Object.keys(CANVAS_DIMENSIONS) as CanvasAspectRatio[];

interface CanvasSectionProps {
  defaultOpen?: boolean;
}

/** Canvas settings: the aspect ratio of the active scene. */
const CanvasSection = ({ defaultOpen = true }: CanvasSectionProps) => {
  const canvas = useCanvasSize();
  const executeCommand = useEditorStore((state) => state.executeCommand);

  return (
    <Section
      title="Canvas"
      defaultOpen={defaultOpen}
      badge={
        <span className="signal-section__meta">
          {canvas.width}×{canvas.height}
        </span>
      }
    >
      <div className="signal-segmented" role="group" aria-label="Canvas aspect ratio">
        {RATIOS.map((ratio) => (
          <button
            key={ratio}
            type="button"
            className="signal-segmented__item"
            aria-pressed={canvas.aspectRatio === ratio}
            title={`${CANVAS_DIMENSIONS[ratio].width}×${CANVAS_DIMENSIONS[ratio].height}`}
            onClick={() => executeCommand({ type: 'set_canvas_ratio', aspectRatio: ratio }, 'user')}
          >
            {ratio}
          </button>
        ))}
      </div>
      <p className="signal-note">
        Changing the ratio scales and re-centres every layer to fit the new canvas.
      </p>
    </Section>
  );
};

export default CanvasSection;
