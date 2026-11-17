/**
 * "Import a folder": find question PDFs and their answer PDFs in a folder of folders (Surgery/, OBGYN/, …) and pair
 * them. Pure functions here; the screen does the reading and importing.
 */
export interface FoundFile {
  /** path relative to the folder the user picked, with "/" separators, e.g. "2 Surgery/5 Q.pdf" */
  path: string;
  name: string;
  /** the subfolder it is in ("" at the top level) */
  folder: string;
  file: () => Promise<File>;
}

export interface Pair {
  category: string;
  name: string;
  question: FoundFile;
  answer: FoundFile | null;
}

/** "2 Surgery" → "Surgery", "1 Internal Medicine" → "Internal Medicine": a leading number only orders folders. */
export function categoryName(folder: string): string {
  const last = folder.split('/').filter(Boolean).pop() ?? '';
  return last.replace(/^\s*\d+[\s._-]+/, '').trim() || last || 'Unsorted';
}

const ANSWER_WORDS = /(?:^|[\s._-])(?:a|ans|answers?|keys?|explanations?|solutions?|sol)(?=$|[\s._-])/i;
const QUESTION_WORDS = /(?:^|[\s._-])(?:q|qs|questions?|exam|test|form)(?=$|[\s._-])/i;

interface Parsed {
  num: string | null;
  isAnswer: boolean;
  base: string;
}

/** "5 Q.pdf" → 5, question; "5A.pdf" / "5 A.pdf" / "Form 5 answers.pdf" → 5, answer. */
export function parseName(name: string): Parsed {
  const stem = name.replace(/\.pdf$/i, '').trim();
  const m = /(\d+)\s*([A-Za-z]*)/.exec(stem);
  const num = m ? String(parseInt(m[1], 10)) : null;
  const glued = m && /^(a|ans|answers?|key)$/i.test(m[2]);
  const gluedQ = m && /^(q|qs|questions?)$/i.test(m[2]);
  const isAnswer = !!glued || (!gluedQ && ANSWER_WORDS.test(stem.replace(/\d+/g, ' ')) && !QUESTION_WORDS.test(stem.replace(/\d+/g, ' ')));
  const base = stem
    .toLowerCase()
    .replace(/\d+/g, ' ')
    .replace(ANSWER_WORDS, ' ')
    .replace(QUESTION_WORDS, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim();
  return { num, isAnswer, base };
}

/** Pair question and answer PDFs folder by folder (by number, then by name). */
export function pairFiles(files: FoundFile[]): Pair[] {
  const pdfs = files.filter((f) => /\.pdf$/i.test(f.name) && !f.name.startsWith('.'));
  const byFolder = new Map<string, FoundFile[]>();
  for (const f of pdfs) (byFolder.get(f.folder) ?? byFolder.set(f.folder, []).get(f.folder)!).push(f);
  const out: Pair[] = [];
  for (const [folder, list] of [...byFolder.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) {
    const parsed = list.map((f) => ({ f, p: parseName(f.name) }));
    const qs = parsed.filter((x) => !x.p.isAnswer);
    const as = parsed.filter((x) => x.p.isAnswer);
    const used = new Set<FoundFile>();
    for (const q of qs.sort((a, b) => a.f.name.localeCompare(b.f.name, undefined, { numeric: true }))) {
      const a = as.find((x) => !used.has(x.f) && x.p.num != null && x.p.num === q.p.num && (x.p.base === q.p.base || !x.p.base || !q.p.base)) ?? as.find((x) => !used.has(x.f) && x.p.num === q.p.num && q.p.num != null);
      if (a) used.add(a.f);
      const category = categoryName(folder);
      const label = q.p.num != null ? `${category} ${q.p.num}` : q.f.name.replace(/\.pdf$/i, '');
      out.push({ category, name: label, question: q.f, answer: a?.f ?? null });
    }
  }
  return out;
}
