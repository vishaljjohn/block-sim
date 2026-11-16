import type { Exam, Question } from '../types';
import type { ParsedKey } from './keyParser';
import { pdfTextProvider, type WordsProvider } from './importer';
import type { PdfDoc } from './pdf';

export interface AnalyzeOptions {
  auto: boolean;
  inlineAnswers: boolean;
  startPage: number;
  endPage: number;
  skip: number[];
}
export interface AnalyzeResult {
  questions: Question[];
  examPatch: Partial<Exam>;
  inlineKey: ParsedKey | null;
}

/** Stage A: page text comes from the PDF only. Stage D replaces this with cached text + OCR. */
export function wordsProvider(_examId: string | null): WordsProvider {
  return pdfTextProvider;
}

/** Stage A: keeps the fixed layout. Stage D adds question-number detection, choices, cropping. */
export async function analyzeExam(exam: Exam, _doc: PdfDoc, _opts: AnalyzeOptions, _onProgress?: (done: number, total: number) => void): Promise<AnalyzeResult> {
  return { questions: exam.questions, examPatch: {}, inlineKey: null };
}

export function resumeBackgroundText(_examId: string): void {}
