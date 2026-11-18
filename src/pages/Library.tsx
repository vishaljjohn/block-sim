import { useEffect, useMemo, useState } from 'react';
import { allFiles, displayName, fileUrl, findDir, forgetFolder, patchLib, rescan, toggle, useFolder, useLibState, type LDir, type LFile } from '../lib/localLibrary';
import { go } from '../ui/hooks';
import { H1 } from '../ui/Shell';
import { FolderConnect } from '../ui/FolderConnect';

const COVERS = [
  ['#8a3b12', '#b5541f'],
  ['#0f5a3f', '#1b7a55'],
  ['#0f4c75', '#1d6aa0'],
  ['#8b0f3a', '#b3184d'],
  ['#4b2f7a', '#6a46a6'],
  ['#5c4a12', '#86701f'],
];
const enc = encodeURIComponent;

/** Books are the top-level subfolders; documents at the top level form one more book. */
function booksOf(tree: LDir): LDir[] {
  const out = [...tree.dirs];
  if (tree.files.length) out.push({ name: tree.dirs.length ? 'Loose documents' : tree.name, path: '', dirs: [], files: tree.files });
  return out;
}

function Viewer({ path }: { path: string }) {
  const [src, setSrc] = useState<{ url: string; file: File } | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let url = '';
    setSrc(null);
    setText(null);
    fileUrl('library', path).then(
      async (r) => {
        url = r.url;
        if (/\.(txt|md)$/i.test(path)) setText(await r.file.text());
        setSrc(r);
      },
      (e) => setErr(String(e?.message ?? e)),
    );
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);
  if (err) return <div className="text-[14px]" style={{ color: 'var(--bad)' }}>Could not open this file: {err}</div>;
  if (!src) return <div className="text-[14px]">Opening…</div>;
  if (text != null) return <div className="whitespace-pre-wrap text-[15px] leading-relaxed" style={{ userSelect: 'text' }}>{text}</div>;
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(path)) return <img src={src.url} alt={displayName(path.split('/').pop()!)} className="max-w-full" />;
  // PDFs open in the browser's own viewer; HTML pages run sandboxed (no scripts)
  return <iframe title="Document" src={src.url} className="h-[78vh] w-full border" style={{ borderColor: 'var(--line)', background: '#fff' }} sandbox={/\.html?$/i.test(path) ? '' : undefined} data-testid="doc-frame" />;
}

function Toc({ dir, book, cur, depth = 0 }: { dir: LDir; book: string; cur: string; depth?: number }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(dir.dirs.filter((d) => cur.startsWith(d.path + '/')).map((d) => d.path)));
  return (
    <div>
      {dir.dirs.map((d) => {
        const o = open.has(d.path);
        return (
          <div key={d.path}>
            <button className="flex w-full items-center gap-2 py-1.5 text-left text-[13px] font-semibold" style={{ paddingLeft: depth * 14 }} onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(d.path)) n.delete(d.path); else n.add(d.path); return n; })}>
              <span style={{ color: 'var(--brand)' }}>▤</span>
              <span className="flex-1 truncate">{displayName(d.name)}</span>
              <span style={{ color: 'var(--ink-3)' }}>{o ? '⌄' : '›'}</span>
            </button>
            {o && <Toc dir={d} book={book} cur={cur} depth={depth + 1} />}
          </div>
        );
      })}
      {dir.files.map((f) => (
        <a key={f.path} href={`#/library?b=${enc(book)}&d=${enc(f.path)}`} className="flex items-center gap-2 py-1.5 text-[13px]" style={{ paddingLeft: depth * 14 + 4, color: cur === f.path ? 'var(--brand)' : 'var(--ink)', fontWeight: cur === f.path ? 700 : 500, background: cur === f.path ? 'var(--surface-2)' : undefined }}>
          <span style={{ color: 'var(--ink-3)' }}>▯</span>
          <span className="truncate">{displayName(f.name)}</span>
        </a>
      ))}
    </div>
  );
}

export function LibraryPage({ book, doc }: { book: string | null; doc: string | null }) {
  const { tree, name, needsPermission, loading } = useFolder('library');
  const st = useLibState();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'read' | 'name' | 'progress'>('read');
  const [page, setPage] = useState(0);
  const [focus, setFocus] = useState(false);
  const books = useMemo(() => (tree ? booksOf(tree) : []), [tree]);
  useEffect(() => {
    if (doc) void patchLib((s) => ({ ...s, opened: [{ path: doc, t: Date.now() }, ...s.opened.filter((x) => x.path !== doc)].slice(0, 50) }));
  }, [doc]);
  if (loading || !st) return <div className="text-sm">Loading…</div>;
  if (!tree)
    return (
      <div data-testid="library-page">
        <H1 rule sub="Your personal collection of texts, notes and progress.">Library Folio</H1>
        <FolderConnect kind="library" needsPermission={needsPermission} name={name} />
      </div>
    );

  const b = book != null ? books.find((x) => x.path === book) : null;
  // ---- the shelf ----
  if (!b)
    return (
      <div data-testid="library-page">
        <H1 rule sub="Your personal collection of texts, notes and progress." right={<><button className="btn btn-sm" onClick={() => void rescan('library')}>Refresh</button><button className="btn btn-sm btn-quiet" onClick={() => window.confirm('Unlink this folder? Your files are not touched; reading progress is kept.') && void forgetFolder('library')}>Unlink folder</button></>}>
          Library Folio
        </H1>
        <div className="mono mb-5 text-[12px]" style={{ color: 'var(--ink-2)' }}>Folder: {tree.name} · {allFiles(tree).length} documents</div>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-3 xl:grid-cols-4">
          {books.map((bk, i) => {
            const files = allFiles(bk);
            const done = files.filter((f) => st.done.includes(f.path)).length;
            const [c1, c2] = COVERS[i % COVERS.length];
            return (
              <button key={bk.path || 'loose'} className="group relative aspect-[4/5] overflow-hidden rounded-sm text-left shadow-md transition-transform hover:-translate-y-1" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }} onClick={() => go(`/library?b=${enc(bk.path)}`)} aria-label={`${displayName(bk.name)} Open Book`} data-testid="book">
                <span className="absolute inset-y-0 left-6 w-px" style={{ background: 'rgb(255 255 255 / 0.35)' }} />
                <span className="absolute left-2 top-2 h-px w-2.5" style={{ background: 'rgb(255 255 255 / 0.5)' }} />
                <span className="absolute bottom-2 left-2 h-px w-2.5" style={{ background: 'rgb(255 255 255 / 0.5)' }} />
                <span className="absolute right-0 top-0 h-5 w-5" style={{ background: 'linear-gradient(225deg, rgb(255 255 255 / 0.35) 50%, transparent 50%)' }} />
                <span className="absolute left-10 right-4 top-6 text-[18px] font-bold leading-snug text-white" style={{ fontFamily: 'var(--serif)' }}>{displayName(bk.name)}</span>
                <span className="mono absolute bottom-4 left-10 right-4 text-[11px] text-white/80">{files.length} docs · {files.length ? Math.round((done / files.length) * 100) : 0}% read</span>
              </button>
            );
          })}
        </div>
      </div>
    );

  const files = allFiles(b);
  const done = files.filter((f) => st.done.includes(f.path)).length;
  const last = st.opened.find((o) => files.some((f) => f.path === o.path));
  const lastFile = last ? files.find((f) => f.path === last.path) : null;
  const bookmarks = st.bookmarks.map((p) => files.find((f) => f.path === p)).filter((f): f is LFile => !!f);
  const term = q.trim().toLowerCase();
  const hits = term ? files.filter((f) => f.name.toLowerCase().includes(term) || f.path.toLowerCase().includes(term)).slice(0, 30) : [];
  const modules = (b.dirs.length ? b.dirs : [{ ...b, name: 'All documents' }]).map((d) => {
    const fs = allFiles(d);
    const dn = fs.filter((f) => st.done.includes(f.path)).length;
    const lastRead = Math.max(0, ...st.opened.filter((o) => fs.some((f) => f.path === o.path)).map((o) => o.t));
    return { d, total: fs.length, done: dn, lastRead };
  });
  modules.sort((x, y) => (sort === 'name' ? x.d.name.localeCompare(y.d.name, undefined, { numeric: true }) : sort === 'progress' ? y.done / Math.max(1, y.total) - x.done / Math.max(1, x.total) : y.lastRead - x.lastRead));
  const per = 5;
  const pages = Math.max(1, Math.ceil(modules.length / per));
  const pg = Math.min(page, pages - 1);
  const docFile = doc ? files.find((f) => f.path === doc) : null;
  const siblings = docFile ? (findDir(b, doc!.split('/').slice(0, -1).join('/'))?.files ?? files) : [];
  const idx = docFile ? siblings.findIndex((f) => f.path === doc) : -1;

  return (
    <div data-testid="library-book" className="-mx-4 -mt-8 flex min-h-[calc(100vh-80px)] sm:-mx-8">
      {!focus && (
        <aside className="hidden w-[280px] shrink-0 overflow-y-auto border-r-2 p-5 md:block" style={{ borderColor: 'var(--line)' }}>
          <a href="#/library" className="mb-5 flex items-center gap-3 rounded border p-2.5" style={{ borderColor: '#f0d8c8', background: 'color-mix(in srgb, var(--brand) 6%, var(--bg))' }}>
            <span className="flex h-8 w-8 items-center justify-center rounded" style={{ background: 'color-mix(in srgb, var(--brand) 15%, transparent)', color: 'var(--brand)' }}>▤</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold" style={{ color: 'var(--brand)' }}>← Back to Library</span>
              <span className="block truncate text-[11px]" style={{ color: 'var(--ink-2)' }}>{displayName(b.name)}</span>
            </span>
          </a>
          <div className="mb-3 text-[18px] font-bold" style={{ fontFamily: 'var(--serif)' }}>Table of Contents</div>
          <Toc dir={b} book={b.path} cur={doc ?? ''} />
        </aside>
      )}
      <div className="min-w-0 flex-1 px-4 py-8 sm:px-10">
        {docFile ? (
          <div data-testid="library-doc">
            <a className="link text-[13px]" href={`#/library?b=${enc(b.path)}`}>← Back to {displayName(b.name)}</a>
            <div className="mb-5 mt-2 flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-[28px] font-bold leading-tight">{displayName(docFile.name)}</h1>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-caps btn-sm" onClick={() => setFocus((f) => !f)} data-testid="focus-mode">⤢ {focus ? 'Exit focus' : 'Focus mode'}</button>
                <button className="btn btn-caps btn-sm" style={st.done.includes(docFile.path) ? { background: 'var(--good)', borderColor: 'var(--good)', color: '#fff' } : undefined} onClick={() => void patchLib((s) => ({ ...s, done: toggle(s.done, docFile.path) }))} data-testid="mark-done">
                  ✓ {st.done.includes(docFile.path) ? 'Done' : 'Mark as done'}
                </button>
                <button className="btn btn-caps btn-sm" style={{ color: 'var(--brand)', borderColor: 'var(--brand)', ...(st.bookmarks.includes(docFile.path) ? { background: 'var(--brand)', color: '#fff' } : {}) }} onClick={() => void patchLib((s) => ({ ...s, bookmarks: toggle(s.bookmarks, docFile.path) }))} data-testid="bookmark">
                  ⚑ {st.bookmarks.includes(docFile.path) ? 'Bookmarked' : 'Bookmark'}
                </button>
              </div>
            </div>
            <Viewer path={docFile.path} />
            <div className="mt-6 flex justify-between">
              <button className="btn btn-sm" disabled={idx <= 0} onClick={() => go(`/library?b=${enc(b.path)}&d=${enc(siblings[idx - 1].path)}`)}>← Previous</button>
              <button className="btn btn-sm" disabled={idx < 0 || idx >= siblings.length - 1} onClick={() => go(`/library?b=${enc(b.path)}&d=${enc(siblings[idx + 1].path)}`)}>Next →</button>
            </div>
          </div>
        ) : (
          <>
            <a className="link text-[13px]" href="#/library">← Back to Library</a>
            <h1 className="mt-2 text-[30px] font-bold">{displayName(b.name)}</h1>
            <p className="mb-5 text-[14px]" style={{ color: 'var(--ink-2)' }}>Your progress, notes, and reading.</p>
            <div className="relative mb-6">
              <input className="field w-full pl-9" placeholder="Search the library…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="library-search" />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px]" style={{ color: 'var(--ink-2)' }}>⌕</span>
              {term && (
                <div className="absolute inset-x-0 top-full z-20 max-h-[50vh] overflow-y-auto border-2 shadow-lg" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
                  {hits.length ? hits.map((f) => (
                    <a key={f.path} href={`#/library?b=${enc(b.path)}&d=${enc(f.path)}`} className="block border-b px-3 py-2 text-[13px] hover:bg-[var(--surface-2)]" style={{ borderColor: 'var(--line)' }} onClick={() => setQ('')}>
                      <b>{displayName(f.name)}</b> <span className="mono text-[11px]" style={{ color: 'var(--ink-2)' }}>{f.path.split('/').slice(0, -1).join(' › ')}</span>
                    </a>
                  )) : <div className="px-3 py-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>No documents match.</div>}
                </div>
              )}
            </div>
            <div className="mb-6 grid grid-cols-3 gap-4">
              {[
                ['▤', 'Total Documents', files.length.toLocaleString()],
                ['✓', 'Completed', String(done)],
                ['▥', 'Progress', `${files.length ? Math.round((done / files.length) * 100) : 0}%`],
              ].map(([i, l, v]) => (
                <div key={l} className="rounded border bg-[var(--surface)] p-5" style={{ borderColor: 'var(--line)' }}>
                  <div className="mb-1 flex items-center gap-2 text-[13px] font-semibold" style={{ color: 'var(--ink-2)' }}><span style={{ color: l === 'Completed' ? 'var(--good)' : 'var(--brand)' }}>{i}</span>{l}</div>
                  <div className="mono text-[28px] font-bold">{v}</div>
                </div>
              ))}
            </div>
            {lastFile && (
              <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-2 border-dashed p-5" style={{ borderColor: 'color-mix(in srgb, var(--brand) 50%, transparent)', background: 'color-mix(in srgb, var(--brand) 5%, var(--bg))' }}>
                <div>
                  <div className="mono text-[10px] font-bold uppercase tracking-[1.2px]" style={{ color: 'var(--brand)' }}>Continue reading</div>
                  <div className="text-[20px] font-bold" style={{ fontFamily: 'var(--serif)' }}>{displayName(lastFile.name)}</div>
                  <div className="mono text-[11px]" style={{ color: 'var(--ink-2)' }}>Last opened: {new Date(last!.t).toLocaleString()}</div>
                </div>
                <a className="btn-primary btn-caps" href={`#/library?b=${enc(b.path)}&d=${enc(lastFile.path)}`} data-testid="continue-reading">Pick up where you left off ›</a>
              </div>
            )}
            <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
              <div>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-[20px] font-bold">Modules</h2>
                  <select className="field py-1 text-[13px]" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                    <option value="read">Sort by Last Read</option>
                    <option value="name">Sort by Name</option>
                    <option value="progress">Sort by Progress</option>
                  </select>
                </div>
                {modules.slice(pg * per, pg * per + per).map((m) => (
                  <a key={m.d.path || 'all'} href={`#/library?b=${enc(b.path)}&d=${enc(allFiles(m.d)[0]?.path ?? '')}`} className="mb-3 block rounded border bg-[var(--surface)] p-4 hover:shadow" style={{ borderColor: 'var(--line)' }}>
                    <div className="mb-2 flex justify-between text-[14px] font-bold" style={{ fontFamily: 'var(--serif)' }}>
                      <span className="truncate">{displayName(m.d.name)}</span>
                      <span className="mono text-[11px] font-normal" style={{ color: 'var(--ink-2)' }}>{m.done}/{m.total}</span>
                    </div>
                    <div className="flex h-1.5"><span style={{ width: `${(m.done / Math.max(1, m.total)) * 100}%`, background: 'var(--good)' }} /><span className="flex-1" style={{ background: 'var(--bad)' }} /></div>
                  </a>
                ))}
                {pages > 1 && (
                  <div className="mono mt-4 flex items-center justify-between border-t pt-4 text-[12px]" style={{ borderColor: 'var(--line)' }}>
                    <button className="btn btn-caps btn-sm" disabled={pg === 0} onClick={() => setPage(pg - 1)}>Previous</button>
                    <span>PAGE {pg + 1} OF {pages}</span>
                    <button className="btn btn-caps btn-sm" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>Next</button>
                  </div>
                )}
              </div>
              <div>
                <h2 className="mb-3 text-[20px] font-bold">My Bookmarks</h2>
                {bookmarks.length ? (
                  bookmarks.map((f) => (
                    <a key={f.path} href={`#/library?b=${enc(b.path)}&d=${enc(f.path)}`} className="mb-2 flex items-center gap-2 rounded border bg-[var(--surface)] px-3 py-2.5 text-[13px] font-semibold" style={{ borderColor: 'var(--line)' }}>
                      <span style={{ color: 'var(--brand)' }}>⚑</span> {displayName(f.name)}
                    </a>
                  ))
                ) : (
                  <div className="rounded border-2 border-dashed p-6 text-[14px]" style={{ borderColor: 'var(--line)' }}>No bookmarks yet.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
