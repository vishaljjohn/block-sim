// Generates test PDFs with ORIGINAL made-up questions (no real exam content) into tests/fixtures/generated.
//  a) image-only, one question per page, fake browser-toolbar clutter + separate key PDF ("1. C. explanation")
//  b) text PDF with "Answer: C" after each question
//  c) text PDF, several questions per page, key table at the end
//  d) two-column text PDF with choices up to H
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import { wrap } from './demo-pdf.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'tests', 'fixtures', 'generated');
fs.mkdirSync(out, { recursive: true });

const SUBJECTS = ['fever', 'cough', 'rash', 'joint pain', 'headache', 'fatigue', 'abdominal pain', 'dizziness', 'swelling', 'back pain', 'chest discomfort', 'weight loss'];
const PLACES = ['clinic', 'emergency department', 'urgent care center', 'office'];
const WORDS = ['Alpha', 'Bravo', 'Cedar', 'Delta', 'Ember', 'Falcon', 'Garnet', 'Harbor', 'Iris', 'Juniper', 'Kestrel', 'Lumen', 'Maple', 'Nova', 'Onyx', 'Pine', 'Quartz', 'Raven', 'Sage', 'Topaz'];
const LETTERS = 'ABCDEFGH';

/** Deterministic, original practice questions about made-up "test agents". */
export function makeQuestions(n, choices = 5, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  return Array.from({ length: n }, (_, i) => {
    const age = 20 + Math.floor(rnd() * 60);
    const subj = SUBJECTS[Math.floor(rnd() * SUBJECTS.length)];
    const place = PLACES[Math.floor(rnd() * PLACES.length)];
    const days = 2 + Math.floor(rnd() * 12);
    const opts = Array.from({ length: choices }, (_, k) => `${WORDS[(i * 3 + k * 7) % WORDS.length]} protocol ${k + 1}`);
    const answer = LETTERS[Math.floor(rnd() * choices)];
    return {
      n: i + 1,
      stem: `A ${age}-year-old person comes to the ${place} because of ${subj} for ${days} days. Temperature is 37.${Math.floor(rnd() * 9)} C and pulse is ${60 + Math.floor(rnd() * 40)}/min. This is practice item ${i + 1} written for software testing only. Which of the following is the best next step?`,
      choices: opts,
      answer,
      explanation: `The ${opts[answer.charCodeAt(0) - 65]} is preferred in this made-up scenario. In 3 of 4 similar cases the response occurs within 2 days.\n${i + 2}. Numbers like this at the start of a line belong to the explanation, not to the next answer.\nA dose of 10 mg twice daily for 14 days is typical here, and about 25 percent improve by day 7.`,
      tag: ['Cardio', 'Renal', 'Neuro', 'Pulm'][i % 4],
    };
  });
}

async function textDoc() {
  const doc = await PDFDocument.create();
  return { doc, font: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
}

// ---------- a) image-only with toolbar clutter + separate key ----------
function questionImage(q, total) {
  const W = 1600;
  const H = 1000;
  const c = createCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#e8e8e8';
  g.fillRect(0, 0, W, H);
  // fake browser chrome: tabs + address bar
  g.fillStyle = '#d0d0d0';
  g.fillRect(0, 0, W, 44);
  g.fillStyle = '#f6f6f6';
  g.fillRect(14, 8, 260, 36);
  g.fillStyle = '#333';
  g.font = '18px sans-serif';
  g.fillText('Practice Tool - Browser', 30, 32);
  g.fillStyle = '#fff';
  g.fillRect(0, 44, W, 50);
  g.fillStyle = '#eee';
  g.fillRect(120, 52, 1200, 34);
  g.fillStyle = '#555';
  g.fillText('https://practice.example.test/exam/session', 140, 75);
  // app header strip
  g.fillStyle = '#2b4c7e';
  g.fillRect(0, 94, W, 56);
  g.fillStyle = '#fff';
  g.font = 'bold 20px sans-serif';
  g.fillText(`Item ${q.n} of ${total}`, 24, 128);
  g.fillText('Sample Practice Session', 640, 128);
  // white question area
  g.fillStyle = '#fff';
  g.fillRect(0, 150, W, 760);
  g.fillStyle = '#000';
  g.font = '26px sans-serif';
  let y = 210;
  const words = q.stem.split(' ');
  let line = `${q.n}. `;
  for (const w of words) {
    if (g.measureText(line + w).width > 1380) {
      g.fillText(line, 60, y);
      y += 38;
      line = '';
    }
    line += w + ' ';
  }
  g.fillText(line, 60, y);
  y += 60;
  q.choices.forEach((ch, k) => {
    g.beginPath();
    g.arc(80, y - 9, 9, 0, Math.PI * 2);
    g.strokeStyle = '#444';
    g.lineWidth = 2;
    g.stroke();
    g.fillText(`${LETTERS[k]}) ${ch}`, 100, y);
    y += 44;
  });
  // fake OS dock at the bottom
  g.fillStyle = '#1f1f1f';
  g.fillRect(0, 910, W, 90);
  for (let k = 0; k < 9; k++) {
    g.fillStyle = ['#e44', '#4a4', '#48e', '#ec4', '#a4e'][k % 5];
    g.fillRect(420 + k * 86, 925, 62, 62);
  }
  return c.toBuffer('image/png');
}

async function fixtureA() {
  const qs = makeQuestions(6, 5, 11);
  const doc = await PDFDocument.create();
  for (const q of qs) {
    const img = await doc.embedPng(questionImage(q, qs.length));
    const page = doc.addPage([800, 500]);
    page.drawImage(img, { x: 0, y: 0, width: 800, height: 500 });
  }
  fs.writeFileSync(path.join(out, 'a-image-questions.pdf'), await doc.save());
  const k = await textDoc();
  let page = k.doc.addPage([612, 792]);
  let y = 740;
  page.drawText('Answer Key and Explanations', { x: 50, y, size: 16, font: k.bold });
  y -= 18;
  page.drawText('Practice set, 6 items, version 2', { x: 50, y, size: 10, font: k.font });
  y -= 30;
  for (const q of qs) {
    const lines = [];
    const paras = q.explanation.split('\n');
    paras.forEach((p, pi) => {
      const ws = wrap(k.font, (pi === 0 ? `${q.n}. ${q.answer}. ` : '') + p, 11, 500);
      lines.push(...ws);
    });
    for (const l of lines) {
      if (y < 60) {
        page = k.doc.addPage([612, 792]);
        y = 740;
      }
      page.drawText(l, { x: 50, y, size: 11, font: k.font });
      y -= 15;
    }
    // padding so explanations cross page breaks
    for (let pad = 0; pad < 8; pad++) {
      if (y < 60) {
        page = k.doc.addPage([612, 792]);
        y = 740;
      }
      page.drawText(`Further detail line ${pad + 1}: values of ${pad * 5 + 3} mg/dL are discussed here.`, { x: 50, y, size: 11, font: k.font });
      y -= 15;
    }
    y -= 10;
  }
  fs.writeFileSync(path.join(out, 'a-key.pdf'), await k.doc.save());
  return qs;
}

// ---------- b) text, "Answer: C" after each question ----------
async function fixtureB() {
  const qs = makeQuestions(5, 5, 22);
  const k = await textDoc();
  for (const q of qs) {
    const page = k.doc.addPage([612, 792]);
    let y = 730;
    const lines = wrap(k.font, `${q.n}. ${q.stem}`, 12, 500);
    for (const l of lines) {
      page.drawText(l, { x: 50, y, size: 12, font: k.font });
      y -= 16;
    }
    y -= 10;
    if (q.n === 1) {
      // a made-up "exhibit" picture: colored bands, like a photo or tracing
      for (let b = 0; b < 12; b++) page.drawRectangle({ x: 70 + b * 14, y: y - 96, width: 14, height: 96, color: rgb(0.9 - b * 0.05, 0.5 + (b % 3) * 0.1, 0.35 + (b % 4) * 0.1) });
      y -= 110;
    }
    q.choices.forEach((ch, i) => {
      page.drawText(`(${LETTERS[i]}) ${ch}`, { x: 70, y, size: 12, font: k.font });
      y -= 18;
    });
    y -= 30;
    page.drawText(`Answer: ${q.answer}`, { x: 50, y, size: 12, font: k.bold });
    y -= 18;
    for (const l of wrap(k.font, q.explanation.split('\n')[0], 11, 500)) {
      page.drawText(l, { x: 50, y, size: 11, font: k.font });
      y -= 15;
    }
  }
  fs.writeFileSync(path.join(out, 'b-answer-after.pdf'), await k.doc.save());
  return qs;
}

// ---------- c) several questions per page + key table ----------
async function fixtureC() {
  const qs = makeQuestions(9, 4, 33);
  const k = await textDoc();
  let page = k.doc.addPage([612, 792]);
  let y = 740;
  let onPage = 0;
  for (const q of qs) {
    if (onPage === 3) {
      page = k.doc.addPage([612, 792]);
      y = 740;
      onPage = 0;
    }
    for (const [j, l] of wrap(k.font, q.stem, 11, 470).entries()) {
      if (j === 0) page.drawText(`${q.n}.`, { x: 50, y, size: 11, font: k.bold });
      page.drawText(l, { x: 72, y, size: 11, font: k.font });
      y -= 14;
    }
    y -= 6;
    q.choices.forEach((ch, i) => {
      page.drawText(`${LETTERS[i].toLowerCase()}. ${ch}`, { x: 86, y, size: 11, font: k.font });
      y -= 15;
    });
    y -= 40;
    onPage++;
  }
  page = k.doc.addPage([612, 792]);
  y = 740;
  page.drawText('Answer Key', { x: 50, y, size: 16, font: k.bold });
  y -= 30;
  page.drawText('Question', { x: 60, y, size: 11, font: k.bold });
  page.drawText('Answer', { x: 160, y, size: 11, font: k.bold });
  y -= 18;
  for (const q of qs) {
    page.drawText(String(q.n), { x: 60, y, size: 11, font: k.font });
    page.drawText(q.answer, { x: 160, y, size: 11, font: k.font });
    page.drawLine({ start: { x: 55, y: y - 4 }, end: { x: 220, y: y - 4 }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
    y -= 18;
  }
  fs.writeFileSync(path.join(out, 'c-multi-per-page.pdf'), await k.doc.save());
  return qs;
}

// ---------- d) two columns, choices A-H ----------
async function fixtureD() {
  const qs = makeQuestions(4, 8, 44);
  const k = await textDoc();
  for (let p = 0; p < qs.length; p += 2) {
    const page = k.doc.addPage([792, 612]);
    [qs[p], qs[p + 1]].forEach((q, col) => {
      if (!q) return;
      const x = col === 0 ? 40 : 420;
      let y = 570;
      for (const [j, l] of wrap(k.font, q.stem, 11, 320).entries()) {
        if (j === 0) page.drawText(`${q.n}.`, { x, y, size: 11, font: k.bold });
        page.drawText(l, { x: x + 18, y, size: 11, font: k.font });
        y -= 14;
      }
      y -= 8;
      q.choices.forEach((ch, i) => {
        page.drawText(`${LETTERS[i]}. ${ch}`, { x: x + 28, y, size: 11, font: k.font });
        y -= 15;
      });
    });
  }
  fs.writeFileSync(path.join(out, 'd-two-column.pdf'), await k.doc.save());
  return qs;
}

// ---------- e) key that marks each answer only with a yellow highlight (no "Answer:" text) ----------
async function fixtureE(qs) {
  const k = await textDoc();
  for (const q of qs) {
    const page = k.doc.addPage([612, 792]);
    let y = 730;
    for (const l of wrap(k.font, `${q.n}. ${q.stem}`, 11, 500)) {
      page.drawText(l, { x: 50, y, size: 11, font: k.font });
      y -= 15;
    }
    y -= 8;
    q.choices.forEach((ch, i) => {
      if (LETTERS[i] === q.answer) page.drawRectangle({ x: 66, y: y - 4, width: 380, height: 16, color: rgb(1, 1, 0) });
      page.drawText(`${LETTERS[i]}) ${ch}`, { x: 70, y, size: 11, font: k.font });
      y -= 20;
    });
    y -= 6;
    for (const l of wrap(k.font, q.explanation.split('\n')[0], 11, 480)) {
      page.drawText(l, { x: 90, y, size: 11, font: k.font, color: rgb(0, 0, 0.8) });
      y -= 15;
    }
  }
  fs.writeFileSync(path.join(out, 'e-highlight-key.pdf'), await k.doc.save());
}

const a = await fixtureA();
await fixtureE(a);
const b = await fixtureB();
const c = await fixtureC();
const d = await fixtureD();
fs.writeFileSync(path.join(out, 'answers.json'), JSON.stringify({ a: a.map((q) => q.answer), b: b.map((q) => q.answer), c: c.map((q) => q.answer), d: d.map((q) => q.answer) }));
console.log('fixtures written to', path.relative(root, out));
