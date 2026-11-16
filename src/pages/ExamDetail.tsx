import { useState } from 'react';
import { db } from '../db';
import { flips, scoreAttempt } from '../lib/score';
import { exportBackup } from '../lib/backup';
import { downloadBlob } from '../lib/csv';
import { deleteAttempt } from '../lib/store';
import { fmtDuration } from '../lib/timer';
import { fmtDateTime, useLive } from '../ui/hooks';
import { H1, H2 } from '../ui/Shell';
import { TrendChart } from '../ui/charts';

export function ExamDetail({ examId }: { examId: string }) {
  const exam = useLive(() => db.exams.get(examId).then((e) => e ?? null), [examId]);
  const attempts = useLive(() => db.attempts.where('examId').equals(examId).toArray(), [examId]);
  const [busy, setBusy] = useState('');
  if (exam === undefined || !attempts) return <div className="text-sm">Loading…</div>;
  if (exam === null) return <div>This exam was not found. <a className="link" href="#/">Back to the library</a></div>;
  const done = attempts.filter((a) => a.status === 'completed').sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
  const open = attempts.filter((a) => a.status === 'active');
  const full = done.filter((a) => a.items.length >= Math.min(exam.questions.length, 5));
  const lastTwo = done.slice(-2);
  const fl = lastTwo.length === 2 ? flips(lastTwo[0], lastTwo[1]) : [];
  const tags = [...new Set(exam.questions.flatMap((q) => q.tags))];
  return (
    <div data-testid="exam-detail">
      <a className="link text-sm" href="#/">← Library</a>
      <H1>{exam.name}</H1>
      <div className="mb-3 text-sm text-gray-700">
        {exam.subject && <>{exam.subject} · </>}
        {exam.questions.length} questions · {exam.questions.filter((q) => q.answer).length} with answers · {exam.pageCount} pages
        {tags.length > 0 && <> · tags: {tags.slice(0, 12).join(', ')}{tags.length > 12 ? '…' : ''}</>}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {exam.keyChecked ? (
          <a className="btn-primary" href={`#/setup?exam=${exam.id}`} data-testid="detail-new-attempt">New attempt</a>
        ) : (
          <a className="btn-primary" href={`#/exam/${exam.id}/key`}>Check the answer key first</a>
        )}
        {open.map((a) => (
          <a key={a.id} className="btn" href={`#/test/${a.id}`}>Resume unfinished block</a>
        ))}
        <a className="btn" href={`#/exam/${exam.id}/key`}>Edit answer key</a>
        <a className="btn" href={`#/exam/${exam.id}/layout`}>Layout, crop and choices</a>
        <button
          className="btn"
          onClick={async () => {
            setBusy('Preparing…');
            downloadBlob(await exportBackup({ examId: exam.id }), `block-sim-exam-${exam.name.replace(/[^\w-]+/g, '_').slice(0, 40)}.zip`);
            setBusy('Exported. Restore it on any computer from Settings → Restore.');
          }}
        >
          Export this exam
        </button>
        {busy && <span className="self-center text-sm">{busy}</span>}
      </div>

      <H2>Attempts</H2>
      {done.length === 0 && open.length === 0 ? (
        <div className="text-sm text-gray-600">No attempts yet.</div>
      ) : (
        <table className="w-full border-collapse border border-gray-400" data-testid="attempt-list">
          <thead>
            <tr>
              <th className="th">Date</th>
              <th className="th">Mode</th>
              <th className="th">Questions</th>
              <th className="th">Score</th>
              <th className="th">Time</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {[...done].reverse().concat(open).map((a) => {
              const s = scoreAttempt(a);
              return (
                <tr key={a.id}>
                  <td className="td">{fmtDateTime(a.completedAt ?? a.createdAt)}</td>
                  <td className="td capitalize">{a.mode}{a.status === 'active' ? ' (in progress)' : ''}</td>
                  <td className="td">{a.items.length}</td>
                  <td className="td">{a.status === 'completed' ? `${Math.round(s.pct)}% (${s.correct}/${s.total})` : '—'}</td>
                  <td className="td">{fmtDuration(s.timeMs)}</td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1">
                      {a.status === 'completed' ? (
                        <>
                          <a className="btn py-0.5" href={`#/report/${a.id}`}>Score report</a>
                          <a className="btn py-0.5" href={`#/review/${a.id}`}>Review</a>
                        </>
                      ) : (
                        <a className="btn py-0.5" href={`#/test/${a.id}`}>Resume</a>
                      )}
                      <button className="btn py-0.5" onClick={() => window.confirm('Delete this attempt permanently? Its answers, notes and highlights will be removed.') && void deleteAttempt(a.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <H2>Score trend</H2>
      <TrendChart points={full.map((a) => ({ label: fmtDateTime(a.completedAt), pct: scoreAttempt(a).pct }))} />

      {lastTwo.length === 2 && (
        <>
          <H2>Changed since the previous attempt</H2>
          {fl.length === 0 ? (
            <div className="text-sm text-gray-600">No question flipped between your last two attempts.</div>
          ) : (
            <div className="grid gap-4 text-sm md:grid-cols-2" data-testid="flips">
              {(['wrong→right', 'right→wrong'] as const).map((k) => (
                <div key={k}>
                  <div className="font-bold" style={{ color: k === 'wrong→right' ? '#15803d' : '#dc2626' }}>{k === 'wrong→right' ? 'Wrong → right' : 'Right → wrong'} ({fl.filter((f) => f.kind === k).length})</div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {fl.filter((f) => f.kind === k).map((f) => {
                      const idx = lastTwo[1].items.findIndex((it) => it.qid === f.qid);
                      return (
                        <a key={f.qid} className="btn py-0" href={`#/review/${lastTwo[1].id}?i=${idx}`}>Q{f.number}</a>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
