/**
 * Auto-crop: trim a page to the question content, dropping browser toolbars, app headers, footers and docks
 * that appear in screenshots. Pure function on RGBA pixels (plus optional word boxes) so it can be unit-tested.
 */
import type { Rect, Word } from '../types';

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const lum = (d: Uint8ClampedArray, i: number) => (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;

/**
 * 1. Classify each pixel row as "background" (light, nearly empty), "content" (light background with ink) or
 *    "bar" (mostly dark or colored: toolbars, headers, docks, black screen borders).
 * 2. The question lives in the tallest stretch without bars.
 * 3. Within it, trim to the ink (text and images), padded a little; word boxes widen it if OCR found text the
 *    pixel pass missed.
 */
export function detectCrop(px: Pixels, words: Word[] = []): Rect {
  const { data, width: W, height: H } = px;
  if (W < 8 || H < 8) return { x: 0, y: 0, w: 1, h: 1 };
  const light = (i: number) => {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // white or very light gray, and not strongly colored
    return lum(data, i) > 205 && Math.max(r, g, b) - Math.min(r, g, b) < 40;
  };
  // a "bar" row is mostly ONE non-light color (toolbars, headers, docks); rows of text or photos are mixed
  const rowBar = new Uint8Array(H);
  const hist = new Uint32Array(4096);
  for (let y = 0; y < H; y++) {
    let n = 0;
    hist.fill(0);
    let top = 0;
    let topBin = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (light(i)) n++;
      const bin = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      if (++hist[bin] > top) {
        top = hist[bin];
        topBin = bin;
      }
    }
    const domLight = ((topBin >> 8) << 4) * 0.299 + (((topBin >> 4) & 15) << 4) * 0.587 + ((topBin & 15) << 4) * 0.114 > 200;
    rowBar[y] = n / W < 0.55 && top / W > 0.45 && !domLight ? 1 : 0;
  }
  const isBar = (y: number) => rowBar[y] === 1;

  // tallest run of non-bar rows (bars of 1-2 px, like divider lines, do not split a run)
  let bestA = 0;
  let bestB = H - 1;
  let bestLen = -1;
  let a = -1;
  let barRun = 0;
  for (let y = 0; y <= H; y++) {
    const bar = y === H || isBar(y);
    if (!bar) {
      if (a < 0) a = y;
      barRun = 0;
    } else {
      barRun++;
      if (a >= 0 && (barRun > 2 || y === H)) {
        const b = y - barRun;
        if (b - a > bestLen) {
          bestLen = b - a;
          bestA = a;
          bestB = b;
        }
        a = -1;
      }
    }
  }
  if (bestLen < H * 0.15) return { x: 0, y: 0, w: 1, h: 1 };

  // columns inside the band: drop dark side bars (scrollbars, dark sidebars)
  const colBar = new Uint8Array(W);
  const bandH = bestB - bestA + 1;
  for (let x = 0; x < W; x++) {
    let n = 0;
    hist.fill(0);
    let top = 0;
    let topBin = 0;
    for (let y = bestA; y <= bestB; y++) {
      const i = (y * W + x) * 4;
      if (light(i)) n++;
      const bin = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      if (++hist[bin] > top) {
        top = hist[bin];
        topBin = bin;
      }
    }
    const domLight = ((topBin >> 8) << 4) * 0.299 + (((topBin >> 4) & 15) << 4) * 0.587 + ((topBin & 15) << 4) * 0.114 > 200;
    colBar[x] = n / bandH < 0.55 && top / bandH > 0.45 && !domLight ? 1 : 0;
  }
  let cA = 0;
  let cB = W - 1;
  {
    let best = -1;
    let s = -1;
    for (let x = 0; x <= W; x++) {
      const bar = x === W || colBar[x] === 1;
      if (!bar && s < 0) s = x;
      if (bar && s >= 0) {
        if (x - 1 - s > best) {
          best = x - 1 - s;
          cA = s;
          cB = x - 1;
        }
        s = -1;
      }
    }
  }

  // ink extents within the band
  let x0 = W;
  let x1 = -1;
  let y0 = H;
  let y1 = -1;
  for (let y = bestA; y <= bestB; y++) {
    for (let x = cA; x <= cB; x++) {
      const i = (y * W + x) * 4;
      if (lum(data, i) < 170) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const band: Rect = { x: cA / W, y: bestA / H, w: (cB - cA + 1) / W, h: (bestB - bestA + 1) / H };
  if (x1 < 0) return band;

  // light-colored toolbars: a thin strip of ink at the very top or bottom, cut off from the question by a wide
  // blank gap, is page furniture (icons, "Question 3 of 50", a toolbar), not part of the question
  {
    const rowInk = new Uint8Array(H);
    for (let y = y0; y <= y1; y++) {
      for (let x = cA; x <= cB; x++) {
        if (lum(data, (y * W + x) * 4) < 170) {
          rowInk[y] = 1;
          break;
        }
      }
    }
    const runs: [number, number][] = [];
    for (let y = y0; y <= y1; y++) {
      if (!rowInk[y]) continue;
      let e = y;
      while (e + 1 <= y1 && (rowInk[e + 1] || (e + 2 <= y1 && rowInk[e + 2]))) e++;
      runs.push([y, e]);
      y = e;
    }
    if (runs.length >= 3) {
      const first = runs[0];
      const gapTop = runs[1][0] - first[1];
      if (first[1] - first[0] < H * 0.04 && first[0] < bestA + H * 0.04 && gapTop > H * 0.012 && y1 - runs[1][0] > H * 0.2) y0 = runs[1][0];
      const last = runs[runs.length - 1];
      const prev = runs[runs.length - 2];
      if (last[1] - last[0] < H * 0.12 && last[1] > bestB - H * 0.08 && last[0] - prev[1] > H * 0.15) y1 = prev[1];
      // recompute the horizontal extent for the rows kept
      if (y0 !== first[0] || y1 !== last[1]) {
        x0 = W;
        x1 = -1;
        for (let y = y0; y <= y1; y++)
          for (let x = cA; x <= cB; x++)
            if (lum(data, (y * W + x) * 4) < 170) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
            }
      }
    }
  }
  let r: Rect = { x: x0 / W, y: y0 / H, w: (x1 - x0 + 1) / W, h: (y1 - y0 + 1) / H };
  // include words found by OCR / the PDF that sit inside the band
  for (const w of words) {
    const cx = w.x + w.w / 2;
    const cy = w.y + w.h / 2;
    if (cx < band.x || cx > band.x + band.w || cy < y0 / H || cy > (y1 + 1) / H) continue;
    r = union(r, w);
  }
  const padX = 0.02;
  const padY = 0.02;
  r = { x: r.x - padX, y: r.y - padY, w: r.w + 2 * padX, h: r.h + 2 * padY };
  r = intersect(r, band);
  // nothing worth cropping: keep the full page
  if (r.w > 0.96 && r.h > 0.96) return { x: 0, y: 0, w: 1, h: 1 };
  return r;
}

export function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
export function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, w: Math.max(0.01, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0.01, Math.min(a.y + a.h, b.y + b.h) - y) };
}

/**
 * Which choice is highlighted (yellow or green marker behind the text)? Keys that mark the answer only by
 * highlighting it. Returns the letter when one choice clearly stands out.
 */
export function highlightedChoice(px: Pixels, choices: { letter: string; x: number; y: number; w: number; h: number }[]): string | null {
  const { data, width: W, height: H } = px;
  // look at each choice's first line only: the last choice's region can run into the explanation below it
  const hs = choices.map((c) => c.h).sort((a, b) => a - b);
  const lineH = hs[Math.floor(hs.length / 2)] ?? 0.02;
  const score = choices.map((c) => {
    const x0 = Math.max(0, Math.floor(c.x * W));
    const x1 = Math.min(W - 1, Math.ceil((c.x + c.w) * W));
    const y0 = Math.max(0, Math.floor(c.y * H));
    const y1 = Math.min(H - 1, Math.ceil((c.y + Math.min(c.h, lineH * 1.1)) * H));
    let n = 0;
    let hit = 0;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = (y * W + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        n++;
        const yellow = r > 190 && g > 180 && b < 140 && Math.abs(r - g) < 70;
        const green = g > 150 && r < 170 && b < 170 && g - Math.max(r, b) > 40;
        if (yellow || green) hit++;
      }
    return n ? hit / n : 0;
  });
  let best = -1;
  for (let i = 0; i < score.length; i++) if (best < 0 || score[i] > score[best]) best = i;
  if (best < 0) return null;
  const second = Math.max(0, ...score.filter((_, i) => i !== best));
  return score[best] > 0.12 && score[best] > second * 3 ? choices[best].letter : null;
}

/** Rows with ink (dark pixels) inside a rectangle, merged into bands (page fractions). */
export function inkBands(px: Pixels, within: Rect): [number, number][] {
  const { data, width: W, height: H } = px;
  const x0 = Math.max(0, Math.floor(within.x * W));
  const x1 = Math.min(W - 1, Math.ceil((within.x + within.w) * W));
  const y0 = Math.max(0, Math.floor(within.y * H));
  const y1 = Math.min(H - 1, Math.ceil((within.y + within.h) * H));
  const bands: [number, number][] = [];
  let start = -1;
  let gap = 0;
  for (let y = y0; y <= y1 + 1; y++) {
    let ink = false;
    if (y <= y1) {
      let n = 0;
      for (let x = x0; x <= x1; x++) {
        if (lum(data, (y * W + x) * 4) < 200) n++;
        if (n >= 2) {
          ink = true;
          break;
        }
      }
    }
    if (ink) {
      if (start < 0) start = y;
      gap = 0;
    } else if (start >= 0) {
      gap++;
      if (gap > H * 0.006 || y > y1) {
        bands.push([start / H, (y - gap + 1) / H]);
        start = -1;
        gap = 0;
      }
    }
  }
  return bands;
}

/**
 * Find the page's own radio-button circles: for each choice line (label position, page fractions), look just left
 * of the label for a small, roughly round, dark ring. Returns one rect per line (or null).
 */
export function findRadios(px: Pixels, labels: { x: number; y: number; h: number }[]): (Rect | null)[] {
  const { data, width: W, height: H } = px;
  const dark = (x: number, y: number) => lum(data, (y * W + x) * 4) < 175;
  return labels.map((l) => {
    const hPx = l.h * H;
    const x1 = Math.floor(l.x * W) - 1;
    const x0 = Math.max(0, Math.floor(x1 - hPx * 3.2));
    const y0 = Math.max(0, Math.floor(l.y * H - hPx * 0.35));
    const y1 = Math.min(H - 1, Math.ceil(l.y * H + hPx * 1.35));
    if (x1 <= x0 + 2) return null;
    // the right-most blob of dark pixels before the label: walk left past the gap, then collect the blob
    const colDark = (x: number) => {
      for (let y = y0; y <= y1; y++) if (dark(x, y)) return true;
      return false;
    };
    let x = x1;
    let gapRun = 0;
    // skip the label's own left edge if we started inside it
    while (x > x0 && colDark(x)) x--;
    while (x > x0 && !colDark(x)) {
      x--;
      gapRun++;
    }
    if (x <= x0 || gapRun > hPx * 2.5) return null;
    const bx1 = x;
    while (x > x0 && colDark(x)) x--;
    const bx0 = x + 1;
    let by0 = y1;
    let by1 = y0;
    let n = 0;
    for (let yy = y0; yy <= y1; yy++)
      for (let xx = bx0; xx <= bx1; xx++)
        if (dark(xx, yy)) {
          n++;
          if (yy < by0) by0 = yy;
          if (yy > by1) by1 = yy;
        }
    const w = bx1 - bx0 + 1;
    const h = by1 - by0 + 1;
    if (w < hPx * 0.45 || w > hPx * 1.9 || h < hPx * 0.45 || h > hPx * 1.9) return null;
    if (w / h < 0.7 || w / h > 1.4) return null;
    // a ring is hollow: the centre is light
    const cx = Math.round((bx0 + bx1) / 2);
    const cy = Math.round((by0 + by1) / 2);
    if (dark(cx, cy) && n > w * h * 0.6) return null;
    return { x: bx0 / W, y: by0 / H, w: w / W, h: h / H };
  });
}
