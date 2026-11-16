/**
 * OCR with Tesseract.js, fully local: worker script, wasm core and English data are served from /vendor.
 * A small pool (max 4 workers) processes pages in the background.
 */
import { createWorker, OEM, PSM, type Worker as TWorker } from 'tesseract.js';
import type { Word } from '../types';

const VENDOR = import.meta.env.BASE_URL + 'vendor/tesseract/';
const MAX = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));

interface Slot {
  worker: Promise<TWorker>;
  busy: boolean;
}
const slots: Slot[] = [];
const waiting: ((s: Slot) => void)[] = [];
let limit = MAX;

/** Fewer workers while a block is on screen keeps the test interface smooth. */
export function setOcrConcurrency(n: number): void {
  limit = Math.max(1, Math.min(MAX, n));
}

function makeWorker(): Promise<TWorker> {
  return createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: VENDOR + 'worker.min.js',
    corePath: VENDOR,
    langPath: VENDOR,
    gzip: true,
    workerBlobURL: false,
    cacheMethod: 'none',
  }).then(async (w) => {
    await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' });
    return w;
  });
}

async function acquire(): Promise<Slot> {
  const free = slots.find((s) => !s.busy);
  if (free && slots.filter((s) => s.busy).length < limit) {
    free.busy = true;
    return free;
  }
  if (slots.length < limit) {
    const s: Slot = { worker: makeWorker(), busy: true };
    slots.push(s);
    s.worker.catch(() => {
      slots.splice(slots.indexOf(s), 1);
    });
    return s;
  }
  return new Promise((res) => waiting.push(res));
}

function release(s: Slot) {
  const next = waiting.shift();
  if (next) next(s);
  else s.busy = false;
}

export interface OcrResult {
  words: Word[];
  /** mean word confidence 0–100 */
  conf: number;
}

/** Recognize an image (canvas rendered from a PDF page) and return word boxes as page fractions. */
export async function ocrCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<OcrResult> {
  const slot = await acquire();
  try {
    const w = await slot.worker;
    const img = canvas instanceof HTMLCanvasElement ? await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('canvas encode failed'))), 'image/png')) : await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' });
    const r = await w.recognize(img, {}, { blocks: true, text: false });
    const W = canvas.width;
    const H = canvas.height;
    const words: Word[] = [];
    for (const b of r.data.blocks ?? [])
      for (const p of b.paragraphs)
        for (const l of p.lines)
          for (const wd of l.words) {
            const t = wd.text.trim();
            if (!t) continue;
            // use the line's box for height so every word on a line lines up for highlighting
            const y0 = Math.min(wd.bbox.y0, l.bbox.y0 + (l.bbox.y1 - l.bbox.y0) * 0.1);
            const y1 = Math.max(wd.bbox.y1, l.bbox.y1 - (l.bbox.y1 - l.bbox.y0) * 0.1);
            words.push({ t, x: wd.bbox.x0 / W, y: y0 / H, w: (wd.bbox.x1 - wd.bbox.x0) / W, h: (y1 - y0) / H, c: Math.round(wd.confidence) });
          }
    const conf = words.length ? words.reduce((s, x) => s + x.c, 0) / words.length : 0;
    return { words, conf };
  } finally {
    release(slot);
  }
}

export async function terminateOcr(): Promise<void> {
  const all = slots.splice(0);
  await Promise.all(all.map((s) => s.worker.then((w) => w.terminate()).catch(() => {})));
}
