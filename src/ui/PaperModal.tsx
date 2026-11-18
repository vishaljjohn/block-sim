import { useEffect, type ReactNode } from 'react';

/** A dialog in the paper style: serif title, close cross, optional footer. */
export function PaperModal({ title, children, onClose, footer, width = 560, testId }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; width?: number; testId?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgb(26 46 59 / 0.45)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div className="flex max-h-[90vh] w-full flex-col border-2 shadow-2xl" style={{ maxWidth: width, background: 'var(--bg)', borderColor: 'var(--line)', color: 'var(--ink)' }} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} data-testid={testId}>
        <div className="flex items-center justify-between border-b-2 px-5 py-4" style={{ borderColor: 'var(--line)' }}>
          <h2 className="text-[18px] font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-[22px] leading-none" style={{ color: 'var(--ink-2)' }}>
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[14px]">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t-2 px-5 py-3" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
