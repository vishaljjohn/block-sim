import { useState } from 'react';
import { db } from '../db';
import { useLive } from './hooks';

const NEW = '__new__';
/** Folders people usually want, offered even before any exam uses them. */
export const SUGGESTED_FOLDERS = ['Internal Medicine', 'Surgery', 'OBGYN', 'Pediatrics', 'Neurology', 'Psychiatry', 'Family Medicine', 'Emergency Medicine'];

/**
 * Choose a Library folder: a dropdown of the folders in use (plus common ones), "No folder", or "New folder…" to type
 * any name.
 */
export function FolderPicker({ value, onChange, testId, className = '' }: { value: string; onChange: (v: string) => void; testId?: string; className?: string }) {
  const used = useLive(() => db.exams.toArray().then((es) => [...new Set(es.map((e) => e.subject?.trim()).filter((s): s is string => !!s))]), []) ?? [];
  const options = [...new Set([...used, ...SUGGESTED_FOLDERS])].sort((a, b) => a.localeCompare(b));
  const known = !value || options.includes(value);
  const [typing, setTyping] = useState(!known);
  return (
    <span className={'inline-flex flex-wrap items-center gap-2 ' + className}>
      <select
        className="field"
        value={typing ? NEW : value}
        onChange={(e) => {
          if (e.target.value === NEW) {
            setTyping(true);
            onChange('');
          } else {
            setTyping(false);
            onChange(e.target.value);
          }
        }}
        data-testid={testId}
        aria-label="Folder"
      >
        <option value="">No folder</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={NEW}>New folder…</option>
      </select>
      {typing && <input className="field w-48" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Folder name" autoFocus data-testid={testId ? `${testId}-name` : undefined} aria-label="New folder name" />}
    </span>
  );
}
