import { useEffect, useMemo, useState } from 'react';
import { db } from '../db';
import type { Exam, PageText } from '../types';
import { buildMissedBank } from '../lib/missed';
import { choiceLetters, usesChoiceRegions } from '../lib/layout';
import { examPdf, type PdfDoc } from '../lib/pdf';
import { addRedo } from '../lib/store';
import { fmtDate, go, useElementWidth, useLive } from '../ui/hooks';
import { QuestionView } from '../ui/QuestionView';
import { AnswerBox } from '../ui/AnswerBox';

/** Answer missed questions again, blind (no old markings), and log the result for the spaced schedule. */
export function Redo({ qids }: { qids: string[] }) {
  const exams = useLive(() => db.exams.toArray(), []);
  const attempts = useLive(() => db.attempts.toArray(), []);
  const reviews = useLive(() => db.reviews.toArray(), []);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [strikes, setStrikes] = useState<string[]>([]);
  const [done, setDone] = useState<{ correct: boolean } | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [doc, setDoc] = useState<{ id: string; doc: PdfDoc } | null>(null);
  const [areaRef, areaW] = useElementWidth<HTMLDivElement>();

  const items = useMemo(() => {
    if (!exams) return [];
    const byId = new Map<string, { exam: Exam; qi: number }>();
    for (const e of exams) e.questions.forEach((q, qi) => byId.set(q.id, { exam: e, qi }));
    return qids.map((id) => byId.get(id)).filter((x): x is { exam: Exam; qi: number } => !!x);
  }, [exams, qids.join(',')]);
  const cur = items[i];
  const exam = cur?.exam;
  const q = cur ? cur.exam.questions[cur.qi] : undefined;
  const texts = useLive<PageText[]>(() => (exam ? db.pages.where('examId').equals(exam.id).toArray() : Promise.resolve([])), [exam?.id]);
  const textMap = useMemo(() => new Map((texts ?? []).map((t) => [t.page, t])), [texts]);
  const row = useMemo(() => (attempts && reviews && q ? buildMissedBank(attempts, reviews).find((r) => r.qid === q.id) : undefined), [attempts, reviews, q?.id]);

  useEffect(() => {
    if (!exam || doc?.id === exam.id) return;
    let live = true;
    examPdf(exam.id).then((d) => live && setDoc({ id: exam.id, doc: d }), () => {});
    return () => {
      live = false;
    };
  }, [exam?.id]);

  const submit = async () => {
    if (!q || !exam || !answer || done) return;
    const correct = answer === q.answer;
    await addRedo(q.id, exam.id, answer, correct);
    setDone({ correct });
    setResults((r) => [...r, correct]);
  };
  const next = () => {
    setI(i + 1);
    setAnswer(null);
    setStrikes([]);
    setDone(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      if (!q) return;
      if (e.key === 'Enter') {
        if (done) next();
        else void submit();
        e.preventDefault();
        return;
      }
      const l = e.key.length === 1 ? e.key.toUpperCase() : '';
      if (!done && choiceLetters(q).includes(l)) setAnswer(l);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!exams || !attempts || !reviews) return <div className="text-sm">Loading…</div>;
  if (!items.length) return <div>None of these questions are available (their exam may have been deleted). <a className="link" href="#/missed">Back to Missed Questions</a></div>;
  if (!cur || !q || !exam) {
    const right = results.filter(Boolean).length;
    return (
      <div className="max-w-xl" data-testid="redo-done">
        <h1 className="mb-2 text-xl font-bold">Redo finished</h1>
        <p className="mb-3 text-sm">
          {right} of {results.length} correct. Correct redos push the next review further out; wrong ones bring it back in 3 days.
        </p>
        <div className="flex gap-2">
          <a className="btn-primary" href="#/missed">Back to Missed Questions</a>
          <a className="btn" href="#/">Library</a>
        </div>
      </div>
    );
  }
  const clickable = usesChoiceRegions(exam, q);
  const width = Math.max(300, Math.min(1000, areaW - (clickable ? 10 : 190)));

  return (
    <div data-testid="redo-page">
      <div className="mb-2 flex flex-wrap items-center gap-3 bg-navy px-3 py-2 text-sm text-white">
        <span className="border border-white px-2 py-0.5" data-testid="redo-pos">
          Redo {i + 1} of {items.length}
        </span>
        <span>
          {exam.name}, question {q.number}
          {row && <> · last missed {fmtDate(row.missedAt)} · status {row.schedule.status}</>}
        </span>
        <span className="flex-1" />
        <button className="underline" onClick={() => go('/missed')}>Exit</button>
      </div>
      <div ref={areaRef} className="flex items-start gap-5">
        <div className="shrink-0">
          {doc && doc.id === exam.id && (
            <QuestionView
              exam={exam}
              question={q}
              doc={doc.doc}
              texts={textMap}
              width={width}
              item={{ answer, highlights: [], strikes }}
              readOnly={!!done}
              revealKey={done ? q.answer : null}
              onSelect={(l) => !done && setAnswer(l)}
              onStrike={(l) => !done && setStrikes((s) => (s.includes(l) ? s.filter((x) => x !== l) : [...s, l]))}
            />
          )}
        </div>
        {!clickable && <AnswerBox letters={choiceLetters(q)} answer={answer} strikes={strikes} readOnly={!!done} revealKey={done ? q.answer : null} onSelect={(l) => !done && setAnswer(l)} onStrike={(l) => !done && setStrikes((s) => (s.includes(l) ? s.filter((x) => x !== l) : [...s, l]))} />}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {!done ? (
          <button className="btn-primary" disabled={!answer} onClick={() => void submit()} data-testid="redo-submit">
            Submit answer
          </button>
        ) : (
          <>
            <span className="text-base font-bold" style={{ color: done.correct ? '#15803d' : '#dc2626' }} data-testid="redo-result">
              {done.correct ? 'Correct' : `Incorrect: the answer is ${q.answer}`}
            </span>
            <button className="btn-primary" onClick={next} data-testid="redo-next" autoFocus>
              {i + 1 < items.length ? 'Next question' : 'Finish'}
            </button>
            {row && <a className="btn" href={`#/review/${row.attemptId}?i=${row.itemIndex}`}>See my original attempt</a>}
          </>
        )}
      </div>
      {done && (
        <div className="mt-4 max-w-3xl border-l-4 border-gray-400 pl-3 text-sm leading-relaxed" data-testid="redo-explanation">
          <div className="mb-1 font-bold">Explanation</div>
          {q.explanation ? q.explanation.split(/\n{2,}/).map((p, k) => <p key={k} className="mb-2 whitespace-pre-wrap">{p}</p>) : <p className="text-gray-600">No explanation in the answer key.</p>}
        </div>
      )}
    </div>
  );
}
