import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { Word } from '../types';
import { db } from '../db';
import { hasRealText, itemsToWords } from './pdfWords';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const VENDOR = import.meta.env.BASE_URL + 'vendor/pdfjs/';

export type PdfDoc = PDFDocumentProxy;

export async function openPdf(data: ArrayBuffer): Promise<PdfDoc> {
  // pdf.js takes ownership of the buffer it is given, so hand it a copy
  return pdfjs.getDocument({
    data: new Uint8Array(data.slice(0)),
    cMapUrl: VENDOR + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: VENDOR + 'standard_fonts/',
    wasmUrl: VENDOR + 'wasm/',
    iccUrl: VENDOR + 'iccs/',
  }).promise;
}

/** Release a document opened with openPdf. */
export function closePdf(doc: PdfDoc): void {
  try {
    const d = doc as unknown as { loadingTask?: { destroy?: () => Promise<void> }; destroy?: () => Promise<void> };
    void (d.loadingTask?.destroy?.() ?? d.destroy?.())?.catch?.(() => {});
  } catch {}
}

const docCache = new Map<string, Promise<PdfDoc>>();

/** Open (and keep open) the stored PDF of an exam. */
export function examPdf(examId: string): Promise<PdfDoc> {
  let p = docCache.get(examId);
  if (!p) {
    p = (async () => {
      const row = await db.blobs.get(examId);
      if (!row) throw new Error('The PDF for this exam is missing from storage.');
      return openPdf(row.data);
    })();
    docCache.set(examId, p);
    p.catch(() => docCache.delete(examId));
    if (docCache.size > 4) {
      const first = docCache.keys().next().value as string;
      if (first !== examId) {
        void docCache.get(first)?.then(closePdf).catch(() => {});
        docCache.delete(first);
        for (const k of [...sizeCache.keys()]) if (k.startsWith(first + ':')) sizeCache.delete(k);
      }
    }
  }
  return p;
}

export function forgetPdf(examId: string): void {
  void docCache.get(examId)?.then(closePdf).catch(() => {});
  docCache.delete(examId);
  for (const k of [...renderCache.keys()]) if (k.startsWith(examId + ':')) renderCache.delete(k);
}

const sizeCache = new Map<string, Promise<{ w: number; h: number }>>();
export function pageSize(examId: string, doc: PdfDoc, page: number): Promise<{ w: number; h: number }> {
  const k = `${examId}:${page}`;
  let p = sizeCache.get(k);
  if (!p) {
    p = doc.getPage(page).then((pg) => {
      const v = pg.getViewport({ scale: 1 });
      return { w: v.width, h: v.height };
    });
    sizeCache.set(k, p);
  }
  return p;
}

const MAX_SIDE = 4096;
const MAX_PIXELS = 14_000_000;

export async function renderToCanvas(page: PDFPageProxy, pixelWidth: number): Promise<HTMLCanvasElement> {
  const v1 = page.getViewport({ scale: 1 });
  let scale = pixelWidth / v1.width;
  scale = Math.min(scale, MAX_SIDE / v1.width, MAX_SIDE / v1.height, Math.sqrt(MAX_PIXELS / (v1.width * v1.height)));
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(vp.width));
  canvas.height = Math.max(1, Math.round(vp.height));
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
  return canvas;
}

const renderCache = new Map<string, Promise<HTMLCanvasElement>>();
const RENDER_KEEP = 14;

/** Rendered page bitmap, cached (LRU) so switching questions is instant. */
export function renderPage(examId: string, doc: PdfDoc, pageNum: number, pixelWidth: number): Promise<HTMLCanvasElement> {
  const w = Math.max(200, Math.ceil(pixelWidth / 64) * 64);
  const key = `${examId}:${pageNum}:${w}`;
  const hit = renderCache.get(key);
  if (hit) {
    renderCache.delete(key);
    renderCache.set(key, hit);
    return hit;
  }
  const p = doc.getPage(pageNum).then((pg) => renderToCanvas(pg, w));
  renderCache.set(key, p);
  p.catch(() => renderCache.delete(key));
  while (renderCache.size > RENDER_KEEP) renderCache.delete(renderCache.keys().next().value as string);
  return p;
}

/** Words with positions (fractions of the page) from the PDF's real text layer. */
export async function pageWords(page: PDFPageProxy): Promise<Word[]> {
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  return itemsToWords(tc.items, vp, pdfjs.Util.transform as (a: number[], b: number[]) => number[]);
}

export { hasRealText };

/** Does the page draw any raster image? (screenshots pasted into a document with a little typed text) */
export async function pageHasImage(page: PDFPageProxy): Promise<boolean> {
  try {
    const ops = await page.getOperatorList();
    const img = new Set([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageXObjectRepeat]);
    return ops.fnArray.some((f) => img.has(f));
  } catch {
    return false;
  }
}
