import type { BaseItem } from "../types";

interface Labeled {
  label: string;
  name: string;
}

/** Flatten a template's group tree into a flat list of its leaf questions,
 * for comparing against newly extracted questions regardless of which group
 * they sit in. */
export function flattenBaseItems(items: BaseItem[]): Labeled[] {
  const out: Labeled[] = [];
  for (const item of items) {
    if (item.kind === "question") {
      out.push({ label: item.label, name: item.name });
    } else if (item.questions) {
      out.push(...flattenBaseItems(item.questions));
    }
  }
  return out;
}

export interface DuplicateMatch {
  baseLabel: string;
  score: number;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordSet(text: string): Set<string> {
  return new Set(normalize(text).split(" ").filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const DUPLICATE_THRESHOLD = 0.6;

/** Best-guess match for a question against a template's existing questions, by
 * exact label/name match or word-overlap similarity. Not exact — a heuristic to
 * flag for the reviewer to confirm or dismiss, not to silently act on. */
export function findDuplicate(question: Labeled, baseQuestions: Labeled[]): DuplicateMatch | null {
  const qLabelNorm = normalize(question.label);
  const qNameNorm = normalize(question.name);
  const qWords = wordSet(question.label);

  let best: DuplicateMatch | null = null;
  for (const base of baseQuestions) {
    const baseLabelNorm = normalize(base.label);
    const baseNameNorm = normalize(base.name);
    let score: number;
    if (qLabelNorm && qLabelNorm === baseLabelNorm) score = 1;
    else if (qNameNorm && qNameNorm === baseNameNorm) score = 0.95;
    else score = jaccard(qWords, wordSet(base.label));

    if (score >= DUPLICATE_THRESHOLD && (!best || score > best.score)) {
      best = { baseLabel: base.label, score };
    }
  }
  return best;
}

/** Map of question id -> best duplicate match, for every question with one. */
export function findDuplicates<T extends Labeled & { id: string }>(
  questions: T[],
  baseQuestions: Labeled[],
): Map<string, DuplicateMatch> {
  const result = new Map<string, DuplicateMatch>();
  for (const q of questions) {
    const match = findDuplicate(q, baseQuestions);
    if (match) result.set(q.id, match);
  }
  return result;
}
