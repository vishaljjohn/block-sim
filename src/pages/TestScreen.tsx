import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db, migrateAttempt } from '../db';
import { IS_BETA, STORAGE_PREFIX } from '../config';

/**
 * Synchronous mirror of the active attempt in localStorage. IndexedDB writes are asynchronous and can be
 * cut off by a refresh, crash or closed window; this copy is written instantly on every change, and
 * whichever copy is newer wins when the block is reopened.
 */
const mirrorKey = (id: string) => STORAGE_PREFIX + 'live:' + id;
function writeMirror(a: Attempt) {
  try {
    localStorage.setItem(mirrorKey(a.id), JSON.stringify({ ...a, updatedAt: Date.now() }));
  } catch {}
}
function readMirror(id: string): Attempt | null {
  try {
    const s = localStorage.getItem(mirrorKey(id));
    return s ? (JSON.parse(s) as Attempt) : null;
  } catch {
    return null;
  }
}
export function clearMirror(id: string) {
  try {
    localStorage.removeItem(mirrorKey(id));
  } catch {}
}
import type { Attempt, AttemptItem, Exam, MissReason, PageText } from '../types';
import { MISS_REASONS } from '../types';
import * as T from '../lib/timer';
import { block, endBlock, lockItem, selectAnswer, setHighlights, startNextBlock, toggleStrike } from '../lib/attempt';
import { classifyChange, isCorrect } from '../lib/score';
import { choiceLetters, segmentRect, usesChoiceRegions } from '../lib/layout';
import { examPdf, pageSize, renderPage, type PdfDoc } from '../lib/pdf';
import { setOcrConcurrency } from '../lib/ocr';
import { useDisplay } from '../lib/display';
import { DisplaySettings } from '../ui/DisplaySettings';
import { HighlightableText } from '../ui/HighlightableText';
import { startTicker } from '../lib/ticker';
import { createSnapshot, markReviewed, patchSettings, saveAttempt, saveExam } from '../lib/store';
import { go, useElementWidth, useLive } from '../ui/hooks';
import { QuestionView } from '../ui/QuestionView';
import { AnswerBox } from '../ui/AnswerBox';
import { Calculator, LabValues, Modal, NotesPanel } from '../ui/panels';
import { Check, Cross, IconCalc, IconCheckCircle, IconEnd, IconExit, IconFlag, IconGear, IconGrid, IconLab, IconNext, IconNotes, IconPause, IconPrev } from '../ui/icons';

type Filter = 'all' | 'incorrect' | 'marked' | 'changed' | 'guesses' | 'slowest';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All questions' },
  { id: 'incorrect', label: 'Incorrect' },
  { id: 'marked', label: 'Marked' },
  { id: 'changed', label: 'Changed answers' },
  { id: 'slowest', label: 'Slowest 10' },
];

function cloneAttempt(a: Attempt): Attempt {
  return { ...a, items: [...a.items], blocks: a.blocks.map((b) => ({ ...b, timer: { ...b.timer } })) };
}

function ToolButton({ label, onClick, children, disabled, testId, active }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; testId?: string; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testId} aria-pressed={active} className="flex min-w-[58px] flex-col items-center px-1.5 text-[12px] leading-tight text-white disabled:opacity-40" title={label}>
      {children}
      <span className="mt-0.5 whitespace-nowrap">{label}</span>
    </button>
  );
}

export function TestScreen({ attemptId, review, startIndex, startFilter }: { attemptId: string; review: boolean; startIndex?: number; startFilter?: string }) {
  const [a, setA] = useState<Attempt | null>(null);
  const [missing, setMissing] = useState(false);
  const aRef = useRef<Attempt | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const dirty = useRef(false);
  const saveSeq = useRef(0);
  const [exams, setExams] = useState<Map<string, Exam>>(new Map());
  const [doc, setDoc] = useState<{ examId: string; doc: PdfDoc } | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [panel, setPanel] = useState<{ labs: boolean; calc: boolean; notes: boolean }>({ labs: false, calc: false, notes: false });
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState<null | 'grid' | 'end' | 'confirm' | 'help' | 'timer'>(null);
  const [navFilter, setNavFilter] = useState<null | 'marked' | 'incomplete'>(null);
  const [filter, setFilter] = useState<Filter>((FILTERS.find((f) => f.id === startFilter)?.id ?? 'all') as Filter);
  const [showElapsed, setShowElapsed] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [hideStrikes, setHideStrikes] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [areaRef, areaW] = useElementWidth<HTMLDivElement>();
  const display = useDisplay();
  const lastTick = useRef(Date.now());

  // keep the test screen smooth: background text recognition uses a single worker while a block is open
  useEffect(() => {
    setOcrConcurrency(1);
    return () => setOcrConcurrency(4);
  }, []);

  // ---------- load ----------
  useEffect(() => {
    let live = true;
    (async () => {
      let got = await db.attempts.get(attemptId);
      if (!live) return;
      if (!got) return setMissing(true);
      const mirror = readMirror(attemptId);
      if (mirror && mirror.updatedAt > got.updatedAt && !(got.status === 'completed' && mirror.status !== 'completed')) {
        got = migrateAttempt(mirror);
        await saveAttempt(cloneAttempt(got)).catch(() => {});
      } else if (mirror) clearMirror(attemptId);
      if (!review && got.status === 'completed') return go(`/report/${got.id}`, true);
      const at = cloneAttempt(got);
      // review opens on the requested item, otherwise on the first question
      if (review) at.current = startIndex != null && startIndex >= 0 && startIndex < at.items.length ? startIndex : 0;
      if (!review && at.phase === 'block') {
        // closed / crashed / slept: stop the clock at the moment the app went away
        const b = block(at);
        const r = T.beat(b.timer, Date.now());
        b.timer = r.timer;
        if (r.slept) at.paused = true;
        else if (!at.paused && b.timer.runningSince == null) b.timer = T.start(b.timer, Date.now());
      }
      aRef.current = at;
      setA(at);
      const ids = [...new Set(at.items.map((i) => i.examId))];
      const list = await db.exams.bulkGet(ids);
      if (!live) return;
      setExams(new Map(list.filter((e): e is Exam => !!e).map((e) => [e.id, e])));
      const s = await patchSettings({});
      setSidebar(s.sidebarOpen);
    })();
    return () => {
      live = false;
    };
  }, [attemptId, review]);

  const persist = useCallback(() => {
    const cur = aRef.current;
    if (!cur) return;
    dirty.current = false;
    const snap = cloneAttempt(cur);
    writeMirror(snap);
    const seq = ++saveSeq.current;
    saveChain.current = saveChain.current
      .then(() => saveAttempt(snap))
      .then(() => {
        // the database now holds the newest state; the instant copy is no longer needed
        if (seq === saveSeq.current) clearMirror(snap.id);
      })
      .catch((e) => console.error('save failed', e));
  }, []);

  /** Apply a change and autosave it immediately. */
  const commit = useCallback(
    (fn: (d: Attempt) => void, save = true) => {
      const cur = aRef.current;
      if (!cur) return;
      const d = cloneAttempt(cur);
      fn(d);
      aRef.current = d;
      setA(d);
      if (save) persist();
      else dirty.current = true;
    },
    [persist],
  );

  const cur = a ? a.items[a.current] : null;
  const exam = cur ? exams.get(cur.examId) : undefined;
  const question = exam && cur ? exam.questions.find((q) => q.id === cur.qid) : undefined;
  const texts = useLive<PageText[]>(() => (exam ? db.pages.where('examId').equals(exam.id).toArray() : Promise.resolve([])), [exam?.id]);
  const textMap = useMemo(() => new Map((texts ?? []).map((t) => [t.page, t])), [texts]);
  // exams can gain clickable choices while a block is open (text processing finishes in the background)
  const liveExam = useLive<Exam | undefined>(() => (cur ? db.exams.get(cur.examId) : Promise.resolve(undefined)), [cur?.examId]);
  useEffect(() => {
    if (liveExam && exams.get(liveExam.id)?.updatedAt !== liveExam.updatedAt) setExams((m) => new Map(m).set(liveExam.id, liveExam));
  }, [liveExam]);

  useEffect(() => {
    if (!cur) return;
    if (doc?.examId === cur.examId) return;
    let live = true;
    setDocError(null);
    examPdf(cur.examId).then(
      (d) => live && setDoc({ examId: cur.examId, doc: d }),
      (e) => live && setDocError(String(e?.message ?? e)),
    );
    return () => {
      live = false;
    };
  }, [cur?.examId]);

  const testing = !review && !!a && a.phase === 'block';
  const b = a ? a.blocks[Math.min(a.currentBlock, a.blocks.length - 1)] : null;

  // ---------- which items are navigable ----------
  const order: number[] = useMemo(() => {
    if (!a) return [];
    if (!review) {
      const all = Array.from({ length: b!.end - b!.start }, (_, i) => b!.start + i);
      if (navFilter === 'marked') return all.filter((i) => a.items[i].marked);
      if (navFilter === 'incomplete') return all.filter((i) => !a.items[i].answer);
      return all;
    }
    const all = a.items.map((_, i) => i);
    switch (filter) {
      case 'incorrect':
        return all.filter((i) => !isCorrect(a.items[i]));
      case 'marked':
        return all.filter((i) => a.items[i].marked);
      case 'changed':
        return all.filter((i) => new Set(a.items[i].changes.map((c) => c.to).filter(Boolean)).size > 1);
      case 'guesses':
        return all.filter((i) => a.items[i].confidence === 'guess');
      case 'slowest':
        return [...all].sort((x, y) => a.items[y].timeMs - a.items[x].timeMs).slice(0, 10).sort((x, y) => x - y);
      default:
        return all;
    }
    // items are re-read on every change so the list stays current
  }, [a, review, filter, navFilter, b?.start, b?.end]);

  const blockItems = useMemo(() => (a && b ? (review ? a.items.map((_, i) => i) : Array.from({ length: b.end - b.start }, (_, i) => b.start + i)) : []), [a?.items.length, b?.start, b?.end, review]);
  const sidebarItems = review ? order : blockItems;

  const goTo = useCallback(
    (i: number) => {
      const c = aRef.current;
      if (!c || i === c.current) return;
      commit((d) => {
        d.current = i;
      });
      areaRef.current?.scrollTo({ top: 0 });
    },
    [commit],
  );
  const step = useCallback(
    (dir: 1 | -1) => {
      const c = aRef.current;
      if (!c) return;
      const pos = order.indexOf(c.current);
      if (pos === -1) {
        const next = dir === 1 ? order.find((i) => i > c.current) : [...order].reverse().find((i) => i < c.current);
        if (next != null) goTo(next);
        else if (order.length) goTo(order[dir === 1 ? order.length - 1 : 0]);
        return;
      }
      const n = order[pos + dir];
      if (n != null) goTo(n);
    },
    [order, goTo],
  );

  // keep the current item inside the review filter
  useEffect(() => {
    if (review && a && order.length && !order.includes(a.current)) goTo(order[0]);
  }, [filter, review, order.length]);

  // ---------- grading / ending ----------
  const keyOf = useCallback(
    (it: AttemptItem) => exams.get(it.examId)?.questions.find((q) => q.id === it.qid)?.answer,
    [exams],
  );
  const finishBlock = useCallback(() => {
    const c = aRef.current;
    if (!c || c.phase !== 'block') return;
    let result: 'break' | 'done' = 'done';
    commit((d) => {
      result = endBlock(d, Date.now(), keyOf);
    });
    setModal(null);
    setNavFilter(null);
    setPanel({ labs: false, calc: false, notes: false });
    if (result === 'done') {
      void saveChain.current.then(() => createSnapshot('block completed')).then(() => {
        if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
        go(`/report/${c.id}`, true);
      });
    }
  }, [commit, keyOf]);

  // ---------- clock ----------
  useEffect(() => {
    if (!a || review) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const c = aRef.current;
      if (!c || c.phase !== 'block') {
        lastTick.current = t;
        return;
      }
      const bl = block(c);
      if (c.paused || bl.timer.runningSince == null) {
        lastTick.current = t;
        return;
      }
      const r = T.beat(bl.timer, t);
      if (r.slept) {
        commit((d) => {
          block(d).timer = r.timer;
          d.paused = true;
        });
        lastTick.current = t;
        return;
      }
      const delta = Math.min(Math.max(0, t - lastTick.current), 2500);
      lastTick.current = t;
      const rem = T.remaining(r.timer, bl.limitMs, t);
      const warn = rem != null && rem <= 5 * 60_000 && rem > 0 && !bl.warned5 && bl.limitMs! > 6 * 60_000;
      const d = cloneAttempt(c);
      block(d).timer = r.timer;
      const it = d.items[d.current];
      if (!it.locked) d.items[d.current] = { ...it, timeMs: it.timeMs + delta };
      if (warn) block(d).warned5 = true;
      aRef.current = d;
      dirty.current = true;
      // heartbeat to storage every 5 s so a crash loses at most a few seconds of clock
      if (warn || Math.floor(t / 5000) !== Math.floor((t - 1000) / 5000)) {
        setA(d);
        persist();
      }
      if (warn) setToast('5 minutes remaining in this block.');
      if (rem === 0) finishBlock();
    };
    lastTick.current = Date.now();
    const stopTicker = startTicker(tick, 1000);
    const flush = () => {
      if (dirty.current) persist();
    };
    const vis = () => (document.hidden ? flush() : tick());
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', flush);
    return () => {
      stopTicker();
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [!!a, review, commit, persist, finishBlock]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(id);
  }, [toast]);

  // keep the review position and filter in the address, so a refresh or the Back button returns here
  useEffect(() => {
    if (!review || !a) return;
    const want = `#/review/${a.id}?i=${a.current}${filter !== 'all' ? `&filter=${filter}` : ''}`;
    if (window.location.hash !== want) history.replaceState(history.state, '', want);
  }, [review, a?.current, filter]);

  // count a review visit for the missed bank
  useEffect(() => {
    if (review && cur && !isCorrect(cur)) void markReviewed(cur.qid, cur.examId);
  }, [review, cur?.qid]);

  const pauseNow = useCallback(() => {
    commit((d) => {
      if (d.phase !== 'block') return;
      block(d).timer = T.pause(block(d).timer, Date.now());
      d.paused = true;
    });
  }, [commit]);
  const resume = useCallback(() => {
    lastTick.current = Date.now();
    commit((d) => {
      block(d).timer = T.start(block(d).timer, Date.now());
      d.paused = false;
    });
  }, [commit]);
  const exitHome = useCallback(() => {
    if (!review) pauseNow();
    void saveChain.current.then(() => {
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
      go('/');
    });
  }, [review, pauseNow]);

  // ---------- item edits ----------
  const editItem = useCallback(
    (fn: (it: AttemptItem) => AttemptItem) => {
      commit((d) => {
        d.items[d.current] = fn(d.items[d.current]);
      });
    },
    [commit],
  );
  const itemLocked = !!cur?.locked;
  const canAnswer = testing && !itemLocked && !a?.paused;
  const letters = question ? choiceLetters(question) : [];
  const reveal = review || (itemLocked && a?.mode === 'tutor');

  const select = (l: string) => canAnswer && editItem((it) => selectAnswer(it, l, Date.now()));
  const strike = (l: string) => testing && !itemLocked && editItem((it) => toggleStrike(it, l));
  // review is read-only: marking only happens during the block
  const mark = () => testing && !a?.paused && editItem((it) => ({ ...it, marked: !it.marked }));
  const submitTutor = () => {
    if (!cur || !cur.answer) return;
    editItem((it) => lockItem(it, keyOf(it) ?? ''));
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key === 'Escape') {
        setPanel({ labs: false, calc: false, notes: false });
        setMenu(false);
        if (modal) setModal(null);
        (document.activeElement as HTMLElement | null)?.blur?.();
        return;
      }
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || modal || !aRef.current) return;
      const c = aRef.current;
      if (!review && (c.paused || c.phase !== 'block')) return;
      if (e.key === 'ArrowRight') return void (e.preventDefault(), step(1));
      if (e.key === 'ArrowLeft') return void (e.preventDefault(), step(-1));
      const letter = e.altKey ? (e.code.startsWith('Key') ? e.code.slice(3) : '') : e.key.length === 1 ? e.key.toUpperCase() : '';
      if (!/^[A-Z]$/.test(letter)) return;
      // a letter that is one of this question's choices selects it; otherwise it is a shortcut (Alt forces the shortcut)
      if (!e.altKey && !review && letters.includes(letter)) {
        if (canAnswer) select(letter);
        e.preventDefault();
        return;
      }
      if (letter === 'N') step(1);
      else if (letter === 'P') step(-1);
      else if (letter === 'M') mark();
      else if (letter === 'L') setPanel((p) => ({ ...p, labs: !p.labs }));
      else if (letter === 'C') setPanel((p) => ({ ...p, calc: !p.calc }));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- sizing + prefetch ----------
  const clickable = !!(exam && question && usesChoiceRegions(exam, question));
  const showExplain = reveal;
  const answerCol = clickable ? 0 : 168;
  const explainW = showExplain ? Math.max(300, Math.min(520, Math.round(areaW * 0.36))) : 0;
  // the question always fits next to the bubbles and the explanation: a larger text size uses the free width, never more
  const avail = Math.max(280, areaW - 44 - answerCol - explainW - (showExplain ? 24 : 0));
  const SIZE_CAP = { S: 820, M: 1000, L: 1180, XL: 1600 } as const;
  const qWidth = Math.round(Math.min(avail, SIZE_CAP[display.size]));

  useEffect(() => {
    if (!a || !doc || qWidth <= 0) return;
    const pos = order.indexOf(a.current);
    for (const i of [order[pos + 1], order[pos - 1]]) {
      const it = i != null ? a.items[i] : null;
      if (!it || it.examId !== doc.examId) continue;
      const ex = exams.get(it.examId);
      const q = ex?.questions.find((x) => x.id === it.qid);
      const seg = q?.segments[0];
      if (!ex || !seg) continue;
      const crop = segmentRect(ex, seg, textMap.get(seg.page));
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      void pageSize(ex.id, doc.doc, seg.page).then(() => renderPage(ex.id, doc.doc, seg.page, (qWidth / crop.w) * dpr)).catch(() => {});
    }
  }, [a?.current, doc, qWidth, order.length]);

  const toggleSidebar = () => {
    setSidebar((s) => {
      void patchSettings({ sidebarOpen: !s });
      return !s;
    });
  };

  if (missing) {
    return (
      <div className="p-6">
        <p className="mb-3">This block could not be found. It may have been deleted.</p>
        <a className="link" href="#/">Back to Home</a>
      </div>
    );
  }
  if (!a || !b) return <div className="p-6 text-sm">Loading…</div>;

  // ---------- break between blocks ----------
  if (!review && a.phase === 'break') {
    const breakMs = a.breakStartedAt ? now - a.breakStartedAt : 0;
    const limit = a.settings.breakMinutes != null ? a.settings.breakMinutes * 60_000 : null;
    return (
      <div className="flex h-full flex-col">
        <div className="bg-navy px-4 py-3 text-white">{a.name}</div>
        <div className="flex flex-1 items-center justify-center bg-white p-6">
          <div className="border-2 border-navy p-6 text-center" style={{ background: '#d6dbe8', minWidth: 320 }} data-testid="break-screen">
            <div className="mb-2 text-lg font-bold">Block {a.currentBlock + 1} of {a.blocks.length} complete</div>
            <div className="mb-1 text-sm">Break time{limit != null ? ' remaining' : ''}</div>
            <div className="mb-4 font-mono text-2xl">{T.fmtClock(limit != null ? Math.max(0, limit - breakMs) : breakMs)}</div>
            {limit != null && breakMs > limit && <div className="mb-3 text-sm text-red-700">Break time is over.</div>}
            <button className="btn-primary" data-testid="start-next-block" onClick={() => commit((d) => startNextBlock(d, Date.now()))} autoFocus>
              Start Block {a.currentBlock + 2}
            </button>
            <div className="mt-4">
              <button className="link text-sm" onClick={() => void saveChain.current.then(() => go('/'))}>Save and exit (the break clock keeps running)</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const idxInList = review ? a.current + 1 : a.current - b.start + 1;
  const listLen = review ? a.items.length : b.end - b.start;
  // with a review filter (or Review Marked/Incomplete) the counter shows the place in that shorter list
  const filtered = (review && filter !== 'all') || (!review && navFilter != null);
  const posText = filtered && order.includes(a.current) ? `${order.indexOf(a.current) + 1} / ${order.length}` : `${idxInList} / ${listLen}`;
  const pos = order.indexOf(a.current);
  const elapsedMs = T.elapsed(b.timer, now);
  const remMs = T.remaining(b.timer, b.limitMs, now);
  const answered = blockItems.filter((i) => a.items[i].answer).length;
  const markedCount = blockItems.filter((i) => a.items[i].marked).length;
  const correct = cur ? isCorrect(cur) : false;
  const changeKind = cur ? classifyChange(cur) : null;

  const copyReview = async () => {
    if (!cur) return;
    const text = [`${exam?.name ?? 'Exam'}, question ${cur.number}`, `My answer: ${cur.answer ?? '(blank)'}   Correct answer: ${cur.key ?? '?'}`, cur.reviewNote ? `\nWhat I learned:\n${cur.reviewNote}` : '', question?.explanation ? `\nExplanation:\n${question.explanation}` : ''].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const statusMark = (it: AttemptItem) => {
    if (review || (it.locked && a.mode === 'tutor')) return isCorrect(it) ? <Check size={11} /> : <Cross size={11} />;
    return it.answer ? null : <span aria-hidden="true">•</span>;
  };

  return (
    <div className="flex h-full select-none flex-col bg-white" data-testid={review ? 'review-screen' : 'test-screen'} data-mode={a.mode}>
      <div className="flex min-h-0 flex-1">
        {/* -------- Question Status strip -------- */}
        {sidebar && (
          <nav className="status-font flex w-[104px] shrink-0 flex-col border-r border-gray-400 bg-white" aria-label="Question status">
            <div className="px-1 py-1 text-center text-[13px] font-bold leading-tight">Question Status</div>
            <div className="min-h-0 flex-1 overflow-y-auto" data-testid="sidebar">
              {sidebarItems.map((i, row) => {
                const it = a.items[i];
                const active = i === a.current;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => goTo(i)}
                    data-testid={`nav-${review ? i + 1 : i - b.start + 1}`}
                    data-answered={it.answer ? '1' : '0'}
                    data-marked={it.marked ? '1' : '0'}
                    aria-current={active}
                    aria-label={`Question ${review ? i + 1 : i - b.start + 1}${it.answer ? ', answered' : ', unanswered'}${it.marked ? ', marked' : ''}`}
                    className="flex h-[20px] w-full items-center text-[15px] leading-none"
                    style={{ background: active ? '#1c4973' : row % 2 ? '#d2d2d2' : '#fff', color: active ? '#fff' : '#000' }}
                  >
                    <span className="inline-flex w-5 justify-center text-[13px]">{statusMark(it)}</span>
                    <span className="w-8 text-right">{review ? i + 1 : i - b.start + 1}</span>
                    <span className="ml-1.5 inline-flex w-4">{it.marked && <IconFlag size={12} />}</span>
                  </button>
                );
              })}
              {sidebarItems.length === 0 && <div className="p-2 text-xs">No questions match this filter.</div>}
            </div>
            <div className="border-t border-gray-300 px-1 py-1 text-[10px] leading-tight text-gray-700" data-testid="status-legend">
              {review ? (
                <>
                  <Check size={9} /> correct · <Cross size={9} /> wrong
                </>
              ) : (
                <>• unanswered</>
              )}
              <div>
                <IconFlag size={9} /> marked
              </div>
            </div>
          </nav>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* -------- top bar -------- */}
          <header className="keep-colors dark-focus relative z-30 flex h-[62px] shrink-0 items-center justify-between bg-navy px-2 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <div className="status-font shrink-0 border border-white px-2 py-0.5 text-[14px] leading-tight" data-testid="item-box">
                <div>
                  Item: <span data-testid="item-n">{idxInList}</span> of {listLen}
                </div>
                {a.blocks.length > 1 && <div>Block: {a.currentBlock + 1} of {a.blocks.length}</div>}
                {a.blocks.length === 1 && <div className="text-[11px] opacity-90">{review ? 'Review' : a.mode === 'exam' ? 'Exam mode' : a.mode === 'tutor' ? 'Tutor mode' : 'Untimed'}</div>}
              </div>
              <div className="status-font hidden min-w-0 truncate text-[14px] md:block" title={a.name}>
                {a.name}
                {IS_BETA && <span className="ml-2 bg-yellow-300 px-1 text-xs font-bold text-black">BETA</span>}
              </div>
            </div>
            <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-3">
              <ToolButton label="Previous" onClick={() => step(-1)} disabled={pos <= 0} testId="prev">
                <IconPrev />
              </ToolButton>
              <span className="status-font text-[14px]" data-testid="position">
                {posText}
              </span>
              <ToolButton label="Next" onClick={() => step(1)} disabled={pos === -1 || pos >= order.length - 1} testId="next">
                <IconNext />
              </ToolButton>
            </div>
            <div className="flex items-center">
              <ToolButton label="Lab Values" onClick={() => setPanel((p) => ({ ...p, labs: !p.labs }))} testId="btn-labs" active={panel.labs}>
                <IconLab />
              </ToolButton>
              <ToolButton label="Notes" onClick={() => setPanel((p) => ({ ...p, notes: !p.notes }))} testId="btn-notes" active={panel.notes}>
                <IconNotes />
              </ToolButton>
              <ToolButton label="Calculator" onClick={() => setPanel((p) => ({ ...p, calc: !p.calc }))} testId="btn-calc" active={panel.calc}>
                <IconCalc />
              </ToolButton>
              <ToolButton label="Settings" onClick={() => setMenu((m) => !m)} testId="btn-settings" active={menu}>
                <IconGear />
              </ToolButton>
            </div>
            {menu && (
              <div className="status-font absolute right-1 top-[60px] z-50 max-h-[calc(100vh-130px)] w-[340px] max-w-[calc(100vw-12px)] overflow-y-auto border border-gray-400 bg-white px-4 py-1 text-[14px] text-black shadow-lg" role="menu" data-testid="settings-menu">
                <DisplaySettings />
                <div className="-mx-4 border-t border-gray-200 pt-1">
                {[
                  { l: sidebar ? 'Hide Question Status' : 'Show Question Status', f: toggleSidebar },
                  { l: 'Show/Hide Strikeout', f: () => setHideStrikes((s) => !s) },
                  {
                    l: document.fullscreenElement ? 'Exit Full Screen' : 'Full Screen',
                    f: () => (document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.())?.catch?.(() => {}),
                  },
                  ...(exam && question && question.choices && question.choices.length >= 2
                    ? [
                        {
                          l: exam.alwaysBubbles ? 'Use clickable choices on the page' : 'Choices look wrong? Use bubbles',
                          f: () => {
                            const e2 = { ...exam, alwaysBubbles: !exam.alwaysBubbles };
                            setExams((m) => new Map(m).set(e2.id, e2));
                            void saveExam(e2);
                          },
                        },
                      ]
                    : []),
                  { l: 'Help: keyboard shortcuts', f: () => setModal('help') },
                  { l: review ? 'Exit review' : 'Save and exit to Home', f: exitHome },
                ].map((m) => (
                  <button key={m.l} role="menuitem" className="block w-full px-4 py-1 text-left hover:bg-gray-200" onClick={() => { setMenu(false); m.f(); }}>
                    {m.l}
                  </button>
                ))}
                </div>
              </div>
            )}
          </header>

          {/* -------- question area -------- */}
          <main ref={areaRef} className="relative min-h-0 flex-1 overflow-auto bg-white" data-testid="question-area" onClick={() => menu && setMenu(false)}>
            {a.paused && !review ? (
              <div className="flex h-full items-center justify-center p-6" data-testid="paused-screen">
                <div className="border-2 border-navy p-6 text-center" style={{ background: '#d6dbe8', minWidth: 300 }}>
                  <div className="mb-2 text-lg font-bold">{b.timer.autoPaused ? 'Block paused while you were away' : 'Block paused'}</div>
                  <div className="mb-4 text-sm">
                    {b.timer.autoPaused ? 'The computer slept or the app was closed, so the clock was stopped at that moment.' : 'The clock is stopped and the question is hidden.'}
                    {remMs != null && <div className="mt-1">Time remaining: {T.fmtClock(remMs)}</div>}
                  </div>
                  <button className="btn-primary" onClick={resume} data-testid="resume" autoFocus>
                    Resume block
                  </button>
                  <div className="mt-4">
                    <button className="link text-sm" onClick={exitHome}>Save and exit to Home</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-5 pb-10 pt-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2" style={{ maxWidth: qWidth + answerCol + explainW + 24 }}>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                    <input type="checkbox" className="h-4 w-4" checked={!!cur?.marked} onChange={mark} disabled={!testing} data-testid="mark" aria-label="Mark question" />
                    <IconFlag />
                    Mark Question
                  </label>
                  <div className="flex items-center gap-3 text-[12px]">
                    {review && (
                      <label className="flex items-center gap-1">
                        Show
                        <select className="field py-0.5 text-[12px]" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} data-testid="review-filter">
                          {FILTERS.map((f) => (
                            <option key={f.id} value={f.id}>{f.label}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    {navFilter && (
                      <span className="border border-gray-500 bg-yellow-100 px-1.5 py-0.5" data-testid="nav-filter">
                        Reviewing {navFilter} ({order.length}){' '}
                        <button className="ml-1 font-bold" onClick={() => setNavFilter(null)} aria-label="Stop filtering">×</button>
                      </span>
                    )}
                    {testing && !itemLocked && (cur?.highlights.length ?? 0) > 0 && (
                      <button className="font-bold text-gray-700" onClick={() => editItem((it) => setHighlights(it, []))} data-testid="clear-highlights">
                        🗑 Clear highlights
                      </button>
                    )}
                  </div>
                </div>

                {docError && <div className="border border-red-700 bg-red-50 p-3 text-sm">Could not open the PDF for this question: {docError}</div>}
                {!question && exams.size > 0 && cur && (
                  <div className="border border-gray-400 bg-gray-50 p-3 text-sm">
                    This question's exam is no longer in the library, so the page cannot be shown. Your answer ({cur.answer ?? 'blank'}) and the correct answer ({cur.key ?? 'unknown'}) are still saved.
                  </div>
                )}
                <div className="flex items-start gap-6">
                  <div className="shrink-0">
                    {exam && question && doc && doc.examId === exam.id && cur && (
                      <QuestionView
                        exam={exam}
                        question={question}
                        doc={doc.doc}
                        texts={textMap}
                        width={qWidth}
                        item={cur}
                        readOnly={!canAnswer}
                        revealKey={reveal ? (cur.key ?? '') : null}
                        selectableText={review}
                        hideStrikes={hideStrikes}
                        onSelect={select}
                        onStrike={strike}
                        onHighlights={testing && !itemLocked ? (h) => editItem((it) => setHighlights(it, h)) : undefined}
                      />
                    )}

                    <div className="mt-3 flex flex-wrap items-start gap-4">
                      {clickable && cur && (
                        <div className="text-[13px] text-gray-700" data-testid="answer-readout">
                          Selected: <b>{cur.answer ?? 'none'}</b>
                        </div>
                      )}
                      {exam && question && question.choices && question.choices.length >= 2 && !question.forceBubbles && (
                        <button
                          type="button"
                          className="text-[12px] text-gray-600 underline"
                          data-testid="toggle-bubbles"
                          onClick={() => {
                            const e2 = { ...exam, alwaysBubbles: !exam.alwaysBubbles };
                            setExams((m) => new Map(m).set(e2.id, e2));
                            void saveExam(e2);
                          }}
                        >
                          {exam.alwaysBubbles ? 'Click the choices on the page instead' : 'Choices look wrong? Use bubbles'}
                        </button>
                      )}
                      {testing && a.mode === 'tutor' && !itemLocked && (
                        <button className="btn-primary" disabled={!cur?.answer} onClick={submitTutor} data-testid="submit">
                          Submit
                        </button>
                      )}
                      {testing && a.mode === 'tutor' && itemLocked && pos < order.length - 1 && (
                        <button className="border border-blue-900 bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => step(1)} data-testid="proceed">
                          Proceed to Next Item
                        </button>
                      )}
                    </div>

                    {reveal && cur && (
                      <div className="mt-4 flex flex-wrap gap-8 border border-gray-300 py-2 pl-3 pr-6 text-[13px]" style={{ borderLeft: `5px solid ${correct ? '#15803d' : '#dc2626'}`, maxWidth: qWidth }} data-testid="result-strip">
                        <div>
                          <div className="text-[15px]" style={{ color: correct ? '#15803d' : '#dc2626' }} data-testid="result-word">
                            {cur.key ? (correct ? 'Correct' : cur.answer ? 'Incorrect' : 'Omitted') : 'Not graded'}
                          </div>
                          <div className="text-gray-600">Correct answer</div>
                          <div data-testid="result-key">{cur.key ?? 'No answer key'}</div>
                        </div>
                        <div>
                          <div className="text-[15px]">{cur.answer ?? '—'}</div>
                          <div className="text-gray-600">Your answer</div>
                          {changeKind && <div>Changed: {changeKind}</div>}
                        </div>
                        <div>
                          <div className="text-[15px]">{T.fmtDuration(cur.timeMs)}</div>
                          <div className="text-gray-600">Time spent</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {!clickable && cur && question && (
                    <div className="sticky top-2 shrink-0" style={{ width: answerCol - 24 }}>
                      <AnswerBox
                        letters={letters}
                        answer={cur.answer}
                        strikes={hideStrikes ? [] : cur.strikes}
                        readOnly={!canAnswer}
                        revealKey={reveal ? (cur.key ?? '') : null}
                        onSelect={select}
                        onStrike={testing && !itemLocked ? strike : undefined}
                        onCount={
                          testing && exam && !itemLocked
                            ? (dlt) => {
                                const n = Math.max(2, Math.min(26, choiceLetters(question).length + dlt));
                                const e2 = { ...exam, questions: exam.questions.map((q) => (q.id === question.id ? { ...q, choiceCount: n, choiceCountSet: true } : q)) };
                                setExams((m) => new Map(m).set(e2.id, e2));
                                void saveExam(e2);
                              }
                            : undefined
                        }
                      />
                    </div>
                  )}

                  {showExplain && cur && (
                    <aside className="shrink-0 border-l border-gray-300 pl-5 text-[14px] leading-relaxed" style={{ width: explainW, userSelect: 'text', WebkitUserSelect: 'text' }} data-testid="explanation-panel">
                      <div className="mb-2 inline-block border border-b-0 border-gray-300 px-3 py-1 text-[16px]">Explanation</div>
                      <div className="mb-3 text-[14px]">Correct Answer: {cur.key ? `${cur.key}.` : '(none in the answer key)'}</div>
                      {question?.explanation ? (
                        <HighlightableText
                          text={question.explanation}
                          highlights={cur.explHighlights ?? []}
                          color={display.highlightColor}
                          testId="explanation-text"
                          onChange={review || itemLocked ? (h) => editItem((it) => ({ ...it, explHighlights: h })) : undefined}
                        />
                      ) : (
                        <p className="mb-3 text-gray-600">No explanation was found in the answer key for this question.</p>
                      )}
                      {cur.note && (
                        <div className="mb-3 border border-gray-300 bg-gray-50 p-2">
                          <div className="text-xs font-bold">Notes written during the test</div>
                          <div className="whitespace-pre-wrap">{cur.note}</div>
                        </div>
                      )}
                      {review && (
                        <>
                          {cur.key && !correct && (
                            <div className="mb-3" data-testid="miss-reasons">
                              <div className="mb-1 text-xs font-bold">Reason for miss</div>
                              <div className="flex flex-wrap gap-1">
                                {MISS_REASONS.map((r) => (
                                  <button key={r.id} className="border border-gray-500 px-2 py-0.5 text-[12px]" style={{ background: cur.missReason === r.id ? '#1c4973' : '#f3f3f3', color: cur.missReason === r.id ? '#fff' : '#000' }} aria-pressed={cur.missReason === r.id} data-testid={`reason-${r.id}`} onClick={() => editItem((it) => ({ ...it, missReason: it.missReason === r.id ? null : (r.id as MissReason) }))}>
                                    {r.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="mb-1 text-xs font-bold">Review note (what I learned)</div>
                          <textarea className="field mb-2 h-24 w-full" value={cur.reviewNote} onChange={(e) => editItem((it) => ({ ...it, reviewNote: e.target.value }))} data-testid="review-note" aria-label="Review note" />
                          <button className="btn" onClick={copyReview} data-testid="copy-review">
                            {copied ? 'Copied' : 'Copy review note + explanation'}
                          </button>
                        </>
                      )}
                    </aside>
                  )}
                </div>
              </div>
            )}
            {toast && (
              <div className="fixed left-1/2 top-[70px] z-50 -translate-x-1/2 border-2 border-yellow-600 bg-yellow-100 px-4 py-2 text-sm font-bold" role="alert" data-testid="toast">
                {toast}{' '}
                <button className="ml-2" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
              </div>
            )}
          </main>

          {/* -------- bottom bar -------- */}
          <footer className="keep-colors dark-focus relative flex h-[58px] shrink-0 items-center justify-between bg-navy px-2 text-white">
            {review ? (
              <div className="status-font border border-white px-2 py-1 text-[13px]">
                Review · {a.items.filter(isCorrect).length} of {a.items.length} correct
              </div>
            ) : (
              <button type="button" className="status-font border border-white px-2 py-1 text-left text-[13px]" onClick={() => setModal('timer')} title="Timer and mode: switch Timed / Tutor, add time" data-testid="timer">
                {remMs != null && !showElapsed ? (
                  <>
                    Block Time Remaining <span data-testid="timer-value" style={{ color: remMs <= 5 * 60_000 ? '#ffd24a' : undefined }}>{T.fmtClock(remMs)}</span>
                  </>
                ) : (
                  <>
                    Block Time Elapsed <span data-testid="timer-value">{T.fmtClock(elapsedMs)}</span>
                  </>
                )}
              </button>
            )}
            {!review && (
              <div className="absolute left-1/2 -translate-x-1/2">
                <ToolButton label={a.paused ? 'Resume' : 'Pause'} onClick={a.paused ? resume : pauseNow} testId="pause">
                  <IconPause />
                </ToolButton>
              </div>
            )}
            <div className="flex items-center gap-1">
              {review ? (
                <>
                  <ToolButton label="Score Report" onClick={() => go(`/report/${a.id}`)} testId="to-report">
                    <IconCheckCircle />
                  </ToolButton>
                  <ToolButton label="Exit Review" onClick={exitHome} testId="exit-review">
                    <IconExit />
                  </ToolButton>
                </>
              ) : (
                <>
                  <ToolButton label="Review" onClick={() => { setPanel({ labs: false, calc: false, notes: false }); setModal('grid'); }} testId="btn-review" disabled={a.paused}>
                    <IconGrid />
                  </ToolButton>
                  <ToolButton label="End Block" onClick={() => { setPanel({ labs: false, calc: false, notes: false }); setModal('end'); }} testId="end-block" disabled={a.paused}>
                    <IconEnd />
                  </ToolButton>
                </>
              )}
            </div>
          </footer>
        </div>
      </div>

      {panel.labs && <LabValues onClose={() => setPanel((p) => ({ ...p, labs: false }))} />}
      {panel.calc && <Calculator onClose={() => setPanel((p) => ({ ...p, calc: false }))} />}
      {panel.notes && cur && <NotesPanel key={cur.qid} value={cur.note} readOnly={review || itemLocked} onChange={(v) => editItem((it) => ({ ...it, note: v }))} onClose={() => setPanel((p) => ({ ...p, notes: false }))} />}

      {(modal === 'grid' || modal === 'end') && (
        <Modal title={modal === 'end' ? 'End Block' : 'Review'} onClose={() => setModal(null)} wide>
          <div className="mb-2 flex flex-wrap gap-4 text-sm" data-testid="grid-summary">
            <span>Answered: <b>{answered}</b></span>
            <span>Unanswered: <b>{blockItems.length - answered}</b></span>
            <span>Marked: <b>{markedCount}</b></span>
          </div>
          <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }} data-testid="review-grid">
            {blockItems.map((i) => {
              const it = a.items[i];
              return (
                <button key={i} className="flex items-center justify-between border border-gray-500 px-1.5 py-1 text-sm" style={{ background: it.answer ? '#e6efe6' : '#fff' }} onClick={() => { setModal(null); setNavFilter(null); goTo(i); }} title={`${it.answer ? 'Answered' : 'Unanswered'}${it.marked ? ', marked' : ''}`}>
                  <span>{i - b.start + 1}</span>
                  <span className="flex items-center gap-0.5">
                    {it.marked && <IconFlag size={12} />}
                    <span className="font-bold">{it.answer ?? '–'}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <button className="btn" disabled={!markedCount} data-testid="review-marked" onClick={() => { const f = blockItems.find((i) => a.items[i].marked); setNavFilter('marked'); setModal(null); if (f != null) goTo(f); }}>
                Review Marked
              </button>
              <button className="btn" disabled={answered === blockItems.length} data-testid="review-incomplete" onClick={() => { const f = blockItems.find((i) => !a.items[i].answer); setNavFilter('incomplete'); setModal(null); if (f != null) goTo(f); }}>
                Review Incomplete
              </button>
            </div>
            <div className="flex gap-2">
              <button className="btn" onClick={() => setModal(null)}>Return to Block</button>
              <button className={modal === 'end' ? 'btn-primary' : 'btn'} onClick={() => setModal('confirm')} data-testid="grid-end">End Block</button>
            </div>
          </div>
        </Modal>
      )}
      {modal === 'confirm' && (
        <Modal title="End this block?" onClose={() => setModal(null)}>
          <p className="mb-3">
            {blockItems.length - answered > 0 ? `${blockItems.length - answered} question${blockItems.length - answered === 1 ? ' is' : 's are'} unanswered. ` : ''}
            You will not be able to return to these questions{a.currentBlock < a.blocks.length - 1 ? ' after the block ends' : ''}.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn-primary" onClick={finishBlock} data-testid="confirm-end" autoFocus>
              End Block
            </button>
          </div>
        </Modal>
      )}
      {modal === 'timer' && (
        <Modal title="Timer and mode" onClose={() => setModal(null)}>
          <div className="space-y-4 text-sm" data-testid="timer-popup">
            <div>
              <div className="mb-1 font-bold">Mode for this block</div>
              {(
                [
                  ['exam', 'Timed', 'Answers and explanations stay hidden until the block ends.'],
                  ['tutor', 'Tutor', 'Submit each answer to see if it is right and read the explanation, then “Proceed to Next Item”.'],
                  ['untimed', 'Untimed', 'Like Timed, without a countdown.'],
                ] as const
              ).map(([m, label, help]) => (
                <label key={m} className="mb-1 flex items-start gap-2">
                  <input
                    type="radio"
                    name="mode"
                    checked={a.mode === m}
                    data-testid={`timer-mode-${m}`}
                    onChange={() =>
                      commit((d) => {
                        d.mode = m;
                        const bl = block(d);
                        // timed needs a limit: give the time used so far plus the usual time for the questions left
                        if (m === 'exam' && bl.limitMs == null) {
                          const left = d.items.slice(bl.start, bl.end).filter((it) => !it.locked && !it.answer).length;
                          bl.limitMs = T.elapsed(bl.timer, Date.now()) + Math.max(1, left) * (d.settings.secPerQ ?? 90) * 1000;
                        }
                        if (m !== 'exam') bl.limitMs = null;
                      })
                    }
                  />
                  <span>
                    <b>{label}</b>
                    <span className="block text-xs text-gray-600">{help}</span>
                  </span>
                </label>
              ))}
            </div>
            {a.mode === 'exam' && b.limitMs != null && (
              <div>
                <div className="mb-1 font-bold">Add time</div>
                <div className="flex flex-wrap gap-2">
                  {[5, 10, 15, 30].map((m) => (
                    <button key={m} className="btn" data-testid={`add-time-${m}`} onClick={() => commit((d) => void (block(d).limitMs = (block(d).limitMs ?? 0) + m * 60_000))}>
                      +{m} min
                    </button>
                  ))}
                </div>
                <div className="mt-1 text-xs text-gray-600" data-testid="timer-popup-remaining">Time remaining: {T.fmtClock(remMs ?? 0)}</div>
              </div>
            )}
            <div>
              <div className="mb-1 font-bold">Show</div>
              <label className="mr-4">
                <input type="radio" name="show" checked={!showElapsed} onChange={() => setShowElapsed(false)} disabled={remMs == null} /> Time remaining
              </label>
              <label>
                <input type="radio" name="show" checked={showElapsed || remMs == null} onChange={() => setShowElapsed(true)} /> Time elapsed
              </label>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary" onClick={() => setModal(null)} data-testid="timer-done">Done</button>
            </div>
          </div>
        </Modal>
      )}
      {modal === 'help' && (
        <Modal title="Keyboard shortcuts" onClose={() => setModal(null)}>
          <table className="w-full text-sm">
            <tbody>
              {[
                ['A – Z', 'Select that answer choice'],
                ['→ or N', 'Next question'],
                ['← or P', 'Previous question'],
                ['M', 'Mark / unmark the question'],
                ['L', 'Lab values'],
                ['C', 'Calculator'],
                ['Esc', 'Close panels and menus'],
                ['Right-click (long-press on iPad)', 'Strike out a choice'],
                ['Drag across text', 'Highlight; click a highlight to remove it'],
                ['Click a picture (or Zoom)', 'Pop the image out; − / + to zoom'],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td className="td whitespace-nowrap font-bold">{k}</td>
                  <td className="td">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-700">Letters pick answer choices first: on a question with choices A–E, pressing C picks choice C. To use a shortcut whose letter is also a choice, hold Alt (Option on a Mac): Alt+C opens the Calculator. You can always click the buttons instead.</p>
        </Modal>
      )}
    </div>
  );
}
