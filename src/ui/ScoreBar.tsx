/** Green (correct) / red (incorrect) / grey (omitted) proportion bar. */
export function ScoreBar({ correct, wrong, blank, height = 8, testId }: { correct: number; wrong: number; blank: number; height?: number; testId?: string }) {
  const total = Math.max(1, correct + wrong + blank);
  const seg = (n: number, color: string, label: string) =>
    n > 0 ? <div title={`${label}: ${n} (${Math.round((n / total) * 100)}%)`} style={{ width: `${(n / total) * 100}%`, background: color }} /> : null;
  return (
    <div className="flex w-full overflow-hidden rounded-full bg-gray-200" style={{ height }} role="img" aria-label={`${correct} correct, ${wrong} incorrect, ${blank} omitted`} data-testid={testId}>
      {seg(correct, '#16a34a', 'Correct')}
      {seg(wrong, '#dc2626', 'Incorrect')}
      {seg(blank, '#9ca3af', 'Omitted')}
    </div>
  );
}

/** Ring chart with the percentage in the middle (score report). */
export function Donut({ correct, wrong, blank, size = 120 }: { correct: number; wrong: number; blank: number; size?: number }) {
  const total = Math.max(1, correct + wrong + blank);
  const r = 46;
  const c = 2 * Math.PI * r;
  const arc = (n: number, offset: number, color: string) => (n > 0 ? <circle r={r} cx="60" cy="60" fill="none" stroke={color} strokeWidth="12" strokeDasharray={`${(n / total) * c} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" /> : null);
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`${Math.round((correct / total) * 100)}% correct`} data-testid="donut">
      <circle r={r} cx="60" cy="60" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="12" />
      {arc(correct, 0, '#16a34a')}
      {arc(wrong, (correct / total) * c, '#dc2626')}
      {arc(blank, ((correct + wrong) / total) * c, '#9ca3af')}
      <text x="60" y="58" textAnchor="middle" fontSize="22" fontWeight="700" fill="currentColor">
        {Math.round((correct / total) * 100)}%
      </text>
      <text x="60" y="76" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.65">
        correct
      </text>
    </svg>
  );
}
