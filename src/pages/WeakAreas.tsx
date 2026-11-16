import { useMemo } from 'react';
import { db } from '../db';
import { MISS_REASONS } from '../types';
import { buildMissedBank } from '../lib/missed';
import { isBlank, isCorrect, type Bucket } from '../lib/score';
import { go, useLive } from '../ui/hooks';
import { H1, H2 } from '../ui/Shell';
import { BucketTable } from '../ui/charts';
import { BANK_KEY } from './BlockSetup';

/** Accuracy by tag and by reason for miss across every finished block, worst first. */
export function WeakAreas() {
  const attempts = useLive(() => db.attempts.where('status').equals('completed').toArray(), []);
  const reviews = useLive(() => db.reviews.toArray(), []);
  const exams = useLive(() => db.exams.toArray(), []);
  const data = useMemo(() => {
    if (!attempts) return null;
    const tags: Record<string, Bucket> = {};
    const conf: Record<string, Bucket> = {};
    const reasons: Record<string, number> = {};
    let misses = 0;
    let graded = 0;
    for (const a of attempts)
      for (const it of a.items) {
        if (!it.key) continue;
        graded++;
        const ok = isCorrect(it);
        for (const t of it.tags.length ? it.tags : ['(untagged)']) {
          tags[t] ??= { label: t, correct: 0, total: 0 };
          tags[t].total++;
          if (ok) tags[t].correct++;
        }
        if (!isBlank(it)) {
          const k = it.confidence ?? 'not rated';
          conf[k] ??= { label: k[0].toUpperCase() + k.slice(1), correct: 0, total: 0 };
          conf[k].total++;
          if (ok) conf[k].correct++;
        }
        if (!ok) {
          misses++;
          const r = it.missReason ?? 'none';
          reasons[r] = (reasons[r] ?? 0) + 1;
        }
      }
    const byTag = Object.values(tags).sort((x, y) => x.correct / x.total - y.correct / y.total || y.total - x.total);
    return { byTag, byConf: Object.values(conf), reasons, misses, graded };
  }, [attempts]);
  const bank = useMemo(() => (attempts && reviews ? buildMissedBank(attempts, reviews) : []), [attempts, reviews]);
  if (!data || !exams) return <div className="text-sm">Loading…</div>;
  const examIds = new Set(exams.map((e) => e.id));
  const quizTag = (tag: string) => {
    const ids = bank.filter((r) => r.schedule.status !== 'Mastered' && examIds.has(r.examId) && (tag === '(untagged)' ? !r.tags.length : r.tags.includes(tag))).map((r) => r.qid);
    sessionStorage.setItem(BANK_KEY, JSON.stringify(ids));
    go('/setup?bank=1');
  };
  const reasonRows = [...MISS_REASONS.map((m) => ({ id: m.id as string, label: m.label })), { id: 'none', label: 'No reason given yet' }]
    .map((r) => ({ ...r, n: data.reasons[r.id] ?? 0 }))
    .sort((a, b) => b.n - a.n);

  return (
    <div data-testid="weak-areas">
      <H1>Weak Areas</H1>
      {data.graded === 0 ? (
        <div className="border border-gray-400 p-4 text-sm">Finish a block to see where you lose points. Tag questions on the answer key screen (Cardio, Renal…) to get a breakdown by topic.</div>
      ) : (
        <>
          <p className="mb-2 text-sm text-gray-700">
            Across {attempts!.length} finished block{attempts!.length === 1 ? '' : 's'}: {data.graded - data.misses} of {data.graded} correct ({Math.round(((data.graded - data.misses) / data.graded) * 100)}%). Worst first.
          </p>
          <H2>Accuracy by tag</H2>
          <BucketTable buckets={data.byTag} head="Tag" />
          <div className="mt-2 flex flex-wrap gap-1">
            {data.byTag.slice(0, 6).map((b) => (
              <button key={b.label} className="btn py-0.5 text-xs" onClick={() => quizTag(b.label)} disabled={!bank.some((r) => (b.label === '(untagged)' ? !r.tags.length : r.tags.includes(b.label)))}>
                Quiz me: {b.label}
              </button>
            ))}
          </div>
          <H2>Why I miss questions</H2>
          <table className="w-full max-w-xl border-collapse" data-testid="reason-table">
            <tbody>
              {reasonRows.map((r) => (
                <tr key={r.id}>
                  <td className="td">{r.label}</td>
                  <td className="td w-16 font-bold">{r.n}</td>
                  <td className="td w-48">
                    <div className="h-3 w-full border border-gray-400">
                      <div className="h-full bg-red-600" style={{ width: `${data.misses ? (r.n / data.misses) * 100 : 0}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-gray-600">Set the reason for each miss in review (one click under the explanation).</p>
          <H2>Accuracy by confidence</H2>
          <BucketTable buckets={data.byConf} head="Confidence" />
        </>
      )}
    </div>
  );
}
