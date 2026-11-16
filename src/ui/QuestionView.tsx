import { useRef, useState } from 'react';
import type { AttemptItem, ChoiceRegion, Exam, Highlight, PageText, Question, Rect, Segment } from '../types';
import type { PdfDoc } from '../lib/pdf';
import { segmentRect, usesChoiceRegions } from '../lib/layout';
import { addWordRange, boxFromDrag, highlightAt, rectsForRange, removeHighlight, wordAt } from '../lib/highlights';
import { uid } from '../db';
import { PageView, type PageApi } from './PageView';

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
  choice: string | null;
  longDone: boolean;
}

export function QuestionView(p: QuestionViewProps) {
  const { exam, question, doc, texts, width } = p;
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const longTimer = useRef<number | null>(null);
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
      const a = api();
      if (!a) return;
      const pt = a.toPage(e.clientX, e.clientY);
      const words = texts.get(seg.page)?.words;
      const ch = choiceAt(seg.page, pt.x, pt.y);
      const w = words ? wordAt(words, pt.x, pt.y) : -1;
      const d: Drag = { seg: segIndex, page: seg.page, x0: pt.x, y0: pt.y, cx: e.clientX, cy: e.clientY, x1: pt.x, y1: pt.y, moved: false, w0: w, w1: w, choice: ch?.letter ?? null, longDone: false };
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
      const d = dragRef.current;
      if (!d || d.seg !== segIndex) return;
      const a = api();
      if (!a) return;
      if (!d.moved && Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 5) return;
      clearLong();
      if (!canMark) return setD({ ...d, moved: true });
      const pt = a.toPage(e.clientX, e.clientY);
      const words = texts.get(seg.page)?.words;
      let w1 = d.w1;
      if (words && d.w0 >= 0) {
        const w = wordAt(words, pt.x, pt.y, 0.05);
        if (w >= 0) w1 = w;
      }
      setD({ ...d, moved: true, x1: pt.x, y1: pt.y, w1 });
    },
    onPointerUp: () => {
      const d = dragRef.current;
      clearLong();
      setD(null);
      if (!d || d.seg !== segIndex || d.longDone) return;
      const words = texts.get(seg.page)?.words;
      if (d.moved) {
        if (!canMark) return;
        if (words && d.w0 >= 0) p.onHighlights!(addWordRange(highlights, d.page, d.w0, d.w1, uid('h')));
        else {
          const b = boxFromDrag(d.page, d.x0, d.y0, d.x1, d.y1, uid('h'));
          if (b) p.onHighlights!([...highlights, b]);
        }
        return;
      }
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
    <div className="no-select" data-testid="question-view" style={{ paddingLeft: clickable ? 34 : 0 }}>
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
              const rectsOf = (h: Highlight): Rect[] => (h.kind === 'box' ? [h] : words ? rectsForRange(words, h.start, h.end) : []);
              const live: Rect[] =
                drag && drag.seg === i && drag.moved && canMark
                  ? words && drag.w0 >= 0
                    ? rectsForRange(words, Math.min(drag.w0, drag.w1), Math.max(drag.w0, drag.w1))
                    : [{ x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) }]
                  : [];
              return (
                <>
                  {highlights
                    .filter((h) => h.page === seg.page)
                    .flatMap((h) =>
                      rectsOf(h).map((r, k) => (
                        <div key={h.id + k} data-testid="highlight" style={{ ...api.pos(pad(r, h.kind === 'words')), background: 'rgba(255, 235, 0, 0.42)', mixBlendMode: 'multiply', pointerEvents: 'none' }} />
                      )),
                    )}
                  {live.map((r, k) => (
                    <div key={'live' + k} style={{ ...api.pos(pad(r, !!words && drag!.w0 >= 0)), background: 'rgba(255, 235, 0, 0.42)', mixBlendMode: 'multiply', pointerEvents: 'none' }} />
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
                        />
                      ))}
                  {p.selectableText && words && <TextLayer words={words} api={api} />}
                </>
              );
            }}
          </PageView>
        );
      })}
    </div>
  );
}

function pad(r: Rect, words: boolean): Rect {
  return words ? { x: r.x - 0.002, y: r.y - r.h * 0.12, w: r.w + 0.004, h: r.h * 1.24 } : r;
}

function ChoiceOverlay({ c, api, selected, struck, reveal, interactive }: { c: ChoiceRegion; api: PageApi; selected: boolean; struck: boolean; reveal?: string | null; interactive: boolean }) {
  const isKey = !!reveal && reveal === c.letter;
  const wrong = !!reveal && selected && !isKey;
  const pxPerY = api.height / api.crop.h;
  const pxPerX = api.width / api.crop.w;
  const leftPct = ((c.x - api.crop.x) / api.crop.w) * 100;
  const topPct = ((c.y - api.crop.y) / api.crop.h) * 100;
  // radio: on top of the page's own circle when there is one, otherwise just left of the label
  let radio: { left: string; top: string; size: number };
  if (c.radio) {
    const size = Math.max(10, Math.min(26, c.radio.h * pxPerY * 1.15, c.radio.w * pxPerX * 1.15));
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
        {struck && <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: '2px solid #333' }} />}
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
