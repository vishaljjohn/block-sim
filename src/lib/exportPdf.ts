/**
 * A finished block as a PDF to keep or use elsewhere: each question as it appeared (optionally with the user's
 * highlights and strike-outs drawn on it), the user's answer and the correct one, and the explanation (optionally
 * with explanation highlights). Made entirely in the browser.
 */
import type { PDFFont, PDFPage } from 'pdf-lib';
import { db } from '../db';
import type { Attempt, Exam, HighlightColor, PageText, Rect } from '../types';
import { examPdf, renderToCanvas } from './pdf';
import { segmentRect } from './layout';
import { rectsForRange } from './highlights';
import { isBlank, isCorrect } from './score';
import { HIGHLIGHT_RGBA } from './display';

export interface ExportOptions {
  highlights: boolean;
  strikes: boolean;
  explanations: boolean;
  /** which questions */
  which: 'all' | 'incorrect' | 'marked';
}

const PAGE_W = 612;
const PAGE_H = 792;
const M = 44;

function wrapWithOffsets(font: PDFFont, text: string, size: number, max: number): { s: string; at: number }[] {
  const out: { s: string; at: number }[] = [];
  let pos = 0;
  for (const para of text.split('\n')) {
    let line = '';
    let lineAt = pos;
    let i = 0;
    for (const word of para.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (line && font.widthOfTextAtSize(t, size) > max) {
        out.push({ s: line, at: lineAt });
        lineAt = pos + i;
        line = word;
      } else line = t;
      i += word.length + 1;
    }
    out.push({ s: line, at: lineAt });
    pos += para.length + 1;
  }
  return out;
}

const rgb255 = (rgba: string) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgba);
  return m ? [+m[1] / 255, +m[2] / 255, +m[3] / 255] : [1, 0.9, 0.3];
};

/** One question area rendered to a JPEG, with highlights and strike-outs drawn on when asked. */
async function questionImage(exam: Exam, page: number, area: Rect, text: PageText | undefined, item: Attempt['items'][number], opts: ExportOptions): Promise<{ jpg: Uint8Array; w: number; h: number }> {
  const doc = await examPdf(exam.id);
  const full = await renderToCanvas(await doc.getPage(page), 1500);
  const W = full.width;
  const H = full.height;
  const sx = Math.round(area.x * W);
  const sy = Math.round(area.y * H);
  const sw = Math.max(1, Math.round(area.w * W));
  const sh = Math.max(1, Math.round(area.h * H));
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, sw, sh);
  g.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  full.width = full.height = 1;
  const toC = (r: Rect) => ({ x: r.x * W - sx, y: r.y * H - sy, w: r.w * W, h: r.h * H });
  if (opts.highlights) {
    g.globalCompositeOperation = 'multiply';
    for (const h of item.highlights.filter((x) => x.page === page)) {
      g.fillStyle = HIGHLIGHT_RGBA[(h.color ?? 'yellow') as HighlightColor];
      const rects = h.kind === 'box' ? [h] : text ? rectsForRange(text.words, h.start, h.end, h.sc, h.ec) : [];
      for (const r of rects) {
        const p = toC(r);
        g.fillRect(p.x, p.y, p.w, p.h);
      }
    }
    g.globalCompositeOperation = 'source-over';
  }
  if (opts.strikes && item.strikes.length) {
    const q = exam.questions.find((x) => x.id === item.qid);
    g.strokeStyle = '#222';
    g.lineWidth = Math.max(2, W / 600);
    for (const letter of item.strikes) {
      const ch = q?.choices?.find((x) => x.letter === letter && x.page === page);
      if (!ch) continue;
      const p = toC(ch);
      g.beginPath();
      g.moveTo(p.x, p.y + p.h / 2);
      g.lineTo(p.x + p.w, p.y + p.h / 2);
      g.stroke();
    }
  }
  // the correct choice outlined in green, a wrong pick in red (as in review)
  {
    const q = exam.questions.find((x) => x.id === item.qid);
    const key = item.key ?? q?.answer ?? null;
    g.lineWidth = Math.max(2, W / 500);
    for (const ch of q?.choices?.filter((x) => x.page === page) ?? []) {
      const right = ch.letter === key;
      const wrongPick = ch.letter === item.answer && !right;
      if (!right && !wrongPick) continue;
      g.strokeStyle = right ? '#16a34a' : '#dc2626';
      const p = toC(ch);
      g.strokeRect(p.x - 3, p.y - 2, p.w + 6, p.h + 4);
    }
  }
  const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  c.width = c.height = 1;
  return { jpg: new Uint8Array(await blob!.arrayBuffer()), w: sw, h: sh };
}

export async function exportAttemptPdf(attempt: Attempt, opts: ExportOptions, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(attempt.name);
  const base = import.meta.env.BASE_URL;
  const font = await pdf.embedFont(await fetch(`${base}vendor/pdfjs/standard_fonts/LiberationSans-Regular.ttf`).then((r) => r.arrayBuffer()), { subset: true });
  const bold = await pdf.embedFont(await fetch(`${base}vendor/pdfjs/standard_fonts/LiberationSans-Bold.ttf`).then((r) => r.arrayBuffer()), { subset: true });
  const ok = new Set(font.getCharacterSet());
  const clean = (t: string) => [...t].map((ch) => (ok.has(ch.codePointAt(0)!) || ch === '\n' ? ch : /\s/.test(ch) ? ' ' : '?')).join('');

  const exams = new Map<string, Exam>();
  for (const id of new Set(attempt.items.map((i) => i.examId))) {
    const e = await db.exams.get(id);
    if (e) exams.set(id, e);
  }
  const items = attempt.items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => (opts.which === 'incorrect' ? !isCorrect(it) : opts.which === 'marked' ? it.marked : true));

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;
  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - M;
  };
  const need = (h: number) => {
    if (y - h < M) newPage();
  };
  const text = (s: string, size: number, f: PDFFont = font, color = rgb(0.07, 0.09, 0.15), x = M) => {
    need(size + 6);
    page.drawText(clean(s), { x, y: y - size, size, font: f, color });
    y -= size + 6;
  };

  // cover
  const correct = attempt.items.filter((x) => isCorrect(x)).length;
  text(attempt.name, 20, bold);
  text(`${new Date(attempt.completedAt ?? attempt.updatedAt).toLocaleString()} · ${correct} of ${attempt.items.length} correct (${Math.round((correct / Math.max(1, attempt.items.length)) * 100)}%)`, 11, font, rgb(0.3, 0.35, 0.45));
  text(`${items.length} question${items.length === 1 ? '' : 's'} in this file${opts.which === 'incorrect' ? ' (incorrect and omitted only)' : opts.which === 'marked' ? ' (marked only)' : ''}.`, 11, font, rgb(0.3, 0.35, 0.45));
  y -= 10;

  let done = 0;
  for (const { it, i } of items) {
    const exam = exams.get(it.examId);
    const q = exam?.questions.find((x) => x.id === it.qid);
    need(60);
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.6, color: rgb(0.85, 0.87, 0.9) });
    y -= 10;
    const status = isBlank(it) ? 'Omitted' : isCorrect(it) ? 'Correct' : 'Incorrect';
    text(`Question ${i + 1}${it.marked ? ' (marked)' : ''}`, 13, bold);
    if (exam && q) {
      const texts = new Map((await db.pages.where('examId').equals(exam.id).toArray()).map((p) => [p.page, p]));
      for (const seg of q.segments) {
        const area = segmentRect(exam, seg, texts.get(seg.page));
        try {
          const im = await questionImage(exam, seg.page, area, texts.get(seg.page), it, opts);
          const img = await pdf.embedJpg(im.jpg);
          const maxW = PAGE_W - 2 * M;
          let w = maxW;
          let h = (im.h / im.w) * w;
          const maxH = PAGE_H - 2 * M - 20;
          if (h > maxH) {
            h = maxH;
            w = (im.w / im.h) * h;
          }
          need(h + 6);
          page.drawImage(img, { x: M, y: y - h, width: w, height: h });
          y -= h + 8;
        } catch {
          text('(This page could not be drawn: the exam PDF is not available on this device.)', 10);
        }
      }
    } else text('(This question’s exam is no longer in the library.)', 10);
    const col = status === 'Correct' ? rgb(0.05, 0.5, 0.2) : status === 'Incorrect' ? rgb(0.75, 0.1, 0.1) : rgb(0.4, 0.4, 0.45);
    text(`${status} · Your answer: ${it.answer ?? '—'} · Correct answer: ${it.key ?? q?.answer ?? '—'}${opts.strikes && it.strikes.length ? ` · Struck out: ${[...it.strikes].sort().join(', ')}` : ''}`, 11, bold, col);
    const expl = (q?.explanation ?? '').trim();
    if (opts.explanations && expl) {
      y -= 2;
      text('Explanation', 11, bold);
      const size = 10;
      const lineH = 13.5;
      const lines = wrapWithOffsets(font, clean(expl), size, PAGE_W - 2 * M);
      const hl = opts.highlights ? (it.explHighlights ?? []) : [];
      for (const l of lines) {
        need(lineH);
        // explanation highlights behind the text
        for (const h of hl) {
          const a = Math.max(h.s, l.at);
          const b = Math.min(h.e, l.at + l.s.length);
          if (b <= a) continue;
          const x0 = M + font.widthOfTextAtSize(l.s.slice(0, a - l.at), size);
          const x1 = M + font.widthOfTextAtSize(l.s.slice(0, b - l.at), size);
          const [r, g, bl] = rgb255(HIGHLIGHT_RGBA[(h.color ?? 'yellow') as HighlightColor]);
          page.drawRectangle({ x: x0, y: y - size - 2, width: x1 - x0, height: size + 4, color: rgb(r, g, bl), opacity: 0.55 });
        }
        page.drawText(l.s, { x: M, y: y - size, size, font, color: rgb(0.1, 0.12, 0.18) });
        y -= lineH;
      }
    }
    if (it.reviewNote?.trim()) {
      text('My note', 11, bold);
      for (const l of wrapWithOffsets(font, clean(it.reviewNote.trim()), 10, PAGE_W - 2 * M)) text(l.s, 10);
    }
    y -= 12;
    onProgress?.(++done, items.length);
  }
  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
