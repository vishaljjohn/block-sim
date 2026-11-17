import { useEffect, useRef, useState } from 'react';
import { fixedLayout, formatPageList, parsePageList, readKeyFromText } from '../lib/importer';
import { openPdf, type PdfDoc } from '../lib/pdf';
import { importExam, type KeySource } from '../lib/importRun';
import { go } from '../ui/hooks';
import { H1, H2 } from '../ui/Shell';
import { FolderPicker } from '../ui/FolderPicker';
import { FolderImport } from './FolderImport';
import { blocksToPdf, countInlineAnswers, countQuestions, docxToBlocks, textToBlocks, type Block } from '../lib/textExam';

export function ImportPage() {
  const [mode, setMode] = useState<'one' | 'folder'>(() => (window.location.hash.includes('folder=1') ? 'folder' : 'one'));
  const [file, setFile] = useState<File | null>(null);
  const [qsrc, setQsrc] = useState<'pdf' | 'doc' | 'paste'>('pdf');
  const [qText, setQText] = useState('');
  const [making, setMaking] = useState('');
  const [made, setMade] = useState('');
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

  /** text or Word → an exam PDF made here, then the usual import */
  const fromBlocks = async (blocks: Block[], title: string, what = 'text') => {
    setErr('');
    setMaking('Making the exam…');
    try {
      if (!blocks.some((b) => b.kind === 'p')) throw new Error('No text was found.');
      const n = countQuestions(blocks);
      if (!n) throw new Error('no numbered questions were found. Start each question with its number, like “1.” or “Question 1:”, and number them in order.');
      const bytes = await blocksToPdf(blocks, title);
      if (countInlineAnswers(blocks) >= Math.max(1, Math.floor(n / 2))) setSource('inline');
      else if (source === 'pdf' || source === 'same') setSource('paste');
      setLayout('auto');
      setMade(what);
      setName((v) => v || title);
      setFile(new File([bytes as BlobPart], title.replace(/[\\/:*?"<>|]+/g, '_') + '.pdf', { type: 'application/pdf' }));
    } catch (e) {
      setErr('Could not read the questions: ' + String((e as Error)?.message ?? e));
    } finally {
      setMaking('');
    }
  };
  const pickAny = async (f: File) => {
    const ext = /\.([a-z0-9]+)$/i.exec(f.name)?.[1]?.toLowerCase() ?? '';
    const base = f.name.replace(/\.[^.]+$/, '');
    if (ext === 'pdf' || f.type === 'application/pdf') {
      setMade('');
      setFile(f);
    } else if (ext === 'docx') {
      setMaking('Reading the Word file…');
      await fromBlocks(await docxToBlocks(await f.arrayBuffer()).catch((e) => { setMaking(''); throw e; }), base, 'Word file');
    } else if (ext === 'doc') setErr('Old Word files (.doc) cannot be read. In Word, choose File → Save As → Word Document (.docx), then choose that file.');
    else await fromBlocks(textToBlocks(await f.text()), base, 'text file');
  };

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
      <div className="eyebrow mb-1">Add to your library</div>
      <H1>Import</H1>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={mode === 'one'} onClick={() => setMode('one')} data-testid="mode-one">One exam</button>
          <button role="tab" aria-selected={mode === 'folder'} onClick={() => setMode('folder')} data-testid="mode-folder">A whole folder of exams</button>
        </div>
        <p className="muted flex items-center gap-1.5 text-xs" data-testid="import-note">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          Only import materials you have the right to use. Everything stays on this device.
        </p>
      </div>
      {mode === 'folder' ? (
        <FolderImport />
      ) : (
      <>

      <H2>1. The questions</H2>
      <div className="seg mb-3" role="tablist" aria-label="Where the questions are">
        {(
          [
            ['pdf', 'PDF file'],
            ['doc', 'Word or text file'],
            ['paste', 'Paste text'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={qsrc === k} onClick={() => setQsrc(k)} data-testid={`qsrc-${k}`}>
            {l}
          </button>
        ))}
      </div>
      {qsrc === 'paste' && (
        <div className="mb-3 text-sm">
          <textarea
            className="field h-64 w-full font-mono text-[13px]"
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder={'1. A 30-year-old woman comes to the clinic because of…\nWhich of the following is the most likely diagnosis?\nA) First choice\nB) Second choice\nC) Third choice\nAnswer: B\nExplanation: …\n\n2. …'}
            data-testid="question-text"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={!qText.trim() || !!making} onClick={() => void fromBlocks(textToBlocks(qText), name.trim() || 'Pasted questions')} data-testid="make-from-text">
              {making || 'Use this text'}
            </button>
            <span className="text-xs text-gray-600">Number each question (1., 2., …) and letter its choices (A), B), …). An “Answer: C” line after a question is used as its answer, and anything after it as the explanation.</span>
          </div>
        </div>
      )}
      <div
        hidden={qsrc === 'paste'}
        className="flex flex-col items-center rounded-2xl border-2 border-dashed px-4 py-8 text-center text-sm transition-colors"
        style={{ borderColor: drag ? 'var(--brand)' : 'var(--line-strong)', background: drag ? 'var(--brand-soft)' : 'var(--surface)' }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) void pickAny(f);
        }}
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
        </div>
        {qsrc === 'pdf' ? (
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" data-testid="question-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickAny(f); }} aria-label="Question PDF" />
        ) : (
          <input type="file" accept=".docx,.txt,.text,.md,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" data-testid="question-doc" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickAny(f); }} aria-label="Word or text file" />
        )}
        <div className="mt-1 text-gray-600">{qsrc === 'pdf' ? 'Choose the PDF with the questions, or drop it here.' : 'Choose a Word (.docx) or text (.txt) file, or drop it here. Pictures in Word files are kept.'}</div>
        {making && <div className="mt-2" data-testid="making">{making}</div>}
        {doc && file && (
          <div className="mt-2 font-bold" data-testid="pdf-info">
            {file.name}: {pageCount} pages{made ? ` (made from your ${made})` : ''}
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
            <span className="flex items-center gap-2">
              Folder
              <FolderPicker value={subject} onChange={setSubject} testId="exam-folder" />
            </span>
          </div>

          <H2>2. How are the questions laid out?</H2>
          <div className="space-y-2 text-sm">
            <label className="choice flex-wrap items-center">
              <input type="radio" name="layout" checked={layout === 'auto'} onChange={() => setLayout('auto')} data-testid="layout-auto" /> <span><b>Work it out for me</b> (recommended). Test Simulator reads the question numbers on the pages. Falls back to one page per question when it cannot.</span>
            </label>
            <label className="choice flex-wrap items-center">
              <input type="radio" name="layout" checked={layout === 'fixed'} onChange={() => setLayout('fixed')} data-testid="layout-fixed" /> <span><b>Fixed</b>: exactly</span>
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
            <label className="choice flex-wrap items-center">
              <input type="radio" name="src" checked={source === 'pdf'} onChange={() => setSource('pdf')} data-testid="src-pdf" /> A separate PDF
              {source === 'pdf' && <input className="ml-3" type="file" accept="application/pdf,.pdf" onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)} data-testid="key-file" aria-label="Answer key PDF" />}
            </label>
            <label className="choice flex-wrap items-center">
              <input type="radio" name="src" checked={source === 'same'} onChange={() => setSource('same')} data-testid="src-same" /> At the end of this same PDF
              {source === 'same' && (
                <span className="ml-3">
                  key starts on page
                  <input className="field ml-1 w-16" type="number" min={1} max={pageCount} value={keyStart} onChange={(e) => setKeyStart(e.target.value)} data-testid="key-start" />
                </span>
              )}
            </label>
            <label className="choice flex-wrap items-center">
              <input type="radio" name="src" checked={source === 'inline'} onChange={() => setSource('inline')} data-testid="src-inline" /> After each question (for example “Answer: C” under the choices). The answer is hidden while you take the exam.
            </label>
            <label className="choice flex-wrap items-center">
              <input type="radio" name="src" checked={source === 'paste'} onChange={() => setSource('paste')} data-testid="src-paste" /> I will paste or type it
            </label>
            {source === 'paste' && (
              <div className="pl-5">
                <textarea className="field h-32 w-full max-w-xl font-mono" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'1 C, 2 A, 3 B …\nor one letter per line\nor  1. C. explanation text'} data-testid="key-paste" aria-label="Pasted answer key" />
                <div className="text-gray-700" data-testid="paste-count">{paste.trim() ? `${pasteCount} answers recognised.` : 'Formats like “1 C, 2 A”, “1. C”, or one letter per line all work.'}</div>
              </div>
            )}
            <label className="choice flex-wrap items-center">
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
