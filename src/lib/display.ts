import { useEffect } from 'react';
import { DEFAULT_DISPLAY, type Display, type HighlightColor } from '../types';
import { getSettings } from './store';
import { useLive } from '../ui/hooks';

export const SIZE_FACTOR: Record<Display['size'], number> = { S: 0.88, M: 1, L: 1.15, XL: 1.3 };
const ROOT_FONT: Record<Display['size'], string> = { S: '14px', M: '16px', L: '18px', XL: '20px' };

/** Highlight colors (translucent, drawn with multiply so the text stays crisp). */
export const HIGHLIGHT_RGBA: Record<HighlightColor, string> = {
  yellow: 'rgba(255, 228, 0, 0.45)',
  pink: 'rgba(255, 140, 200, 0.42)',
  green: 'rgba(90, 220, 130, 0.40)',
  blue: 'rgba(110, 170, 255, 0.40)',
  purple: 'rgba(190, 140, 255, 0.42)',
};
export const HIGHLIGHT_SWATCH: Record<HighlightColor, string> = { yellow: '#fde047', pink: '#fbcfe8', green: '#bbf7d0', blue: '#bfdbfe', purple: '#e9d5ff' };
export const HIGHLIGHT_COLORS = Object.keys(HIGHLIGHT_SWATCH) as HighlightColor[];

export function useDisplay(): Display {
  const s = useLive(() => getSettings(), []);
  return s?.display ?? DEFAULT_DISPLAY;
}

/** Applies the display settings to the whole page (classes on <html>). */
export function useApplyDisplay(): void {
  const d = useDisplay();
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle('dark', d.theme === 'dark');
    el.classList.toggle('bold-text', d.bold);
    el.classList.toggle('layout-default', d.layout === 'default');
    el.style.fontSize = ROOT_FONT[d.size];
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', d.theme === 'dark' ? '#111827' : d.layout === 'default' ? '#1f2937' : '#1c4973');
  }, [d.theme, d.bold, d.layout, d.size]);
}
