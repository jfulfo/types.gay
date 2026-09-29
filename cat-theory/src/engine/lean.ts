// The facing page: the same proofs in Lean 4. Axioms and lemmas take their
// variables implicitly, so each step of a calculation is just the equation it
// uses (reversed with .symm, pushed into its context with congrArg) and Lean
// works out the instance. Lean still checks every step.

import { AXIOMS, THEOREM_LEAN } from '../book/theory';
import { THEOREM, type Doc, type Step } from './doc';
import { isVar, parseEquation, replaceAt, varsInOrder, type Pos, type Term } from './term';

export function leanTerm(t: Term): string {
  if (isVar(t)) return t.v;
  if (t.f === 'hole') return '·';
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

function axiomLine(src: string, name: string): string {
  const [l, r] = parseEquation(src);
  return `  ${name} : ∀ {${varsInOrder([l, r]).join(' ')} : G}, ${leanTerm(l)} = ${leanTerm(r)}`;
}

export const LEAN_PRELUDE = `class LeftGroup (G : Type) extends Mul G, Inv G where
  e : G
${AXIOMS.map((a) => axiomLine(a.src, a.lean)).join('\n')}

namespace LeftGroup
variable {G : Type} [LeftGroup G]
`;
export const LEAN_POSTLUDE = `end LeftGroup
`;

/** The function that puts a hole at `pos` back into `t`, as short as Lean allows. */
function context(t: Term, pos: Pos): string {
  // One level down, the cdot shorthand scopes correctly: (· * y), (x * ·), (·⁻¹).
  if (pos.length === 1) return `(${leanTerm(replaceAt(t, pos, { f: 'hole', a: [] }))})`;
  return `(fun t => ${leanTerm(replaceAt(t, pos, { v: 't' }))})`;
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
  const m = new Map<string, string>(AXIOMS.map((a) => [a.label, a.lean]));
  let k = 0;
  for (const it of doc.items) m.set(it.id, it.id === THEOREM ? THEOREM_LEAN : `lemma${++k}`);
  return m;
}

export function leanItems(doc: Doc): LeanItem[] {
  const names = leanNames(doc);
  const cite = (s: Step, before: Term): string => {
    const h = names.get(s.ref)! + (s.dir === -1 ? '.symm' : '');
    return s.pos.length === 0 ? h : `congrArg ${context(before, s.pos)} ${h}`;
  };
  return doc.items.map((it) => {
    const name = names.get(it.id)!;
    const theorem = it.id === THEOREM;
    const vars = theorem ? skolems(it.lhs, it.rhs) : varsInOrder([it.lhs, it.rhs]);
    const binder = theorem ? `(${vars.join(' ')} : G)` : `{${vars.join(' ')} : G}`;
    const c = it.chain;
    return {
      id: it.id,
      name,
      head: [`theorem ${name} ${binder} :`, `    ${leanTerm(it.lhs)} = ${leanTerm(it.rhs)} :=`, `  calc ${leanTerm(c.terms[0])}`],
      steps: c.steps.map((s, i) => `    _ = ${leanTerm(c.terms[i + 1])} := ${cite(s, c.terms[i])}`),
    };
  });
}

function skolems(...ts: Term[]): string[] {
  const out: string[] = [];
  const go = (t: Term) => {
    if (isVar(t)) return;
    if (t.a.length === 0 && t.f.startsWith('$') && !out.includes(t.f.slice(1))) out.push(t.f.slice(1));
    t.a.forEach(go);
  };
  ts.forEach(go);
  return out;
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
