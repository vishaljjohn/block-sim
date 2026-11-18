import type { ReactNode } from 'react';
import type { Display } from '../types';
import { patchDisplay } from '../lib/store';
import { HIGHLIGHT_COLORS, HIGHLIGHT_SWATCH, useDisplay } from '../lib/display';

const Icon = ({ d }: { d: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const SUN = 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z';
const MOON = 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z';
const TYPE = 'M5 6V4h14v2M12 4v16M9 20h6';
const LAYOUT = 'M4 4h16v16H4zM4 9h16M9 9v11';
const PEN = 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 7.5l3 3';
const BOLT = 'M13 2 4 14h7l-1 8 9-12h-7z';

function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="border-b border-gray-200 py-3 last:border-0">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-bold tracking-wider text-gray-800">
        <Icon d={icon} />
        {title}
      </div>
      {children}
    </div>
  );
}

function Seg<T extends string | boolean>({ value, options, onChange, testId }: { value: T; options: { v: T; label: ReactNode; aria: string }[]; onChange: (v: T) => void; testId: string }) {
  return (
    <div className="flex gap-1.5" role="radiogroup">
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.aria}
            data-testid={`${testId}-${String(o.v)}`}
            onClick={() => onChange(o.v)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border py-1.5 text-[14px]"
            style={{ background: on ? '#111827' : '#fff', color: on ? '#fff' : '#111', borderColor: on ? '#111827' : '#d1d5db' }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Appearance, typography, layout and highlighting: applies instantly and is remembered on this device. */
export function DisplaySettings() {
  const d = useDisplay();
  const set = (p: Partial<Display>) => void patchDisplay(p);
  return (
    <div className="text-black" data-testid="display-settings">
      <Section icon={SUN} title="APPEARANCE">
        <div className="flex rounded-lg border border-gray-300 bg-gray-100 p-1" role="radiogroup" aria-label="Appearance">
          {(['light', 'dark'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={d.theme === t}
              aria-label={t === 'light' ? 'Light mode' : 'Dark mode'}
              data-testid={`theme-${t}`}
              onClick={() => set({ theme: t })}
              className="flex flex-1 items-center justify-center rounded-md py-1.5"
              style={{ background: d.theme === t ? '#1f2d3d' : 'transparent', color: d.theme === t ? '#fff' : '#555' }}
            >
              <Icon d={t === 'light' ? SUN : MOON} />
            </button>
          ))}
        </div>
      </Section>
      <Section icon={TYPE} title="TYPOGRAPHY">
        <div className="mb-2 grid grid-cols-[52px_1fr] items-center gap-2">
          <span className="text-[14px] text-gray-700">Size</span>
          <Seg value={d.size} testId="size" onChange={(v) => set({ size: v })} options={(['S', 'M', 'L', 'XL'] as const).map((v) => ({ v, label: v, aria: `Text size ${v}` }))} />
          <span className="text-[14px] text-gray-700">Bold</span>
          <Seg
            value={d.bold}
            testId="bold"
            onChange={(v) => set({ bold: v })}
            options={[
              { v: false, label: <span style={{ fontWeight: 400 }}>Aa</span>, aria: 'Normal text' },
              { v: true, label: <span style={{ fontWeight: 800 }}>Aa</span>, aria: 'Bold text' },
            ]}
          />
        </div>
      </Section>
      <Section icon={LAYOUT} title="LAYOUT">
        <div className="grid grid-cols-[52px_1fr] items-center gap-2">
          <span className="text-[14px] text-gray-700">Style</span>
          <Seg
            value={d.layout}
            testId="layout"
            onChange={(v) => set({ layout: v })}
            options={[
              { v: 'default', label: 'Default', aria: 'Default layout' },
              { v: 'board', label: 'Board-style', aria: 'Board-style layout' },
            ]}
          />
          <span className="text-[14px] text-gray-700">Split</span>
          <Seg
            value={d.split ?? 'side'}
            testId="split"
            onChange={(v) => set({ split: v })}
            options={[
              { v: 'side', label: <svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="1" y="1" width="14" height="12" rx="1.5" /><path d="M8 1v12" /></svg>, aria: 'Explanation beside the question' },
              { v: 'below', label: <svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="1" y="1" width="14" height="12" rx="1.5" /><path d="M1 7h14" /></svg>, aria: 'Explanation below the question' },
            ]}
          />
        </div>
      </Section>
      <Section icon={PEN} title="HIGHLIGHTING">
        <Seg
          value={d.highlightMode}
          testId="hlmode"
          onChange={(v) => set({ highlightMode: v })}
          options={[
            { v: 'quick', label: <><Icon d={BOLT} /> Quick</>, aria: 'Quick highlighting' },
            { v: 'manual', label: <><Icon d={PEN} /> Manual</>, aria: 'Manual highlighting' },
          ]}
        />
        <p className="mt-2 text-[13px] text-gray-600">{d.highlightMode === 'quick' ? 'Select text to instantly highlight' : 'Select text, then choose a color to highlight it'}</p>
        <div className="mt-2 text-[13px] text-gray-700">Default Color</div>
        <div className="mt-1 flex gap-1.5" role="radiogroup" aria-label="Default highlight color">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={d.highlightColor === c}
              aria-label={`${c} highlight`}
              data-testid={`hlcolor-${c}`}
              onClick={() => set({ highlightColor: c })}
              className="h-7 flex-1"
              style={{ background: HIGHLIGHT_SWATCH[c], outline: d.highlightColor === c ? '3px solid #1f2d3d' : 'none', outlineOffset: -3 }}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}
