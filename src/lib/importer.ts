import { SCHEMA_VERSION } from '../config';
import { uid } from '../db';
import type { Exam, Question, Word } from '../types';
import { explanationAfterChoices, parseKeyLines, parseKeyText, resolveAnswerText, type KeyEntry, type ParsedKey } from './keyParser';
import { hasRealText, pageWords, type PdfDoc } from './pdf';
import { pagesToKeyLines } from './textLines';

export interface LayoutOptions {
  pagesPerQuestion: number;
  /** first page that holds a question (1-based) */
  startPage: number;
  /** last page that holds a question (inclusive) */
  endPage: number;
  skip: number[];
}

/** "3, 7-9" → [3,7,8,9] */
export function parsePageList(s: string, max = 100000): number[] {
  const out = new Set<number>();
  for (const part of s.split(/[,;\s]+/)) {
    const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(part.trim());
    if (!m) continue;
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b) && i <= max; i++) if (i >= 1) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

export function formatPageList(pages: number[]): string {
  const s = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    parts.push(j > i ? `${s[i]}-${s[j]}` : `${s[i]}`);
    i = j;
  }
  return parts.join(', ');
}

/** Fixed layout: N pages per question, with a start offset and skipped pages. */
export function fixedLayout(examId: string, o: LayoutOptions): Question[] {
  const skip = new Set(o.skip);
  const pages: number[] = [];
  for (let p = Math.max(1, o.startPage); p <= o.endPage; p++) if (!skip.has(p)) pages.push(p);
  const per = Math.max(1, Math.floor(o.pagesPerQuestion));
  const out: Question[] = [];
  for (let i = 0; i < pages.length; i += per) {
    const n = out.length + 1;
    out.push(blankQuestion(examId, n, pages.slice(i, i + per)));
  }
  return out;
}

export function blankQuestion(examId: string, n: number, pages: number[]): Question {
  return { id: `${examId}:q${n}:${uid('').slice(-5)}`, number: n, segments: pages.map((page) => ({ page })), answer: '', explanation: '', tags: [], choiceCount: 5 };
}

export function newExam(name: string, subject: string, pageCount: number): Exam {
  const now = Date.now();
  return { id: uid('e'), schema: SCHEMA_VERSION, name, subject, createdAt: now, updatedAt: now, pageCount, questions: [], crop: null, autoCrop: true, keyChecked: false, textStatus: 'none' };
}

/** Apply parsed key entries to questions by number. Choice count defaults to the key's highest letter (min 5). */
export function applyKey(questions: Question[], key: ParsedKey, keepExisting = false): Question[] {
  const byN = new Map<number, KeyEntry>(key.entries.map((e) => [e.n, e]));
  // a key numbered 51–100 for a 50-question PDF lines up with questions 1–50; a key that merely lacks entry 1
  // must NOT be shifted
  const nums = key.entries.map((e) => e.n);
  const offset = nums.length && Math.min(...nums) > questions.length ? Math.min(...nums) - 1 : 0;
  let maxLetter = 4;
  for (const e of key.entries) if (e.answer) maxLetter = Math.max(maxLetter, e.answer.charCodeAt(0) - 65);
  const count = Math.min(26, maxLetter + 1);
  return questions.map((q) => {
    const e = byN.get(q.number + offset);
    // detected choices decide the count; the key's highest letter is only the default when none were found
    const out: Question = { ...q, choiceCount: q.choices?.length ? q.choices.length : count };
    if (!e) return out;
    if (!(keepExisting && q.answer)) out.answer = e.answer;
    if (!(keepExisting && q.explanation)) out.explanation = e.explanation;
    out.keyConfidence = e.conf;
    if (out.answer && out.answer.charCodeAt(0) - 65 >= out.choiceCount) out.choiceCount = out.answer.charCodeAt(0) - 64;
    // the explanation repeats the full choice list: trust its length when fewer choices were read on the page
    if (e.choices && e.choices > out.choiceCount) out.choiceCount = e.choices;
    if (!out.answer && e.answerText) {
      const letter = q.choiceTexts?.length ? resolveAnswerText(e.answerText, q.choiceTexts) : '';
      if (letter) {
        out.answer = letter;
        out.keyConfidence = Math.min(e.conf, 0.7);
      } else out.answerText = e.answerText;
    }
    return out;
  });
}

export type WordsProvider = (doc: PdfDoc, page: number) => Promise<{ words: Word[]; source: 'pdf' | 'ocr' | 'none' }>;

/** Stage A provider: the PDF's own text only. */
export const pdfTextProvider: WordsProvider = async (doc, page) => {
  const words = await pageWords(await doc.getPage(page));
  return hasRealText(words) ? { words, source: 'pdf' } : { words: [], source: 'none' };
};

export interface KeyReadResult {
  key: ParsedKey;
  pagesWithText: number;
  pagesTotal: number;
}

/** Read an answer key out of PDF pages (rebuilding lines by position). */
export async function readKeyFromPdf(doc: PdfDoc, fromPage: number, toPage: number, provider: WordsProvider, onProgress?: (done: number, total: number) => void, highlight?: HighlightReader): Promise<KeyReadResult> {
  const total = toPage - fromPage + 1;
  let done = 0;
  // pages are read in parallel (OCR runs through a small worker pool) and put back in order
  const pages = await Promise.all(
    Array.from({ length: total }, async (_, i) => {
      const p = fromPage + i;
      const r = await provider(doc, p).catch(() => ({ words: [] as Word[], source: 'none' as const }));
      onProgress?.(++done, total);
      return { page: p, words: r.words };
    }),
  );
  const withText = pages.filter((p) => p.words.length).length;
  const key = parseKeyLines(pagesToKeyLines(pages));
  // entries with no answer letter: the key may mark the answer by highlighting the choice
  if (highlight) {
    const byPage = new Map(pages.map((p) => [p.page, p.words]));
    for (const e of key.entries) {
      if (e.answer || e.page == null) continue;
      const words = byPage.get(e.page);
      if (!words?.length) continue;
      const letter = await highlight(doc, e.page, words).catch(() => null);
      if (letter) {
        e.answer = letter;
        e.conf = Math.min(e.conf, 0.85);
        if (e.raw) e.explanation = explanationAfterChoices(e.raw);
        delete e.answerText;
      }
    }
  }
  return { key, pagesWithText: withText, pagesTotal: total };
}

/** Finds a highlighted answer choice on a key page (browser: renders the page). */
export type HighlightReader = (doc: PdfDoc, page: number, words: Word[]) => Promise<string | null>;

export function readKeyFromText(text: string): ParsedKey {
  return parseKeyText(text);
}

export interface KeyWarning {
  n: number;
  kind: 'missing' | 'beyond' | 'lowconf';
  text: string;
}

export function keyWarnings(questions: Question[]): KeyWarning[] {
  const out: KeyWarning[] = [];
  for (const q of questions) {
    if (!q.answer) out.push({ n: q.number, kind: 'missing', text: q.answerText ? `Key says “${q.answerText.slice(0, 40)}”: pick the letter` : 'No answer' });
    else if (q.answer.charCodeAt(0) - 65 >= q.choiceCount) out.push({ n: q.number, kind: 'beyond', text: `Answer ${q.answer} is beyond the ${q.choiceCount} choices` });
    else if (q.keyConfidence != null && q.keyConfidence < 0.6) out.push({ n: q.number, kind: 'lowconf', text: 'Low text-recognition confidence: please check' });
  }
  return out;
}
