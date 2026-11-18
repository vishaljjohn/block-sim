import { useState } from 'react';
import { chooseFolder, loadPickedFiles, pickerSupported, reconnect, type Kind } from '../lib/localLibrary';

/** "Link a folder" card: Chrome/Edge remember it; other browsers pick it each visit. */
export function FolderConnect({ kind, needsPermission, name }: { kind: Kind; needsPermission: boolean; name: string | null }) {
  const [err, setErr] = useState('');
  const what = kind === 'videos' ? 'videos' : 'books and documents';
  const exts = kind === 'videos' ? 'MP4, WebM, MOV or M4V' : 'PDF, HTML, text, Markdown or image';
  return (
    <div className="mx-auto max-w-[640px] border-2 border-dashed p-10 text-center" style={{ borderColor: 'var(--line)' }} data-testid={`${kind}-connect`}>
      <div className="mb-2 text-[22px] font-bold" style={{ fontFamily: 'var(--serif)' }}>{needsPermission ? `Reconnect “${name}”` : `Link your ${kind === 'videos' ? 'video' : 'library'} folder`}</div>
      <p className="mb-6 text-[14px]" style={{ color: 'var(--ink-2)' }}>
        {needsPermission
          ? 'Your browser asks again after a restart before this app may read the folder.'
          : `Choose a folder on this computer with your ${what} (${exts} files). Each subfolder becomes a ${kind === 'videos' ? 'section' : 'book or chapter'}. The files are read where they are: nothing is copied or uploaded.`}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {needsPermission ? (
          <button className="btn-primary btn-caps" onClick={() => void reconnect(kind, true).catch((e) => setErr(String(e)))} data-testid={`${kind}-reconnect`}>Reconnect folder</button>
        ) : pickerSupported() ? (
          <button className="btn-primary btn-caps" onClick={() => void chooseFolder(kind).catch((e) => (e as Error)?.name !== 'AbortError' && setErr(String(e)))} data-testid={`${kind}-choose`}>Choose folder</button>
        ) : null}
        <label className="btn btn-caps cursor-pointer">
          {pickerSupported() ? 'Pick files instead' : 'Choose folder'}
          {/* fallback for browsers without folder access: works for this visit */}
          <input type="file" className="hidden" multiple {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={(e) => loadPickedFiles(kind, e.target.files)} data-testid={`${kind}-input`} />
        </label>
      </div>
      {!pickerSupported() && <p className="mt-4 text-[12px]" style={{ color: 'var(--ink-3)' }}>This browser can’t remember folders, so you’ll pick it again next visit. Chrome or Edge remember it.</p>}
      {err && <p className="mt-3 text-[13px]" style={{ color: 'var(--bad)' }}>{err}</p>}
    </div>
  );
}
