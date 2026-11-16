import { describe, expect, it } from 'vitest';
import { matchPair, parseKeyLines, parseKeyText, resolveAnswerText, stripRepeatedLines } from '../../src/lib/keyParser';

const answers = (t: string) => parseKeyText(t).entries.map((e) => `${e.n}${e.answer}`).join(' ');

describe('answer key formats', () => {
  it('1. C', () => expect(answers('1. C\n2. A\n3. E')).toBe('1C 2A 3E'));
  it('1) C', () => expect(answers('1) C\n2) A\n3) B')).toBe('1C 2A 3B'));
  it('1-C', () => expect(answers('1-C\n2-A\n3-D')).toBe('1C 2A 3D'));
  it('1: C', () => expect(answers('1: C\n2: A\n3: D')).toBe('1C 2A 3D'));
  it('1 C', () => expect(answers('1 C\n2 A\n3 D')).toBe('1C 2A 3D'));
  it('lowercase and (C)', () => expect(answers('1. c\n2. (a)\n3. b')).toBe('1C 2A 3B'));
  it('Q1 / Question 1', () => expect(answers('Q1: C\nQuestion 2: A\nQ3. B')).toBe('1C 2A 3B'));
  it('pasted comma list "1 C, 2 A…"', () => expect(answers('1 C, 2 A, 3 B, 4 D\n5 E, 6 A')).toBe('1C 2A 3B 4D 5E 6A'));
  it('inline with dots', () => expect(answers('1.C 2.A 3.B 4.D')).toBe('1C 2A 3B 4D'));
  it('one letter per line', () => expect(answers('C\nA\n\nB\nD\n')).toBe('1C 2A 3B 4D'));
  it('letter comma list', () => expect(answers('C, A, B, D, E')).toBe('1C 2A 3B 4D 5E'));
  it('letter run', () => expect(answers('CABDE')).toBe('1C 2A 3B 4D 5E'));
  it('"Answer: C" lines without numbers', () => expect(answers('Answer: C\nbecause.\nAnswer: A\nCorrect answer: D')).toBe('1C 2A 3D'));
  it('"1. Answer: C"', () => expect(answers('1. Answer: C\n2. Correct answer: B\n3. Ans: A')).toBe('1C 2B 3A'));
  it('key table with header', () => {
    expect(answers('Answer Key\nQuestion Answer\n1 C\n2 A\n3 B\n4 E')).toBe('1C 2A 3B 4E');
  });
  it('key table read row-wise from two column groups', () => {
    expect(answers('1 C 4 D\n2 A 5 E\n3 B 6 A')).toBe('1C 2A 3B 4D 5E 6A');
  });
  it('ignores header lines before entry 1', () => {
    const k = parseKeyText('Practice Form 7 Answers\nPrinted 2024, 50 questions\n\n1. B\n2. C');
    expect(k.entries.map((e) => e.answer)).toEqual(['B', 'C']);
  });
});

describe('explanations', () => {
  it('"1. C. explanation" keeps explanation and ignores numbers inside it', () => {
    const k = parseKeyText(
      [
        '1. C. The dose is 5 mg/kg given over',
        '2. hours is wrong; actually 3 doses are used.',
        '10 mg is the maximum. See step',
        '3. A different line starting with a number',
        '',
        'Second paragraph of the first explanation.',
        '2. A. Short one.',
        '3. D. Third. In 2 of 3 patients the value exceeds 40.',
      ].join('\n'),
    );
    expect(k.entries.map((e) => e.answer)).toEqual(['C', 'A', 'D']);
    expect(k.entries[0].explanation).toContain('2. hours is wrong');
    expect(k.entries[0].explanation).toContain('3. A different line');
    expect(k.entries[0].explanation).toContain('\n\nSecond paragraph');
    expect(k.entries[1].explanation).toBe('Short one.');
    expect(k.entries[2].explanation).toContain('2 of 3 patients');
  });

  it('a line starting with the NEXT number inside an explanation is the only ambiguity, and plain text there is not taken as an answer', () => {
    const k = parseKeyText('1. C. First.\n2 weeks later the rash returns.\n2. B. Second.');
    // "2 weeks…" is not a letter answer, so entry 2 is the real "2. B."
    expect(k.entries.map((e) => `${e.n}${e.answer}`)).toEqual(['1C', '2B']);
    expect(k.entries[0].explanation).toContain('2 weeks later');
  });

  it('multi-page explanations (page furniture removed, text continues across the break)', () => {
    const mk = (page: number, lines: string[]) => lines.map((text, i) => ({ text, page, top: i < 3 }));
    const pages = [
      mk(1, ['Exam Review Tool - Page 1', '1. C. Start of a long explanation that runs', 'to the bottom of the page and']),
      mk(2, ['Exam Review Tool - Page 2', 'continues here with 12 more words.', '2. A. Next.']),
      mk(3, ['Exam Review Tool - Page 3', '3. B. Third.']),
      mk(4, ['Exam Review Tool - Page 4', '4. D. Fourth.']),
    ];
    const k = parseKeyLines(stripRepeatedLines(pages).flat());
    expect(k.entries.map((e) => e.answer)).toEqual(['C', 'A', 'B', 'D']);
    expect(k.entries[0].explanation).toBe('Start of a long explanation that runs to the bottom of the page and continues here with 12 more words.');
  });

  it('stem + "Correct Answer: E." pages (question repeated before the answer)', () => {
    const k = parseKeyText(
      [
        '1. A 19-year-old woman comes for a check of 3 things.',
        'A) One',
        'B) Two',
        'Correct Answer: B.',
        '',
        'Because of reasons, 2 of them.',
        '',
        'Incorrect Answers: A, C, and D.',
        '2. A 40-year-old man has pain.',
        'A) Alpha',
        'Correct Answer: A.',
        'Alpha is right.',
      ].join('\n'),
    );
    expect(k.entries.map((e) => `${e.n}${e.answer}`)).toEqual(['1B', '2A']);
    expect(k.entries[0].explanation.startsWith('Because of reasons')).toBe(true);
    expect(k.entries[0].explanation).toContain('Incorrect Answers: A, C, and D.');
    expect(k.entries[0].explanation).not.toContain('19-year-old');
  });

  it('"Item N of M" page hints recover an entry whose number was not read', () => {
    const k = parseKeyLines([
      { text: 'Item 1 of 3', page: 1 },
      { text: '1. A man has a cough.', page: 1 },
      { text: 'Correct Answer: C.', page: 1 },
      { text: 'Item 2 of 3', page: 2 },
      { text: 'Z. A woman has a rash.', page: 2 },
      { text: 'Correct Answer: D.', page: 2 },
      { text: 'Item 3 of 3', page: 3 },
      { text: '3. A child has a fever.', page: 3 },
      { text: 'Correct Answer: A.', page: 3 },
    ]);
    expect(k.entries.map((e) => `${e.n}${e.answer}`)).toEqual(['1C', '2D', '3A']);
  });

  it('answer given as choice text', () => {
    const k = parseKeyText('1. Lisinopril\n2. Right coronary artery\n3. Answer: Primary hypothyroidism');
    expect(k.entries.map((e) => e.answerText)).toEqual(['Lisinopril', 'Right coronary artery', 'Primary hypothyroidism']);
    const choices = [
      { letter: 'A', text: 'Amlodipine' },
      { letter: 'B', text: 'Hydrochlorothiazide' },
      { letter: 'C', text: 'Lisinopril' },
    ];
    expect(resolveAnswerText('lisinopril.', choices)).toBe('C');
    expect(resolveAnswerText('Warfarin', choices)).toBe('');
  });

  it('topic lists before the key become tags', () => {
    const k = parseKeyText('System: Cardiovascular : 1,3\nSystem: Renal : 2,4\n1. A\n2. B\n3. C\n4. D');
    expect(k.tags[1]).toEqual(['Cardiovascular']);
    expect(k.tags[4]).toEqual(['Renal']);
  });

  it('key that starts at a number other than 1', () => {
    expect(answers('51. C\n52. A\n53. B')).toBe('51C 52A 53B');
  });
});

describe('matchPair guards', () => {
  it('does not read a stem as an answer', () => {
    expect(matchPair('1. A 19-year-old woman')).toBeNull();
    expect(matchPair('3. Cat scratch disease')).toBeNull();
    expect(matchPair('2. a patient')).toBeNull();
    expect(matchPair('12. C')).toEqual({ n: 12, letter: 'C', rest: '' });
    expect(matchPair('12. C. Because')?.rest).toBe('Because');
    expect(matchPair('7 B Because it is')?.letter).toBe('B');
  });
});

describe('formats seen in real-world keys (made-up text)', () => {
  const stemPage = (n: number, pre: string, ans: string, extra: string[] = []) => [
    { text: `Exam Section : Item ${n} of 9 Header`, page: n, top: true },
    { text: `${pre}${n}. A 30-year-old man has a cough.`, page: n, top: true },
    ...extra.map((t) => ({ text: t, page: n, top: true })),
    { text: 'A) One', page: n },
    { text: 'B) Two', page: n },
    { text: ans, page: n },
    { text: 'Because of reasons.', page: n },
  ];
  it('"CorrectAnswer:" with no space and "Correct Answers:"', () => {
    const k = parseKeyLines([...stemPage(1, '', 'CorrectAnswer: B.'), ...stemPage(2, '', 'Correct Answers: A.')]);
    expect(k.entries.map((e) => e.answer)).toEqual(['B', 'A']);
  });
  it('icons before the number ("X 10.", "\'I 3.", "~ 4.")', () => {
    const k = parseKeyLines([...stemPage(1, 'X ', 'Correct Answer: B.'), ...stemPage(2, "'I ", 'Correct Answer: A.'), ...stemPage(3, '~ ', 'Correct Answer: B.')]);
    expect(k.entries.map((e) => `${e.n}${e.answer}`)).toEqual(['1B', '2A', '3B']);
  });
  it('a temperature like 36.9°C at the top of a page is not item 36', () => {
    const lines = [...stemPage(1, '', 'Correct Answer: B.', ['2.9°C (98.5°F), pulse is 64/min.'])];
    const k = parseKeyLines(lines);
    expect(k.entries.map((e) => `${e.n}${e.answer}`)).toEqual(['1B']);
  });
  it('"2. C . Text", "1. A - text" and "6.e Text"', () => {
    expect(answers('1. A - WBC high here\n2. C . Duodenal text\n3.e Uncal text\n4.b\nshort')).toBe('1A 2C 3E 4B');
  });
  it('"3. Item 1 of 2" inside a two-question set', () => {
    const k = parseKeyLines([
      ...stemPage(1, '', 'Correct Answer: B.'),
      { text: 'The following vignette applies to the next 2 items.', page: 2, top: true },
      { text: "'I 2. Item 1 of 2", page: 2 },
      { text: 'A) One', page: 2 },
      { text: 'Correct Answer: A.', page: 2 },
      { text: '3. Item 2 of 2', page: 3, top: true },
      { text: 'Correct Answer: B.', page: 3 },
    ]);
    expect(k.entries.map((e) => `${e.n}${e.answer}`)).toEqual(['1B', '2A', '3B']);
  });
});

describe('applying a key to questions', () => {
  it('a key missing entry 1 is not shifted; a key for 51-100 is aligned', async () => {
    const { applyKey, fixedLayout } = await import('../../src/lib/importer');
    const qs = fixedLayout('e', { pagesPerQuestion: 1, startPage: 1, endPage: 3, skip: [] });
    expect(applyKey(qs, parseKeyText('2. B\n3. C')).map((q) => q.answer)).toEqual(['', 'B', 'C']);
    expect(applyKey(qs, parseKeyText('51. A\n52. B\n53. C')).map((q) => q.answer)).toEqual(['A', 'B', 'C']);
  });
});

describe('keys without question numbers', () => {
  it('one "Correct Answer:" per page, stray numbers in lab tables, explanation stops at the next page', () => {
    const page = (p: number, ans: string, extra: string[] = []) => [
      { text: 'A man has a cough for days.', page: p, top: true },
      ...extra.map((t) => ({ text: t, page: p })),
      { text: 'A. One', page: p },
      { text: 'B. Two', page: p },
      { text: `Correct Answer: ${ans}.`, page: p },
      { text: `Explanation for page ${p}.`, page: p },
    ];
    const k = parseKeyLines([...page(1, 'B', ['1. Sodium 140']), ...page(2, 'A', ['2. Potassium 4']), ...page(3, 'B'), ...page(4, 'A')]);
    expect(k.entries.map((e) => e.answer)).toEqual(['B', 'A', 'B', 'A']);
    expect(k.entries[0].explanation).toBe('Explanation for page 1.');
  });
});

it('"Right answer is A" lines', () => {
  expect(answers('Right answer is A\nbecause.\nRight answer is C\nmore.')).toBe('1A 2C');
});
