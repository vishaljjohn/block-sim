/**
 * Stage D: page text (PDF text layer or OCR), auto-crop, question layout and choice detection.
 * Results are cached per page in IndexedDB (and the data folder), so each PDF is processed once.
 * Nothing here ever blocks starting an exam: background work updates the exam as pages finish.
 */
import { db } from '../db';
import type { Exam, PageText, Question, Rect, Word } from '../types';
import type { ParsedKey } from './keyParser';
import { resolveAnswerText } from './keyParser';
import { blankQuestion, fixedLayout, type HighlightReader, type WordsProvider } from './importer';
import { examPdf, hasRealText, pageHasImage, pageWords, renderToCanvas, type PdfDoc } from './pdf';
import { mergeWords } from './pdfWords';
import { detectCrop, highlightedChoice } from './crop';
import { detectChoices, detectLayout, linesForSegment, pageLines, readingOrder, type PageLines } from './detect';
import { ocrCanvas } from './ocr';
import { saveExam, savePageTexts } from './store';
import { logError } from './errorLog';
import { segmentRect } from './layout';

export interface AnalyzeOptions {
  auto: boolean;
  inlineAnswers: boolean;
  startPage: number;
  endPage: number;
  skip: number[];
  /** set by the import screen's "Skip" button: stop waiting for OCR and use what is ready */
  cancel?: { cancelled: boolean };
  /** number of answers in the key, when known: a strong hint for how many questions there are */
  expectedCount?: number;
}
export interface AnalyzeResult {
  questions: Question[];
  examPatch: Partial<Exam>;
  inlineKey: ParsedKey | null;
}

/** OCR target: ~300 DPI for paper-sized pages, capped for big screenshots. */
function ocrWidth(pageW: number): number {
  const dpi300 = (pageW / 72) * 300;
  return Math.round(Math.max(1700, Math.min(3000, dpi300)));
}

/** Small render used for crop detection. */
async function cropPixels(doc: PdfDoc, page: number): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const pg = await doc.getPage(page);
  const c = await renderToCanvas(pg, 600);
  const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  return { data: img.data, width: c.width, height: c.height };
}

/** At most a few pages are rendered/recognized at once: big scanned PDFs must not render every page in parallel. */
let active = 0;
const waiters: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 4) await new Promise<void>((r) => waiters.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

/** Read one page: real PDF text when present, otherwise OCR. Includes auto-crop. */
export function processPage(examId: string | null, doc: PdfDoc, page: number, allowOcr: boolean | (() => boolean) = true): Promise<PageText | null> {
  // decided when the page's turn comes, so "Skip waiting" also stops pages that were already queued
  return slot(() => processPageNow(examId, doc, page, typeof allowOcr === 'function' ? allowOcr() : allowOcr));
}

async function processPageNow(examId: string | null, doc: PdfDoc, page: number, allowOcr: boolean): Promise<PageText | null> {
  const pg = await doc.getPage(page);
  let words: Word[] = await pageWords(pg);
  let source: PageText['source'] = 'pdf';
  let conf = 100;
  const real = hasRealText(words);
  // little typed text plus a picture: the question is probably in the picture, so read it too
  const mixed = real && words.length < 40 && (await pageHasImage(pg));
  if (!real || mixed) {
    if (!allowOcr) return real ? finish(examId, doc, page, words, 'pdf', 100) : null;
    const v = pg.getViewport({ scale: 1 });
    const canvas = await renderToCanvas(pg, ocrWidth(v.width));
    const keep = (ws: Word[]) => ws.filter((w) => w.c >= 35 || (w.t.length > 1 && w.c >= 20));
    let r = await ocrCanvas(canvas);
    let ocrWords = keep(r.words);
    // no answer choices found: page segmentation may have merged the rows of a choice box; try reading the page
    // as one column instead, and keep that version if it finds the choices
    const choicesIn = (ws: Word[]) => {
      const ordered = readingOrder(ws);
      return detectChoices(pageLines(page, ordered).lines, page, null, ordered).choices.length;
    };
    if (choicesIn(ocrWords) < 2 && ocrWords.length > 15) {
      const r2 = await ocrCanvas(canvas, 'column');
      const w2 = keep(r2.words);
      if (choicesIn(w2) >= 2) {
        r = r2;
        ocrWords = w2;
      }
    }
    canvas.width = canvas.height = 1; // free memory now
    words = real ? mergeWords(words, ocrWords) : ocrWords;
    source = 'ocr';
    conf = r.conf;
  }
  return finish(examId, doc, page, words, source, conf);
}

async function finish(examId: string | null, doc: PdfDoc, page: number, input: Word[], source: PageText['source'], conf: number): Promise<PageText> {
  let words = input;
  words = readingOrder(words);
  let autoCrop: Rect | null = null;
  if (examId) {
    try {
      autoCrop = detectCrop(await cropPixels(doc, page), words);
    } catch (e) {
      logError('crop', e);
    }
  }
  return { id: `${examId ?? 'tmp'}:${page}`, examId: examId ?? 'tmp', page, source, words, autoCrop, conf };
}

/** Key pages that mark the answer with a highlight: find the choices, then the one with color behind it. */
export const highlightReader: HighlightReader = async (doc, page, words) => {
  const pl = pageLines(page, words);
  const d = detectChoices(pl.lines, page, null, words);
  if (d.choices.length < 2) return null;
  const pg = await doc.getPage(page);
  const c = await renderToCanvas(pg, 900);
  const img = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
  // the highlighted line can be the one whose label was not read: also test the slot after the last choice
  const tops = d.choices.map((x) => x.y);
  const step = tops.length > 1 ? (tops[tops.length - 1] - tops[0]) / (tops.length - 1) : 0.03;
  const last = d.choices[d.choices.length - 1];
  const extra = { letter: String.fromCharCode(last.letter.charCodeAt(0) + 1), x: last.x, y: last.y + step, w: Math.max(...d.choices.map((x) => x.w)), h: Math.min(last.h, step) };
  const out = highlightedChoice({ data: img.data, width: c.width, height: c.height }, [...d.choices, extra]);
  c.width = c.height = 1;
  return out;
};

/** Words provider for reading answer keys: PDF text, else OCR (key PDFs are not cached). */
export function wordsProvider(examId: string | null): WordsProvider {
  return async (doc, page) => {
    if (examId) {
      const cached = await db.pages.get(`${examId}:${page}`);
      if (cached) return { words: cached.words, source: cached.source };
    }
    const pt = await processPage(examId, doc, page);
    if (!pt) return { words: [], source: 'none' };
    if (examId) await savePageTexts(examId, [pt]);
    return { words: pt.words, source: pt.source };
  };
}

function toPageLines(pt: PageText): PageLines {
  return pageLines(pt.page, pt.words, pt.autoCrop);
}

/** Run at import: read every question page (OCR if needed, cached), work out the layout, detect choices. */
export async function analyzeExam(exam: Exam, doc: PdfDoc, opts: AnalyzeOptions, onProgress?: (done: number, total: number, ocr: boolean) => void): Promise<AnalyzeResult> {
  const skip = new Set(opts.skip);
  const pages: number[] = [];
  for (let p = Math.max(1, opts.startPage); p <= opts.endPage; p++) if (!skip.has(p)) pages.push(p);
  const texts = new Map<number, PageText>();
  let done = 0;
  let anyOcr = false;
  // text pages are instant; OCR pages run in parallel through the worker pool
  const jobs = pages.map(async (p) => {
    if (opts.cancel?.cancelled) return;
    const cached = await db.pages.get(`${exam.id}:${p}`);
    const pt = cached ?? (await processPage(exam.id, doc, p, () => !opts.cancel?.cancelled).catch((e) => (logError('page ' + p, e), null)));
    if (pt) {
      if (pt.source === 'ocr') anyOcr = true;
      texts.set(p, pt);
      if (!cached) await savePageTexts(exam.id, [pt]);
    }
    done++;
    onProgress?.(done, pages.length, anyOcr);
  });
  await Promise.all(jobs);

  let questions = exam.questions;
  let inlineKey: ParsedKey | null = null;
  const pls = pages.map((p) => texts.get(p)).filter((t): t is PageText => !!t).map(toPageLines);
  if (opts.auto || opts.inlineAnswers) {
    const lay = detectLayout(pls, { inlineAnswers: opts.inlineAnswers });
    let enough = lay.questions.length >= 2 && (lay.multiPerPage || lay.confidence >= 0.3 || lay.questions.length >= pages.length * 0.3);
    // the key says how many questions there are: when whole pages divide evenly into that many questions and
    // the page text disagrees, trust the page count (screenshots without readable question numbers)
    const n = opts.expectedCount ?? 0;
    if (opts.auto && n >= 2 && lay.questions.length !== n && !lay.multiPerPage) {
      // compare with "k whole pages per question": use it when its count is closer to the key's count
      const per = Math.max(1, Math.round(pages.length / n));
      const fixedCount = Math.ceil(pages.length / per);
      // questions longer than 4 pages are not plausible: then the count does not describe this PDF
      if (per <= 4 && Math.abs(fixedCount - n) < Math.abs(lay.questions.length - n)) {
        questions = fixedLayout(exam.id, { pagesPerQuestion: per, startPage: opts.startPage, endPage: opts.endPage, skip: opts.skip });
        enough = false;
      }
    }
    if (opts.auto && enough) {
      questions = lay.questions.map((d, i) => {
        const q = blankQuestion(exam.id, i + 1, []);
        q.segments = d.segments.map((s) => ({ page: s.page, ...(s.rect ? { rect: s.rect } : {}) }));
        return q;
      });
    }
    if (opts.inlineAnswers) {
      const entries = lay.questions.filter((d) => d.inlineAnswer).map((d, i) => ({ n: opts.auto && enough ? i + 1 : d.number, answer: d.inlineAnswer!, explanation: d.inlineExplanation ?? '', conf: 1 }));
      inlineKey = { entries, tags: {}, format: 'answer-lines' };
      // the fixed layout must still hide the answers: cut each page above its "Answer:" line
      if (!(opts.auto && enough)) {
        const byNum = new Map(lay.questions.map((d) => [d.number, d]));
        questions = questions.map((q) => {
          const d = byNum.get(q.number);
          if (!d) return q;
          const keep = d.segments.filter((s) => q.segments.some((x) => x.page === s.page));
          return keep.length ? { ...q, segments: keep.map((s) => ({ page: s.page, ...(s.rect ? { rect: s.rect } : {}) })) } : q;
        });
      }
    }
  }
  if (!questions.length) questions = fixedLayout(exam.id, { pagesPerQuestion: 1, startPage: opts.startPage, endPage: opts.endPage, skip: opts.skip });
  questions = applyChoices({ ...exam, questions }, texts);
  const allDone = pages.every((p) => texts.has(p));
  return { questions, examPatch: { textStatus: allDone ? 'done' : 'partial' }, inlineKey };
}

/** Detect clickable choices for every question whose pages have text (manual corrections are kept). */
export function applyChoices(exam: Exam, texts: Map<number, PageText>): Question[] {
  return exam.questions.map((q) => {
    if (q.choiceSource === 'manual') return q;
    const found = choicesFor(exam, q, texts);
    if (!found) return q;
    const out: Question = { ...q };
    if (found.choices.length >= 2 && found.confidence >= 0.6) {
      out.choices = found.choices;
      out.choiceSource = 'auto';
      out.choiceCount = Math.max(q.choiceCount, found.choices.length);
      // the key's answer is beyond the detected choices: something was missed, so use bubbles
      if (q.answer && q.answer.charCodeAt(0) - 65 >= found.choices.length) {
        out.choices = undefined;
        out.choiceSource = undefined;
      }
    } else {
      out.choices = undefined;
      out.choiceSource = undefined;
    }
    if (!out.answer && q.answerText && found.texts.length) {
      out.answer = resolveAnswerText(q.answerText, found.texts);
      if (out.answer) {
        out.keyConfidence = 0.7;
        delete out.answerText;
      }
    }
    if (found.texts.length) out.choiceTexts = found.texts;
    return out;
  });
}

function choicesFor(exam: Exam, q: Question, texts: Map<number, PageText>) {
  // choices are normally on the last page of the question; look from the end
  for (let i = q.segments.length - 1; i >= 0; i--) {
    const seg = q.segments[i];
    const pt = texts.get(seg.page);
    if (!pt) return null;
    const pl = toPageLines(pt);
    const region = segmentRect(exam, seg, pt);
    const lines = linesForSegment(pl, region);
    const d = detectChoices(lines, seg.page, region, pl.words);
    if (d.choices.length >= 2) return d;
  }
  return { choices: [], texts: [], confidence: 0 };
}

// ------------------------------------------------------------------ background processing
let running = false;
const queue: string[] = [];

/** Make sure every page of an exam has text (OCR in the background) and refresh choices as pages finish. */
export function resumeBackgroundText(examId?: string): void {
  if (examId && !queue.includes(examId)) queue.push(examId);
  if (running) return;
  running = true;
  void (async () => {
    try {
      if (!examId && !queue.length) {
        for (const e of await db.exams.toArray()) if (e.textStatus !== 'done' && !queue.includes(e.id)) queue.push(e.id);
      }
      while (queue.length) {
        const id = queue.shift()!;
        await processExamText(id).catch((e) => logError('background text ' + id, e));
      }
    } finally {
      running = false;
    }
  })();
}

async function processExamText(examId: string) {
  let exam = await db.exams.get(examId);
  if (!exam || exam.textStatus === 'done') return;
  const doc = await examPdf(examId);
  const pages = [...new Set(exam.questions.flatMap((q) => q.segments.map((s) => s.page)))].sort((a, b) => a - b);
  const have = new Set((await db.pages.where('examId').equals(examId).toArray()).map((p) => p.page));
  const todo = pages.filter((p) => !have.has(p));
  let lastSave = Date.now();
  const refresh = async () => {
    exam = await db.exams.get(examId);
    if (!exam) return;
    const texts = new Map((await db.pages.where('examId').equals(examId).toArray()).map((p) => [p.page, p]));
    const questions = applyChoices(exam, texts);
    const done = pages.every((p) => texts.has(p));
    if (JSON.stringify(questions) !== JSON.stringify(exam.questions) || done !== (exam.textStatus === 'done')) {
      await saveExam({ ...exam, questions, textStatus: done ? 'done' : 'partial' });
    }
  };
  await Promise.all(
    todo.map(async (p) => {
      if (!(await db.exams.get(examId))) return;
      const pt = await processPage(examId, doc, p).catch((e) => (logError('ocr page ' + p, e), null));
      if (pt) await savePageTexts(examId, [pt]);
      if (Date.now() - lastSave > 4000) {
        lastSave = Date.now();
        await refresh();
      }
    }),
  );
  await refresh();
}

/** Re-run choice detection for one exam (after a crop or layout change). */
export async function redetectChoices(exam: Exam): Promise<Exam> {
  const texts = new Map((await db.pages.where('examId').equals(exam.id).toArray()).map((p) => [p.page, p]));
  return { ...exam, questions: applyChoices(exam, texts) };
}

/** Re-run the automatic layout from cached page text (the "adjust splits" screen's reset button). */
export async function redetectLayout(exam: Exam, inlineAnswers = false): Promise<Question[] | null> {
  const texts = (await db.pages.where('examId').equals(exam.id).toArray()).sort((a, b) => a.page - b.page);
  const lay = detectLayout(texts.map(toPageLines), { inlineAnswers });
  if (lay.questions.length < 2) return null;
  const old = new Map(exam.questions.map((q) => [q.number, q]));
  const qs = lay.questions.map((d, i) => {
    const prev = old.get(i + 1);
    const q = prev ? { ...prev, choices: prev.choiceSource === 'manual' ? prev.choices : undefined, choiceSource: prev.choiceSource === 'manual' ? prev.choiceSource : undefined } : blankQuestion(exam.id, i + 1, []);
    q.segments = d.segments.map((s) => ({ page: s.page, ...(s.rect ? { rect: s.rect } : {}) }));
    return q;
  });
  return applyChoices({ ...exam, questions: qs }, new Map(texts.map((t) => [t.page, t])));
}
