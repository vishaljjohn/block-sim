import { useEffect, useRef, useState } from 'react';
import type { Rect } from '../types';
import { renderToCanvas, type PdfDoc } from '../lib/pdf';
import { FloatingPanel } from './panels';

const STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5];

/** Renders just one area of a page, sharp at any size (no full-page render). */
function RegionCanvas({ doc, page, rect, width }: { doc: PdfDoc; page: number; rect: Rect; width: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [aspect, setAspect] = useState(rect.h / rect.w);
  useEffect(() => {
    let live = true;
    (async () => {
      const pg = await doc.getPage(page);
      const v1 = pg.getViewport({ scale: 1 });
      setAspect((rect.h * v1.height) / (rect.w * v1.width));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // render the page so that the region is `width` CSS px wide, then copy the region out (capped for memory)
      const fullW = Math.min((width * dpr) / rect.w, 9000);
      const src = await renderToCanvas(pg, fullW);
      if (!live || !ref.current) return;
      const sx = rect.x * src.width;
      const sy = rect.y * src.height;
      const sw = rect.w * src.width;
      const sh = rect.h * src.height;
      const c = ref.current;
      c.width = Math.max(1, Math.round(sw));
      c.height = Math.max(1, Math.round(sh));
      c.getContext('2d')!.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
      src.width = src.height = 1;
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [doc, page, rect.x, rect.y, rect.w, rect.h, Math.round(width)]);
  return <canvas ref={ref} className="keep-colors" style={{ width, height: width * aspect, display: 'block', background: '#fff' }} data-testid="zoom-canvas" />;
}

/** Pop-out exhibit viewer: draggable, resizable, with zoom in / zoom out / fit. */
export function ImageZoom({ doc, page, rect, onClose }: { doc: PdfDoc; page: number; rect: Rect; onClose: () => void }) {
  const base = Math.min(720, window.innerWidth - 100);
  const [z, setZ] = useState(2); // index into STEPS → 100%
  const zoom = STEPS[z];
  const pad = 0.01;
  const r: Rect = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), w: Math.min(1, rect.w + 2 * pad), h: Math.min(1, rect.h + 2 * pad) };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') setZ((v) => Math.min(STEPS.length - 1, v + 1));
      else if (e.key === '-' || e.key === '_') setZ((v) => Math.max(0, v - 1));
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  return (
    <FloatingPanel title="Image" onClose={onClose} initial={{ x: Math.max(0, (window.innerWidth - base - 40) / 2), y: 70, w: base + 30, h: Math.min(window.innerHeight - 120, 620) }} testId="image-zoom">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-1 border-b border-gray-400 bg-white px-2 py-1 text-sm">
          <button className="btn px-2 py-0 text-base font-bold" onClick={() => setZ((v) => Math.max(0, v - 1))} disabled={z === 0} aria-label="Zoom out" data-testid="zoom-img-out">
            −
          </button>
          <span className="w-14 text-center" data-testid="zoom-img-level">{Math.round(zoom * 100)}%</span>
          <button className="btn px-2 py-0 text-base font-bold" onClick={() => setZ((v) => Math.min(STEPS.length - 1, v + 1))} disabled={z === STEPS.length - 1} aria-label="Zoom in" data-testid="zoom-img-in">
            +
          </button>
          <button className="btn ml-1 px-2 py-0" onClick={() => setZ(2)}>Fit</button>
          <span className="ml-auto text-xs text-gray-600">Drag the title bar to move · corner to resize</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-gray-200 p-2" style={{ touchAction: 'pan-x pan-y pinch-zoom' }}>
          <RegionCanvas doc={doc} page={page} rect={r} width={base * zoom} />
        </div>
      </div>
    </FloatingPanel>
  );
}
