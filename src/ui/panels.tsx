import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LAB_TABS } from '../data/labValues';
import { IconClose } from './icons';

export function CloseBox({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="flex h-6 w-6 items-center justify-center rounded border-2 border-navy bg-white text-navy" data-testid="panel-close">
      <IconClose size={12} />
    </button>
  );
}

/** Draggable (by its top strip) and resizable floating panel. Works with mouse and touch. */
export function FloatingPanel({ title, children, onClose, initial, resizable = true, testId }: { title: string; children: ReactNode; onClose: () => void; initial: { x: number; y: number; w: number; h?: number }; resizable?: boolean; testId?: string }) {
  const [pos, setPos] = useState({ x: initial.x, y: initial.y });
  const ref = useRef<HTMLDivElement | null>(null);
  const start = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  useEffect(() => {
    // keep inside the window
    setPos((p) => ({ x: Math.max(0, Math.min(p.x, window.innerWidth - 80)), y: Math.max(0, Math.min(p.y, window.innerHeight - 60)) }));
  }, []);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      data-testid={testId}
      className="fixed z-40 flex flex-col border-2 border-navy"
      style={{ left: pos.x, top: pos.y, width: initial.w, height: initial.h, background: '#d6dbe8', resize: resizable ? 'both' : 'none', overflow: 'hidden', minWidth: 200, minHeight: 120, maxWidth: '100vw', maxHeight: '100vh' }}
    >
      <div
        className="flex cursor-move items-center justify-between px-2 py-1 text-sm font-bold text-navy"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          start.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          setPos({ x: Math.max(-initial.w + 60, Math.min(window.innerWidth - 60, s.x + e.clientX - s.px)), y: Math.max(0, Math.min(window.innerHeight - 40, s.y + e.clientY - s.py)) });
        }}
        onPointerUp={() => (start.current = null)}
        onPointerCancel={() => (start.current = null)}
      >
        <span>{title}</span>
        <CloseBox onClick={onClose} label={`Close ${title}`} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

/** Highlight every occurrence of `q` inside `text`. */
function Marked({ text, q }: { text: string; q: string }) {
  if (!q || !text) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  const low = text.toLowerCase();
  let i = 0;
  let k = 0;
  for (;;) {
    const j = low.indexOf(q, i);
    if (j < 0) break;
    if (j > i) parts.push(text.slice(i, j));
    parts.push(
      <mark key={k++} style={{ background: '#fde047', color: 'inherit', padding: 0 }}>
        {text.slice(j, j + q.length)}
      </mark>,
    );
    i = j + q.length;
  }
  parts.push(text.slice(i));
  return <>{parts}</>;
}

/**
 * Lab values, docked on the right like the real exam: full height between the bars, resizable by its left edge.
 * Typing in Search highlights matches (and the tabs that contain them) instead of hiding rows. The SI checkbox adds
 * an SI column next to the reference ranges.
 */
export function LabValues({ onClose, top = 62, bottom = 58 }: { onClose: () => void; top?: number; bottom?: number }) {
  const [tab, setTab] = useState(LAB_TABS[0].id);
  const [q, setQ] = useState('');
  const [si, setSi] = useState(false);
  const [width, setWidth] = useState(() => Math.max(380, Math.min(680, Math.round(window.innerWidth * 0.42))));
  const drag = useRef<{ x: number; w: number } | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  const query = q.trim().toLowerCase();
  const matchesRow = (t: (typeof LAB_TABS)[number], i: number) => {
    const r = t.rows[i];
    if (!query) return false;
    // a continuation row (no name) matches through the row above it
    let name = r.name;
    for (let k = i; !name && k > 0; k--) name = t.rows[k - 1].name;
    return name.toLowerCase().includes(query) || (r.ref ?? '').toLowerCase().includes(query);
  };
  const tabHits = useMemo(() => new Set(LAB_TABS.filter((t) => t.rows.some((_, i) => matchesRow(t, i))).map((t) => t.id)), [query]);
  // jump to a tab that has matches when the current one has none, then scroll to the first match
  useEffect(() => {
    if (!query) return;
    if (!tabHits.has(tab) && tabHits.size) setTab([...tabHits][0]);
  }, [query]);
  useEffect(() => {
    if (!query) return;
    body.current?.querySelector('[data-hit="1"]')?.scrollIntoView({ block: 'center' });
  }, [query, tab]);
  const t = LAB_TABS.find((x) => x.id === tab)!;
  return (
    <div
      role="dialog"
      aria-label="Lab Values"
      data-testid="lab-panel"
      className="fixed right-0 z-40 flex flex-col border-l-2 border-navy"
      style={{ top, bottom, width, maxWidth: '100vw', background: '#d6dbe8' }}
    >
      {/* resize by dragging the left edge */}
      <div
        className="absolute left-0 top-0 h-full w-1.5 -translate-x-1 cursor-ew-resize"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, w: width };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => drag.current && setWidth(Math.max(320, Math.min(window.innerWidth - 40, drag.current.w - (e.clientX - drag.current.x))))}
        onPointerUp={() => (drag.current = null)}
        aria-hidden="true"
      />
      <div className="flex items-center justify-between bg-white px-3 pt-2">
        <span className="text-[15px] font-bold text-navy">Lab Values</span>
        <CloseBox onClick={onClose} label="Close Lab Values" />
      </div>
      <div className="bg-white px-3 pb-1 pt-2">
        <div className="flex items-center justify-between gap-2">
          <input className="field w-48" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search lab values" data-testid="lab-search" />
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={si} onChange={(e) => setSi(e.target.checked)} data-testid="lab-si" /> SI Reference Intervals
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-1" role="tablist">
          {LAB_TABS.map((x) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={tab === x.id}
              data-testid={`lab-tab-${x.id}`}
              data-hit={tabHits.has(x.id) ? '1' : '0'}
              className="rounded-t border border-b-0 border-gray-400 px-2 py-0.5 text-xs"
              style={{ background: tabHits.has(x.id) ? '#fde047' : tab === x.id ? '#d6dbe8' : '#fff', fontWeight: tab === x.id ? 700 : 400 }}
              onClick={() => setTab(x.id)}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 text-[12.5px]" data-testid="lab-rows">
        <table className="w-full border-collapse">
          <thead className="sticky top-0" style={{ background: '#d6dbe8' }}>
            <tr className="border-b border-gray-400">
              <th className="py-1 text-left font-bold">{t.title}</th>
              <th className="py-1 text-left font-bold">Reference Range</th>
              {si && <th className="py-1 text-left font-bold" data-testid="lab-si-col">SI Reference Intervals</th>}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r, i) => {
              const hit = matchesRow(t, i);
              return r.kind === 'group' ? (
                <tr key={i} className="border-b border-gray-400">
                  <td colSpan={si ? 3 : 2} className="py-[3px] italic">{r.name}</td>
                </tr>
              ) : (
                <tr key={i} className="border-b border-gray-400" data-hit={hit ? '1' : '0'}>
                  <td className="py-[3px] pr-2" style={{ paddingLeft: r.indent ? 16 : 0 }}>
                    <Marked text={r.name} q={query} />
                  </td>
                  <td className="py-[3px] pr-2">
                    <Marked text={r.ref ?? ''} q={query} />
                  </td>
                  {si && <td className="py-[3px]">{r.si}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="pt-2 text-[11px] text-gray-600">Typical adult reference ranges. Individual laboratories differ.</div>
      </div>
    </div>
  );
}

type Op = '+' | '-' | '×' | '÷';
export function Calculator({ onClose }: { onClose: () => void }) {
  const [disp, setDisp] = useState('0');
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [fresh, setFresh] = useState(true);
  const [mem, setMem] = useState(0);
  const val = () => parseFloat(disp) || 0;
  const show = (n: number) => setDisp(Number.isFinite(n) ? String(parseFloat(n.toPrecision(12))) : 'Error');
  const apply = (a: number, b: number, o: Op) => (o === '+' ? a + b : o === '-' ? a - b : o === '×' ? a * b : a / b);
  const digit = (d: string) => {
    if (fresh) {
      setDisp(d === '.' ? '0.' : d);
      setFresh(false);
    } else if (d === '.' && disp.includes('.')) return;
    else if (disp.length < 16) setDisp(disp === '0' && d !== '.' ? d : disp + d);
  };
  const operator = (o: Op) => {
    if (op && acc != null && !fresh) {
      const r = apply(acc, val(), op);
      setAcc(r);
      show(r);
    } else setAcc(val());
    setOp(o);
    setFresh(true);
  };
  const equals = () => {
    if (op && acc != null) {
      show(apply(acc, val(), op));
      setAcc(null);
      setOp(null);
    }
    setFresh(true);
  };
  const unary = (f: (n: number) => number) => {
    show(f(val()));
    setFresh(true);
  };
  const clear = () => {
    setDisp('0');
    setAcc(null);
    setOp(null);
    setFresh(true);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (/^[0-9.]$/.test(k)) digit(k);
    else if (k === '+' || k === '-') operator(k);
    else if (k === '*') operator('×');
    else if (k === '/') operator('÷');
    else if (k === 'Enter' || k === '=') equals();
    else if (k === 'Backspace') setDisp(disp.length > 1 && !fresh ? disp.slice(0, -1) : '0');
    else if (k === 'Delete') clear();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const B = ({ l, f, c, wide }: { l: string; f: () => void; c: string; wide?: boolean }) => (
    <button type="button" onClick={f} className="border border-gray-600 py-1 text-sm font-bold" style={{ background: c, gridColumn: wide ? 'span 1' : undefined }} aria-label={l} data-testid={`calc-${l}`}>
      {l}
    </button>
  );
  const purple = '#b9a3e3';
  const yellow = '#ecd27a';
  const blue = '#7f9be6';
  const gray = '#c9c9c9';
  return (
    <FloatingPanel title="Calculator" onClose={onClose} initial={{ x: Math.max(0, window.innerWidth - 270), y: Math.max(70, window.innerHeight - 400), w: 250 }} resizable={false} testId="calc-panel">
      <div className="p-2" onKeyDown={onKey} tabIndex={0} ref={(el) => el?.focus()} style={{ outline: 'none' }}>
        <div className="mb-2 border border-gray-700 bg-white px-2 py-1 text-right font-serif text-xl" data-testid="calc-display" aria-live="polite">
          {disp}
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <B l="M+" f={() => { setMem(mem + val()); setFresh(true); }} c={purple} />
          <B l="MR" f={() => { show(mem); setFresh(true); }} c={purple} />
          <B l="MC" f={() => setMem(0)} c={purple} />
          <B l="C" f={clear} c={yellow} />
          <B l="±" f={() => unary((n) => -n)} c={blue} />
          <B l="√" f={() => unary(Math.sqrt)} c={blue} />
          <B l="1/x" f={() => unary((n) => 1 / n)} c={blue} />
          <B l="÷" f={() => operator('÷')} c={blue} />
          <B l="7" f={() => digit('7')} c={gray} />
          <B l="8" f={() => digit('8')} c={gray} />
          <B l="9" f={() => digit('9')} c={gray} />
          <B l="×" f={() => operator('×')} c={blue} />
          <B l="4" f={() => digit('4')} c={gray} />
          <B l="5" f={() => digit('5')} c={gray} />
          <B l="6" f={() => digit('6')} c={gray} />
          <B l="-" f={() => operator('-')} c={blue} />
          <B l="1" f={() => digit('1')} c={gray} />
          <B l="2" f={() => digit('2')} c={gray} />
          <B l="3" f={() => digit('3')} c={gray} />
          <B l="+" f={() => operator('+')} c={blue} />
          <B l="0" f={() => digit('0')} c={gray} />
          <B l="." f={() => digit('.')} c={gray} />
          <button type="button" onClick={equals} className="col-span-2 border border-gray-600 py-1 text-sm font-bold" style={{ background: yellow }} aria-label="equals" data-testid="calc-=">
            =
          </button>
        </div>
      </div>
    </FloatingPanel>
  );
}

export function NotesPanel({ value, onChange, onClose, readOnly, title = 'Notes' }: { value: string; onChange: (v: string) => void; onClose: () => void; readOnly?: boolean; title?: string }) {
  return (
    <FloatingPanel title={title} onClose={onClose} initial={{ x: Math.max(0, window.innerWidth - 380), y: 90, w: 340, h: 240 }} testId="notes-panel">
      <textarea
        className="h-full w-full resize-none border-0 bg-white p-2 text-sm outline-none"
        placeholder={readOnly ? '(no notes)' : 'Notes for this question…'}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Question notes"
        data-testid="notes-text"
        autoFocus
      />
    </FloatingPanel>
  );
}

export function Modal({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose?: () => void; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-full flex-col border-2 border-navy" style={{ background: '#d6dbe8', width: wide ? 760 : 460, maxWidth: '100%' }}>
        <div className="flex items-center justify-between px-3 py-2">
          <div className="text-base font-bold">{title}</div>
          {onClose && <CloseBox onClick={onClose} />}
        </div>
        <div className="min-h-0 overflow-auto bg-white p-3 text-sm">{children}</div>
      </div>
    </div>
  );
}
