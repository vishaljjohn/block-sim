/**
 * The whole import of one exam (question PDF + answer source) as a function, used by the single-exam import screen
 * and by "Import a folder".
 */
import type { Exam } from '../types';
import { applyKey, fixedLayout, keyWarnings, newExam, readKeyFromPdf, readKeyFromText } from './importer';
import { analyzeExam, highlightReader, resumeBackgroundText, wordsProvider } from './analyze';
import { closePdf, openPdf } from './pdf';
import { saveExam, savePdf } from './store';
import type { ParsedKey } from './keyParser';

export type KeySource = 'pdf' | 'same' | 'inline' | 'paste' | 'none';

export interface ImportOptions {
  question: ArrayBuffer;
  name: string;
  category: string;
  layout: 'auto' | 'fixed';
  perQuestion?: number;
  startPage?: number;
  skip?: number[];
  keySource: KeySource;
  keyPdf?: ArrayBuffer;
  keyStartPage?: number;
  keyText?: string;
  sourcePath?: string;
  sourceName?: string;
  keySourceName?: string;
  cancel?: { cancelled: boolean };
  /** mark the key as checked when nothing needs a look (folder import) */
  autoConfirm?: boolean;
}

export interface ImportResult {
  exam: Exam;
  keyFound: number | null;
  note: string;
}

export async function importExam(o: ImportOptions, status: (msg: string, ocr?: boolean) => void): Promise<ImportResult> {
  status('Opening the PDF…');
  const doc = await openPdf(o.question);
  try {
    const pageCount = doc.numPages;
    const keyStartN = o.keySource === 'same' ? (o.keyStartPage ?? 0) : 0;
    const endPage = keyStartN > 1 ? keyStartN - 1 : pageCount;
    const startPage = Math.max(1, o.startPage ?? 1);
    const skip = o.skip ?? [];
    const exam: Exam = newExam(o.name, o.category, pageCount);
    if (o.sourcePath) exam.sourcePath = o.sourcePath;
    if (o.sourceName) exam.sourceName = o.sourceName;
    if (o.keySourceName) exam.keySourceName = o.keySourceName;
    exam.questions = fixedLayout(exam.id, { pagesPerQuestion: o.perQuestion ?? 1, startPage, endPage, skip });
    if (!exam.questions.length) throw new Error('No question pages are left with these settings.');
    status('Saving the PDF on this device…');
    await savePdf(exam.id, o.question);
    await saveExam(exam);

    let key: ParsedKey | null = null;
    let note = '';
    if (o.keySource === 'paste' && o.keyText) key = readKeyFromText(o.keyText);
    else if (o.keySource === 'pdf' && o.keyPdf) {
      status('Reading the answer key PDF…');
      const kd = await openPdf(o.keyPdf);
      try {
        const r = await readKeyFromPdf(kd, 1, kd.numPages, wordsProvider(null), (d, t) => status(`Reading the answer key: page ${d} of ${t}…`, true), highlightReader);
        key = r.key;
        if (r.pagesWithText === 0) note = 'The answer key PDF has no readable text.';
      } finally {
        closePdf(kd);
      }
    } else if (o.keySource === 'same' && keyStartN >= 1) {
      status('Reading the answer key pages…');
      key = (await readKeyFromPdf(doc, keyStartN, pageCount, wordsProvider(exam.id), (d, t) => status(`Reading the answer key: page ${d} of ${t}…`, true), highlightReader)).key;
    }

    // the key's highest question number says how many questions there are — when most of it was readable
    const maxN = key && key.entries.length ? Math.max(...key.entries.map((e) => e.n)) : 0;
    const readable = key ? key.entries.filter((e) => e.answer || e.answerText).length : 0;
    const expectedCount = maxN >= 2 && readable >= maxN * 0.6 ? maxN : undefined;
    status('Looking at the question pages…');
    const analyzed = await analyzeExam(exam, doc, { auto: o.layout === 'auto', inlineAnswers: o.keySource === 'inline', endPage, startPage, skip, cancel: o.cancel, expectedCount }, (d, t, ocr) =>
      status(ocr ? `Reading scanned pages with text recognition: ${d} of ${t}. This runs once per PDF…` : `Looking at the question pages: ${d} of ${t}…`, ocr && d < t),
    );
    let questions = analyzed.questions;
    if (o.keySource === 'inline' && analyzed.inlineKey) key = analyzed.inlineKey;
    if (key && key.entries.length) questions = applyKey(questions, key);
    const final: Exam = { ...exam, ...analyzed.examPatch, questions };
    if (o.autoConfirm && keyWarnings(questions).length === 0) final.keyChecked = true;
    await saveExam(final);
    resumeBackgroundText(exam.id);
    return { exam: final, keyFound: key ? key.entries.filter((e) => e.answer).length : null, note };
  } finally {
    closePdf(doc);
  }
}
