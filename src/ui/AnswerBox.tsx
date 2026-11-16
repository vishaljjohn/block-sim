import { useRef } from 'react';
import { Check, Cross } from './icons';

interface Props {
  letters: string[];
  answer: string | null;
  strikes: string[];
  readOnly?: boolean;
  revealKey?: string | null;
  onSelect?: (l: string) => void;
  onStrike?: (l: string) => void;
  onCount?: (delta: number) => void;
  compact?: boolean;
}

/** Bubble answer panel styled like the reference choice box (thin border, heavy navy bottom edge). */
export function AnswerBox({ letters, answer, strikes, readOnly, revealKey, onSelect, onStrike, onCount }: Props) {
  const long = useRef<number | null>(null);
  const longFired = useRef(false);
  return (
    <div className="inline-block border border-navy bg-white" style={{ borderBottomWidth: 5, minWidth: 132 }} data-testid="answer-box" role="radiogroup" aria-label="Answer choices">
      {letters.map((l) => {
        const struck = strikes.includes(l);
        const sel = answer === l;
        const isKey = !!revealKey && revealKey === l;
        const wrong = !!revealKey && sel && !isKey;
        return (
          <div
            key={l}
            className="flex items-center gap-1 px-1.5"
            style={{ background: isKey ? '#2e7d1e' : wrong ? '#fde2e2' : undefined, color: isKey ? '#fff' : undefined }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (!longFired.current) onStrike?.(l);
            }}
          >
            <span className="inline-flex w-4 justify-center">{revealKey ? isKey ? <Check color={isKey ? '#fff' : undefined} /> : wrong ? <Cross /> : null : null}</span>
            <button
              type="button"
              role="radio"
              aria-checked={sel}
              aria-label={`Choice ${l}${struck ? ' (struck out)' : ''}`}
              data-testid={`bubble-${l}`}
              data-selected={sel ? '1' : '0'}
              data-struck={struck ? '1' : '0'}
              disabled={readOnly}
              className="flex flex-1 items-center gap-2 py-[5px] text-left text-[15px]"
              onClick={() => {
                if (longFired.current) return void (longFired.current = false);
                onSelect?.(l);
              }}
              onPointerDown={(e) => {
                longFired.current = false;
                if (e.pointerType === 'mouse' || !onStrike) return;
                long.current = window.setTimeout(() => {
                  longFired.current = true;
                  onStrike(l);
                }, 550);
              }}
              onPointerUp={() => long.current != null && window.clearTimeout(long.current)}
              onPointerLeave={() => long.current != null && window.clearTimeout(long.current)}
            >
              <span className="inline-flex h-[15px] w-[15px] items-center justify-center rounded-full border border-gray-600 bg-white">
                {sel && <span className="h-[8px] w-[8px] rounded-full" style={{ background: wrong ? '#dc2626' : '#1c4973' }} />}
              </span>
              <span style={{ textDecoration: struck ? 'line-through' : undefined, color: struck && !isKey ? '#8a8a8a' : undefined }}>{l}.</span>
            </button>
            {onStrike && (
              <button
                type="button"
                className="px-1 text-xs"
                style={{ textDecoration: 'line-through', color: isKey ? '#dfe' : struck ? '#bbb' : '#666' }}
                title="Strike out this choice (or right-click it)"
                aria-label={`Strike out choice ${l}`}
                data-testid={`strike-${l}`}
                onClick={() => onStrike(l)}
              >
                ab
              </button>
            )}
          </div>
        );
      })}
      {onCount && (
        <div className="flex items-center justify-between border-t border-gray-300 px-1.5 py-0.5 text-xs text-gray-600">
          <span>choices</span>
          <span>
            <button type="button" className="px-1.5 font-bold" aria-label="Fewer choices" onClick={() => onCount(-1)}>
              −
            </button>
            <button type="button" className="px-1.5 font-bold" aria-label="More choices" data-testid="more-choices" onClick={() => onCount(1)}>
              +
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
