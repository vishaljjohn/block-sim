/**
 * Questions typed, pasted, or saved as .txt / .docx become an exam PDF made right here in the browser (nothing is
 * uploaded). Each numbered question starts on its own page and the text is real text, so the rest of the app (finding
 * questions and answer choices, highlighting, "Answer: C" keys after each question) works exactly as for a PDF.
 */
import type { PDFFont, PDFPage } from 'pdf-lib';

export type Block = { kind: 'p'; text: string; indent?: number } | { kind: 'img'; data: Uint8Array; type: 'png' | 'jpg' } | { kind: 'gap' };

const QSTART = /^\s*(?:q(?:uestion)?\.?\s*)?(\d{1,3})\s*[.):]\s*\S/i;
const LABEL = /^\s*\(?([A-Za-z])\s*[.):]\s/;
const ANSWER = /^\s*(?:correct\s+)?answer\s*(?:is)?\s*[:\-–]?\s*\(?[A-J]\b/i;

/** Plain text → blocks: every line is kept; blank lines become spacing. */
export function textToBlocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\t/g, '    ').split('').filter((c) => c.charCodeAt(0) >= 32 || c === '\n').join('').trimEnd();
    if (!line.trim()) {
      if (out.length && out[out.length - 1].kind !== 'gap') out.push({ kind: 'gap' });
    } else out.push({ kind: 'p', text: line.trim(), indent: /^\s{2,}/.test(line) ? 1 : 0 });
  }
  return out;
}

/** How many answers like "Answer: C" the text has (to suggest the "after each question" key option). */
export function countInlineAnswers(blocks: Block[]): number {
  return blocks.filter((b) => b.kind === 'p' && ANSWER.test(b.text)).length;
}

/** Number of questions the text seems to hold (lines that start with 1., 2., … in order). */
export function countQuestions(blocks: Block[]): number {
  let n = 0;
  for (const b of blocks) if (b.kind === 'p' && Number(QSTART.exec(b.text)?.[1]) === n + 1) n++;
  return n;
}

const decodeDataUrl = (src: string): { data: Uint8Array; type: string } | null => {
  const m = /^data:([^;]+);base64,(.*)$/.exec(src);
  if (!m) return null;
  const bin = atob(m[2]);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  return { data, type: m[1] };
};

/** Any picture the browser can draw (gif, bmp, webp…) → PNG, so it can go into the PDF. */
async function toPng(data: Uint8Array, type: string): Promise<Uint8Array | null> {
  try {
    const bmp = await createImageBitmap(new Blob([data as BlobPart], { type }));
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/**
 * Word (.docx) → blocks, keeping pictures in place. Word's automatic numbering is lost when reading the file, so long
 * list items are numbered as questions and the short ones under them lettered as answer choices.
 */
export async function docxToBlocks(buf: ArrayBuffer): Promise<Block[]> {
  const mammoth = (await import('mammoth/mammoth.browser.js')) as unknown as { convertToHtml: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };
  const { value } = await mammoth.convertToHtml({ arrayBuffer: buf });
  const html = new DOMParser().parseFromString(`<div>${value}</div>`, 'text/html');
  const out: Block[] = [];
  let q = 0;
  let letter = 0;
  const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const pushText = (t: string, indent = 0) => {
    if (!t) return;
    const m = QSTART.exec(t);
    if (m && Number(m[1]) === q + 1) {
      q++;
      letter = 0;
    } else if (LABEL.test(t)) letter = t.replace(/^\s*\(?/, '').toUpperCase().charCodeAt(0) - 64;
    out.push({ kind: 'p', text: t, indent });
  };
  const images = async (el: Element) => {
    for (const img of el.querySelectorAll('img')) {
      const d = decodeDataUrl(img.getAttribute('src') ?? '');
      if (!d) continue;
      if (d.type === 'image/png') out.push({ kind: 'img', data: d.data, type: 'png' });
      else if (d.type === 'image/jpeg') out.push({ kind: 'img', data: d.data, type: 'jpg' });
      else {
        const png = await toPng(d.data, d.type);
        if (png) out.push({ kind: 'img', data: png, type: 'png' });
      }
    }
  };
  const list = async (ol: Element, depth: number): Promise<void> => {
    for (const li of [...ol.children]) {
      const own = [...li.childNodes].filter((n) => !(n instanceof Element && /^(ol|ul)$/i.test(n.tagName)));
      const t = own.map((n) => n.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim();
      if (t) {
        if (QSTART.test(t) || LABEL.test(t)) pushText(t, depth);
        // a long item (or the first one) is the next question; short items after a question are its choices
        else if (q === 0 || (depth === 0 && t.length > 80)) pushText(`${q + 1}. ${t}`, 0);
        else pushText(`${String.fromCharCode(65 + Math.min(letter, 25))}) ${t}`, 1);
      }
      await images(li);
      for (const sub of [...li.children]) if (/^(ol|ul)$/i.test(sub.tagName)) await list(sub, depth + 1);
    }
  };
  const walk = async (el: Element): Promise<void> => {
    for (const ch of [...el.children]) {
      const tag = ch.tagName.toLowerCase();
      if (tag === 'ol' || tag === 'ul') await list(ch, 0);
      else if (tag === 'table') {
        for (const tr of ch.querySelectorAll('tr')) pushText([...tr.children].map(text).join('    '), 1);
        out.push({ kind: 'gap' });
      } else if (/^(p|h[1-6])$/.test(tag)) {
        const t = text(ch);
        if (t) pushText(t);
        else if (!ch.querySelector('img') && out.length && out[out.length - 1].kind !== 'gap') out.push({ kind: 'gap' });
        await images(ch);
      } else await walk(ch);
    }
  };
  await walk(html.body.firstElementChild!);
  return out;
}

// ------------------------------------------------------------------ PDF
const PAGE_W = 612;
const PAGE_H = 792;
const M = 54;
const SIZE = 11.5;
const LINE = 16;

function wrap(font: PDFFont, text: string, size: number, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const t = line ? line + ' ' + word : word;
    if (line && font.widthOfTextAtSize(t, size) > max) {
      out.push(line);
      line = word;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}

/** Keep only characters the font can draw. */
function drawable(font: PDFFont, text: string): string {
  const set = font.getCharacterSet();
  const ok = new Set(set);
  const map: Record<string, string> = { '≤': '<=', '≥': '>=', '→': '->', '←': '<-', '↑': '^', '↓': 'v', '…': '...' };
  let out = '';
  for (const ch of text) out += ok.has(ch.codePointAt(0)!) ? ch : (map[ch] ?? (/\s/.test(ch) ? ' ' : '?'));
  return out;
}

/** Blocks → PDF bytes. Each question (1., 2., …) starts a new page. */
export async function blocksToPdf(blocks: Block[], title: string): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(title);
  const fontBytes = await fetch(`${import.meta.env.BASE_URL}vendor/pdfjs/standard_fonts/LiberationSans-Regular.ttf`).then((r) => r.arrayBuffer());
  const font = await doc.embedFont(fontBytes, { subset: true });
  let page: PDFPage | null = null;
  let y = 0;
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - M;
  };
  const used = () => page && y < PAGE_H - M - 1;
  // where each question's page starts: at its number, or at the pictures right above it
  const breakAt = new Set<number>();
  {
    let n = 0;
    blocks.forEach((b, i) => {
      if (b.kind !== 'p' || Number(QSTART.exec(b.text)?.[1]) !== n + 1) return;
      n++;
      let k = i;
      while (k > 0 && (blocks[k - 1].kind === 'img' || blocks[k - 1].kind === 'gap')) k--;
      while (k < i && blocks[k].kind === 'gap') k++;
      breakAt.add(k);
    });
  }
  for (const [bi, b] of blocks.entries()) {
    if (breakAt.has(bi) && used()) newPage();
    if (b.kind === 'gap') {
      if (page) y -= LINE * 0.6;
      continue;
    }
    if (b.kind === 'p') {
      if (!page) newPage();
      const indent = (b.indent ?? 0) * 18;
      const lines = wrap(font, drawable(font, b.text), SIZE, PAGE_W - 2 * M - indent);
      for (const l of lines) {
        if (y - LINE < M) newPage();
        page!.drawText(l, { x: M + indent, y: y - SIZE, size: SIZE, font });
        y -= LINE;
      }
      y -= 3;
      continue;
    }
    // picture: as wide as fits, never taller than half a page
    const img = b.type === 'png' ? await doc.embedPng(b.data).catch(() => null) : await doc.embedJpg(b.data).catch(() => null);
    if (!img) continue;
    if (!page) newPage();
    const scale = Math.min(1, (PAGE_W - 2 * M) / img.width, (PAGE_H * 0.5) / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    if (y - h < M) newPage();
    page!.drawImage(img, { x: M, y: y - h, width: w, height: h });
    y -= h + 8;
  }
  if (!doc.getPageCount()) newPage();
  return doc.save();
}
