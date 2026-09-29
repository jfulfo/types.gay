// Laying the pencil out: lemmas first, then the proof, in the space the book
// leaves under the theorem. What doesn't fit runs on overleaf.

import { THEOREM, type Doc } from '../engine/doc';
import type { LeanItem } from '../engine/lean';
import type { Term } from '../engine/term';

/** Pencil lines that fit under the printed theorem. */
export const ROOM = 17;

export type Line =
  | { kind: 'head'; item: string; number: number; lhs: Term; rhs: Term }
  | { kind: 'thm'; item: string }
  | { kind: 'row'; item: string; row: number; left?: Term; term: Term; cite: string }
  | { kind: 'gap' }
  | { kind: 'qed' };

/** A pencil bracket over a passage that turns up more than once. */
export interface Hint {
  item: string;
  fromRow: number;
  toRow: number;
  letter: string;
  /** How many times this passage occurs in the book. */
  count: number;
}

export interface Layout {
  lines: Line[];
  /** Lines under the theorem, and lines run on overleaf. */
  here: Line[];
  overleaf: Line[];
  fits: boolean;
  hints: Hint[];
  numbers: Map<string, number>;
}

const GREEK = 'αβγδεζηθικλμνξοπρστυφχψω';

export function layout(doc: Doc): Layout {
  const numbers = new Map<string, number>();
  doc.items.forEach((it, i) => it.id !== THEOREM && numbers.set(it.id, i + 1));
  const cite = (ref: string) => (numbers.has(ref) ? `L${numbers.get(ref)}` : ref);

  const lines: Line[] = [];
  for (const it of doc.items) {
    if (it.id === THEOREM) lines.push({ kind: 'thm', item: it.id });
    else lines.push({ kind: 'head', item: it.id, number: numbers.get(it.id)!, lhs: it.lhs, rhs: it.rhs });
    const c = it.chain;
    c.steps.forEach((s, i) =>
      lines.push({ kind: 'row', item: it.id, row: i + 1, left: i === 0 ? c.terms[0] : undefined, term: c.terms[i + 1], cite: cite(s.ref) }),
    );
    lines.push(it.id === THEOREM ? { kind: 'qed' } : { kind: 'gap' });
  }

  // Brackets: passages repeated somewhere in the book, outermost only.
  const count = new Map<string, number>();
  for (const it of doc.items) for (const m of it.chain.marks) count.set(m.key, (count.get(m.key) ?? 0) + 1);
  const letters = new Map<string, string>();
  const hints: Hint[] = [];
  for (const it of doc.items) {
    const repeated = it.chain.marks.filter((m) => (count.get(m.key) ?? 0) >= 2);
    for (const m of repeated) {
      const inside = repeated.some((o) => o !== m && o.from <= m.from && o.to >= m.to && o.to - o.from > m.to - m.from);
      if (inside) continue;
      if (!letters.has(m.key)) letters.set(m.key, GREEK[letters.size % GREEK.length]);
      hints.push({ item: it.id, fromRow: m.from + 1, toRow: m.to, letter: letters.get(m.key)!, count: count.get(m.key)! });
    }
  }

  return { lines, here: lines.slice(0, ROOM), overleaf: lines.slice(ROOM), fits: lines.length <= ROOM, hints, numbers };
}

export interface LeanLine {
  text: string;
  kind: 'head' | 'step' | 'gap';
  /** "item:row" for steps, matching the pencil row it translates. */
  key?: string;
}

/** All the Lean, in the same order as the pencil. */
export function leanLines(items: LeanItem[]): LeanLine[] {
  const out: LeanLine[] = [];
  for (const it of items) {
    for (const h of it.head) out.push({ text: h, kind: 'head' });
    it.steps.forEach((s, i) => out.push({ text: s, kind: 'step', key: `${it.id}:${i + 1}` }));
    out.push({ text: '', kind: 'gap' });
  }
  return out;
}
