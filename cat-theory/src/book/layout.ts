// Laying the pencil out across the book's proof pages, and the Lean beside it.

import { LAW, THEOREM, type Doc } from '../engine/doc';
import type { LeanItem } from '../engine/lean';
import type { Term } from '../engine/term';

/** Pencil lines a proof page holds at full size. */
export const LINES_PER_PAGE = 26;
/** Spreads the book sets aside for the proof. */
export const PROOF_SPREADS = 3;
export const CAPACITY = LINES_PER_PAGE * PROOF_SPREADS;

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
}

export interface Layout {
  lines: Line[];
  /** Line index ranges, one per proof page. */
  pages: [number, number][];
  /** Size the pencil has to shrink to so it all fits (1 = comfortable). */
  scale: number;
  fits: boolean;
  hints: Hint[];
  numbers: Map<string, number>;
}

const GREEK = 'αβγδεζηθικλμνξοπρστυφχψω';

export function cite(ref: string, numbers: Map<string, number>): string {
  if (ref === LAW) return 'A';
  return `L${numbers.get(ref)}`;
}

export function layout(doc: Doc): Layout {
  const numbers = new Map<string, number>();
  doc.items.forEach((it, i) => it.id !== THEOREM && numbers.set(it.id, i + 1));

  const lines: Line[] = [];
  for (const it of doc.items) {
    if (it.id === THEOREM) lines.push({ kind: 'thm', item: it.id });
    else lines.push({ kind: 'head', item: it.id, number: numbers.get(it.id)!, lhs: it.lhs, rhs: it.rhs });
    const c = it.chain;
    c.steps.forEach((s, i) =>
      lines.push({
        kind: 'row',
        item: it.id,
        row: i + 1,
        left: i === 0 ? c.terms[0] : undefined,
        term: c.terms[i + 1],
        cite: cite(s.ref, numbers),
      }),
    );
    lines.push(it.id === THEOREM ? { kind: 'qed' } : { kind: 'gap' });
  }

  const scale = Math.min(1, CAPACITY / lines.length);
  const perPage = Math.max(LINES_PER_PAGE, Math.ceil(lines.length / PROOF_SPREADS));
  const pages: [number, number][] = [];
  for (let p = 0; p < PROOF_SPREADS; p++) pages.push([p * perPage, Math.min(lines.length, (p + 1) * perPage)]);

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
      hints.push({ item: it.id, fromRow: m.from + 1, toRow: m.to, letter: letters.get(m.key)! });
    }
  }

  return { lines, pages, scale, fits: lines.length <= CAPACITY, hints, numbers };
}

export interface LeanLine {
  text: string;
  kind: 'head' | 'step' | 'gap';
  /** "item:row" for steps, matching the pencil row it translates. */
  key?: string;
}

/** The Lean for exactly the pencil lines on one page. */
export function leanFor(lines: Line[], items: LeanItem[]): LeanLine[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: LeanLine[] = [];
  for (const l of lines) {
    if (l.kind === 'head' || l.kind === 'thm') for (const h of byId.get(l.item)!.head) out.push({ text: h, kind: 'head' });
    else if (l.kind === 'row') out.push({ text: byId.get(l.item)!.steps[l.row - 1], kind: 'step', key: `${l.item}:${l.row}` });
    else out.push({ text: '', kind: 'gap' });
  }
  return out;
}
