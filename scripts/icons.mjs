import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';

function draw(size) {
  const c = createCanvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = '#1c4973';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#ffffff';
  const u = size / 16;
  g.fillRect(3 * u, 3 * u, 10 * u, 10 * u);
  g.fillStyle = '#1c4973';
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(5 * u, (5.2 + i * 2.8) * u, 0.8 * u, 0, Math.PI * 2);
    g.fill();
    g.fillRect(6.6 * u, (4.8 + i * 2.8) * u, 5 * u, 0.8 * u);
  }
  return c.toBuffer('image/png');
}

export async function makeIcons(pubDir) {
  fs.writeFileSync(path.join(pubDir, 'icon-192.png'), draw(192));
  fs.writeFileSync(path.join(pubDir, 'icon-512.png'), draw(512));
  fs.writeFileSync(
    path.join(pubDir, 'icon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#1c4973"/><rect x="3" y="3" width="10" height="10" fill="#fff"/><g fill="#1c4973"><circle cx="5" cy="5.2" r=".8"/><rect x="6.6" y="4.8" width="5" height=".8"/><circle cx="5" cy="8" r=".8"/><rect x="6.6" y="7.6" width="5" height=".8"/><circle cx="5" cy="10.8" r=".8"/><rect x="6.6" y="10.4" width="5" height=".8"/></g></svg>`,
  );
  fs.writeFileSync(
    path.join(pubDir, 'manifest.webmanifest'),
    JSON.stringify(
      {
        name: process.env.VITE_CHANNEL === 'beta' ? 'Block Sim (beta)' : 'Block Sim',
        short_name: process.env.VITE_CHANNEL === 'beta' ? 'Block Sim β' : 'Block Sim',
        id: process.env.VITE_CHANNEL === 'beta' ? 'block-sim-beta' : 'block-sim',
        description: 'Board-style practice exams from your own PDFs. Everything stays on this device.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1c4973',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      null,
      1,
    ),
  );
}
