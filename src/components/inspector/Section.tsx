'use client';

import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '@/components/icons';

interface SectionProps {
  title: string;
  /** Small count or status shown next to the title. */
  badge?: ReactNode;
  /** Controls shown at the right of the header, outside the toggle button. */
  actions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** Collapsible inspector section. The body is unmounted while collapsed. */
const Section = ({ title, badge, actions, defaultOpen = true, children }: SectionProps) => {
  const bodyId = useId();
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={`signal-section ${isOpen ? 'is-open' : ''}`}>
      <div className="signal-section__header">
        <button
          type="button"
          className="signal-section__toggle"
          aria-expanded={isOpen}
          aria-controls={bodyId}
          onClick={() => setIsOpen((open) => !open)}
        >
          <Icon name="chevron" size={14} />
          <span>{title}</span>
          {badge}
        </button>
        {actions}
      </div>
      {isOpen && (
        <div id={bodyId} className="signal-section__body">
          {children}
        </div>
      )}
    </section>
  );
};

export default Section;
