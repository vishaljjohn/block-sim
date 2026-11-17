import type { Bucket } from '../lib/score';

export function TimeChart({ times }: { times: { n: number; ms: number; correct: boolean; blank: boolean }[] }) {
  if (!times.length) return null;
  const max = Math.max(...times.map((t) => t.ms), 1000);
  const W = Math.max(300, Math.min(900, times.length * 14));
  const H = 130;
  const bw = W / times.length;
  const avg = times.reduce((s, t) => s + t.ms, 0) / times.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: '100%', maxWidth: W, height: 'auto' }} role="img" aria-label="Time spent per question" data-testid="time-chart">
      {times.map((t, i) => {
        const h = Math.max(1, (t.ms / max) * H);
        return (
          <rect key={i} x={i * bw + 1} y={H - h} width={Math.max(1, bw - 2)} height={h} fill={t.blank ? '#9ca3af' : t.correct ? '#16a34a' : '#dc2626'}>
            <title>{`Q${t.n}: ${Math.round(t.ms / 1000)} s (${t.blank ? 'blank' : t.correct ? 'correct' : 'incorrect'})`}</title>
          </rect>
        );
      })}
      <line x1="0" x2={W} y1={H - (avg / max) * H} y2={H - (avg / max) * H} stroke="#2f5be7" strokeDasharray="4 3" />
      <line x1="0" x2={W} y1={H} y2={H} stroke="currentColor" strokeOpacity="0.4" />
      <text fill="currentColor" x="0" y={H + 13} fontSize="10">1</text>
      <text fill="currentColor" x={W} y={H + 13} fontSize="10" textAnchor="end">{times.length}</text>
      <text fill="currentColor" x={W / 2} y={H + 13} fontSize="10" textAnchor="middle">question (dashed line = average {Math.round(avg / 1000)} s; tallest = {Math.round(max / 1000)} s)</text>
    </svg>
  );
}

export function TrendChart({ points }: { points: { label: string; pct: number }[] }) {
  if (points.length < 2) return <div className="text-sm text-gray-600">The score trend appears after two completed attempts.</div>;
  const W = 520;
  const H = 140;
  const x = (i: number) => 30 + (i * (W - 50)) / (points.length - 1);
  const y = (p: number) => 10 + ((100 - p) / 100) * (H - 30);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: 'auto' }} role="img" aria-label="Score trend" data-testid="trend-chart">
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1="30" x2={W - 10} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity="0.12" />
          <text fill="currentColor" x="26" y={y(g) + 3} fontSize="10" textAnchor="end">{g}%</text>
        </g>
      ))}
      <polyline fill="none" stroke="#2f5be7" strokeWidth="2" points={points.map((p, i) => `${x(i)},${y(p.pct)}`).join(' ')} />
      {points.map((p, i) => (
        <g key={i}>
          <rect x={x(i) - 3} y={y(p.pct) - 3} width="6" height="6" fill="#2f5be7">
            <title>{`${p.label}: ${Math.round(p.pct)}%`}</title>
          </rect>
          <text fill="currentColor" x={x(i)} y={y(p.pct) - 7} fontSize="10" textAnchor="middle">{Math.round(p.pct)}%</text>
        </g>
      ))}
    </svg>
  );
}

export function BucketTable({ buckets, head }: { buckets: Bucket[]; head: string }) {
  if (!buckets.length) return <div className="text-sm text-gray-600">Nothing to show yet.</div>;
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className="th">{head}</th>
          <th className="th w-24">Correct</th>
          <th className="th w-16">%</th>
          <th className="th w-40"></th>
        </tr>
      </thead>
      <tbody>
        {buckets.map((b) => {
          const pct = b.total ? (b.correct / b.total) * 100 : 0;
          return (
            <tr key={b.label}>
              <td className="td">{b.label}</td>
              <td className="td">{b.correct} / {b.total}</td>
              <td className="td">{Math.round(pct)}%</td>
              <td className="td">
                <div className="h-3 w-full border border-gray-400 bg-white">
                  <div className="h-full" style={{ width: `${pct}%`, background: pct >= 70 ? '#16a34a' : pct >= 50 ? '#ca8a04' : '#dc2626' }} />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
