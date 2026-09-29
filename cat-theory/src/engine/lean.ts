// The facing page: the same proofs as Lean 4. Each rewrite step becomes an
// exact term (the cited equation, maybe reversed, pushed into its context
// with congrArg), so Lean re-checks precisely the steps the book shows.

import { LAW, THEOREM, type Doc, type Item, type Step } from './doc';
import { isVar, replaceAt, varsInOrder, type Term } from './term';

export const LEAN_PRELUDE = `class SingleLaw (G : Type) extends Mul G, Inv G where
  law : ∀ x y z : G, ((x * y) * z) * (x * z)⁻¹ = y

namespace SingleLaw
variable {G : Type} [SingleLaw G]
`;
export const LEAN_POSTLUDE = `end SingleLaw
`;

export function leanTerm(t: Term): string {
  if (isVar(t)) return t.v;
  if (t.a.length === 0) return t.f.startsWith('$') ? t.f.slice(1) : t.f;
  if (t.f === 'mul') {
    const side = (u: Term) => (!isVar(u) && u.f === 'mul' ? `(${leanTerm(u)})` : leanTerm(u));
    return `${side(t.a[0])} * ${side(t.a[1])}`;
  }
  if (t.f === 'inv') {
    const u = t.a[0];
    const inner = isVar(u) || u.a.length === 0 ? leanTerm(u) : `(${leanTerm(u)})`;
    return `${inner}⁻¹`;
  }
  throw new Error(`no Lean syntax for ${t.f}`);
}

/** The variables an item is stated over, in binder order. */
export function binders(lhs: Term, rhs: Term): string[] {
  const vs = varsInOrder([lhs, rhs]);
  if (vs.length) return vs;
  // The theorem is stated over skolem constants $x, $y, …
  const cs: string[] = [];
  const go = (t: Term) => {
    if (isVar(t)) return;
    if (t.a.length === 0 && t.f.startsWith('$') && !cs.includes(t.f)) cs.push(t.f);
    t.a.forEach(go);
  };
  go(lhs);
  go(rhs);
  return cs;
}

export interface LeanItem {
  id: string;
  name: string;
  /** "theorem …: … :=" and "calc …" */
  head: string[];
  /** One line per step of the proof, aligned with the pencil rows. */
  steps: string[];
}

export function leanNames(doc: Doc): Map<string, string> {
  const m = new Map<string, string>([[LAW, 'law']]);
  let k = 0;
  for (const it of doc.items) m.set(it.id, it.id === THEOREM ? 'comm' : `lemma${++k}`);
  return m;
}

export function leanItems(doc: Doc): LeanItem[] {
  const names = leanNames(doc);
  const stmtVars = new Map<string, string[]>([[LAW, ['x', 'y', 'z']]]);
  for (const it of doc.items) stmtVars.set(it.id, binders(it.lhs, it.rhs));

  const proofOf = (s: Step, before: Term): string => {
    // Lean works the instantiation out itself from the calc step.
    const args = stmtVars.get(s.ref)!.map(() => '_');
    let h = [names.get(s.ref)!, ...args].join(' ');
    if (s.dir === -1) h = `(${h}).symm`;
    if (s.pos.length === 0) return h;
    const ctx = leanTerm(replaceAt(before, s.pos, { v: 't' }));
    return `congrArg (fun t => ${ctx}) (${h})`;
  };

  return doc.items.map((it: Item) => {
    const vars = stmtVars.get(it.id)!.map((v) => (v.startsWith('$') ? v.slice(1) : v));
    const name = names.get(it.id)!;
    const c = it.chain;
    return {
      id: it.id,
      name,
      head: [
        `theorem ${name} (${vars.join(' ')} : G) :`,
        `    ${leanTerm(it.lhs)} = ${leanTerm(it.rhs)} :=`,
        `  calc ${leanTerm(c.terms[0])}`,
      ],
      steps: c.steps.map((s, i) => `    _ = ${leanTerm(c.terms[i + 1])} := ${proofOf(s, c.terms[i])}`),
    };
  });
}

/** Just the declarations; the server wraps them in the prelude before checking. */
export function leanBody(doc: Doc): string {
  return leanItems(doc)
    .map((i) => [...i.head, ...i.steps].join('\n'))
    .join('\n\n');
}

export function leanFile(doc: Doc): string {
  return `${LEAN_PRELUDE}\n${leanBody(doc)}\n\n${LEAN_POSTLUDE}`;
}
