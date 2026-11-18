import { describe, expect, it } from 'vitest';
import { parseKeyLines } from '../../src/lib/keyParser';
import { dropSidebarToken } from '../../src/lib/textLines';

const L = (text: string, page: number) => ({ text, page });

describe('answer keys without numbers in the text', () => {
  it('answers are tied to the question shown in the screenshot before them, never shifted by a missing one', () => {
    const lines = [
      L('Item 1 of 50', 1), L('• Right answer is A', 1), L('made-up explanation one', 1),
      L('Item 2 of 50', 2), L('. Right answer is C', 2), L('Right answer is D – confirmed', 2),
      // question 3's answer line was in a picture nobody could read
      L('Item 3 of 50', 3), L('made-up text', 3),
      L('Item 4 of 50', 4), L('Right answer is B', 4),
    ];
    const k = parseKeyLines(lines);
    const got = Object.fromEntries(k.entries.filter((e) => e.answer).map((e) => [e.n, e.answer]));
    expect(got[1]).toBe('A');
    expect(got[3]).toBeUndefined();
    expect(got[4]).toBe('B');
  });
  it('one question per page: an unreadable page leaves a gap instead of shifting later answers', () => {
    const lines = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((p) => (p === 3 ? [L('garbled scan text', p)] : [L(`Correct Answer: ${'ABCDEFGH'[p - 1]}.`, p), L('Incorrect Answers: others.', p)]));
    const k = parseKeyLines(lines);
    const got = Object.fromEntries(k.entries.map((e) => [e.n, e.answer]));
    expect(got[2]).toBe('B');
    expect(got[3]).toBe('');
    expect(got[4]).toBe('D');
    expect(got[8]).toBe('H');
  });
});

describe('sidebar numbers in screenshots', () => {
  const w = (t: string, x: number) => ({ t, x, y: 0.1, w: 0.02 * t.length, h: 0.015, c: 90 });
  it('a number far left of the text is dropped', () => {
    const words = [w('39', 0.02), w('Correct', 0.15), w('Answer:', 0.27), w('E.', 0.4)];
    expect(dropSidebarToken({ text: '39 Correct Answer: E.', idx: [0, 1, 2, 3], x: 0.02, y: 0.1, w: 0.4, h: 0.015, column: 0, conf: 1 }, words)).toBe('Correct Answer: E.');
  });
  it('a number that starts the sentence is kept', () => {
    const words = [w('12.', 0.1), w('A', 0.17), w('woman', 0.2)];
    expect(dropSidebarToken({ text: '12. A woman', idx: [0, 1, 2], x: 0.1, y: 0.1, w: 0.2, h: 0.015, column: 0, conf: 1 }, words)).toBe('12. A woman');
  });
});
