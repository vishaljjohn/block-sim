import { db, getMeta, setMeta } from '../db';
import { fixedLayout, newExam } from './importer';
import { saveExam, savePdf } from './store';

interface DemoKey {
  n: number;
  answer: string;
  explanation: string;
  tags: string[];
  choiceCount: number;
}

export const DEMO_ID = 'demo-exam';

/** Adds the 5-question demo exam (original, made-up questions) once. Deleting it keeps it deleted. */
export async function ensureDemo(force = false): Promise<boolean> {
  if (!force && (await getMeta('demoAdded', false))) return false;
  if (await db.exams.get(DEMO_ID)) return false;
  try {
    const base = import.meta.env.BASE_URL;
    const [pdf, key] = await Promise.all([fetch(base + 'demo/demo-exam.bin').then((r) => r.arrayBuffer()), fetch(base + 'demo/demo-key.json').then((r) => r.json() as Promise<DemoKey[]>)]);
    const exam = newExam('Demo exam (5 sample questions)', 'Sample', key.length);
    exam.id = DEMO_ID;
    exam.isDemo = true;
    exam.keyChecked = true;
    exam.questions = fixedLayout(exam.id, { pagesPerQuestion: 1, startPage: 1, endPage: key.length, skip: [] }).map((q, i) => ({
      ...q,
      id: `${DEMO_ID}:q${i + 1}`,
      answer: key[i].answer,
      explanation: key[i].explanation,
      tags: key[i].tags,
      choiceCount: key[i].choiceCount,
    }));
    await savePdf(exam.id, pdf);
    await saveExam(exam);
    await setMeta('demoAdded', true);
    return true;
  } catch (e) {
    console.warn('demo exam unavailable', e);
    return false;
  }
}
