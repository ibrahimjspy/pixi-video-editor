'use client';

import { useId, useState } from 'react';
import AIRail from '@/components/AIRail';
import Inspector from '@/components/inspector/Inspector';

type RightTab = 'inspector' | 'ai';

const TABS: ReadonlyArray<{ id: RightTab; label: string }> = [
  { id: 'inspector', label: 'Inspector' },
  { id: 'ai', label: 'AI' },
];

/**
 * Right column: manual inspector and the AI rail behind two tabs.
 *
 * The AI rail is mounted the first time its tab is opened and then stays
 * mounted (hidden) so an unsent prompt, a verified key, or a request that is
 * still running survives a trip back to the inspector.
 */
const RightPanel = () => {
  const baseId = useId();
  const [activeTab, setActiveTab] = useState<RightTab>('inspector');
  const [hasOpenedAi, setHasOpenedAi] = useState(false);

  const openTab = (tab: RightTab) => {
    setActiveTab(tab);

    if (tab === 'ai') {
      setHasOpenedAi(true);
    }
  };

  return (
    <aside className="signal-panel signal-right">
      <div className="signal-tabs signal-right__tabs" role="tablist" aria-label="Editing panel">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            className="signal-tabs__tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${baseId}-panel`}
            onClick={() => openTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${activeTab}`}
        className="signal-right__body"
      >
        {activeTab === 'inspector' && <Inspector />}
        {hasOpenedAi && (
          <div className="signal-right__ai" hidden={activeTab !== 'ai'}>
            <AIRail />
          </div>
        )}
      </div>
    </aside>
  );
};

export default RightPanel;
