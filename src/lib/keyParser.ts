/**
 * Answer-key parsing. Works on plain lines of text (from pasted text, pdf.js, or OCR).
 * Core rule: a numbered entry is accepted only at the START of a line and only when it is the
 * NEXT expected number, so numbers inside explanations can never overwrite answers.
 */
export interface KeyLine {
  text: string;
  page?: number;
  /** 0–1 */
  conf?: number;
  /** line is among the first lines of its page */
  top?: boolean;
}

export interface KeyEntry {
  n: number;
  /** page the entry starts on (keys read from PDFs) */
  page?: number;
  /** raw lines, kept for entries with no answer letter so the answer can be found another way (highlight) */
  raw?: string[];
  answer: string;
  /** set when the key gives the answer as choice text rather than a letter */
  answerText?: string;
  explanation: string;
  conf: number;
  /** how many choices the question has, when the key itself shows its choice list */
  choices?: number;
}

export interface ParsedKey {
  entries: KeyEntry[];
  tags: Record<number, string[]>;
  format: 'numbered' | 'answer-lines' | 'letter-lines' | 'letter-list' | 'none';
  /** answers tied to question markers ("Item 12 of 50") rather than counted in order */
  anchored?: boolean;
}

const DASH = '\\-–—';
const PAIR_RE = new RegExp(`^(?:Q(?:uestion)?\\.?\\s*|#\\s*)?(\\d{1,3})\\s*(?:[.):=|]|[${DASH}]|\\s)\\s*(?:(?:correct\\s*)?(?:answer|ans)\\.?\\s*(?:is)?\\s*[:=${DASH}]?\\s*)?\\(?([A-Za-z])\\)?(.*)$`, 'i');
// up to 3 stray symbols before the number (✓/✗ marks and icons read as "~", ")(", "»")
const STEM_RE = /^(?:(?:[^\w\s]{1,3}|[^\w\s]?[IlXx|✓✗][^\w\s]?)\s*(?=\d))?(?:Q(?:uestion)?\.?\s*|#\s*)?(\d{1,3})\s*(?:[.):](?![\d,])|\s[-–—]\s)\s*(.*)$/i; // "36.9°C" is a number, not item 36
const BARE_NUM_RE = /^(?:Q(?:uestion)?\.?\s*|#\s*)?(\d{1,3})\s*[.):]?$/i;
export const ANSWER_RE = new RegExp(
  `^[•·●▪◦*.\\-\\s]*(?:the\\s+)?(?:correct\\s*answers?|right\\s*answer|correct\\s*choice|correct\\s*response|answer|ans|key)\\.?\\s*(?:is|was)?\\s*[:=${DASH}]?\\s*\\(?([A-Za-z])\\)?(?=$|[\\s.,;:)${DASH}])\\s*[.):,;${DASH}]?\\s*(.*)$`,
  'i',
);
const ANSWER_TEXT_RE = /^[•*\-\s]*(?:the\s+)?(?:correct\s*answer|right\s*answer|answer)\s*(?:is\s*:?|[:=])\s*(.{3,})$/i;
export const ITEM_OF_RE = /\b(?:item|question|q)\s*[:#]?\s*(\d{1,3})\s+of\s+(\d{1,3})\b/i;
const TAG_LINE_RE = /^(.*?[A-Za-z].*?)\s*[:\-–—]\s*((?:\d{1,3}\s*,\s*)+\d{1,3})\s*,?\s*$/;
const AFTER_LETTER_OK = new RegExp(`^\\s*(?:$|[.),:;|${DASH}])`);

interface PairMatch {
  n: number;
  letter: string;
  rest: string;
}

function stripLead(s: string): string {
  return s.replace(new RegExp(`^[\\s.),:;|${DASH}]+`), '').trim();
}

/** Match "12. C", "12) C", "12-C", "12: C", "12 C", "Q12 C", "12. Answer: C", with what follows in `rest`. */
export function matchPair(text: string): PairMatch | null {
  const m = PAIR_RE.exec(text);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const letter = m[2];
  const rest = m[3];
  if (/^[A-Za-z0-9]/.test(rest)) return null; // "12. Cat…" is a word, not an answer letter
  const upper = letter === letter.toUpperCase();
  if (AFTER_LETTER_OK.test(rest)) return { n, letter: letter.toUpperCase(), rest: stripLead(rest) };
  // letter followed by whitespace and more text
  const after = rest.trim();
  if (after === '') return { n, letter: letter.toUpperCase(), rest: '' };
  const nextPair = matchPair(after);
  if (nextPair) return { n, letter: letter.toUpperCase(), rest: after };
  // "6.e Uncal herniation": a lowercase letter glued to the number, then a capitalised explanation
  if (!upper && new RegExp(`^(?:Q(?:uestion)?\\.?\\s*|#\\s*)?${n}[.)]${letter}\\s+[A-Z(]`).test(text.trim())) return { n, letter: letter.toUpperCase(), rest: after };
  if (!upper) return null; // "1. a patient…"
  if ((letter === 'A' || letter === 'I') && /^[a-z0-9]/.test(after)) return null; // "1. A 19-year-old…"
  if (/^\s{2,}|^\t/.test(rest) || /^[A-Z("']/.test(after) || /^[a-z]/.test(after)) return { n, letter, rest: after };
  return null;
}

function isPurePairs(text: string): PairMatch[] | null {
  const out: PairMatch[] = [];
  let s = text.trim();
  while (s) {
    const m = matchPair(s);
    if (!m) return null;
    out.push(m);
    if (m.rest === s) return null;
    s = m.rest;
    // rest must itself be a pair (or empty) for a "pure pairs" line
    if (s && !/^(?:Q(?:uestion)?\.?\s*|#\s*)?\d/.test(s)) return null;
  }
  return out.length ? out : null;
}

function joinParagraphs(buf: string[]): string {
  const paras: string[] = [];
  let cur = '';
  for (const l of buf) {
    if (l === '') {
      if (cur) paras.push(cur);
      cur = '';
    } else if (!cur) cur = l;
    else if (/[A-Za-z]-$/.test(cur) && /^[a-z]/.test(l)) cur = cur.slice(0, -1) + l;
    else cur += ' ' + l;
  }
  if (cur) paras.push(cur);
  return paras.join('\n\n').trim();
}

interface Work {
  n: number;
  page?: number;
  answer: string;
  answerText?: string;
  buf: string[];
  conf: number;
  stem: boolean;
}

export interface ParseOptions {
  /** number of the first entry (default: 1, with automatic fallback to the first number seen) */
  startAt?: number;
}

const answered = (k: ParsedKey) => k.entries.filter((e) => e.answer || e.answerText).length;

export function parseKeyLines(lines: KeyLine[], opts: ParseOptions = {}): ParsedKey {
  let first = runNumbered(lines, opts.startAt ?? 1, false);
  // "1. B cells are…" at the top of a stem-style key would lock the wrong format; try both readings.
  const alt0 = runNumbered(lines, opts.startAt ?? 1, true);
  if (answered(alt0) > answered(first)) first = alt0;
  let best = first;
  if (first.entries.length < 2 && opts.startAt == null) {
    // key may start at a number other than 1 (e.g. questions 51–100)
    for (const l of lines) {
      const m = matchPair(l.text.trim()) ?? null;
      const s = m ? null : STEM_RE.exec(l.text.trim());
      const n = m ? m.n : s ? parseInt(s[1], 10) : null;
      if (n != null && n > 1) {
        const alt = runNumbered(lines, n, false);
        if (alt.entries.length > best.entries.length) best = alt;
        break;
      }
    }
  }
  // keys with no question numbers ("Correct Answer: C." on each page): read the answers in order. Used when that
  // finds clearly more answers than reading by number (stray numbers in lab tables can fool the numbered reader).
  const loose = parseLoose(lines);
  const a = answered(best);
  if ((a < Math.max(3, answered(loose) * 0.3) && answered(loose) > a) || (a === 0 && loose.entries.length > best.entries.length)) return { ...loose, tags: best.tags };
  return best.entries.length ? best : { entries: [], tags: best.tags, format: 'none' };
}

function runNumbered(lines: KeyLine[], startAt: number, forceStem: boolean): ParsedKey {
  const done: Work[] = [];
  const seen = new Set<number>();
  let cur: Work | null = null;
  let pendingHint: number | null = null;
  const tagLines: { label: string; nums: number[] }[] = [];

  const lastN = () => (done.length ? Math.max(...done.map((d) => d.n)) : startAt - 1);
  const expected = () => {
    let e = cur ? cur.n + 1 : startAt;
    while (seen.has(e)) e++;
    return e;
  };
  // Format lock: once the key has shown itself to be "number + letter", a numbered line WITHOUT a
  // letter ("2. hours later…") is explanation text, not a new entry.
  let pairMode: boolean | null = null;
  const accept = (n: number, line: KeyLine, strictPair = false) => {
    if (seen.has(n)) return false;
    if (strictPair && pairMode && done.length > 0 && n > expected() && n <= expected() + 3) return true;
    if (n === expected()) return true;
    if (pendingHint != null && n === pendingHint) return true;
    // lenient only at the top of a page: a missed entry (bad OCR) must not derail the rest
    if (line.top && done.length > 0 && n > expected() && n <= expected() + 3) return true;
    return false;
  };
  const open = (n: number, answer: string, line: KeyLine, stem: boolean): Work => {
    const w: Work = { n, answer, buf: [], conf: line.conf ?? 1, stem, page: line.page };
    done.push(w);
    seen.add(n);
    cur = w;
    pendingHint = null;
    return w;
  };

  for (const line of lines) {
    let text = line.text.replace(/\s+/g, ' ').trim();
    if (text === '') {
      if (cur) (cur as Work).buf.push('');
      continue;
    }
    const hint = ITEM_OF_RE.exec(text);
    if (hint) {
      const n = parseInt(hint[1], 10);
      const curN = cur ? (cur as Work).n : startAt - 1;
      if (n > curN && n <= lastN() + 6 && !seen.has(n)) pendingHint = n;
      // the hint is page furniture, never explanation text
      text = text.replace(ITEM_OF_RE, '').trim();
      // what is left may still be a question number ("3. Item 1 of 2" in a two-question set)
      if (text.length < 40 && !(STEM_RE.test(text) || matchPair(text))) continue;
    }

    const pairs = isPurePairs(text);
    if (pairs && pairs.length >= 2) {
      // key table / comma list: every token is a number+letter, so order does not matter
      let any = false;
      for (const p of pairs) {
        if (seen.has(p.n) || p.n < startAt) continue;
        open(p.n, p.letter, line, false);
        if (pairMode == null && !forceStem) pairMode = true;
        any = true;
      }
      if (any) continue;
    }

    const m = forceStem && matchPair(text)?.rest ? null : matchPair(text);
    if (m && accept(m.n, line, /^\D*\d+\s*[.):]\s*\(?[A-Z]\)?(?:[.):]|$)/.test(text))) {
      if (pairMode == null) pairMode = true;
      let w = open(m.n, m.letter, line, false);
      let rest = m.rest;
      for (;;) {
        const m2 = rest ? matchPair(rest) : null;
        if (m2 && m2.n === w.n + 1 && !seen.has(m2.n)) {
          w = open(m2.n, m2.letter, line, false);
          rest = m2.rest;
        } else break;
      }
      if (rest) w.buf.push(rest);
      continue;
    }

    const s = STEM_RE.exec(text) ?? BARE_NUM_RE.exec(text);
    if (s) {
      const n = parseInt(s[1], 10);
      if (!pairMode && accept(n, line)) {
        if (pairMode == null) pairMode = false;
        const w = open(n, '', line, true);
        const rest = (s[2] ?? '').trim();
        const at0 = rest ? ANSWER_TEXT_RE.exec(rest) : null;
        if (at0 && !(ANSWER_RE.exec(rest) && isLetterOk(ANSWER_RE.exec(rest)![1], ANSWER_RE.exec(rest)![2]))) {
          w.answerText = at0[1].trim();
          w.stem = false;
          continue;
        }
        // "12. Answer: C" where PAIR_RE did not apply
        const a = rest ? ANSWER_RE.exec(rest) : null;
        if (a && isLetterOk(a[1], a[2])) {
          w.answer = a[1].toUpperCase();
          w.stem = false;
          if (a[2]) w.buf.push(a[2]);
        } else if (rest) w.buf.push(rest);
        continue;
      }
    }

    const a = ANSWER_RE.exec(text);
    if (a && isLetterOk(a[1], a[2])) {
      if (pendingHint != null && pendingHint > (cur ? (cur as Work).n : 0)) open(pendingHint, '', line, true);
      if (cur) {
        const w = cur as Work;
        if (!w.answer) {
          w.answer = a[1].toUpperCase();
          w.conf = Math.min(w.conf, line.conf ?? 1);
          if (w.stem) w.buf = []; // drop the question stem that preceded the answer line
          w.stem = false;
          if (a[2]) w.buf.push(a[2]);
          continue;
        }
      }
    } else if (cur && !(cur as Work).answer && !(cur as Work).answerText) {
      const at = ANSWER_TEXT_RE.exec(text);
      if (at) {
        const w = cur as Work;
        w.answerText = at[1].trim();
        if (w.stem) w.buf = [];
        w.stem = false;
        continue;
      }
    }

    if (cur) (cur as Work).buf.push(text);
    else {
      const t = TAG_LINE_RE.exec(text);
      if (t) tagLines.push({ label: cleanTagLabel(t[1]), nums: t[2].split(',').map((x) => parseInt(x.trim(), 10)) });
    }
  }

  const entries: KeyEntry[] = done
    .sort((a, b) => a.n - b.n)
    .map((w) => {
      const explanation = joinParagraphs(w.buf);
      const e: KeyEntry = { n: w.n, answer: w.answer, explanation, conf: w.conf };
      if (w.page != null) e.page = w.page;
      if (!w.answer) e.raw = w.buf;
      if (w.answerText) e.answerText = w.answerText;
      else if (!w.answer && w.stem && explanation && explanation.length <= 90 && !explanation.includes('\n')) {
        // "12. Lisinopril": answer given as choice text
        e.answerText = explanation;
      }
      return e;
    });
  const tags: Record<number, string[]> = {};
  if (tagLines.length >= 2) {
    for (const t of tagLines) for (const n of t.nums) (tags[n] ??= []).push(t.label);
  }
  return { entries, tags, format: entries.length ? 'numbered' : 'none' };
}

function isLetterOk(letter: string, rest: string): boolean {
  if (letter === letter.toUpperCase()) return true;
  return rest.trim() === ''; // lowercase letter only when it stands alone ("answer: c")
}

function cleanTagLabel(s: string): string {
  return s
    .replace(/^[^:]{1,20}:\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseLoose(lines: KeyLine[]): ParsedKey {
  const texts = lines.map((l) => l.text.replace(/\s+/g, ' ').trim());
  const nonEmpty = texts.filter(Boolean);
  // "Answer: C" lines with no numbering → in order
  const answers: KeyEntry[] = [];
  let cur: { e: KeyEntry; buf: string[] } | null = null;
  const flush = () => {
    if (cur) cur.e.explanation = joinParagraphs(cur.buf);
  };
  // pages that hold an answer line: reaching one of them ends the previous explanation (it is the next question)
  const answerPages = new Set(lines.filter((l, i) => l.page != null && ANSWER_RE.test(texts[i])).map((l) => l.page));
  // question markers before an answer ("Item 12 of 50" in a screenshot, or "12. A 30-year-old…") tie the answer to
  // its question; when the key uses them, an answer with no new marker since the last one corrects that answer
  const markerOf = (t: string): number | null => {
    const it = ITEM_OF_RE.exec(t);
    if (it) return parseInt(it[1], 10);
    const st = /^(?:Q(?:uestion)?\s*#?\s*)?(\d{1,3})\s*[.)]\s+[A-Z]/.exec(t);
    return st ? parseInt(st[1], 10) : null;
  };
  const markers = texts.map(markerOf);
  const usesMarkers = markers.filter((m) => m != null).length >= 3;
  let marker: number | null = null;
  let markerUsed = true;
  let curPage: number | undefined;
  lines.forEach((l, i) => {
    const text = texts[i];
    const a = ANSWER_RE.exec(text);
    // a plausible next question number only (numbered lists inside explanations are not markers)
    const lastN = answers[answers.length - 1]?.n ?? 0;
    if (usesMarkers && markers[i] != null && !a && markers[i]! > lastN && markers[i]! <= lastN + 5) {
      marker = markers[i];
      markerUsed = false;
    }
    if (l.page != null && l.page !== curPage) {
      if (cur && curPage != null && answerPages.has(l.page) && !(a && isLetterOk(a[1], a[2]))) {
        flush();
        cur = null;
      }
      curPage = l.page;
    }
    if (a && isLetterOk(a[1], a[2])) {
      flush();
      const n = usesMarkers && marker != null && !markerUsed ? marker : (answers[answers.length - 1]?.n ?? 0) + 1;
      markerUsed = true;
      const e: KeyEntry = { n, answer: a[1].toUpperCase(), explanation: '', conf: l.conf ?? 1, ...(l.page != null ? { page: l.page } : {}) };
      answers.push(e);
      cur = { e, buf: a[2] ? [a[2]] : [] };
    } else if (cur) {
      // explanation runs until something that looks like the next question
      if (/^(?:Q(?:uestion)?\.?\s*)?\d{1,3}\s*[.)]/.test(text)) {
        flush();
        cur = null;
      } else cur.buf.push(text);
    }
  });
  flush();
  // one question per page (each page has at most one answer, and most pages have one): number answers by page, so
  // a page whose answer line could not be read leaves a gap instead of shifting every later answer; such pages get
  // an empty entry, so the answer can still be found another way (a highlighted choice)
  if (!usesMarkers && answers.length >= 3) {
    const pagesSeen = [...new Set(lines.map((l) => l.page).filter((p): p is number => p != null))].sort((a, b) => a - b);
    const perPage = new Map<number, number>();
    for (const e of answers) if (e.page != null) perPage.set(e.page, (perPage.get(e.page) ?? 0) + 1);
    if (pagesSeen.length && [...perPage.values()].every((v) => v === 1) && answers.length >= pagesSeen.length * 0.75) {
      const first = pagesSeen[0];
      for (const e of answers) e.n = e.page! - first + 1;
      for (const p of pagesSeen) if (!perPage.has(p)) answers.push({ n: p - first + 1, answer: '', explanation: '', conf: 0, page: p, raw: [] });
      answers.sort((x, y) => x.n - y.n);
      return { entries: answers, tags: {}, format: 'answer-lines', anchored: true };
    }
  }
  if (answers.length >= 1) return { entries: answers, tags: {}, format: 'answer-lines', ...(usesMarkers ? { anchored: true } : {}) };

  // one letter per line
  const letterLines = nonEmpty.filter((t) => /^\(?[A-Za-z]\)?[.)]?$/.test(t));
  if (letterLines.length >= 2 && letterLines.length >= nonEmpty.length * 0.8) {
    return {
      entries: letterLines.map((t, i) => ({ n: i + 1, answer: t.replace(/[^A-Za-z]/g, '').toUpperCase(), explanation: '', conf: 1 })),
      tags: {},
      format: 'letter-lines',
    };
  }
  // "C, A, B, D" or "C A B D" or "CABDE"
  const joined = nonEmpty.join(' ');
  if (/^[A-Za-z](?:\s*[,;/|\s]\s*[A-Za-z])+[.,;]?$/.test(joined)) {
    const ls = joined.match(/[A-Za-z]/g) ?? [];
    return { entries: ls.map((t, i) => ({ n: i + 1, answer: t.toUpperCase(), explanation: '', conf: 1 })), tags: {}, format: 'letter-list' };
  }
  if (/^[A-J]{5,}$/.test(joined)) {
    return { entries: joined.split('').map((t, i) => ({ n: i + 1, answer: t, explanation: '', conf: 1 })), tags: {}, format: 'letter-list' };
  }
  return { entries: [], tags: {}, format: 'none' };
}

/** For an entry whose answer was found elsewhere (a highlight): drop the repeated stem and choices, keep what follows. */
export function explanationAfterChoices(raw: string[]): string {
  let last = -1;
  raw.forEach((l, i) => {
    if (/^(?:[^\w\s]{0,3}\s*)?(?:\(?[A-Za-z]\)|[A-Za-z][.)])\s+\S/.test(l.trim())) last = i;
  });
  return joinParagraphs(last >= 0 ? raw.slice(last + 1) : raw);
}

export function parseKeyText(text: string, opts: ParseOptions = {}): ParsedKey {
  return parseKeyLines(
    text.split(/\r?\n/).map((t) => ({ text: t })),
    opts,
  );
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Resolve an answer given as choice text ("Lisinopril") to a letter using the choices read from the page. */
export function resolveAnswerText(answerText: string, choices: { letter: string; text: string }[]): string {
  const a = norm(answerText);
  if (!a) return '';
  let best = '';
  let bestScore = 0;
  for (const c of choices) {
    const t = norm(c.text);
    if (!t) continue;
    let score: number;
    if (t === a) score = 1;
    else if (t.includes(a) || a.includes(t)) score = Math.min(t.length, a.length) / Math.max(t.length, a.length) * 0.9 + 0.1;
    else {
      const ta = new Set(a.split(' '));
      const tt = new Set(t.split(' '));
      let common = 0;
      for (const w of ta) if (tt.has(w)) common++;
      score = (2 * common) / (ta.size + tt.size) * 0.8;
    }
    if (score > bestScore) {
      bestScore = score;
      best = c.letter;
    }
  }
  return bestScore >= 0.5 ? best : '';
}

/**
 * Remove page furniture (toolbars, headers, footers captured in screenshots): lines that repeat,
 * ignoring digits, on most pages. Answer lines and "Item N of M" hints are always kept.
 */
export function stripRepeatedLines<T extends { text: string }>(pages: T[][], minShare = 0.6): T[][] {
  if (pages.length < 4) return pages;
  const key = (s: string) =>
    s
      .toLowerCase()
      .replace(/\d+/g, '#')
      .replace(/[^a-z#]+/g, '');
  const counts = new Map<string, number>();
  for (const p of pages) {
    const seen = new Set<string>();
    for (const l of p) {
      const k = key(l.text);
      if (k.replace(/#/g, '').length < 3 || seen.has(k)) continue;
      seen.add(k);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const limit = pages.length * minShare;
  return pages.map((p) =>
    p.filter((l) => {
      if (ANSWER_RE.test(l.text.trim()) || ITEM_OF_RE.test(l.text)) return true;
      return (counts.get(key(l.text)) ?? 0) < limit;
    }),
  );
}
