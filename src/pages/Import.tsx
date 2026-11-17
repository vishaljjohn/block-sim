import { useEffect, useRef, useState } from 'react';
import { fixedLayout, formatPageList, parsePageList, readKeyFromText } from '../lib/importer';
import { openPdf, type PdfDoc } from '../lib/pdf';
import { importExam, type KeySource } from '../lib/importRun';
import { db } from '../db';
import { go, useLive } from '../ui/hooks';
import { H1, H2 } from '../ui/Shell';
import { FolderImport } from './FolderImport';

export function ImportPage() {
  const [mode, setMode] = useState<'one' | 'folder'>(() => (window.location.hash.includes('folder=1') ? 'folder' : 'one'));
  const cats = useLive(async () => [...new Set((await db.exams.toArray()).map((e) => e.subject).filter(Boolean))].sort(), []);
  const [file, setFile] = useState<File | null>(null);
  const [buf, setBuf] = useState<ArrayBuffer | null>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [layout, setLayout] = useState<'auto' | 'fixed'>('auto');
  const [per, setPer] = useState(1);
  const [start, setStart] = useState(1);
  const [skip, setSkip] = useState('');
  const [source, setSource] = useState<KeySource>('pdf');
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [keyStart, setKeyStart] = useState('');
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState('');
  const [drag, setDrag] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!file) return;
    let live = true;
    setErr('');
    setDoc(null);
    (async () => {
      try {
        const b = await file.arrayBuffer();
        const d = await openPdf(b);
        if (!live) return;
        setBuf(b);
        setDoc(d);
        setName((n) => n || file.name.replace(/\.pdf$/i, ''));
      } catch (e) {
        if (live) setErr('This file could not be opened as a PDF. ' + String((e as Error)?.message ?? ''));
      }
    })();
    return () => {
      live = false;
    };
  }, [file]);

  const pageCount = doc?.numPages ?? 0;
  const keyStartN = source === 'same' ? parseInt(keyStart, 10) || 0 : 0;
  const endPage = keyStartN > 1 ? keyStartN - 1 : pageCount;
  const skipList = parsePageList(skip, pageCount);
  const preview = doc ? fixedLayout('x', { pagesPerQuestion: per, startPage: start, endPage, skip: skipList }).length : 0;
  const pasteCount = source === 'paste' && paste.trim() ? readKeyFromText(paste).entries.length : 0;

  const run = async () => {
    if (!doc || !buf || !file) return;
    setErr('');
    try {
      cancelRef.current = { cancelled: false };
      const r = await importExam(
        {
          question: buf,
          name: name.trim() || file.name,
          category: subject.trim(),
          layout,
          perQuestion: per,
          startPage: start,
          skip: skipList,
          keySource: source,
          keyPdf: source === 'pdf' && keyFile ? await keyFile.arrayBuffer() : undefined,
          keyStartPage: keyStartN,
          keyText: paste,
          sourceName: file.name,
          keySourceName: keyFile?.name,
          cancel: cancelRef.current,
        },
        (msg, ocr) => {
          setBusy(msg);
          setOcrRunning(!!ocr);
        },
      );
      setBusy('');
      setOcrRunning(false);
      const q = new URLSearchParams();
      if (r.note) q.set('note', r.note);
      if (r.keyFound != null) q.set('found', String(r.keyFound));
      go(`/exam/${r.exam.id}/key?${q.toString()}`);
    } catch (e) {
      setBusy('');
      setOcrRunning(false);
      setErr(String((e as Error)?.message ?? e));
    }
  };

  return (
    <div data-testid="import-page">
      <H1>Import</H1>
      <p className="mb-3 border border-gray-400 bg-gray-50 p-2 text-sm" data-testid="import-note">
        Only import materials you have the right to use. Everything stays on this device.
      </p>
      <div className="mb-4 flex gap-2" role="tablist">
        <button role="tab" aria-selected={mode === 'one'} className={mode === 'one' ? 'btn-primary' : 'btn'} onClick={() => setMode('one')} data-testid="mode-one">One exam</button>
        <button role="tab" aria-selected={mode === 'folder'} className={mode === 'folder' ? 'btn-primary' : 'btn'} onClick={() => setMode('folder')} data-testid="mode-folder">A whole folder of exams</button>
      </div>
      {mode === 'folder' ? (
        <FolderImport />
      ) : (
      <>

      <H2>1. Question PDF</H2>
      <div
        className="border-2 border-dashed p-4 text-sm"
        style={{ borderColor: drag ? '#1c4973' : '#888', background: drag ? '#eef3f8' : '#fff' }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) setFile(f);
        }}
      >
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" data-testid="question-file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Question PDF" />
        <div className="mt-1 text-gray-600">Choose the PDF with the questions, or drop it here.</div>
        {doc && file && (
          <div className="mt-2 font-bold" data-testid="pdf-info">
            {file.name}: {pageCount} pages
          </div>
        )}
      </div>
      {doc && (
        <>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <label>
              Exam name
              <input className="field ml-2 w-72" value={name} onChange={(e) => setName(e.target.value)} data-testid="exam-name" />
            </label>
            <label>
              Folder
              <input className="field ml-2 w-44" list="folder-names" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Surgery" data-testid="exam-folder" />
              <datalist id="folder-names">
                {(cats ?? []).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
          </div>

          <H2>2. How are the questions laid out?</H2>
          <div className="space-y-1 text-sm">
            <label className="block">
              <input type="radio" name="layout" checked={layout === 'auto'} onChange={() => setLayout('auto')} data-testid="layout-auto" /> <b>Work it out for me</b> (recommended). Test Simulator reads the question numbers on the pages. Falls back to one page per question when it cannot.
            </label>
            <label className="block">
              <input type="radio" name="layout" checked={layout === 'fixed'} onChange={() => setLayout('fixed')} data-testid="layout-fixed" /> <b>Fixed</b>: exactly
              <input className="field mx-1 w-14" type="number" min={1} max={20} value={per} onChange={(e) => { setPer(Math.max(1, parseInt(e.target.value, 10) || 1)); setLayout('fixed'); }} data-testid="per-question" aria-label="Pages per question" />
              page(s) per question
            </label>
            <div className="flex flex-wrap gap-4 pl-5 pt-1">
              <label>
                First question page
                <input className="field ml-1 w-16" type="number" min={1} max={pageCount} value={start} onChange={(e) => setStart(Math.max(1, parseInt(e.target.value, 10) || 1))} data-testid="start-page" />
              </label>
              <label>
                Pages to skip
                <input className="field ml-1 w-40" value={skip} onChange={(e) => setSkip(e.target.value)} placeholder="e.g. 3, 12-14" data-testid="skip-pages" />
              </label>
              {skipList.length > 0 && <span className="text-gray-600">skipping {formatPageList(skipList)}</span>}
            </div>
            <div className="pl-5 text-gray-700" data-testid="layout-preview">
              {layout === 'fixed' ? `${preview} questions.` : `Up to ${preview} question pages. You can adjust the result afterwards.`}
            </div>
          </div>

          <H2>3. Where is the answer key?</H2>
          <div className="space-y-2 text-sm">
            <label className="block">
              <input type="radio" name="src" checked={source === 'pdf'} onChange={() => setSource('pdf')} data-testid="src-pdf" /> A separate PDF
              {source === 'pdf' && <input className="ml-3" type="file" accept="application/pdf,.pdf" onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)} data-testid="key-file" aria-label="Answer key PDF" />}
            </label>
            <label className="block">
              <input type="radio" name="src" checked={source === 'same'} onChange={() => setSource('same')} data-testid="src-same" /> At the end of this same PDF
              {source === 'same' && (
                <span className="ml-3">
                  key starts on page
                  <input className="field ml-1 w-16" type="number" min={1} max={pageCount} value={keyStart} onChange={(e) => setKeyStart(e.target.value)} data-testid="key-start" />
                </span>
              )}
            </label>
            <label className="block">
              <input type="radio" name="src" checked={source === 'inline'} onChange={() => setSource('inline')} data-testid="src-inline" /> After each question (for example “Answer: C” under the choices). The answer is hidden while you take the exam.
            </label>
            <label className="block">
              <input type="radio" name="src" checked={source === 'paste'} onChange={() => setSource('paste')} data-testid="src-paste" /> I will paste or type it
            </label>
            {source === 'paste' && (
              <div className="pl-5">
                <textarea className="field h-32 w-full max-w-xl font-mono" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'1 C, 2 A, 3 B …\nor one letter per line\nor  1. C. explanation text'} data-testid="key-paste" aria-label="Pasted answer key" />
                <div className="text-gray-700" data-testid="paste-count">{paste.trim() ? `${pasteCount} answers recognised.` : 'Formats like “1 C, 2 A”, “1. C”, or one letter per line all work.'}</div>
              </div>
            )}
            <label className="block">
              <input type="radio" name="src" checked={source === 'none'} onChange={() => setSource('none')} data-testid="src-none" /> No key yet. I will type the answers on the next screen.
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className="btn-primary px-5 py-2" disabled={!!busy || (source === 'pdf' && !keyFile) || (source === 'same' && !(keyStartN >= 2))} onClick={run} data-testid="import-go">
              Continue: check the answer key
            </button>
            {busy && <span className="text-sm" data-testid="import-busy">{busy}</span>}
            {ocrRunning && (
              <button className="btn" data-testid="skip-ocr" onClick={() => (cancelRef.current.cancelled = true)} title="Use one page per question now; text recognition finishes in the background">
                Skip waiting
              </button>
            )}
          </div>
          {source === 'pdf' && !keyFile && <div className="mt-1 text-xs text-gray-600">Choose the answer key PDF above, or pick another option.</div>}
        </>
      )}
      {err && <div className="mt-3 border border-red-700 bg-red-50 p-2 text-sm" role="alert" data-testid="import-error">{err}</div>}
      </>
      )}
    </div>
  );
}
