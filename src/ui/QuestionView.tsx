import { useEffect, useRef, useState } from 'react';
import type { AttemptItem, ChoiceRegion, Exam, Highlight, PageText, Question, Rect, Segment } from '../types';
import type { PdfDoc } from '../lib/pdf';
import { segmentRect, usesChoiceRegions } from '../lib/layout';
import { addWordRange, boxFromDrag, charAt, choiceWords, highlightAt, readingOrder, rectsForRange, removeHighlight, wordAt, wordsBetween } from '../lib/highlights';
import { uid } from '../db';
import { PageView, type PageApi } from './PageView';
import { ImageZoom } from './ImageZoom';
import { detectFigures } from '../lib/figures';
import { HIGHLIGHT_COLORS, HIGHLIGHT_RGBA, HIGHLIGHT_SWATCH, useDisplay } from '../lib/display';
import type { HighlightColor } from '../types';
import { renderToCanvas } from '../lib/pdf';

/** Pictures on a page, found once per page and kept in memory. */
const figureCache = new Map<string, Promise<Rect[]>>();
function useFigures(examId: string, doc: PdfDoc, page: number, pt: PageText | undefined): Rect[] {
  const [figs, setFigs] = useState<Rect[]>([]);
  useEffect(() => {
    // without the page's words, text would look like pictures: wait until the page has been read
    if (!pt) return setFigs([]);
    const key = `${examId}:${page}:${pt.words.length}`;
    let p = figureCache.get(key);
    if (!p) {
      p = (async () => {
        const c = await renderToCanvas(await doc.getPage(page), 600);
        const img = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
        c.width = c.height = 1;
        return detectFigures({ data: img.data, width: img.width, height: img.height }, pt.words);
      })().catch(() => []);
      figureCache.set(key, p);
    }
    let live = true;
    void p.then((f) => live && setFigs(f));
    return () => {
      live = false;
    };
  }, [examId, doc, page, pt?.words.length]);
  return figs;
}

function FigureLayer({ examId, doc, page, pt, api, onOpen }: { examId: string; doc: PdfDoc; page: number; pt: PageText | undefined; api: PageApi; onOpen: (r: Rect) => void }) {
  const figs = useFigures(examId, doc, page, pt).filter((f) => f.x < api.crop.x + api.crop.w && f.x + f.w > api.crop.x && f.y < api.crop.y + api.crop.h && f.y + f.h > api.crop.y);
  return (
    <>
      {figs.map((f, i) => {
        const top = Math.max(f.y, api.crop.y);
        const right = Math.min(f.x + f.w, api.crop.x + api.crop.w);
        return (
          <div key={i}>
          {/* clicking the picture itself also opens it */}
          <div
            data-testid="zoom-image-area"
            title="Click to zoom in"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(f);
            }}
            style={{ ...api.pos(f), cursor: 'zoom-in', zIndex: 1 }}
          />
          <button
            type="button"
            data-testid="zoom-image"
            title="Zoom in on this image"
            aria-label="Zoom in on this image"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(f);
            }}
            className="flex items-center gap-1 border border-gray-600 bg-white/95 px-1.5 py-0.5 text-[11px] text-black"
            style={{ position: 'absolute', left: `calc(${((right - api.crop.x) / api.crop.w) * 100}% - 64px)`, top: `calc(${((top - api.crop.y) / api.crop.h) * 100}% + 4px)`, zIndex: 2 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="#111" strokeWidth="2.6" /><path d="m15 15 6 6M10 7v6M7 10h6" stroke="#111" strokeWidth="2.6" strokeLinecap="round" /></svg>
            Zoom
          </button>
          </div>
        );
      })}
    </>
  );
}

export interface QuestionViewProps {
  exam: Exam;
  question: Question;
  doc: PdfDoc;
  texts: Map<number, PageText>;
  width: number;
  item?: Pick<AttemptItem, 'answer' | 'highlights' | 'strikes'>;
  /** no selecting / highlighting (review mode, locked tutor item) */
  readOnly?: boolean;
  /** show the correct answer and right/wrong marks */
  revealKey?: string | null;
  /** allow selecting text in the invisible text layer (review mode) */
  selectableText?: boolean;
  hideStrikes?: boolean;
  onSelect?: (letter: string) => void;
  onStrike?: (letter: string) => void;
  onHighlights?: (h: Highlight[]) => void;
}

interface Drag {
  seg: number;
  page: number;
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  moved: boolean;
  w0: number;
  w1: number;
  /** character offsets inside the start/end word (partial-word highlights) */
  c0: number;
  c1: number;
  choice: string | null;
  longDone: boolean;
}

export function QuestionView(p: QuestionViewProps) {
  const { exam, question, doc, texts, width } = p;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [zoomed, setZoomed] = useState<{ page: number; rect: Rect } | null>(null);
  const display = useDisplay();
  /** manual highlighting: the selection waiting for a color */
  const [pending, setPending] = useState<{ seg: number; page: number; w0: number; w1: number; c0?: number; c1?: number; x0: number; y0: number; x1: number; y1: number; px: number; py: number } | null>(null);
  /** words inside answer-choice areas: answer choices are struck out, never highlighted */
  const blockedWords = (page: number): Set<number> => {
    const out = new Set<number>();
    const words = texts.get(page)?.words;
    if (!words) return out;
    // the choices as read from the text (works with bubbles too)
    for (const seg of question.segments.filter((g) => g.page === page)) for (const i of choiceWords(words, segmentRect(exam, seg, texts.get(page)))) out.add(i);
    if (!usesChoiceRegions(exam, question)) return out;
    const cs = (question.choices ?? []).filter((c) => c.page === page);
    words.forEach((w, i) => {
      const cx = w.x + w.w / 2;
      const cy = w.y + w.h / 2;
      if (cs.some((c) => cx >= c.x - 0.03 && cx <= c.x + c.w + 0.01 && cy >= c.y && cy <= c.y + c.h)) out.add(i);
    });
    return out;
  };
  /** the selection, trimmed so it stops before any answer choice; null when nothing is left */
  const clampSel = (page: number, w0: number, c0: number, w1: number, c1: number) => {
    const blocked = blockedWords(page);
    if (blocked.has(w0)) return null;
    const words = texts.get(page)?.words ?? [];
    const path = words.length ? wordsBetween(words, w0, w1) : [w0];
    const fwd = path.length < 2 || path[path.length - 1] === w1;
    let end = w0;
    let endC = c1;
    for (const i of path) {
      if (blocked.has(i)) {
        endC = fwd ? Infinity : 0;
        break;
      }
      end = i;
      endC = i === w1 ? c1 : fwd ? Infinity : 0;
    }
    return { a: { w: w0, c: c0 }, b: { w: end, c: endC } };
  };
  const makeHighlight = (sel: { page: number; w0: number; w1: number; c0?: number; c1?: number; x0: number; y0: number; x1: number; y1: number }, color: HighlightColor) => {
    const words = texts.get(sel.page)?.words;
    if (words && sel.w0 >= 0) {
      const r = clampSel(sel.page, sel.w0, sel.c0 ?? 0, sel.w1, sel.c1 ?? Infinity);
      if (!r) return;
      // a drag left-to-right starts at its first character; right-to-left the other way round
      return p.onHighlights!(addWordRange(highlights, sel.page, r.a, r.b, uid('h'), color, words));
    }
    // free boxes only on pages with no readable text (a picture-only page); otherwise a drag over blank space or a
    // picture would paint a block over the page
    if (words && words.filter((w) => w.t.trim()).length >= 5) return;
    const b = boxFromDrag(sel.page, sel.x0, sel.y0, sel.x1, sel.y1, uid('h'), color);
    if (b) p.onHighlights!([...highlights, b]);
  };
  const dragRef = useRef<Drag | null>(null);
  const longTimer = useRef<number | null>(null);
  const lastPt = useRef({ x: 0, y: 0 });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const highlights = p.item?.highlights ?? [];
  const strikes = p.hideStrikes ? [] : (p.item?.strikes ?? []);
  const clickable = usesChoiceRegions(exam, question);
  const canMark = !p.readOnly && !!p.onHighlights;

  const choiceAt = (page: number, x: number, y: number): ChoiceRegion | null => {
    if (!clickable) return null;
    for (const c of question.choices ?? []) {
      if (c.page === page && x >= c.x - 0.03 && x <= c.x + c.w + 0.01 && y >= c.y && y <= c.y + c.h) return c;
    }
    return null;
  };
  const clearLong = () => {
    if (longTimer.current != null) window.clearTimeout(longTimer.current);
    longTimer.current = null;
  };
  const setD = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  const handlers = (segIndex: number, seg: Segment, api: () => PageApi | null): React.HTMLAttributes<HTMLDivElement> => ({
    onPointerDown: (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      lastPt.current = { x: e.clientX, y: e.clientY };
      setPending(null);
      const a = api();
      if (!a) return;
      const pt = a.toPage(e.clientX, e.clientY);
      const words = texts.get(seg.page)?.words;
      const ch = choiceAt(seg.page, pt.x, pt.y);
      const w = words ? wordAt(words, pt.x, pt.y) : -1;
      const c = w >= 0 && words ? charAt(words[w], pt.x) : 0;
      const d: Drag = { seg: segIndex, page: seg.page, x0: pt.x, y0: pt.y, cx: e.clientX, cy: e.clientY, x1: pt.x, y1: pt.y, moved: false, w0: w, w1: w, c0: c, c1: c, choice: ch?.letter ?? null, longDone: false };
      setD(d);
      if (e.pointerType === 'mouse') (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      clearLong();
      if (ch && p.onStrike && e.pointerType !== 'mouse') {
        // long-press on touch screens = strike out
        longTimer.current = window.setTimeout(() => {
          const cur = dragRef.current;
          if (cur && !cur.moved) {
            p.onStrike?.(ch.letter);
            setD({ ...cur, longDone: true });
          }
        }, 550);
      }
    },
    onPointerMove: (e) => {
      lastPt.current = { x: e.clientX, y: e.clientY };
      const d = dragRef.current;
      if (!d || d.seg !== segIndex) return;
      const a = api();
      if (!a) return;
      if (!d.moved && Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 5) return;
      clearLong();
      // a drag that starts on an answer choice never highlights
      if (!canMark || d.choice) return setD({ ...d, moved: true });
      const pt = a.toPage(e.clientX, e.clientY);
      const words = texts.get(seg.page)?.words;
      let w1 = d.w1;
      let c1 = d.c1;
      if (words && d.w0 >= 0) {
        const w = wordAt(words, pt.x, pt.y, 0.05);
        if (w >= 0) {
          w1 = w;
          c1 = charAt(words[w], pt.x);
        }
      }
      setD({ ...d, moved: true, x1: pt.x, y1: pt.y, w1, c1 });
    },
    onPointerUp: () => {
      const d = dragRef.current;
      clearLong();
      setD(null);
      if (!d || d.seg !== segIndex || d.longDone) return;
      const words = texts.get(seg.page)?.words;
      if (d.moved) {
        if (!canMark || d.choice) return;
        if (display.highlightMode === 'manual') {
          // keep the selection and ask for a color next to where the drag ended
          const box = rootRef.current?.getBoundingClientRect() ?? null;
          setPending({ seg: segIndex, page: d.page, w0: d.w0, w1: d.w1, c0: d.c0, c1: d.c1, x0: d.x0, y0: d.y0, x1: d.x1, y1: d.y1, px: lastPt.current.x - (box?.left ?? 0), py: lastPt.current.y - (box?.top ?? 0) });
          return;
        }
        makeHighlight(d, display.highlightColor);
        return;
      }
      setPending(null);
      // a plain click: remove a highlight, or select a choice
      const hit = canMark ? highlightAt(highlights, words, d.page, d.x0, d.y0) : null;
      if (hit && !d.choice) return p.onHighlights!(removeHighlight(highlights, hit.id));
      if (d.choice && !p.readOnly) return p.onSelect?.(d.choice);
      if (hit) p.onHighlights!(removeHighlight(highlights, hit.id));
    },
    onPointerCancel: () => {
      clearLong();
      setD(null);
    },
    onDoubleClick: (e) => {
      // double-click a word to highlight it (not on answer choices)
      const a = api();
      const words = texts.get(seg.page)?.words;
      if (!a || !words || !canMark) return;
      const pt = a.toPage(e.clientX, e.clientY);
      if (choiceAt(seg.page, pt.x, pt.y)) return;
      const w = wordAt(words, pt.x, pt.y, 0.004);
      if (w < 0 || blockedWords(seg.page).has(w)) return;
      if (display.highlightMode === 'manual') {
        const box = rootRef.current?.getBoundingClientRect() ?? null;
        setPending({ seg: segIndex, page: seg.page, w0: w, w1: w, x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, px: e.clientX - (box?.left ?? 0), py: e.clientY - (box?.top ?? 0) });
        return;
      }
      p.onHighlights!(addWordRange(highlights, seg.page, w, w, uid('h'), display.highlightColor, words));
    },
    onContextMenu: (e) => {
      const a = api();
      if (!a) return;
      const pt = a.toPage(e.clientX, e.clientY);
      const ch = choiceAt(seg.page, pt.x, pt.y);
      if (ch && p.onStrike) {
        e.preventDefault();
        if (e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType === 'touch') return; // handled by long-press
        if (!dragRef.current?.longDone) p.onStrike(ch.letter);
      } else if (clickable) e.preventDefault();
    },
  });

  return (
    <div ref={rootRef} className="no-select relative" data-testid="question-view" style={{ paddingLeft: clickable ? 34 : 0 }}>
      {question.segments.map((seg, i) => {
        const text = texts.get(seg.page);
        const crop = segmentRect(exam, seg, text);
        let apiRef: PageApi | null = null;
        return (
          <PageView
            key={`${exam.id}:${seg.page}:${i}`}
            examId={exam.id}
            doc={doc}
            page={seg.page}
            crop={crop}
            width={clickable ? width - 34 : width}
            style={{ touchAction: canMark ? 'pan-y pinch-zoom' : 'auto', cursor: canMark ? 'text' : 'default', marginBottom: i < question.segments.length - 1 ? 4 : 0 }}
            handlers={handlers(i, seg, () => apiRef)}
          >
            {(api) => {
              apiRef = api;
              const words = text?.words;
              const blocked = blockedWords(seg.page);
              const rectsOf = (h: Highlight): Rect[] => (h.kind === 'box' ? [h] : words ? rectsForRange(words, h.start, h.end, h.sc, h.ec, blocked) : []);
              const sel = drag && drag.seg === i && drag.moved ? drag : pending && pending.seg === i ? { ...pending, moved: true } : null;
              const live: Rect[] =
                sel && canMark
                  ? words && sel.w0 >= 0
                    ? (() => {
                        const r = clampSel(seg.page, sel.w0, sel.c0 ?? 0, sel.w1, sel.c1 ?? Infinity);
                        if (!r) return [];
                        const rk = readingOrder(words).rank;
                        const [x0, x1] = rk[r.a.w] < rk[r.b.w] || (r.a.w === r.b.w && r.a.c <= r.b.c) ? [r.a, r.b] : [r.b, r.a];
                        return rectsForRange(words, x0.w, x1.w, x0.c || undefined, x1.c === Infinity ? undefined : Math.max(x1.c, x0.w === x1.w ? x0.c + 1 : 1));
                      })()
                    : words && words.filter((w) => w.t.trim()).length >= 5
                      ? []
                      : [{ x: Math.min(sel.x0, sel.x1), y: Math.min(sel.y0, sel.y1), w: Math.abs(sel.x1 - sel.x0), h: Math.abs(sel.y1 - sel.y0) }]
                  : [];
              return (
                <>
                  {highlights
                    .filter((h) => h.page === seg.page)
                    .flatMap((h) =>
                      rectsOf(h).map((r, k) => (
                        <div key={h.id + k} data-testid="highlight" data-color={h.color ?? 'yellow'} style={{ ...api.pos(pad(r, h.kind === 'words')), background: HIGHLIGHT_RGBA[h.color ?? 'yellow'], mixBlendMode: 'multiply', pointerEvents: 'none' }} />
                      )),
                    )}
                  {live.map((r, k) => (
                    <div key={'live' + k} style={{ ...api.pos(pad(r, !!words && sel!.w0 >= 0)), background: display.highlightMode === 'manual' ? 'rgba(80, 140, 255, 0.28)' : HIGHLIGHT_RGBA[display.highlightColor], mixBlendMode: 'multiply', pointerEvents: 'none' }} />
                  ))}
                  {clickable &&
                    (question.choices ?? [])
                      .filter((c) => c.page === seg.page)
                      .map((c) => (
                        <ChoiceOverlay
                          key={c.letter}
                          c={c}
                          api={api}
                          selected={p.item?.answer === c.letter}
                          struck={strikes.includes(c.letter)}
                          reveal={p.revealKey}
                          interactive={!p.readOnly}
                          strikeX={Math.max(...(question.choices ?? []).filter((x) => x.page === seg.page).map((x) => x.x + x.w))}
                          onStrike={!p.readOnly && p.onStrike ? p.onStrike : undefined}
                        />
                      ))}
                  {p.selectableText && words && <TextLayer words={words} api={api} />}
                  <FigureLayer examId={exam.id} doc={doc} page={seg.page} pt={text} api={api} onOpen={(r) => setZoomed({ page: seg.page, rect: r })} />
                </>
              );
            }}
          </PageView>
        );
      })}
      {pending && p.onHighlights && (
        <div
          className="absolute z-30 flex items-center gap-1 border border-gray-500 bg-white p-1 shadow-md"
          style={{ left: Math.max(0, pending.px - 70), top: pending.py + 14 }}
          data-testid="highlight-picker"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {HIGHLIGHT_COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Highlight ${c}`} data-testid={`pick-${c}`} className="h-6 w-6" style={{ background: HIGHLIGHT_SWATCH[c], outline: c === display.highlightColor ? '2px solid #1f2d3d' : 'none' }} onClick={() => { makeHighlight(pending, c); setPending(null); }} />
          ))}
          <button type="button" aria-label="Cancel" className="px-1 text-sm text-gray-600" onClick={() => setPending(null)}>
            ✕
          </button>
        </div>
      )}
      {zoomed && <ImageZoom doc={doc} page={zoomed.page} rect={zoomed.rect} onClose={() => setZoomed(null)} />}
    </div>
  );
}

function pad(r: Rect, words: boolean): Rect {
  return words ? { x: r.x - 0.002, y: r.y - r.h * 0.12, w: r.w + 0.004, h: r.h * 1.24 } : r;
}

function ChoiceOverlay({ c, api, selected, struck, reveal, interactive, strikeX, onStrike }: { c: ChoiceRegion; api: PageApi; selected: boolean; struck: boolean; reveal?: string | null; interactive: boolean; strikeX: number; onStrike?: (l: string) => void }) {
  const isKey = !!reveal && reveal === c.letter;
  const wrong = !!reveal && selected && !isKey;
  const pxPerY = api.height / api.crop.h;
  const pxPerX = api.width / api.crop.w;
  const leftPct = ((c.x - api.crop.x) / api.crop.w) * 100;
  const topPct = ((c.y - api.crop.y) / api.crop.h) * 100;
  // radio: on top of the page's own circle when there is one, otherwise just left of the label
  let radio: { left: string; top: string; size: number };
  if (c.radio) {
    // exactly over the page's own circle: same centre, just large enough to cover its ring
    const size = Math.max(10, Math.min(44, Math.max(c.radio.h * pxPerY, c.radio.w * pxPerX) + 2));
    radio = {
      left: `calc(${((c.radio.x + c.radio.w / 2 - api.crop.x) / api.crop.w) * 100}% - ${size / 2}px)`,
      top: `calc(${((c.radio.y + c.radio.h / 2 - api.crop.y) / api.crop.h) * 100}% - ${size / 2}px)`,
      size,
    };
  } else {
    const firstLine = Math.min(c.h * pxPerY, 30);
    const size = Math.max(11, Math.min(18, firstLine * 0.62));
    radio = { left: `calc(${leftPct}% - ${size + 8}px)`, top: `calc(${topPct}% + ${(Math.min(c.h * pxPerY, firstLine * 1.1) - size) / 2}px)`, size };
  }
  const r = radio.size;
  return (
    <>
      <div
        data-testid={`choice-${c.letter}`}
        data-selected={selected ? '1' : '0'}
        data-struck={struck ? '1' : '0'}
        title={interactive ? `Choice ${c.letter}: click to select, right-click to strike out` : undefined}
        style={{
          ...api.pos({ x: c.x - 0.004, y: c.y, w: c.w + 0.008, h: c.h }),
          background: isKey ? 'rgba(46,125,30,0.20)' : wrong ? 'rgba(220,38,38,0.16)' : struck ? 'rgba(255,255,255,0.6)' : 'transparent',
          outline: isKey ? '2px solid #2e7d1e' : wrong ? '2px solid #dc2626' : 'none',
          cursor: interactive ? 'pointer' : 'default',
        }}
      >
        {struck && <div style={{ position: 'absolute', left: c.radio ? `${((c.radio.x + c.radio.w - c.x + 0.004) / (c.w + 0.008)) * 100}%` : `${(0.007 / (c.w + 0.008)) * 100}%`, right: 0, top: '50%', borderTop: '2px solid #333' }} />}
      </div>
      <div
        style={{
          position: 'absolute',
          left: radio.left,
          top: radio.top,
          width: r,
          height: r,
          borderRadius: '50%',
          border: `${r > 16 ? 2 : 1.5}px solid ${struck ? '#999' : '#444'}`,
          background: '#fff',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected && <div style={{ width: r * 0.56, height: r * 0.56, borderRadius: '50%', background: wrong ? '#dc2626' : isKey ? '#2e7d1e' : '#1c4973' }} />}
      </div>
      {onStrike && (
        <button
          type="button"
          data-testid={`strike-${c.letter}`}
          aria-label={`${struck ? 'Undo strike-out of' : 'Strike out'} choice ${c.letter}`}
          title={struck ? 'Undo strike-out' : 'Strike out this choice'}
          aria-pressed={struck}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onStrike(c.letter);
          }}
          className="px-1 leading-none"
          style={{
            position: 'absolute',
            left: `calc(${((Math.min(strikeX, api.crop.x + api.crop.w) - api.crop.x) / api.crop.w) * 100}% + 10px)`,
            top: radio.top,
            height: r,
            fontSize: Math.max(12, r * 0.85),
            textDecoration: 'line-through',
            color: struck ? '#1c4973' : '#777',
            fontWeight: struck ? 700 : 400,
            zIndex: 2,
          }}
        >
          ab
        </button>
      )}
      {reveal && (isKey || wrong) && (
        <div style={{ position: 'absolute', left: `calc(${radio.left} - ${r + 4}px)`, top: radio.top, fontWeight: 700, fontSize: r, lineHeight: 1, color: isKey ? '#2e7d1e' : '#dc2626', pointerEvents: 'none' }}>
          {isKey ? '✓' : '✗'}
        </div>
      )}
    </>
  );
}

/** Invisible but selectable text aligned over the page image. */
function TextLayer({ words, api }: { words: PageText['words']; api: PageApi }) {
  return (
    <div className="text-layer" style={{ position: 'absolute', inset: 0, userSelect: 'text', WebkitUserSelect: 'text' }} data-testid="text-layer">
      {words.map((w, i) => {
        const fs = Math.max(4, (w.h / api.crop.h) * api.height * 0.92);
        const targetW = (w.w / api.crop.w) * api.width;
        const natural = w.t.length * fs * 0.5 || 1;
        return (
          <span
            key={i}
            style={{
              left: `${((w.x - api.crop.x) / api.crop.w) * 100}%`,
              top: `${((w.y - api.crop.y) / api.crop.h) * 100}%`,
              fontSize: fs,
              fontFamily: 'Arial, sans-serif',
              transform: `scaleX(${Math.max(0.3, Math.min(3, targetW / natural))})`,
            }}
          >
            {w.t + ' '}
          </span>
        );
      })}
    </div>
  );
}
