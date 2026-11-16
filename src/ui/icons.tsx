import type { ReactNode } from 'react';

const S = ({ children, size = 22, vb = 24 }: { children: ReactNode; size?: number; vb?: number }) => (
  <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} aria-hidden="true" focusable="false">
    {children}
  </svg>
);

export const IconPrev = ({ size = 30 }: { size?: number }) => (
  <S size={size}>
    <circle cx="12" cy="12" r="11" fill="#fff" />
    <path d="M13 6.5 7.5 12l5.5 5.5M8 12h9" fill="none" stroke="#111" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const IconNext = ({ size = 30 }: { size?: number }) => (
  <S size={size}>
    <circle cx="12" cy="12" r="11" fill="#fff" />
    <path d="M11 6.5 16.5 12 11 17.5M16 12H7" fill="none" stroke="#111" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
/** White rounded-square tile with a dark glyph, like the reference toolbar. */
const Tile = ({ children, size = 30 }: { children: ReactNode; size?: number }) => (
  <S size={size}>
    <rect x="1" y="1" width="22" height="22" rx="3" fill="#fff" />
    {children}
  </S>
);
export const IconLab = () => (
  <Tile>
    <path d="M9.5 5h5M10.5 5v5.2L6.6 17.4A1.2 1.2 0 0 0 7.7 19h8.6a1.2 1.2 0 0 0 1.1-1.6L13.5 10.2V5" fill="none" stroke="#111" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M8.3 14.5h7.4l1.7 3.4H6.6z" fill="#111" />
  </Tile>
);
export const IconNotes = () => (
  <Tile>
    <path d="m6 18 1-4 8.5-8.5 3 3L10 17zM14 7l3 3" fill="#111" stroke="#111" strokeWidth="1" strokeLinejoin="round" />
  </Tile>
);
export const IconCalc = () => (
  <Tile>
    <rect x="7" y="4.5" width="10" height="15" rx="1.5" fill="none" stroke="#111" strokeWidth="1.8" />
    <path d="M9.3 7.5h5.4" stroke="#111" strokeWidth="1.8" />
    <path d="M9.6 11h.01M12 11h.01M14.4 11h.01M9.6 13.6h.01M12 13.6h.01M14.4 13.6h.01M9.6 16.2h.01M12 16.2h.01M14.4 16.2h.01" stroke="#111" strokeWidth="1.9" strokeLinecap="round" />
  </Tile>
);
export const IconGear = () => (
  <Tile>
    <path
      d="M12 8.7a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6zm6.2 3.3c0-.5 0-.9-.1-1.3l1.6-1.2-1.6-2.8-1.9.8a6 6 0 0 0-2.2-1.3L13.7 4h-3.4L10 6.2a6 6 0 0 0-2.2 1.3l-1.9-.8-1.6 2.8 1.6 1.2a6 6 0 0 0 0 2.6l-1.6 1.2 1.6 2.8 1.9-.8c.6.6 1.4 1 2.2 1.3l.3 2.2h3.4l.3-2.2a6 6 0 0 0 2.2-1.3l1.9.8 1.6-2.8-1.6-1.2c.1-.4.1-.8.1-1.3z"
      fill="#111"
      fillRule="evenodd"
    />
  </Tile>
);
export const IconGrid = () => (
  <Tile>
    <path d="M6 7h3v3H6zM10.5 7h3v3h-3zM15 7h3v3h-3zM6 11.5h3v3H6zM10.5 11.5h3v3h-3zM15 11.5h3v3h-3zM6 16h3v2H6zM10.5 16h3v2h-3zM15 16h3v2h-3z" fill="#111" />
  </Tile>
);
export const IconPause = ({ size = 22 }: { size?: number }) => (
  <S size={size}>
    <circle cx="12" cy="12" r="11" fill="#fff" />
    <path d="M9.5 8v8M14.5 8v8" stroke="#111" strokeWidth="2.6" strokeLinecap="round" />
  </S>
);
export const IconCheckCircle = ({ size = 22 }: { size?: number }) => (
  <S size={size}>
    <circle cx="12" cy="12" r="11" fill="#fff" />
    <path d="m7 12.5 3.3 3.3L17 9" fill="none" stroke="#111" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const IconEnd = ({ size = 22 }: { size?: number }) => (
  <S size={size}>
    <rect x="3" y="2.5" width="18" height="19" rx="2" fill="none" stroke="#fff" strokeWidth="1.8" />
    <path d="M10 8v8l6-4z" fill="#fff" />
  </S>
);
export const IconExit = ({ size = 22 }: { size?: number }) => (
  <S size={size}>
    <circle cx="12" cy="12" r="11" fill="#d32f2f" stroke="#fff" strokeWidth="1.5" />
    <path d="m8 8 8 8M16 8l-8 8" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
  </S>
);
export const IconFlag = ({ size = 16, color = '#e11d1d' }: { size?: number; color?: string }) => (
  <S size={size}>
    <path d="M5 3v19" stroke="#333" strokeWidth="2" />
    <path d="M6 4h13l-3.5 4.5L19 13H6z" fill={color} />
  </S>
);
export const IconClose = ({ size = 14 }: { size?: number }) => (
  <S size={size}>
    <path d="m5 5 14 14M19 5 5 19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </S>
);
export const Check = ({ color = '#15803d', size = 14 }: { color?: string; size?: number }) => (
  <S size={size}>
    <path d="m4 13 5 5L20 6" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const Cross = ({ color = '#dc2626', size = 14 }: { color?: string; size?: number }) => (
  <S size={size}>
    <path d="m5 5 14 14M19 5 5 19" stroke={color} strokeWidth="3" strokeLinecap="round" />
  </S>
);
