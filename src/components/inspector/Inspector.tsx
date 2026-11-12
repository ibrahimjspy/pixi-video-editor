'use client';

import { useEditorStore } from '@/store/editorStore';
import CanvasSection from '@/components/inspector/CanvasSection';
import FilterSection from '@/components/inspector/FilterSection';
import LayerSection from '@/components/inspector/LayerSection';
import TextSection from '@/components/inspector/TextSection';
import TransformSection from '@/components/inspector/TransformSection';
import VideoSection from '@/components/inspector/VideoSection';
import { useSelectedLayerId } from '@/components/inspector/hooks';

/**
 * Manual controls for the selected layer, or canvas settings when nothing is
 * selected.
 *
 * It subscribes only to the selected id and the layer's type; each section
 * subscribes to the fields it edits. Sections are keyed by layer id so drafts
 * and toggles never leak from one layer to the next.
 */
const Inspector = () => {
  const layerId = useSelectedLayerId();
  const layerType = useEditorStore((state) =>
    layerId
      ? state.project.layers.find((layer) => layer.id === layerId)?.type ?? null
      : null,
  );

  if (!layerId || !layerType) {
    return (
      <div className="signal-inspector">
        <CanvasSection />
        <p className="signal-empty signal-inspector__hint">
          Select a layer on the canvas or in the Layers list to edit its transform, text, and
          filters. Upload media or use Quick add to create one.
        </p>
      </div>
    );
  }

  return (
    <div className="signal-inspector">
      <LayerSection key={`layer-${layerId}`} layerId={layerId} />
      <TransformSection key={`transform-${layerId}`} layerId={layerId} />
      {layerType === 'text' && <TextSection key={`text-${layerId}`} layerId={layerId} />}
      {layerType === 'video' && <VideoSection key={`video-${layerId}`} layerId={layerId} />}
      <FilterSection key={`filters-${layerId}`} layerId={layerId} />
      <CanvasSection defaultOpen={false} />
    </div>
  );
};

export default Inspector;
