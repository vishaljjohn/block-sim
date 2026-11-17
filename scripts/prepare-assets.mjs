// Copies bundled third-party runtime files (pdf.js extras, OCR engine + English data) into public/vendor,
// and generates the demo exam PDF and icons. Nothing is fetched from the network at runtime.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoPdf } from './demo-pdf.mjs';
import { makeIcons } from './icons.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = (...p) => path.join(root, 'node_modules', ...p);
const pub = (...p) => path.join(root, 'public', ...p);

function copyDir(src, dst, filter = () => true) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d, filter);
    else if (filter(name)) fs.copyFileSync(s, d);
  }
}

fs.rmSync(pub('vendor'), { recursive: true, force: true });
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  if (fs.existsSync(nm('pdfjs-dist', dir))) copyDir(nm('pdfjs-dist', dir), pub('vendor', 'pdfjs', dir), (n) => !n.startsWith('LICENSE') || true);
}
fs.mkdirSync(pub('vendor', 'tesseract'), { recursive: true });
fs.copyFileSync(nm('tesseract.js', 'dist', 'worker.min.js'), pub('vendor', 'tesseract', 'worker.min.js'));
for (const f of fs.readdirSync(nm('tesseract.js-core'))) {
  // LSTM-only cores are all the app uses (smaller and faster than the legacy engine).
  if (/^tesseract-core(-simd|-relaxedsimd)?-lstm\.wasm\.js$/.test(f)) fs.copyFileSync(nm('tesseract.js-core', f), pub('vendor', 'tesseract', f));
}
fs.copyFileSync(nm('@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'), pub('vendor', 'tesseract', 'eng.traineddata.gz'));

// the interface font (SIL Open Font License); the font file itself is bundled by Vite from src/index.css
fs.mkdirSync(pub('vendor', 'inter'), { recursive: true });
fs.copyFileSync(nm('@fontsource-variable', 'inter', 'LICENSE'), pub('vendor', 'inter', 'LICENSE.txt'));

fs.mkdirSync(pub('demo'), { recursive: true });
fs.writeFileSync(pub('demo', 'demo-exam.bin'), await buildDemoPdf());
await makeIcons(pub());
console.log('assets prepared');
