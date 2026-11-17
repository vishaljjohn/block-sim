/** Fractions (0–1) of the full PDF page, origin top-left. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A piece of a page that belongs to a question. rect omitted = whole page (after crop). */
export interface Segment {
  page: number; // 1-based
  rect?: Rect;
}

export interface ChoiceRegion extends Rect {
  letter: string;
  page: number;
  /** the page's own radio-button circle in front of the label, when one was found */
  radio?: Rect;
}

export interface Question {
  id: string;
  number: number;
  segments: Segment[];
  answer: string; // '' when unknown
  explanation: string;
  tags: string[];
  choiceCount: number;
  choices?: ChoiceRegion[];
  choiceSource?: 'auto' | 'manual';
  /** user asked for bubbles on this question even though choices were detected */
  forceBubbles?: boolean;
  /** the user drew this question's area by hand: automatic adjustments leave it alone */
  areaManual?: boolean;
  /** 0–1; below 0.6 is shown as a low-confidence warning on the key check screen */
  keyConfidence?: number;
  /** text of each detected choice (used to resolve keys that give the answer as text) */
  choiceTexts?: { letter: string; text: string }[];
  /** the key gave the answer as choice text that could not be matched to a letter yet */
  answerText?: string;
}

export interface Exam {
  id: string;
  schema: number;
  name: string;
  subject: string;
  createdAt: number;
  updatedAt: number;
  pageCount: number;
  questions: Question[];
  /** manual crop applied to every whole-page segment; null = automatic per-page crop (if available) */
  crop: Rect | null;
  autoCrop: boolean;
  keyChecked: boolean;
  isDemo?: boolean;
  /** 'none' = not processed, 'done' = text layer cached for all pages */
  textStatus: 'none' | 'partial' | 'done';
  /** show bubbles for the whole exam instead of clickable choices */
  alwaysBubbles?: boolean;
}

export interface Word {
  t: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** confidence 0–100 (100 for real PDF text) */
  c: number;
}

export interface PageText {
  id: string; // `${examId}:${page}`
  examId: string;
  page: number;
  source: 'pdf' | 'ocr';
  words: Word[];
  autoCrop: Rect | null;
  conf: number;
  /** vertical bands (page fractions) that contain ink inside the crop: text or pictures */
  ink?: [number, number][];
  /** the page's own radio-button circles, found from the pixels */
  radios?: Rect[];
  /** processing version: pages processed by an older version get the newer extras in the background */
  v?: number;
}

export type Mode = 'exam' | 'tutor' | 'untimed';
export type Confidence = 'sure' | 'unsure' | 'guess';
export type MissReason = 'knowledge' | 'misread' | 'narrowed' | 'changed' | 'time';

export const MISS_REASONS: { id: MissReason; label: string }[] = [
  { id: 'knowledge', label: 'Knowledge gap' },
  { id: 'misread', label: 'Misread the question' },
  { id: 'narrowed', label: 'Narrowed to two, picked wrong' },
  { id: 'changed', label: 'Changed from the right answer' },
  { id: 'time', label: 'Ran out of time' },
];

export type HighlightColor = 'yellow' | 'pink' | 'green' | 'blue' | 'purple';

/** color is optional: highlights saved before colors existed are yellow */
export type Highlight =
  | { id: string; kind: 'box'; page: number; x: number; y: number; w: number; h: number; color?: HighlightColor }
  /** sc/ec: character offsets inside the first/last word (partial words, e.g. just the "%" of "43%") */
  | { id: string; kind: 'words'; page: number; start: number; end: number; sc?: number; ec?: number; color?: HighlightColor };

export interface Display {
  theme: 'light' | 'dark';
  size: 'S' | 'M' | 'L' | 'XL';
  bold: boolean;
  /** 'board' = board-style test screen (navy bars, striped status list); 'default' = cleaner modern look */
  layout: 'board' | 'default';
  /** quick: dragging highlights at once; manual: drag selects, then pick a color to apply */
  highlightMode: 'quick' | 'manual';
  highlightColor: HighlightColor;
}

export const DEFAULT_DISPLAY: Display = { theme: 'light', size: 'M', bold: false, layout: 'board', highlightMode: 'quick', highlightColor: 'yellow' };

export interface AnswerChange {
  t: number;
  from: string | null;
  to: string | null;
}

export interface AttemptItem {
  qid: string;
  examId: string;
  number: number;
  answer: string | null;
  changes: AnswerChange[];
  timeMs: number;
  marked: boolean;
  confidence: Confidence | null;
  highlights: Highlight[];
  strikes: string[];
  note: string;
  /** tutor mode: answer submitted and revealed */
  locked: boolean;
  /** correct answer, copied in when the item is graded so history never depends on later edits */
  key: string | null;
  tags: string[];
  reviewNote: string;
  missReason: MissReason | null;
}

export interface TimerState {
  elapsedMs: number;
  runningSince: number | null;
  lastBeat: number | null;
  /** set when a gap > 60 s was detected (sleep, crash, closed window) */
  autoPaused: boolean;
}

export interface BlockState {
  start: number;
  end: number; // exclusive
  limitMs: number | null;
  timer: TimerState;
  ended: boolean;
  warned5: boolean;
}

export interface AttemptSettings {
  secPerQ: number | null;
  confidence: boolean;
  preset: string;
  order: 'sequential' | 'random';
  selection: string;
  breakMinutes: number | null;
}

export interface Attempt {
  id: string;
  schema: number;
  name: string;
  /** null for blocks mixed across exams ("Quiz me") */
  examId: string | null;
  mode: Mode;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  status: 'active' | 'completed';
  settings: AttemptSettings;
  blocks: BlockState[];
  currentBlock: number;
  phase: 'block' | 'break' | 'done';
  breakStartedAt: number | null;
  current: number;
  /** user-paused (question hidden) */
  paused: boolean;
  items: AttemptItem[];
}

export interface Redo {
  t: number;
  answer: string;
  correct: boolean;
}

export interface ReviewRecord {
  qid: string;
  examId: string;
  updatedAt: number;
  redos: Redo[];
  /** times the user opened this question in review from the missed bank */
  reviewedAt: number[];
}

export interface Snapshot {
  id: string;
  createdAt: number;
  reason: string;
  /** JSON string: attempts, reviews, exams (no PDFs) */
  data: string;
}

export interface Settings {
  welcomed: boolean;
  lastBackupAt: number | null;
  folderName: string | null;
  zoom: number;
  sidebarOpen: boolean;
  noFolderChosen: boolean;
  display: Display;
}

export const DEFAULT_SETTINGS: Settings = {
  welcomed: false,
  lastBackupAt: null,
  folderName: null,
  zoom: 1,
  sidebarOpen: true,
  noFolderChosen: false,
  display: DEFAULT_DISPLAY,
};

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
