import { useRef } from 'react';
import type { HighlightColor } from '../types';
import { HIGHLIGHT_RGBA } from '../lib/display';

export interface TextHighlight {
  s: number;
  e: number;
  color?: HighlightColor;
}

/** Add a range, merging with touching ranges of the same color. */
export function addTextRange(list: TextHighlight[], s: number, e: number, color: HighlightColor): TextHighlight[] {
  let a = Math.min(s, e);
  let b = Math.max(s, e);
  const rest: TextHighlight[] = [];
  for (const h of list) {
    if ((h.color ?? 'yellow') === color && h.s <= b && h.e >= a) {
      a = Math.min(a, h.s);
      b = Math.max(b, h.e);
    } else rest.push(h);
  }
  return [...rest, { s: a, e: b, ...(color !== 'yellow' ? { color } : {}) }].sort((x, y) => x.s - y.s);
}

/**
 * Plain text (paragraphs separated by blank lines) where the user can select words to highlight them; clicking a
 * highlight removes it. Offsets refer to the original string, so highlights survive re-rendering.
 */
export function HighlightableText({ text, highlights, color, onChange, testId }: { text: string; highlights: TextHighlight[]; color: HighlightColor; onChange?: (h: TextHighlight[]) => void; testId?: string }) {
  const root = useRef<HTMLDivElement | null>(null);
  // split into paragraphs, keeping each paragraph's start offset in the full text
  const paras: { start: number; text: string }[] = [];
  const re = /\n{2,}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    paras.push({ start: last, text: text.slice(last, m.index) });
    last = m.index + m[0].length;
  }
  paras.push({ start: last, text: text.slice(last) });

  const offsetOf = (node: Node, off: number): number | null => {
    const el = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element))?.closest('[data-o]') as HTMLElement | null;
    if (!el || !root.current?.contains(el)) return null;
    return Number(el.dataset.o) + (node.nodeType === Node.TEXT_NODE ? off : 0);
  };
  const onUp = () => {
    if (!onChange) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    const a = offsetOf(r.startContainer, r.startOffset);
    const b = offsetOf(r.endContainer, r.endOffset);
    if (a == null || b == null || a === b) return;
    onChange(addTextRange(highlights, a, b, color));
    sel.removeAllRanges();
  };
  const segments = (p: { start: number; text: string }) => {
    const end = p.start + p.text.length;
    const cuts = new Set([p.start, end]);
    for (const h of highlights) {
      if (h.e > p.start && h.s < end) {
        cuts.add(Math.max(p.start, h.s));
        cuts.add(Math.min(end, h.e));
      }
    }
    const pts = [...cuts].sort((x, y) => x - y);
    return pts.slice(0, -1).map((s, i) => {
      const e = pts[i + 1];
      const h = highlights.find((x) => x.s <= s && x.e >= e);
      return { s, e, h };
    });
  };
  return (
    <div ref={root} onMouseUp={onUp} onTouchEnd={onUp} data-testid={testId} style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
      {paras.map((p, i) => (
        <p key={i} className="mb-3 whitespace-pre-wrap">
          {segments(p).map((g) =>
            g.h ? (
              <mark
                key={g.s}
                data-o={g.s}
                data-testid="expl-highlight"
                title={onChange ? 'Click to remove this highlight' : undefined}
                style={{ background: HIGHLIGHT_RGBA[g.h.color ?? 'yellow'], color: 'inherit', cursor: onChange ? 'pointer' : 'text' }}
                onClick={() => onChange?.(highlights.filter((x) => x !== g.h))}
              >
                {text.slice(g.s, g.e)}
              </mark>
            ) : (
              <span key={g.s} data-o={g.s}>
                {text.slice(g.s, g.e)}
              </span>
            ),
          )}
        </p>
      ))}
    </div>
  );
}
