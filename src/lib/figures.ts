/**
 * Find pictures (photos, ECGs, x-rays, diagrams) on a page so they can be zoomed. Pure function on RGBA pixels
 * plus the page's word boxes: dense, non-white areas that are not text.
 */
import type { Rect, Word } from '../types';
import type { Pixels } from './crop';

export function detectFigures(px: Pixels, words: Word[], within: Rect = { x: 0, y: 0, w: 1, h: 1 }): Rect[] {
  const { data, width: W, height: H } = px;
  const CELL = Math.max(4, Math.round(W / 120));
  const gw = Math.ceil(W / CELL);
  const gh = Math.ceil(H / CELL);
  // text cells: covered by a word box (a little padding)
  const text = new Uint8Array(gw * gh);
  for (const w of words) {
    const x0 = Math.max(0, Math.floor(((w.x - 0.004) * W) / CELL));
    const x1 = Math.min(gw - 1, Math.floor(((w.x + w.w + 0.004) * W) / CELL));
    const y0 = Math.max(0, Math.floor(((w.y - 0.003) * H) / CELL));
    const y1 = Math.min(gh - 1, Math.floor(((w.y + w.h + 0.003) * H) / CELL));
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) text[gy * gw + gx] = 1;
  }
  const pic = new Uint8Array(gw * gh);
  const wx0 = within.x * W;
  const wx1 = (within.x + within.w) * W;
  const wy0 = within.y * H;
  const wy1 = (within.y + within.h) * H;
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      if (text[gy * gw + gx]) continue;
      const cx = gx * CELL + CELL / 2;
      const cy = gy * CELL + CELL / 2;
      if (cx < wx0 || cx > wx1 || cy < wy0 || cy > wy1) continue;
      let ink = 0;
      let n = 0;
      for (let y = gy * CELL; y < Math.min(H, gy * CELL + CELL); y++)
        for (let x = gx * CELL; x < Math.min(W, gx * CELL + CELL); x++) {
          const i = (y * W + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = (r * 299 + g * 587 + b * 114) / 1000;
          if (lum < 238 || Math.max(r, g, b) - Math.min(r, g, b) > 25) ink++;
          n++;
        }
      if (n && ink / n > 0.3) pic[gy * gw + gx] = 1;
    }
  // connected regions (8-neighbour, bridging 1-cell gaps)
  const seen = new Uint8Array(gw * gh);
  const out: Rect[] = [];
  for (let s = 0; s < gw * gh; s++) {
    if (!pic[s] || seen[s]) continue;
    let minx = gw;
    let maxx = 0;
    let miny = gh;
    let maxy = 0;
    let count = 0;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % gw;
      const cy = (c - cx) / gw;
      count++;
      minx = Math.min(minx, cx);
      maxx = Math.max(maxx, cx);
      miny = Math.min(miny, cy);
      maxy = Math.max(maxy, cy);
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const k = ny * gw + nx;
          if (pic[k] && !seen[k]) {
            seen[k] = 1;
            stack.push(k);
          }
        }
    }
    const r: Rect = { x: (minx * CELL) / W, y: (miny * CELL) / H, w: ((maxx - minx + 1) * CELL) / W, h: ((maxy - miny + 1) * CELL) / H };
    const fill = count / ((maxx - minx + 1) * (maxy - miny + 1));
    // big enough to be a picture, and solid enough not to be scattered marks
    if (r.w >= 0.08 && r.h >= 0.06 && fill >= 0.25) out.push(r);
  }
  return out.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 6);
}
