import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { LOGO_SVG } from './logo.mjs';

function draw(size) {
  const c = createCanvas(size, size);
  const g = c.getContext('2d');
  const u = size / 16;
  const grad = g.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#3b6cf6');
  grad.addColorStop(1, '#1e3a8a');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size); // full bleed: safe as a maskable icon
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.roundRect(3.5 * u, 3 * u, 9 * u, 10 * u, 1.2 * u);
  g.fill();
  for (let i = 0; i < 3; i++) {
    const y = (5.3 + i * 2.7) * u;
    g.beginPath();
    g.arc(5.6 * u, y, 0.75 * u, 0, Math.PI * 2);
    if (i === 1) {
      g.fillStyle = '#22c55e';
      g.fill();
    } else {
      g.strokeStyle = '#94a3b8';
      g.lineWidth = 0.32 * u;
      g.stroke();
    }
    g.fillStyle = i === 1 ? '#1e3a8a' : '#cbd5e1';
    g.beginPath();
    g.roundRect(7 * u, y - 0.4 * u, 4.2 * u, 0.8 * u, 0.4 * u);
    g.fill();
  }
  return c.toBuffer('image/png');
}

export async function makeIcons(pubDir) {
  fs.writeFileSync(path.join(pubDir, 'icon-192.png'), draw(192));
  fs.writeFileSync(path.join(pubDir, 'icon-512.png'), draw(512));
  fs.writeFileSync(
    path.join(pubDir, 'icon.svg'),
    LOGO_SVG,
  );
  fs.writeFileSync(
    path.join(pubDir, 'manifest.webmanifest'),
    JSON.stringify(
      {
        name: 'Test Simulator',
        short_name: 'Test Simulator',
        id: 'block-sim',
        description: 'Board-style practice exams from your own PDFs. Everything stays on this device.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1e3a8a',
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
