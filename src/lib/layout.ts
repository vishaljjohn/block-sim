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
  // every choice must be clickable: when fewer were found on the page than the question has, use the bubbles
  return !exam.alwaysBubbles && !q.forceBubbles && !!q.choices && q.choices.length >= 2 && q.choices.length >= (q.choiceCount ?? 0);
}

/**
 * Letters to offer. With detected choices, the bubbles start at the number of choices found on the page (the
 * user can add or remove with + / −, which sets choiceCountSet); otherwise the key-based default.
 */
export function choiceLetters(q: Question): string[] {
  const detected = q.choices && q.choices.length >= 2 ? q.choices.length : 0;
  const n = q.choiceCountSet ? q.choiceCount : detected || q.choiceCount;
  return Array.from({ length: Math.max(2, Math.min(26, n)) }, (_, i) => String.fromCharCode(65 + i));
}
