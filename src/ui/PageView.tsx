import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Rect } from '../types';
import { pageSize, renderPage, type PdfDoc } from '../lib/pdf';

export interface PageApi {
  /** CSS position (percentages of the visible area) for a rect given in page fractions */
  pos: (r: Rect) => CSSProperties;
  /** convert a pointer position to page fractions */
  toPage: (clientX: number, clientY: number) => { x: number; y: number };
  crop: Rect;
  /** rendered CSS size of the visible area */
  width: number;
  height: number;
}

interface Props {
  examId: string;
  doc: PdfDoc;
  page: number;
  crop: Rect;
  width: number;
  children?: (api: PageApi) => ReactNode;
  handlers?: React.HTMLAttributes<HTMLDivElement>;
  className?: string;
  style?: CSSProperties;
}

/** One PDF page (or a cropped part of it) drawn as an image, with an overlay in page coordinates. */
export function PageView({ examId, doc, page, crop, width, children, handlers, className, style }: Props) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    let live = true;
    pageSize(examId, doc, page).then((s) => live && setSize(s), () => {});
    return () => {
      live = false;
    };
  }, [examId, doc, page]);

  const fullW = width / crop.w;
  const fullH = size ? (fullW * size.h) / size.w : 0;
  const height = fullH * crop.h;

  useEffect(() => {
    if (!size || width <= 0) return;
    let live = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    renderPage(examId, doc, page, fullW * dpr).then(
      (src) => {
        const c = canvasRef.current;
        if (!live || !c) return;
        if (c.width !== src.width || c.height !== src.height) {
          c.width = src.width;
          c.height = src.height;
        }
        c.getContext('2d', { alpha: false })!.drawImage(src, 0, 0);
        setDrawn(true);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [examId, doc, page, size, Math.round(fullW)]);

  const api: PageApi = {
    crop,
    width,
    height,
    pos: (r) => ({
      position: 'absolute',
      left: `${((r.x - crop.x) / crop.w) * 100}%`,
      top: `${((r.y - crop.y) / crop.h) * 100}%`,
      width: `${(r.w / crop.w) * 100}%`,
      height: `${(r.h / crop.h) * 100}%`,
    }),
    toPage: (cx, cy) => {
      const b = wrapRef.current!.getBoundingClientRect();
      return { x: crop.x + ((cx - b.left) / b.width) * crop.w, y: crop.y + ((cy - b.top) / b.height) * crop.h };
    },
  };

  return (
    <div
      ref={wrapRef}
      className={'relative bg-white ' + (className ?? '')}
      style={{ width, height: height || Math.round(width * 0.6), ...style }}
      data-page={page}
      data-drawn={drawn ? '1' : '0'}
      {...handlers}
    >
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <canvas ref={canvasRef} className="page-canvas" style={{ position: 'absolute', left: -crop.x * fullW, top: -crop.y * fullH, width: fullW, height: fullH }} />
      </div>
      {size && children ? children(api) : null}
    </div>
  );
}
