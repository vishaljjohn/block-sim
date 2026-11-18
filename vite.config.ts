import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// beta (the `beta` branch) is published under /block-sim/beta/ for trying changes before they go live;
// it shares the live site's saved data (same storage names), so it must never change the database schema
const channel = process.env.VITE_CHANNEL === 'beta' ? 'beta' : 'stable';
const base = channel === 'beta' ? '/block-sim/beta/' : '/block-sim/';
const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function walk(dir: string, out: string[] = [], root = dir): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out, root);
    else out.push(path.relative(root, p).split(path.sep).join('/'));
  }
  return out;
}

/** Writes sw.js with the list of every built file, so the app works offline after first load. */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'block-sim-sw',
    apply: 'build',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const files = walk(outDir).filter((f) => f !== 'sw.js' && !f.startsWith('beta/') && !f.endsWith('.map'));
      const hash = crypto.createHash('sha1');
      for (const f of files.sort()) {
        hash.update(f);
        hash.update(fs.readFileSync(path.join(outDir, f)));
      }
      const buildId = hash.digest('hex').slice(0, 12);
      const tpl = fs.readFileSync(new URL('./src/sw.template.js', import.meta.url), 'utf8');
      const sw = tpl
        .replace('"__BASE__"', JSON.stringify(base))
        .replace('"__CHANNEL__"', JSON.stringify(channel))
        .replace('"__BUILD_ID__"', JSON.stringify(buildId))
        .replace('"__FILES__"', JSON.stringify(files));
      fs.writeFileSync(path.join(outDir, 'sw.js'), sw);
      if (channel === 'beta') return;
      // when there is no beta build, the beta link (/block-sim/beta/) is retired: a page that sends people to the app, and a service worker
      // that replaces the old beta one, clears its offline copy and unregisters itself
      fs.mkdirSync(path.join(outDir, 'beta'), { recursive: true });
      fs.writeFileSync(
        path.join(outDir, 'beta', 'index.html'),
        `<!doctype html><meta charset="utf-8"><title>Test Simulator</title><meta http-equiv="refresh" content="2; url=${base}"><p>Test Simulator has moved to <a href="${base}">${base}</a>.</p><script>navigator.serviceWorker?.getRegistrations?.().then((rs) => Promise.all(rs.filter((r) => r.scope.endsWith('/beta/')).map((r) => r.unregister()))).finally(() => location.replace('${base}'));</script>`,
      );
      fs.writeFileSync(
        path.join(outDir, 'beta', 'sw.js'),
        `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('blocksim-beta-')) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate('${base}');
})()));
`,
      );
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), serviceWorker()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __CHANNEL__: JSON.stringify(channel),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    outDir: channel === 'beta' ? 'dist-beta' : 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
