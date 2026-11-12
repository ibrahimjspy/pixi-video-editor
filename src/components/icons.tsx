import type { ReactNode } from 'react';
import type { LayerType } from '@/types/editor';

export type IconName =
  | 'image'
  | 'video'
  | 'text'
  | 'eye'
  | 'eye-off'
  | 'trash'
  | 'duplicate'
  | 'arrow-up'
  | 'arrow-down'
  | 'to-front'
  | 'to-back'
  | 'lock'
  | 'unlock'
  | 'reset'
  | 'grip'
  | 'volume'
  | 'volume-off'
  | 'chevron'
  | 'undo'
  | 'redo'
  | 'plus'
  | 'align-left'
  | 'align-center'
  | 'align-right';

const PATHS: Record<IconName, ReactNode> = {
  image: (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <circle cx="6" cy="6.5" r="1" />
      <path d="M3 11.5l3-3 2.5 2.5 2-2 2.5 2.5" />
    </>
  ),
  video: (
    <>
      <rect x="2" y="4" width="8.5" height="8" rx="1.5" />
      <path d="M10.5 7l3.5-2v6l-3.5-2" />
    </>
  ),
  text: <path d="M3.5 4.5V3.5h9v1M8 3.5v9M6.5 12.5h3" />,
  eye: (
    <>
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="1.8" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M3.6 5.2C2.3 6.4 1.5 8 1.5 8S4 12.5 8 12.5c1 0 1.9-.3 2.7-.7M6.5 3.7c.5-.1 1-.2 1.5-.2 4 0 6.5 4.500 6.500 4.500s-.6 1.100-1.700 2.200" />
      <path d="M2.5 2.5l11 11" />
    </>
  ),
  trash: <path d="M3 4.500h10M6.500 4.500V3h3v1.500M4.500 4.500l.5 8.500h6l.5-8.500M7 7v3.500M9 7v3.500" />,
  duplicate: (
    <>
      <rect x="5.500" y="5.500" width="8" height="8" rx="1.500" />
      <path d="M10.500 5.500V4A1.500 1.500 0 009 2.500H4A1.500 1.500 0 002.500 4v5A1.500 1.500 0 004 10.500h1.500" />
    </>
  ),
  'arrow-up': <path d="M8 13V3M4 7l4-4 4 4" />,
  'arrow-down': <path d="M8 3v10M4 9l4 4 4-4" />,
  'to-front': <path d="M3 2.500h10M8 14V6M4.500 9.500L8 6l3.500 3.500" />,
  'to-back': <path d="M3 13.500h10M8 2v8M4.500 6.500L8 10l3.500-3.500" />,
  lock: (
    <>
      <rect x="3.500" y="7" width="9" height="6.500" rx="1.500" />
      <path d="M5.500 7V5a2.500 2.500 0 015 0v2" />
    </>
  ),
  unlock: (
    <>
      <rect x="3.500" y="7" width="9" height="6.500" rx="1.500" />
      <path d="M5.500 7V5a2.500 2.500 0 014.800-1" />
    </>
  ),
  reset: <path d="M3 8a5 5 0 105-5H4.500M6.500 1L4.500 3l2 2" />,
  grip: (
    <>
      <circle cx="6" cy="4" r="0.900" />
      <circle cx="10" cy="4" r="0.900" />
      <circle cx="6" cy="8" r="0.900" />
      <circle cx="10" cy="8" r="0.900" />
      <circle cx="6" cy="12" r="0.900" />
      <circle cx="10" cy="12" r="0.900" />
    </>
  ),
  volume: <path d="M2.500 6.500v3h2.500l3 2.500v-8l-3 2.500H2.500zM10.500 6a3 3 0 010 4M12 4.500a5 5 0 010 7" />,
  'volume-off': <path d="M2.500 6.500v3h2.500l3 2.500v-8l-3 2.500H2.500zM10.500 6.500l3 3M13.500 6.500l-3 3" />,
  chevron: <path d="M6 4l4 4-4 4" />,
  undo: <path d="M5.500 3L2.500 6l3 3M2.500 6H9a4 4 0 010 8H6" />,
  redo: <path d="M10.500 3l3 3-3 3M13.500 6H7a4 4 0 000 8h3" />,
  plus: <path d="M8 3v10M3 8h10" />,
  'align-left': <path d="M2.500 4h11M2.500 8h7M2.500 12h9" />,
  'align-center': <path d="M2.500 4h11M4.500 8h7M3.500 12h9" />,
  'align-right': <path d="M2.500 4h11M6.500 8h7M4.500 12h9" />,
};

interface IconProps {
  name: IconName;
  size?: number;
}

/**
 * Decorative 16px stroke icon. It is hidden from assistive technology, so the
 * control that contains it must carry its own text or `aria-label`.
 */
export const Icon = ({ name, size = 16 }: IconProps) => (
  <svg
    className="signal-icon"
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.300"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {PATHS[name]}
  </svg>
);

export const LAYER_TYPE_ICON: Record<LayerType, IconName> = {
  image: 'image',
  video: 'video',
  text: 'text',
};
