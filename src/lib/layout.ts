import type { Exam, PageText, Question, Rect, Segment } from '../types';

export const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };

/** The part of the page actually shown for a segment. */
export function segmentRect(exam: Exam, seg: Segment, text?: PageText): Rect {
  if (seg.rect) return seg.rect;
  if (exam.crop) return exam.crop;
  if (exam.autoCrop && text?.autoCrop) return text.autoCrop;
  return FULL;
}

export function questionPages(q: Question): number[] {
  return [...new Set(q.segments.map((s) => s.page))];
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Clickable choices are used only when detection found a clean run and the user has not asked for bubbles. */
export function usesChoiceRegions(exam: Exam, q: Question): boolean {
  return !exam.alwaysBubbles && !q.forceBubbles && !!q.choices && q.choices.length >= 2;
}

export function choiceLetters(q: Question): string[] {
  if (q.choices && q.choices.length >= 2 && !q.forceBubbles) {
    const ls = q.choices.map((c) => c.letter);
    const n = Math.max(ls.length, q.choiceCount);
    return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
  }
  return Array.from({ length: q.choiceCount }, (_, i) => String.fromCharCode(65 + i));
}
