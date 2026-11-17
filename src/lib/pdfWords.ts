import type { Word } from '../types';

interface Item {
  str: string;
  transform: number[];
  width: number;
  height: number;
}
type Mul = (a: number[], b: number[]) => number[];

/**
 * Words with positions (fractions of the page, origin top-left) from pdf.js text items.
 * Pure function (no pdf.js import) so it can be unit-tested in Node.
 */
export function itemsToWords(items: unknown[], viewport: { width: number; height: number; transform: number[] }, transform: Mul): Word[] {
  const out: Word[] = [];
  for (const raw of items) {
    const it = raw as Item;
    if (!it || typeof it.str !== 'string' || !it.str.trim()) continue;
    const tx = transform(viewport.transform, it.transform);
    const fontH = Math.hypot(tx[2], tx[3]) || it.height || 10;
    // skip rotated text (watermarks); its boxes would cover the page diagonally
    if (Math.abs(tx[1]) > Math.abs(tx[0]) * 0.2 && Math.abs(tx[1]) > 0.5) continue;
    const left = tx[4];
    const top = tx[5] - fontH * 0.86;
    const total = Math.abs(it.width * (viewport.width / (viewport.width || 1))) * (Math.hypot(viewport.transform[0], viewport.transform[1]) || 1) || fontH * it.str.length * 0.5;
    const len = it.str.length;
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(it.str))) {
      const x = left + (m.index / len) * total;
      const w = (m[0].length / len) * total;
      const word: Word = { t: m[0], x: x / viewport.width, y: top / viewport.height, w: w / viewport.width, h: (fontH * 1.08) / viewport.height, c: 100 };
      if (word.x > 1.02 || word.y > 1.02 || word.x + word.w < -0.02 || word.y + word.h < -0.02) continue;
      out.push(word);
    }
  }
  return out;
}

/** True when a page has a real, usable text layer (not just a watermark or page number). */
export function hasRealText(words: Word[]): boolean {
  const chars = words.reduce((s, w) => s + w.t.length, 0);
  return words.length >= 6 && chars >= 30 && !isScrambled(words);
}

/**
 * Some PDFs store their text with a scrambled character code (it looks right on screen, but the text reads like
 * "2BCM J;NC?HN"). Such text is useless for finding questions and choices, so those pages are read with OCR.
 * Real text in any Latin-script language has vowels and few symbols inside words; scrambled text has neither.
 */
export function isScrambled(words: Word[]): boolean {
  const tokens = words.map((w) => w.t.trim()).filter((t) => t.length >= 3 && !/^https?:|www\.|@/i.test(t));
  if (tokens.length < 8) return false;
  // a symbol between letters (not - ' . / , : or a digit): "L?F;N?>"
  const odd = tokens.filter((t) => /[A-Za-z][^A-Za-z0-9\s\-'’.,:/()%+]+[A-Za-z]/.test(t)).length / tokens.length;
  const letters = tokens.join('').replace(/[^A-Za-z]/g, '');
  const vowels = letters.replace(/[^aeiouyAEIOUY]/g, '').length / Math.max(1, letters.length);
  return odd > 0.25 || (letters.length >= 60 && vowels < 0.18);
}

/** Add OCR words that the PDF's own text layer does not already cover (pages mixing typed text and images). */
export function mergeWords(pdf: Word[], ocr: Word[]): Word[] {
  const covered = (o: Word) => {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    return pdf.some((p) => cx >= p.x - 0.003 && cx <= p.x + p.w + 0.003 && cy >= p.y - 0.004 && cy <= p.y + p.h + 0.004);
  };
  return [...pdf, ...ocr.filter((o) => !covered(o))];
}
