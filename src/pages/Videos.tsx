import { useEffect, useRef, useState } from 'react';
import { allFiles, displayName, fileUrl, findDir, forgetFolder, patchVideo, rescan, toggle, useFolder, useVideoState, type LDir, type VideoState } from '../lib/localLibrary';
import { go } from '../ui/hooks';
import { FolderConnect } from '../ui/FolderConnect';
import { H1 } from '../ui/Shell';

const enc = encodeURIComponent;
const parentOf = (p: string) => p.split('/').slice(0, -1).join('/');
const mins = (s: number) => Math.max(0, Math.round(s / 60));

function Tree({ dir, sel, depth = 0 }: { dir: LDir; sel: string; depth?: number }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(dir.dirs.filter((d) => sel === d.path || sel.startsWith(d.path + '/')).map((d) => d.path)));
  return (
    <div>
      {dir.dirs.map((d) => {
        const o = open.has(d.path);
        return (
          <div key={d.path}>
            <div className="flex items-center" style={{ paddingLeft: depth * 14 }}>
              <button className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-[13px] font-semibold" style={{ color: sel === d.path ? 'var(--brand)' : 'var(--ink)' }} onClick={() => go(`/videos?f=${enc(d.path)}`)}>
                <span style={{ color: 'var(--brand)' }}>▭</span>
                <span className="truncate">{displayName(d.name)}</span>
              </button>
              {d.dirs.length > 0 && (
                <button className="px-1 text-[12px]" style={{ color: 'var(--ink-3)' }} onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(d.path)) n.delete(d.path); else n.add(d.path); return n; })} aria-label={o ? 'Collapse' : 'Expand'}>
                  {o ? '⌄' : '›'}
                </button>
              )}
            </div>
            {o && <Tree dir={d} sel={sel} depth={depth + 1} />}
          </div>
        );
      })}
    </div>
  );
}

function Player({ path, st, onEnded }: { path: string; st: VideoState; onEnded: () => void }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const [rate, setRate] = useState(1);
  const saved = useRef(0);
  useEffect(() => {
    let u = '';
    setUrl('');
    setErr('');
    fileUrl('videos', path).then((r) => setUrl((u = r.url)), (e) => setErr(String(e?.message ?? e)));
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [path]);
  const save = (force = false) => {
    const v = ref.current;
    if (!v || !v.duration || (!force && Math.abs(v.currentTime - saved.current) < 5)) return;
    saved.current = v.currentTime;
    const at = v.currentTime;
    const dur = v.duration;
    void patchVideo((s) => ({ ...s, pos: { ...s.pos, [path]: { at, dur, t: Date.now() } }, watched: at / dur >= 0.9 && !s.watched.includes(path) ? [...s.watched, path] : s.watched }));
  };
  useEffect(() => () => save(true), [path]);
  if (err) return <div className="text-[14px]" style={{ color: 'var(--bad)' }}>Could not open this video: {err}</div>;
  return (
    <div>
      {url ? (
        <video
          ref={ref}
          src={url}
          controls
          autoPlay
          className="aspect-video w-full bg-black"
          onLoadedMetadata={(e) => {
            const p = st.pos[path];
            if (p && p.at < p.dur - 5) e.currentTarget.currentTime = p.at;
            e.currentTarget.playbackRate = rate;
          }}
          onTimeUpdate={() => save()}
          onPause={() => save(true)}
          onEnded={() => {
            save(true);
            onEnded();
          }}
          data-testid="video"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center bg-black text-white/70">Opening…</div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
        <span style={{ color: 'var(--ink-2)' }}>Speed</span>
        {[0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
          <button key={r} className="mono px-2 py-0.5" style={rate === r ? { background: 'var(--navy)', color: 'var(--bg)' } : { border: '1px solid var(--line)' }} onClick={() => { setRate(r); if (ref.current) ref.current.playbackRate = r; }}>
            {r}×
          </button>
        ))}
      </div>
    </div>
  );
}

export function VideosPage({ folder, video }: { folder: string | null; video: string | null }) {
  const { tree, name, needsPermission, loading } = useFolder('videos');
  const st = useVideoState();
  if (loading || !st) return <div className="text-sm">Loading…</div>;
  if (!tree)
    return (
      <div data-testid="videos-page">
        <H1 rule sub="Your own lectures and videos, watched alongside your tests.">Video Library</H1>
        <FolderConnect kind="videos" needsPermission={needsPermission} name={name} />
      </div>
    );
  const all = allFiles(tree);
  const watched = all.filter((f) => st.watched.includes(f.path)).length;
  const sel = video ? parentOf(video) : (folder ?? null);
  const dir = sel != null ? findDir(tree, sel) : null;
  const cur = video ? all.find((f) => f.path === video) : null;
  const siblings = cur ? (findDir(tree, parentOf(cur.path))?.files ?? []) : [];
  const idx = cur ? siblings.findIndex((f) => f.path === cur.path) : -1;
  const progress = (p: string) => {
    const x = st.pos[p];
    return x && x.dur ? Math.min(1, x.at / x.dur) : st.watched.includes(p) ? 1 : 0;
  };
  const cont = all.filter((f) => st.pos[f.path] && !st.watched.includes(f.path) && progress(f.path) > 0.02).sort((a, b) => st.pos[b.path].t - st.pos[a.path].t).slice(0, 3);
  const recent = all.filter((f) => st.pos[f.path]).sort((a, b) => st.pos[b.path].t - st.pos[a.path].t).slice(0, 8);
  const Card = ({ p }: { p: string }) => {
    const x = st.pos[p];
    return (
      <a href={`#/videos?v=${enc(p)}`} className="block border bg-[var(--surface)] hover:shadow" style={{ borderColor: 'var(--line)' }}>
        <div className="relative flex aspect-video items-center justify-center" style={{ background: '#d4d7db' }}>
          <span className="text-[26px]" style={{ color: '#8a9096' }}>▶</span>
          <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: 'rgb(0 0 0 / 0.1)' }}><span className="block h-full" style={{ width: `${progress(p) * 100}%`, background: 'var(--brand)' }} /></span>
        </div>
        <div className="p-3">
          <div className="truncate text-[14px] font-bold" style={{ fontFamily: 'var(--serif)' }}>{displayName(p.split('/').pop()!)}</div>
          <div className="truncate text-[11px]" style={{ color: 'var(--ink-2)' }}>{displayName(parentOf(p).split('/').pop() || tree.name)}</div>
          <div className="mono mt-2 flex justify-between text-[11px]" style={{ color: 'var(--ink-2)' }}>
            <span>{x ? `${mins(x.at)} / ${mins(x.dur)} min` : ''}</span>
            <span>{Math.round(progress(p) * 100)}%</span>
          </div>
        </div>
      </a>
    );
  };

  return (
    <div data-testid="videos-page" className="-mx-4 -mt-8 flex min-h-[calc(100vh-80px)] sm:-mx-8">
      <aside className="hidden w-[280px] shrink-0 overflow-y-auto border-r-2 p-5 md:block" style={{ borderColor: 'var(--line)' }}>
        <a href="#/videos" className="mb-4 flex items-center gap-2 text-[18px] font-bold" style={{ fontFamily: 'var(--serif)' }}>
          <span style={{ color: 'var(--brand)' }}>▭</span> Video Library
        </a>
        <Tree dir={tree} sel={sel ?? ''} />
        {tree.files.length > 0 && (
          <button className="mt-1 flex w-full items-center gap-2 py-1.5 text-left text-[13px] font-semibold" style={{ color: sel === '' ? 'var(--brand)' : 'var(--ink)' }} onClick={() => go('/videos?f=')}>
            <span style={{ color: 'var(--brand)' }}>▭</span> Loose videos
          </button>
        )}
        <div className="mt-6 border-t pt-3 text-[11px]" style={{ borderColor: 'var(--line)', color: 'var(--ink-3)' }}>
          Folder: {tree.name}
          <div className="mt-1 flex gap-3">
            <button className="link text-[11px]" onClick={() => void rescan('videos')}>Refresh</button>
            <button className="link text-[11px]" onClick={() => window.confirm('Unlink this folder? Your videos are not touched; watch progress is kept.') && void forgetFolder('videos')}>Unlink</button>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1 px-4 py-8 sm:px-10">
        {cur ? (
          <div data-testid="video-player">
            <a className="link text-[13px]" href={`#/videos?f=${enc(parentOf(cur.path))}`}>← Back to {displayName(parentOf(cur.path).split('/').pop() || 'Video Library')}</a>
            <div className="mb-4 mt-2 flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-[26px] font-bold leading-tight">{displayName(cur.name)}</h1>
              <button className="btn btn-caps btn-sm" style={st.watched.includes(cur.path) ? { background: 'var(--good)', borderColor: 'var(--good)', color: '#fff' } : undefined} onClick={() => void patchVideo((s) => ({ ...s, watched: toggle(s.watched, cur.path) }))} data-testid="mark-watched">
                ✓ {st.watched.includes(cur.path) ? 'Watched' : 'Mark as watched'}
              </button>
            </div>
            <Player path={cur.path} st={st} onEnded={() => idx >= 0 && idx < siblings.length - 1 && go(`/videos?v=${enc(siblings[idx + 1].path)}`)} />
            <div className="mt-5 flex justify-between">
              <button className="btn btn-sm" disabled={idx <= 0} onClick={() => go(`/videos?v=${enc(siblings[idx - 1].path)}`)}>← Previous</button>
              <button className="btn btn-sm" disabled={idx < 0 || idx >= siblings.length - 1} onClick={() => go(`/videos?v=${enc(siblings[idx + 1].path)}`)}>Next →</button>
            </div>
            <h2 className="mb-2 mt-8 text-[18px] font-bold">In this section</h2>
            {siblings.map((f) => (
              <a key={f.path} href={`#/videos?v=${enc(f.path)}`} className="flex items-center gap-3 border-b py-2 text-[13px]" style={{ borderColor: 'var(--line)', color: f.path === cur.path ? 'var(--brand)' : 'var(--ink)', fontWeight: f.path === cur.path ? 700 : 500 }}>
                <span style={{ color: st.watched.includes(f.path) ? 'var(--good)' : 'var(--ink-3)' }}>{st.watched.includes(f.path) ? '✓' : '▶'}</span>
                <span className="flex-1 truncate">{displayName(f.name)}</span>
                <span className="mono text-[11px]" style={{ color: 'var(--ink-2)' }}>{Math.round(progress(f.path) * 100)}%</span>
              </a>
            ))}
          </div>
        ) : (
          <>
            <div className="mb-8 grid grid-cols-3 gap-4">
              {[
                ['▭', 'Total Videos', all.length.toLocaleString()],
                ['✓', 'Watched', String(watched)],
                ['◷', 'Completion', `${all.length ? Math.round((watched / all.length) * 100) : 0}%`],
              ].map(([i, l, v]) => (
                <div key={l} className="rounded border bg-[var(--surface)] p-5" style={{ borderColor: 'var(--line)' }}>
                  <div className="mb-1 flex items-center gap-2 text-[13px] font-semibold" style={{ color: 'var(--ink-2)' }}><span style={{ color: l === 'Watched' ? 'var(--good)' : l === 'Completion' ? '#2f5d8a' : 'var(--brand)' }}>{i}</span>{l}</div>
                  <div className="mono text-[28px] font-bold">{v}</div>
                </div>
              ))}
            </div>
            {dir ? (
              <div data-testid="video-folder">
                <h2 className="mb-1 text-[24px] font-bold">{sel === '' ? 'Loose videos' : displayName(dir.name)}</h2>
                <div className="mono mb-4 text-[12px]" style={{ color: 'var(--ink-2)' }}>{allFiles(dir).length} videos · {allFiles(dir).filter((f) => st.watched.includes(f.path)).length} watched</div>
                {dir.dirs.length > 0 && (
                  <div className="mb-5 grid gap-2 sm:grid-cols-2">
                    {dir.dirs.map((d) => (
                      <a key={d.path} href={`#/videos?f=${enc(d.path)}`} className="flex items-center justify-between border bg-[var(--surface)] px-4 py-3 text-[14px] font-semibold" style={{ borderColor: 'var(--line)' }}>
                        <span className="truncate">▭ {displayName(d.name)}</span>
                        <span className="mono text-[11px]" style={{ color: 'var(--ink-2)' }}>{allFiles(d).length}</span>
                      </a>
                    ))}
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {(sel === '' ? tree.files : dir.files).map((f) => (
                    <Card key={f.path} p={f.path} />
                  ))}
                </div>
              </div>
            ) : (
              <>
                <h2 className="mb-4 flex items-center gap-2 text-[20px] font-bold"><span style={{ color: 'var(--brand)' }}>▷</span> Continue Watching</h2>
                {cont.length ? (
                  <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cont.map((f) => <Card key={f.path} p={f.path} />)}</div>
                ) : (
                  <div className="mb-8 rounded border-2 border-dashed p-6 text-[14px]" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}>Nothing in progress. Pick a section on the left to start watching.</div>
                )}
                <h2 className="mb-4 flex items-center gap-2 text-[20px] font-bold"><span style={{ color: '#2f5d8a' }}>◷</span> Recently Watched</h2>
                {recent.length ? (
                  recent.map((f) => (
                    <a key={f.path} href={`#/videos?v=${enc(f.path)}`} className="mb-2 flex items-center gap-3 rounded border bg-[var(--surface)] px-4 py-3" style={{ borderColor: 'var(--line)' }}>
                      <span className="flex h-7 w-7 items-center justify-center rounded-full text-[12px]" style={{ background: st.watched.includes(f.path) ? '#e8f8ee' : 'var(--surface-2)', color: st.watched.includes(f.path) ? 'var(--good)' : 'var(--ink-2)' }}>{st.watched.includes(f.path) ? '✓' : '▶'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">{displayName(f.name)}</span>
                        <span className="block truncate text-[11px]" style={{ color: 'var(--ink-2)' }}>{displayName(parentOf(f.path).split('/').pop() || tree.name)}</span>
                      </span>
                      <span className="mono text-[11px]" style={{ color: 'var(--ink-2)' }}>{new Date(st.pos[f.path].t).toLocaleDateString()}</span>
                    </a>
                  ))
                ) : (
                  <div className="text-[14px]" style={{ color: 'var(--ink-3)' }}>No videos watched yet.</div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
