import { useEffect, useMemo, useState } from 'react';
import { LAB_TABS } from '../data/labValues';

interface Lab {
  name: string;
  conv: string;
  si: string;
}
interface Cat {
  id: string;
  name: string;
  labs: Lab[];
}

/** The reference ranges grouped into categories ("Serum · Electrolytes"), continuation rows joined to their lab. */
function categories(): Cat[] {
  const out: Cat[] = [];
  for (const t of LAB_TABS) {
    let cur: Cat = { id: t.id, name: t.label, labs: [] };
    out.push(cur);
    let parent = '';
    for (const r of t.rows) {
      if (r.kind === 'group') {
        cur = { id: `${t.id}-${out.length}`, name: `${t.label} · ${r.name}`, labs: [] };
        out.push(cur);
        parent = '';
        continue;
      }
      if (!r.ref && !r.si) {
        parent = r.name;
        continue;
      }
      if (!r.name && cur.labs.length) {
        const last = cur.labs[cur.labs.length - 1];
        last.conv += `; ${r.ref ?? ''}`;
        last.si += `; ${r.si ?? ''}`;
        continue;
      }
      cur.labs.push({ name: r.indent && parent ? `${parent}: ${r.name}` : r.name, conv: r.ref ?? '', si: r.si ?? '' });
    }
  }
  return out.filter((c) => c.labs.length);
}

/** Lab values in the paper style: a full-view dialog or a compact side panel, metric (SI) or imperial (conventional). */
export function PaperLabs({ onClose, top = 80 }: { onClose: () => void; top?: number }) {
  const cats = useMemo(categories, []);
  const [q, setQ] = useState('');
  const [metric, setMetric] = useState(true);
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const t = q.trim().toLowerCase();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const shown = cats.map((c) => ({ ...c, labs: t ? c.labs.filter((l) => l.name.toLowerCase().includes(t) || c.name.toLowerCase().includes(t)) : c.labs })).filter((c) => c.labs.length);

  const header = (
    <div className="flex items-center justify-between border-b-2 px-5 py-3.5" style={{ borderColor: 'var(--line)' }}>
      <span className="flex items-center gap-2 text-[18px] font-bold" style={{ fontFamily: 'var(--serif)' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" aria-hidden="true"><path d="M7 3h10M8 3v15a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3V3M8 12h8" /></svg>
        Lab Values
      </span>
      <span className="flex items-center gap-3">
        <button className="rounded px-2.5 py-1 text-[12px] font-semibold" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }} onClick={() => setCompact((c) => !c)} data-testid="labs-view">
          {compact ? 'Full View' : 'Compact View'}
        </button>
        <button onClick={onClose} aria-label="Close Lab Values" className="text-[22px] leading-none" style={{ color: 'var(--ink-2)' }}>×</button>
      </span>
    </div>
  );
  const tools = (
    <div className="flex items-center gap-3 border-b px-5 py-3" style={{ borderColor: 'var(--line)' }}>
      <span className="relative flex-1">
        <input className="field w-full rounded py-1.5 pl-8" placeholder="Search lab values…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="labs-search" aria-label="Search lab values" />
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      </span>
      <span className="flex rounded border p-0.5" style={{ borderColor: 'var(--line)' }}>
        {[true, false].map((m) => (
          <button key={String(m)} className="rounded px-3 py-1 text-[12px] font-semibold" style={metric === m ? { background: 'var(--brand)', color: '#fff' } : { color: 'var(--ink-2)' }} onClick={() => setMetric(m)} data-testid={m ? 'labs-metric' : 'labs-imperial'}>
            {m ? 'Metric' : 'Imperial'}
          </button>
        ))}
      </span>
    </div>
  );
  const list = (
    <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 py-4" data-testid="labs-list">
      {shown.map((c) => {
        const isOpen = !!t || open.has(c.id);
        return (
          <div key={c.id}>
            <button className="flex w-full items-center justify-between px-3 py-3 text-left text-[15px] font-bold" style={{ fontFamily: 'var(--serif)', ...(isOpen ? { background: 'var(--brand)', color: '#fff' } : { background: 'var(--surface-2)' }) }} onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} aria-expanded={isOpen}>
              {c.name}
              <span>{isOpen ? '⌃' : '⌄'}</span>
            </button>
            {isOpen && (
              <div className="space-y-1.5 border-x border-b p-2" style={{ borderColor: 'var(--line)' }}>
                {c.labs.map((l, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 rounded border px-3 py-2.5 text-[13px]" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
                    <span className="font-bold">{l.name}</span>
                    <span className="mono shrink-0 text-right font-bold">{(metric ? l.si : l.conv) || l.conv || l.si}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {!shown.length && <div className="text-[13px]" style={{ color: 'var(--ink-3)' }}>No lab matches “{q}”.</div>}
      <div className="pt-1 text-[11px]" style={{ color: 'var(--ink-3)' }}>Typical adult reference ranges. Individual laboratories differ.</div>
    </div>
  );

  if (compact)
    return (
      <div className="fixed bottom-0 right-0 z-40 flex w-[min(420px,100vw)] flex-col border-l-2 shadow-2xl" style={{ top, background: 'var(--bg)', borderColor: 'var(--line)', color: 'var(--ink)' }} role="dialog" aria-label="Lab Values" data-testid="labs">
        {header}
        {tools}
        {list}
      </div>
    );
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgb(26 46 59 / 0.45)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div className="flex h-[85vh] w-full max-w-[680px] flex-col overflow-hidden rounded-md border shadow-2xl" style={{ background: 'var(--bg)', borderColor: 'var(--line)', color: 'var(--ink)' }} role="dialog" aria-label="Lab Values" onClick={(e) => e.stopPropagation()} data-testid="labs">
        {header}
        {tools}
        {list}
      </div>
    </div>
  );
}
