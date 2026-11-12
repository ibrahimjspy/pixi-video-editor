'use client';

import { memo, useId, useMemo, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { FILTER_PRESET_NAMES } from '@/lib/editor/filterPresets';
import {
  FILTER_CATEGORIES,
  FILTER_DEFINITIONS,
} from '@/lib/renderer/filterDefinitions';
import type { FilterCategory, FilterDefinition } from '@/lib/renderer/filterDefinitions';
import type { FilterSettings } from '@/types/editor';
import { Icon } from '@/components/icons';
import Section from '@/components/inspector/Section';
import { useGestureHandlers } from '@/components/inspector/hooks';

interface FilterSectionProps {
  layerId: string;
}

type CategoryTab = FilterCategory | 'All';

const CATEGORY_TABS: readonly CategoryTab[] = ['All', ...FILTER_CATEGORIES];

const filterKey = (definition: FilterDefinition) =>
  definition.key as keyof FilterSettings;

/** The layer's value for a filter; projects saved before a filter existed lack it. */
const valueOf = (filters: FilterSettings, definition: FilterDefinition) =>
  filters[filterKey(definition)] ?? definition.default;

const isModified = (definition: FilterDefinition, value: number) =>
  Math.abs(value - definition.default) > 1e-9;

/** A 0/1 filter with nothing in between is an on/off switch, not a slider. */
const isSwitch = (definition: FilterDefinition) =>
  definition.step === 1 && definition.min === 0 && definition.max === 1;

/** Formats a value with as many decimals as the filter's step has. */
const formatValue = (definition: FilterDefinition, value: number) => {
  const decimals = (String(definition.step).split('.')[1] ?? '').length;
  return value.toFixed(decimals);
};

const matchesSearch = (definition: FilterDefinition, query: string) =>
  definition.label.toLowerCase().includes(query) ||
  definition.key.toLowerCase().includes(query) ||
  definition.searchTerms.some((term) => term.toLowerCase().includes(query));

interface FilterRowProps {
  layerId: string;
  definition: FilterDefinition;
  value: number;
}

/**
 * One filter control. Dragging previews without history and the release
 * commits a single undo step; double-click or the reset button restores the
 * default value.
 */
const FilterRow = memo(function FilterRow({ layerId, definition, value }: FilterRowProps) {
  const inputId = useId();
  const key = filterKey(definition);
  const modified = isModified(definition, value);
  const executeCommand = useEditorStore((state) => state.executeCommand);
  const previewLayerPatch = useEditorStore((state) => state.previewLayerPatch);
  const gesture = useGestureHandlers(`Filter ${definition.label}`, { snapshot: false });

  const setValue = (next: number) =>
    executeCommand({ type: 'set_filters', layerId, filters: { [key]: next } }, 'user');

  const reset = () => {
    if (modified) {
      setValue(definition.default);
    }
  };

  return (
    <div
      className={`signal-slider ${modified ? 'is-modified' : ''}`}
      title={definition.description}
    >
      <div className="signal-slider__head">
        <label htmlFor={inputId}>{definition.label}</label>
        {modified && (
          <button
            type="button"
            className="signal-icon-button signal-icon-button--small"
            aria-label={`Reset ${definition.label}`}
            title={`Reset to ${formatValue(definition, definition.default)}`}
            onClick={reset}
          >
            <Icon name="reset" size={12} />
          </button>
        )}
        {isSwitch(definition) ? (
          <button
            id={inputId}
            type="button"
            role="switch"
            className="signal-switch"
            aria-checked={value >= 0.5}
            onClick={() => setValue(value >= 0.5 ? 0 : 1)}
          >
            <span className="signal-switch__thumb" />
          </button>
        ) : (
          <output htmlFor={inputId}>{formatValue(definition, value)}</output>
        )}
      </div>
      {!isSwitch(definition) && (
        <input
          id={inputId}
          type="range"
          min={definition.min}
          max={definition.max}
          step={definition.step}
          value={value}
          onChange={(event) =>
            previewLayerPatch(layerId, { filters: { [key]: Number(event.target.value) } })
          }
          onDoubleClick={reset}
          {...gesture}
        />
      )}
    </div>
  );
});

/**
 * Filter presets and one control per filter definition for the given layer.
 *
 * The section subscribes only to the layer's `filters` object, and each row is
 * memoised on its own value, so dragging one slider re-renders one row.
 */
const FilterSection = ({ layerId }: FilterSectionProps) => {
  const searchId = useId();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryTab>('Color');
  const executeCommand = useEditorStore((state) => state.executeCommand);
  const filters = useEditorStore(
    (state) => state.project.layers.find((entry) => entry.id === layerId)?.filters,
  );

  const query = search.trim().toLowerCase();
  const visibleDefinitions = useMemo(
    () =>
      FILTER_DEFINITIONS.filter((definition) =>
        query
          ? matchesSearch(definition, query)
          : category === 'All' || definition.category === category,
      ),
    [category, query],
  );

  if (!filters) {
    return null;
  }

  const modifiedDefinitions = FILTER_DEFINITIONS.filter((definition) =>
    isModified(definition, valueOf(filters, definition)),
  );
  const modifiedByCategory = (tab: CategoryTab) =>
    tab === 'All'
      ? modifiedDefinitions.length
      : modifiedDefinitions.filter((definition) => definition.category === tab).length;

  // With several categories on screen, a heading starts each new one.
  const showHeadings = Boolean(query) || category === 'All';

  return (
    <Section
      title="Filters"
      badge={
        modifiedDefinitions.length > 0 ? (
          <span
            className="signal-badge"
            title={modifiedDefinitions.map((definition) => definition.label).join(', ')}
          >
            {modifiedDefinitions.length} active
          </span>
        ) : undefined
      }
      actions={
        <button
          type="button"
          className="signal-mini-button"
          disabled={modifiedDefinitions.length === 0}
          onClick={() => executeCommand({ type: 'reset_filters', layerId }, 'user')}
        >
          Reset all
        </button>
      }
    >
      <div className="signal-button-row" role="group" aria-label="Filter presets">
        {FILTER_PRESET_NAMES.map((preset) => (
          <button
            key={preset}
            type="button"
            className="signal-mini-button signal-mini-button--preset"
            title={`Replace this layer's filters with the ${preset} preset`}
            onClick={() =>
              executeCommand({ type: 'apply_filter_preset', layerId, preset }, 'user')
            }
          >
            {preset}
          </button>
        ))}
      </div>

      <div className="signal-field">
        <label htmlFor={searchId} className="signal-visually-hidden">
          Search filters
        </label>
        <input
          id={searchId}
          className="signal-input"
          type="search"
          placeholder="Search filters"
          autoComplete="off"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {!query && (
        <div className="signal-tabs signal-tabs--wrap" role="group" aria-label="Filter category">
          {CATEGORY_TABS.map((tab) => {
            const count = modifiedByCategory(tab);

            return (
              <button
                key={tab}
                type="button"
                className="signal-tabs__tab"
                aria-pressed={category === tab}
                onClick={() => setCategory(tab)}
              >
                {tab}
                {count > 0 && <span className="signal-tabs__count">{count}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="signal-filter-list">
        {visibleDefinitions.length === 0 ? (
          <p className="signal-empty">No filter matches &ldquo;{search.trim()}&rdquo;.</p>
        ) : (
          visibleDefinitions.map((definition, index) => (
            <div key={definition.key} className="signal-filter-list__item">
              {showHeadings &&
                visibleDefinitions[index - 1]?.category !== definition.category && (
                  <p className="signal-filter-list__heading">{definition.category}</p>
                )}
              <FilterRow
                layerId={layerId}
                definition={definition}
                value={valueOf(filters, definition)}
              />
            </div>
          ))
        )}
      </div>
    </Section>
  );
};

export default FilterSection;
