import { describe, expect, it } from 'vitest';
import { coverInk, detectLayout, pageLines } from '../../src/lib/detect';
import type { Word } from '../../src/types';

const w = (t: string, x: number, y: number, ww = 0.05): Word => ({ t, x, y, w: ww, h: 0.015, c: 95 });
const line = (text: string, x: number, y: number) => text.split(' ').map((t, i) => w(t, x + i * 0.06, y));

describe('pictures always stay with their question', () => {
  it('a picture beside the text widens the question area', () => {
    const q = [{ segments: [{ page: 1, rect: { x: 0.05, y: 0.1, w: 0.5, h: 0.4 } }] }];
    coverInk(q, [{ page: 1, autoCrop: null, ink: [[0.1, 0.45, 0.05, 0.95]] }]);
    expect(q[0].segments[0].rect.x + q[0].segments[0].rect.w).toBeGreaterThan(0.94);
  });
  it('but never into a second question beside it', () => {
    const q = [{ segments: [{ page: 1, rect: { x: 0.02, y: 0.1, w: 0.46, h: 0.4 } }] }, { segments: [{ page: 1, rect: { x: 0.52, y: 0.1, w: 0.46, h: 0.4 } }] }];
    coverInk(q, [{ page: 1, autoCrop: null, ink: [[0.1, 0.45, 0.02, 0.98]] }]);
    expect(q[0].segments[0].rect.w).toBeCloseTo(0.46);
    expect(q[1].segments[0].rect.x).toBeCloseTo(0.52);
  });
  it('a page that is only a picture belongs to the question before it', () => {
    const p1 = { ...pageLines(1, [...line('1. A made-up stem goes here today', 0.05, 0.1), ...line('A) One', 0.05, 0.2), ...line('B) Two', 0.05, 0.23)]), ink: 0.3 };
    const p2 = { ...pageLines(2, []), ink: 0.6 };
    const p3 = { ...pageLines(3, [...line('2. Another made-up stem for this', 0.05, 0.1), ...line('A) Yes', 0.05, 0.2), ...line('B) No', 0.05, 0.23)]), ink: 0.3 };
    const lay = detectLayout([p1, p2, p3]);
    expect(lay.questions[0].segments.map((s) => s.page)).toEqual([1, 2]);
  });
  it('labels inside a picture above a question (ECG leads) do not make it part of the previous question', () => {
    const p1 = pageLines(1, [...line('1. A made-up stem goes here today', 0.05, 0.1), ...line('A) One', 0.05, 0.2), ...line('B) Two', 0.05, 0.23)]);
    const p2 = pageLines(2, [w('I', 0.1, 0.1), w('aVR', 0.4, 0.1), w('II', 0.1, 0.2), w('V1', 0.4, 0.2), ...line('2. Another made-up stem for this', 0.05, 0.5), ...line('A) Yes', 0.05, 0.6), ...line('B) No', 0.05, 0.63)]);
    const lay = detectLayout([p1, p2]);
    const q2 = lay.questions.find((q) => q.number === 2)!;
    const seg = q2.segments.find((s) => s.page === 2)!;
    expect(seg.rect?.y ?? 0).toBeLessThan(0.1);
    expect(lay.questions[0].segments.map((s) => s.page)).toEqual([1]);
  });
});

describe('explanations that repeat the choices with the answer shaded', () => {
  it('the question ends where its choice list starts again; that list is kept to read the shading', () => {
    const p1 = pageLines(1, [...line('Question # 1', 0.05, 0.05), ...line('A made-up patient has an invented rash today', 0.05, 0.1), ...line('A) One', 0.08, 0.3), ...line('B) Two', 0.08, 0.33), ...line('C) Three', 0.08, 0.36)]);
    const p2 = pageLines(2, [...line('A) One', 0.08, 0.05), ...line('B) Two', 0.08, 0.08), ...line('C) Three', 0.08, 0.11), ...line('This invented explanation says why two is right', 0.05, 0.3)]);
    const p3 = pageLines(3, [...line('Question # 2', 0.05, 0.05), ...line('Another made-up stem for this test', 0.05, 0.1), ...line('A) Yes', 0.08, 0.3), ...line('B) No', 0.08, 0.33)]);
    const lay = detectLayout([p1, p2, p3], { inlineAnswers: true });
    const q1 = lay.questions[0];
    expect(q1.segments.map((s) => s.page)).toEqual([1]);
    expect(q1.answerList?.page).toBe(2);
    expect(q1.answerList?.choices.map((c) => c.letter)).toEqual(['A', 'B', 'C']);
    expect(q1.inlineExplanation).toContain('invented explanation');
    expect(q1.inlineExplanation).not.toContain('Three');
  });
});

describe('repeated choice list: rows text recognition missed, and look-alike headings', () => {
  it('an unread row is placed by the row spacing, and a later heading with a choice\'s words is ignored', () => {
    const p1 = pageLines(1, [...line('Question # 1', 0.05, 0.05), ...line('An invented stem about a made-up patient', 0.05, 0.1), ...line('Which one is right?', 0.05, 0.2),
      ...line('A) Alpha thing', 0.1, 0.3), ...line('B) Beta thing', 0.1, 0.34), ...line('C) Gamma thing', 0.1, 0.38), ...line('D) Delta thing', 0.1, 0.42)]);
    // the explanation repeats the list, but the shaded B row was not read; a heading below repeats "Gamma thing"
    const p2 = pageLines(2, [...line('A) Alpha thing', 0.1, 0.1), ...line('C) Gamma thing', 0.1, 0.18), ...line('D) Delta thing', 0.1, 0.22), ...line('Gamma thing', 0.3, 0.4), ...line('An invented explanation follows here', 0.05, 0.5)]);
    const lay = detectLayout([p1, p2], { inlineAnswers: true });
    const list = lay.questions[0].answerList!;
    expect(list.choices.map((c) => c.letter)).toEqual(['A', 'B', 'C', 'D']);
    const b = list.choices[1];
    expect(b.y + b.h / 2).toBeGreaterThan(0.13);
    expect(b.y + b.h / 2).toBeLessThan(0.16);
    expect(lay.questions[0].segments.map((s) => s.page)).toEqual([1]);
  });
});
