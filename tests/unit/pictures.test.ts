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
