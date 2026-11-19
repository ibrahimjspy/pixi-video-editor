'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { EFFECT_CATEGORIES, EFFECT_DEFINITIONS } from '@/lib/effects/registry';
import type { EffectCategory, EffectDefinition } from '@/lib/effects/registry';
import { Icon } from '@/components/icons';

interface EffectBrowserProps {
  onPick: (type: string) => void;
  onClose: () => void;
}

type CategoryTab = EffectCategory | 'All';

const CATEGORY_TABS: readonly CategoryTab[] = ['All', ...EFFECT_CATEGORIES];

const matches = (definition: EffectDefinition, query: string) =>
  definition.label.toLowerCase().includes(query) ||
  definition.type.toLowerCase().includes(query) ||
  definition.category.toLowerCase().includes(query) ||
  definition.searchTerms.some((term) => term.includes(query));

/**
 * The effect catalogue: search or browse by category, click an effect to add
 * it to the layer. Escape closes it.
 */
const EffectBrowser = ({ onPick, onClose }: EffectBrowserProps) => {
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryTab>('All');

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const query = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      EFFECT_DEFINITIONS.filter((definition) =>
        query ? matches(definition, query) : category === 'All' || definition.category === category,
      ),
    [category, query],
  );

  return (
    <div
      className="signal-effect-browser"
      role="group"
      aria-label="Add an effect"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="signal-effect-browser__bar">
        <label htmlFor={searchId} className="signal-visually-hidden">
          Search effects
        </label>
        <input
          ref={searchRef}
          id={searchId}
          className="signal-input"
          type="search"
          placeholder={`Search ${EFFECT_DEFINITIONS.length} effects`}
          autoComplete="off"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button
          type="button"
          className="signal-icon-button"
          aria-label="Close effect list"
          onClick={onClose}
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      {!query && (
        <div className="signal-tabs signal-tabs--wrap" role="group" aria-label="Effect category">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className="signal-tabs__tab"
              aria-pressed={category === tab}
              onClick={() => setCategory(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="signal-empty">No effect matches &ldquo;{search.trim()}&rdquo;.</p>
      ) : (
        <ul className="signal-effect-browser__list">
          {visible.map((definition) => (
            <li key={definition.type}>
              <button
                type="button"
                className="signal-effect-browser__item"
                onClick={() => onPick(definition.type)}
              >
                <span className="signal-effect-browser__name">
                  {definition.label}
                  <span className="signal-effect__category">{definition.category}</span>
                </span>
                <span className="signal-effect-browser__description">{definition.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default EffectBrowser;
