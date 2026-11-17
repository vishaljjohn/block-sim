import { useEffect, useMemo, useState } from 'react';
import { db } from '../db';
import type { Exam, MissReason, PageText } from '../types';
import { MISS_REASONS } from '../types';
import { buildMissedBank, type MissedRow } from '../lib/missed';
import { DAY } from '../lib/schedule';
import { downloadText, toCsv } from '../lib/csv';
import { segmentRect } from '../lib/layout';
import { fmtDate, go, useLive } from '../ui/hooks';
import { H1 } from '../ui/Shell';
import { BANK_KEY } from './BlockSetup';

type DateFilter = 'any' | 'missed7' | 'missed30' | 'missed90' | 'stale14';
type SortKey = 'missed' | 'due' | 'exam' | 'times';

/** Text of the part of the page(s) a question occupies (for search). */
function questionText(exam: Exam, qid: string, pages: Map<string, PageText>): string {
  const q = exam.questions.find((x) => x.id === qid);
  if (!q) return '';
  return q.segments
    .map((seg) => {
      const pt = pages.get(`${exam.id}:${seg.page}`);
      if (!pt) return '';
      const r = segmentRect(exam, seg, pt);
      return pt.words
        .filter((w) => w.x + w.w / 2 >= r.x && w.x + w.w / 2 <= r.x + r.w && w.y + w.h / 2 >= r.y && w.y + w.h / 2 <= r.y + r.h)
        .map((w) => w.t)
        .join(' ');
    })
    .join(' ');
}

export function Missed() {
  const attempts = useLive(() => db.attempts.toArray(), []);
  const reviews = useLive(() => db.reviews.toArray(), []);
  const exams = useLive(() => db.exams.toArray(), []);
  const [exam, setExam] = useState('');
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('active');
  const [date, setDate] = useState<DateFilter>('any');
  const [why, setWhy] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('missed');
  const [texts, setTexts] = useState<Map<string, PageText> | null>(null);
  const now = Date.now();

  // page text is only loaded when the user searches
  useEffect(() => {
    if (!q.trim() || texts) return;
    void db.pages.toArray().then((all) => setTexts(new Map(all.map((p) => [p.id, p]))));
  }, [q]);

  const rows = useMemo(() => (attempts && reviews ? buildMissedBank(attempts, reviews) : []), [attempts, reviews]);
  const examById = useMemo(() => new Map((exams ?? []).map((e) => [e.id, e])), [exams]);
  const hasText = useLive(() => db.pages.count(), []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (exam && r.examId !== exam) return false;
      if (reason && (reason === 'none' ? r.reason != null : r.reason !== reason)) return false;
      if (status === 'active' && r.schedule.status === 'Mastered') return false;
      if (status === 'due' && !(r.schedule.dueAt != null && r.schedule.dueAt <= now)) return false;
      if ((status === 'New' || status === 'Reviewing' || status === 'Mastered') && r.schedule.status !== status) return false;
      if (why && !r.why.includes(why as MissedRow['why'][number])) return false;
      if (date === 'missed7' && now - r.missedAt > 7 * DAY) return false;
      if (date === 'missed30' && now - r.missedAt > 30 * DAY) return false;
      if (date === 'missed90' && now - r.missedAt > 90 * DAY) return false;
      if (date === 'stale14' && r.lastReviewed != null && now - r.lastReviewed < 14 * DAY) return false;
      if (needle) {
        const e = examById.get(r.examId);
        const hay = `${e?.name ?? ''} ${e && texts ? questionText(e, r.qid, texts) : ''} ${e?.questions.find((x) => x.id === r.qid)?.explanation ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const by: Record<SortKey, (a: MissedRow, b: MissedRow) => number> = {
      missed: (a, b) => b.missedAt - a.missedAt,
      due: (a, b) => (a.schedule.dueAt ?? Infinity) - (b.schedule.dueAt ?? Infinity),
      exam: (a, b) => (examById.get(a.examId)?.name ?? '').localeCompare(examById.get(b.examId)?.name ?? '') || a.number - b.number,
      times: (a, b) => b.timesMissed - a.timesMissed,
    };
    return out.sort(by[sort]);
  }, [rows, exam, reason, status, date, why, q, sort, texts, examById]);

  if (!attempts || !reviews || !exams) return <div className="text-sm">Loading…</div>;
  const examIds = [...new Set(rows.map((r) => r.examId))];
  const dueCount = rows.filter((r) => r.schedule.dueAt != null && r.schedule.dueAt <= now).length;
  const playable = filtered.filter((r) => examById.has(r.examId));

  const quiz = () => {
    sessionStorage.setItem(BANK_KEY, JSON.stringify(playable.map((r) => r.qid)));
    go('/setup?bank=1');
  };
  const csv = () => {
    const out: (string | number)[][] = [['Exam', 'Question #', 'Date missed', 'My answer', 'Correct answer', 'Why listed', 'Reason', 'Times missed', 'Last reviewed', 'Next due', 'Status']];
    for (const r of filtered)
      out.push([examById.get(r.examId)?.name ?? '(deleted exam)', r.number, fmtDate(r.missedAt), r.myAnswer ?? '', r.key ?? '', r.why.join(' + '), MISS_REASONS.find((m) => m.id === r.reason)?.label ?? '', r.timesMissed, fmtDate(r.lastReviewed), r.schedule.dueAt ? fmtDate(r.schedule.dueAt) : '', r.schedule.status]);
    downloadText(toCsv(out), `test-simulator-missed-${new Date().toISOString().slice(0, 10)}.csv`);
  };
  const Sel = ({ value, set, children, label, testId }: { value: string; set: (v: string) => void; children: React.ReactNode; label: string; testId?: string }) => (
    <label className="text-sm">
      {label}{' '}
      <select className="field" value={value} onChange={(e) => set(e.target.value)} data-testid={testId}>
        {children}
      </select>
    </label>
  );

  return (
    <div data-testid="missed-page">
      <H1>Missed Questions</H1>
      <p className="mb-3 text-sm text-gray-700">
        Every question you answered wrong or marked in a finished block, across all exams. Redo them blind on a spaced schedule (3, 7, 21, 60 days); two correct redos on different days = Mastered.
      </p>
      {rows.length === 0 ? (
        <div className="border border-gray-400 p-4 text-sm">Nothing here yet. Finish a block and the questions you miss or mark show up here.</div>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-end gap-x-4 gap-y-2 border border-gray-400 bg-gray-50 p-2">
            <Sel label="Exam" value={exam} set={setExam} testId="f-exam">
              <option value="">All exams</option>
              {examIds.map((id) => (
                <option key={id} value={id}>{examById.get(id)?.name ?? '(deleted exam)'}</option>
              ))}
            </Sel>
            <Sel label="Reason" value={reason} set={setReason}>
              <option value="">Any reason</option>
              {MISS_REASONS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
              <option value="none">No reason given</option>
            </Sel>
            <Sel label="Status" value={status} set={setStatus} testId="f-status">
              <option value="active">Not mastered</option>
              <option value="due">Due now ({dueCount})</option>
              <option value="New">New</option>
              <option value="Reviewing">Reviewing</option>
              <option value="Mastered">Mastered</option>
              <option value="all">All</option>
            </Sel>
            <Sel label="Listed because" value={why} set={setWhy}>
              <option value="">Wrong or marked</option>
              <option value="wrong">Wrong</option>
              <option value="marked">Marked</option>
            </Sel>
            <Sel label="Date" value={date} set={(v) => setDate(v as DateFilter)}>
              <option value="any">Any time</option>
              <option value="missed7">Missed in last 7 days</option>
              <option value="missed30">Missed in last 30 days</option>
              <option value="missed90">Missed in last 90 days</option>
              <option value="stale14">Not reviewed in 2+ weeks</option>
            </Sel>
            <label className="text-sm">
              Search{' '}
              <input className="field w-48" value={q} onChange={(e) => setQ(e.target.value)} placeholder={hasText ? 'words in the question' : 'exam or explanation words'} data-testid="f-search" />
            </label>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm" data-testid="missed-count">
              <b>{filtered.length}</b> question{filtered.length === 1 ? '' : 's'}
            </span>
            <button className="btn-primary" disabled={!playable.length} onClick={quiz} data-testid="quiz-me">
              Quiz me on these ({playable.length})
            </button>
            <button className="btn" disabled={!playable.length} onClick={() => go(`/redo?q=${playable.slice(0, 60).map((r) => encodeURIComponent(r.qid)).join(',')}`)} data-testid="redo-all">
              Redo these one by one
            </button>
            <button className="btn" onClick={csv} disabled={!filtered.length} data-testid="missed-csv">Export CSV</button>
            <span className="flex-1" />
            <Sel label="Sort" value={sort} set={(v) => setSort(v as SortKey)}>
              <option value="missed">Most recently missed</option>
              <option value="due">Next due</option>
              <option value="exam">Exam and number</option>
              <option value="times">Times missed</option>
            </Sel>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-400" data-testid="missed-table">
              <thead>
                <tr>
                  <th className="th">Exam</th>
                  <th className="th">Q#</th>
                  <th className="th">Missed</th>
                  <th className="th">Mine / correct</th>
                  <th className="th">Reason</th>
                  <th className="th">Times</th>
                  <th className="th">Last reviewed</th>
                  <th className="th">Next due</th>
                  <th className="th">Status</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const due = r.schedule.dueAt != null && r.schedule.dueAt <= now;
                  const ex = examById.get(r.examId);
                  return (
                    <tr key={r.qid} className="cursor-pointer hover:bg-blue-50" onClick={() => go(`/review/${r.attemptId}?i=${r.itemIndex}`)} data-testid={`missed-row-${r.number}`}>
                      <td className="td">{ex?.name ?? <span className="text-gray-500">(deleted exam)</span>}</td>
                      <td className="td">{r.number}</td>
                      <td className="td whitespace-nowrap">{fmtDate(r.missedAt)}</td>
                      <td className="td whitespace-nowrap">
                        <span style={{ color: r.myAnswer === r.key ? '#15803d' : '#dc2626' }}>{r.myAnswer ?? '—'}</span> / <b>{r.key}</b>
                        {r.why.includes('marked') && <span className="ml-1 text-xs text-gray-600">marked</span>}
                      </td>
                      <td className="td">{MISS_REASONS.find((m) => m.id === (r.reason as MissReason))?.label ?? ''}</td>
                      <td className="td">{r.timesMissed}</td>
                      <td className="td whitespace-nowrap">{r.lastReviewed ? fmtDate(r.lastReviewed) : 'never'}</td>
                      <td className="td whitespace-nowrap" style={{ color: due ? '#b45309' : undefined, fontWeight: due ? 700 : undefined }}>{r.schedule.dueAt ? (due ? 'due now' : fmtDate(r.schedule.dueAt)) : '—'}</td>
                      <td className="td" data-testid="missed-status">{r.schedule.status}</td>
                      <td className="td" onClick={(e) => e.stopPropagation()}>
                        {ex ? (
                          <button className="btn py-0" onClick={() => go(`/redo?q=${encodeURIComponent(r.qid)}`)} data-testid="redo-one">Redo</button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-600">Click a row to review that question with your original highlights and notes. Set the reason for a miss from the review screen.</p>
        </>
      )}
    </div>
  );
}
