/** Small hand-drawn SVG charts in the paper style (no chart library, nothing loaded from the internet). */
import type { ReactNode } from 'react';

const tone = (v: number | null) => (v == null ? 'var(--ink-3)' : v >= 80 ? 'var(--good)' : v >= 60 ? 'var(--ink)' : 'var(--bad)');

/** Correct | remaining | incorrect bar with the counts under it. */
export function TripleBar({ correct, incorrect, remaining, testId }: { correct: number; incorrect: number; remaining: number; testId?: string }) {
  const total = Math.max(1, correct + incorrect + remaining);
  return (
    <div data-testid={testId}>
      <div className="flex h-3.5 w-full overflow-hidden" style={{ background: 'var(--line)' }}>
        <div style={{ width: `${(correct / total) * 100}%`, background: 'var(--good)' }} />
        <div style={{ flex: 1 }} />
        <div style={{ width: `${(incorrect / total) * 100}%`, background: 'var(--bad)' }} />
      </div>
      <div className="mono mt-1.5 flex justify-between text-[12px]">
        <span style={{ color: 'var(--good)' }}>✓ {correct} correct</span>
        <span style={{ color: 'var(--ink-2)' }}>{remaining} remaining</span>
        <span style={{ color: 'var(--bad)' }}>✗ {incorrect} incorrect</span>
      </div>
    </div>
  );
}

/** Smooth area chart of percentages over time. */
export function AreaChart({ points, height = 220, color = 'var(--brand)', label }: { points: { x: string; y: number }[]; height?: number; color?: string; label?: string }) {
  const W = 640;
  const H = height;
  const P = { l: 40, r: 12, t: 12, b: 28 };
  if (points.length < 2) return <div className="flex items-center justify-center text-sm" style={{ height, color: 'var(--ink-3)', background: 'var(--surface-2)' }}>{label ?? 'Finish two blocks to see the trend.'}</div>;
  const X = (i: number) => P.l + (i / (points.length - 1)) * (W - P.l - P.r);
  const Y = (v: number) => P.t + (1 - v / 100) * (H - P.t - P.b);
  const pts = points.map((p, i) => [X(i), Y(p.y)] as const);
  // smooth curve through the points
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  const area = `${d} L${pts[pts.length - 1][0]},${Y(0)} L${pts[0][0]},${Y(0)} Z`;
  const every = Math.ceil(points.length / 8);
  const gid = `g${Math.round(Math.random() * 1e9)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Score over time">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 20, 40, 60, 80, 100].map((v) => (
        <g key={v}>
          <line x1={P.l} x2={W - P.r} y1={Y(v)} y2={Y(v)} stroke="currentColor" strokeOpacity="0.12" strokeDasharray="3 3" />
          <text x={P.l - 6} y={Y(v) + 3} fontSize="10" textAnchor="end" fill="currentColor" opacity="0.6">
            {v}%
          </text>
        </g>
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2.2" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.6" fill={color}>
          <title>{`${points[i].x}: ${Math.round(points[i].y)}%`}</title>
        </circle>
      ))}
      {points.map((p, i) =>
        i % every === 0 || i === points.length - 1 ? (
          <text key={i} x={X(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="currentColor" opacity="0.7">
            {p.x}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** Accuracy by subject as a radar (3+ subjects) with values at the tips. */
export function Radar({ items, size = 280 }: { items: { name: string; value: number | null }[]; size?: number }) {
  const c = size / 2;
  const R = size / 2 - 46;
  const n = items.length;
  if (n < 3) return null;
  const at = (i: number, r: number) => [c + r * Math.sin((i / n) * Math.PI * 2), c - r * Math.cos((i / n) * Math.PI * 2)] as const;
  const poly = items.map((it, i) => at(i, ((it.value ?? 0) / 100) * R).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-[320px]" role="img" aria-label="Accuracy by subject">
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <circle key={k} cx={c} cy={c} r={R * k} fill="none" stroke="currentColor" strokeOpacity="0.15" />
      ))}
      {items.map((_, i) => {
        const [x, y] = at(i, R);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="currentColor" strokeOpacity="0.12" />;
      })}
      <polygon points={poly} fill="var(--brand)" fillOpacity="0.15" stroke="var(--brand)" strokeWidth="1.8" />
      {items.map((it, i) => {
        const [x, y] = at(i, ((it.value ?? 0) / 100) * R);
        const [lx, ly] = at(i, R + 24);
        return (
          <g key={it.name}>
            <circle cx={x} cy={y} r="3.2" fill={tone(it.value)} />
            <text x={lx} y={ly - 4} fontSize="10" fontWeight="600" textAnchor="middle" fill="currentColor">
              {it.name.length > 14 ? it.name.slice(0, 13) + '…' : it.name}
            </text>
            <text x={lx} y={ly + 9} fontSize="10.5" fontWeight="700" textAnchor="middle" fill={tone(it.value)}>
              {it.value == null ? '—' : `${Math.round(it.value)}%`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Horizontal bars 0–100 % with a label column. */
export function HBars({ rows, empty }: { rows: { name: string; value: number | null; sub?: string }[]; empty?: ReactNode }) {
  if (!rows.length) return <div className="text-sm" style={{ color: 'var(--ink-3)' }}>{empty ?? 'Nothing yet.'}</div>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.name} className="grid grid-cols-[minmax(90px,170px)_1fr_auto] items-center gap-3 text-[13px]">
          <span className="truncate text-right" title={r.name} style={{ color: 'var(--ink-2)' }}>
            {r.name}
          </span>
          <div className="h-5" style={{ background: 'var(--surface-2)' }}>
            <div className="h-full" style={{ width: `${r.value ?? 0}%`, background: r.value == null ? 'transparent' : r.value >= 80 ? 'var(--good)' : r.value >= 60 ? '#facc15' : 'var(--bad)' }} />
          </div>
          <span className="mono w-14 text-right text-[12px]">{r.value == null ? '—' : `${Math.round(r.value)}%`}</span>
        </div>
      ))}
    </div>
  );
}

/** Vertical bars (study time per day). */
export function DayBars({ days, height = 200 }: { days: { label: string; hours: number }[]; height?: number }) {
  const W = 420;
  const H = height;
  const max = Math.max(0.5, ...days.map((d) => d.hours));
  const bw = (W - 40) / days.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Study time per day">
      {[0, 0.5, 1].map((k) => (
        <g key={k}>
          <line x1={34} x2={W} y1={H - 24 - k * (H - 40)} y2={H - 24 - k * (H - 40)} stroke="currentColor" strokeOpacity="0.12" strokeDasharray="3 3" />
          <text x={30} y={H - 21 - k * (H - 40)} fontSize="10" textAnchor="end" fill="currentColor" opacity="0.6">
            {(max * k).toFixed(1)}h
          </text>
        </g>
      ))}
      {days.map((d, i) => {
        const h = (d.hours / max) * (H - 40);
        return (
          <g key={i}>
            <rect x={40 + i * bw + bw * 0.15} y={H - 24 - h} width={bw * 0.7} height={h} fill="var(--navy)">
              <title>{`${d.label}: ${d.hours.toFixed(1)} h`}</title>
            </rect>
            <text x={40 + i * bw + bw / 2} y={H - 8} fontSize="10" textAnchor="middle" fill="currentColor" opacity="0.7">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** A tiny trend line for KPI tiles. */
export function Sparkline({ values, width = 70, height = 26 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - ((v - min) / Math.max(1, max - min)) * (height - 4) - 2}`).join(' ');
  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="var(--brand)" strokeWidth="1.6" />
    </svg>
  );
}
