// The book as a document: some axioms, some lemmas, one theorem. Every proof
// is a chain of rewrites citing an axiom or an earlier lemma. The reader
// restructures it by carving stretches of a proof out into lemmas (or
// erasing lemmas back into the proofs that use them).

import { complete, type Chain as StoreChain, type Equation } from './completion';
import {
  applySubst,
  isVar,
  match,
  parseEquation,
  renameVars,
  replaceAt,
  subtermAt,
  termEq,
  termKey,
  unify,
  varsInOrder,
  varsOf,
  type Pos,
  type Subst,
  type Term,
} from './term';

export const THEOREM = 'thm';

export interface Step {
  /** An axiom's label, or the id of an earlier lemma. */
  ref: string;
  dir: 1 | -1;
  pos: Pos;
  sigma: Subst;
}

/** A stretch the prover derived once and then repeated; the book brackets these. */
export interface Mark {
  key: string;
  from: number;
  to: number;
}

export interface Chain {
  terms: Term[];
  steps: Step[];
  marks: Mark[];
}

export interface Item {
  id: string;
  lhs: Term;
  rhs: Term;
  chain: Chain;
}

export interface Doc {
  axioms: Axiom[];
  /** Lemmas in order, then the theorem last. */
  items: Item[];
  nextId: number;
}

// ---------------------------------------------------------------------------
// Building the first, monolithic proof.

export interface Axiom {
  label: string;
  lhs: Term;
  rhs: Term;
}

export function buildMonolith(axiomSrcs: { label: string; src: string }[], goalSrc: string): Doc {
  const axioms = axiomSrcs.map(({ label, src }) => {
    const [lhs, rhs] = parseEquation(src);
    return { label, lhs, rhs };
  });
  const goal = parseEquation(goalSrc);
  const run = complete(axioms, goal, {
    maxSteps: 20000,
    maxTermSize: 30,
    deadline: Date.now() + 20000,
  });
  if (run.status !== 'proved') throw new Error(`prover could not prove ${goalSrc}`);
  const store = run.store;

  let fresh = 0;
  const marks: Mark[] = [];
  const expand = (c: StoreChain, into: Chain) => {
    c.steps.forEach((s, i) => {
      const e = store[s.eq];
      if (e.label) {
        into.terms.push(c.terms[i + 1]);
        into.steps.push({ ref: e.label, dir: s.dir, pos: s.pos, sigma: s.sigma });
        return;
      }
      const from = into.terms.length - 1;
      expand(instantiateStore(e, s, c.terms[i], `_m${fresh++}`), into);
      marks.push({ key: `e${e.id}`, from, to: into.terms.length - 1 });
    });
  };
  const chain: Chain = { terms: [run.proof!.terms[0]], steps: [], marks: [] };
  expand(run.proof!, chain);
  chain.marks = marks;

  // Stray variables inside a closed calculation are arbitrary: use x.
  const skolem = run.goal[0];
  const free = new Set<string>();
  chain.terms.forEach((t) => varsOf(t, free));
  const pick = firstConstant(skolem);
  const fixed = substChain(chain, Object.fromEntries([...free].map((v) => [v, pick])));

  const doc: Doc = {
    axioms,
    items: [{ id: THEOREM, lhs: run.goal[0], rhs: run.goal[1], chain: tidy(fixed) }],
    nextId: 1,
  };
  checkDoc(doc);
  return doc;
}

function firstConstant(t: Term): Term {
  if (isVar(t)) return t;
  if (t.a.length === 0) return t;
  return firstConstant(t.a[0]);
}

function instantiateStore(e: Equation, step: StoreChain['steps'][number], context: Term, tag: string): StoreChain {
  let c = e.chain!;
  if (step.dir === -1) {
    c = {
      terms: c.terms.slice().reverse(),
      steps: c.steps
        .slice()
        .reverse()
        .map((s) => ({ ...s, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 })),
    };
  }
  const sigma: Subst = { ...step.sigma };
  for (const v of varsInOrder(c.terms)) if (!sigma[v]) sigma[v] = { v: v + tag };
  return {
    terms: c.terms.map((t) => replaceAt(context, step.pos, applySubst(t, sigma))),
    steps: c.steps.map((s) => ({
      ...s,
      pos: [...step.pos, ...s.pos],
      sigma: mapSubst(s.sigma, (t) => applySubst(t, sigma)),
    })),
  };
}

// ---------------------------------------------------------------------------
// Chain utilities.

const mapSubst = (s: Subst, f: (t: Term) => Term): Subst =>
  Object.fromEntries(Object.entries(s).map(([k, t]) => [k, f(t)]));

function substChain(c: Chain, s: Subst): Chain {
  return {
    terms: c.terms.map((t) => applySubst(t, s)),
    steps: c.steps.map((st) => ({ ...st, sigma: mapSubst(st.sigma, (t) => applySubst(t, s)) })),
    marks: c.marks,
  };
}

/** Cut out detours (a term that recurs) and drop marks that no longer make sense. */
function tidy(c: Chain): Chain {
  const terms: Term[] = [];
  const steps: Step[] = [];
  const index: number[] = []; // old term index -> new index (or -1)
  const seen = new Map<string, number>();
  c.terms.forEach((t, i) => {
    const k = termKey(t);
    const at = seen.get(k);
    if (at !== undefined) {
      for (const dropped of terms.splice(at + 1)) seen.delete(termKey(dropped));
      steps.splice(at);
      for (let j = 0; j < i; j++) if (index[j] > at) index[j] = -1;
      index[i] = at;
      return;
    }
    if (i > 0) steps.push(c.steps[i - 1]);
    seen.set(k, terms.length);
    index[i] = terms.length;
    terms.push(t);
  });
  const marks: Mark[] = [];
  for (const m of c.marks) {
    const from = index[m.from];
    const to = index[m.to];
    const whole = from === 0 && to === terms.length - 1;
    if (from >= 0 && to >= 0 && to - from >= 2 && !whole && !marks.some((x) => x.from === from && x.to === to)) {
      marks.push({ key: m.key, from, to });
    }
  }
  return { terms, steps, marks };
}

export function statementOf(doc: Doc, ref: string): [Term, Term] {
  const ax = doc.axioms.find((a) => a.label === ref);
  if (ax) return [ax.lhs, ax.rhs];
  const it = doc.items.find((i) => i.id === ref);
  if (!it) throw new Error(`unknown reference ${ref}`);
  return [it.lhs, it.rhs];
}

function applyStep(doc: Doc, t: Term, s: Step): Term {
  const [l, r] = statementOf(doc, s.ref);
  const from = s.dir === 1 ? l : r;
  const to = s.dir === 1 ? r : l;
  if (!termEq(subtermAt(t, s.pos), applySubst(from, s.sigma))) throw new Error(`kernel: ${s.ref} does not apply`);
  return replaceAt(t, s.pos, applySubst(to, s.sigma));
}

/** The kernel. Throws unless every step of every proof checks. */
export function checkDoc(doc: Doc): void {
  const earlier = new Set<string>(doc.axioms.map((a) => a.label));
  doc.items.forEach((it, idx) => {
    if ((it.id === THEOREM) !== (idx === doc.items.length - 1)) throw new Error('kernel: theorem must come last');
    const c = it.chain;
    if (c.terms.length !== c.steps.length + 1) throw new Error('kernel: malformed chain');
    if (!termEq(c.terms[0], it.lhs) || !termEq(c.terms[c.terms.length - 1], it.rhs)) {
      throw new Error(`kernel: ${it.id} proves the wrong thing`);
    }
    c.steps.forEach((s, i) => {
      if (!earlier.has(s.ref)) throw new Error(`kernel: ${it.id} cites ${s.ref} before it is proved`);
      if (!termEq(applyStep(doc, c.terms[i], s), c.terms[i + 1])) throw new Error(`kernel: ${it.id} step ${i + 1}`);
    });
    earlier.add(it.id);
  });
}

// ---------------------------------------------------------------------------
// Carving: the most general lemma a stretch of steps proves.

function commonPrefix(ps: Pos[]): Pos {
  if (!ps.length) return [];
  let n = ps[0].length;
  for (const p of ps) {
    let k = 0;
    while (k < n && k < p.length && p[k] === ps[0][k]) k++;
    n = k;
  }
  return ps[0].slice(0, n);
}

/**
 * Replay the steps of chain[from..to] on a term with variables, refining it
 * by unification only as far as each step demands. The result is the
 * principal lemma: every other statement those steps prove is an instance.
 */
export function generalize(
  doc: Doc,
  chain: Chain,
  from: number,
  to: number,
): { lhs: Term; rhs: Term; chain: Chain; at: Pos; sigma: Subst } {
  const steps = chain.steps.slice(from, to);
  const at = commonPrefix(steps.map((s) => s.pos));
  const concrete = chain.terms.slice(from, to + 1).map((t) => subtermAt(t, at));
  let fresh = 0;
  const v = (): Term => ({ v: `g${fresh++}` });

  let hist: Term[] = [v()];
  const symSteps: Step[] = [];
  const refine = (s: Subst) => {
    hist = hist.map((t) => applySubst(t, s));
    for (const st of symSteps) st.sigma = mapSubst(st.sigma, (t) => applySubst(t, s));
  };

  steps.forEach((step, k) => {
    const pos = step.pos.slice(at.length);
    // Open up variables that sit above the position this step rewrites.
    for (let d = 0; d < pos.length; d++) {
      const cur = subtermAt(hist[hist.length - 1], pos.slice(0, d));
      if (isVar(cur)) {
        const c = subtermAt(concrete[k], pos.slice(0, d));
        if (isVar(c)) throw new Error('generalize: concrete chain too general');
        refine({ [cur.v]: { f: c.f, a: c.a.map(() => v()) } });
      }
    }
    const [l, r] = statementOf(doc, step.ref);
    const tag = `_s${k}`;
    const ren = (t: Term) => renameVars(t, (x) => x + tag);
    const pat = ren(step.dir === 1 ? l : r);
    const out = ren(step.dir === 1 ? r : l);
    const cur = hist[hist.length - 1];
    const mgu = unify(subtermAt(cur, pos), pat);
    if (!mgu) throw new Error('generalize: step does not unify');
    refine(mgu);
    // Variables only on the far side of the equation stay free (they are fresh).
    const sigma: Subst = {};
    for (const x of varsOf(r, varsOf(l))) sigma[x] = applySubst({ v: x + tag }, mgu);
    const next = replaceAt(hist[hist.length - 1], pos, applySubst(out, mgu));
    symSteps.push({ ref: step.ref, dir: step.dir, pos, sigma });
    hist.push(next);
  });

  // Name the variables x, y, z, … and pin down any that live only inside the proof.
  const ends = varsInOrder([hist[0], hist[hist.length - 1]]);
  const names = new Map(ends.map((x, i) => [x, LETTERS[i] ?? `x${i}`]));
  const pinTo: Term = ends.length ? { v: names.get(ends[0])! } : hist[0];
  const rename: Subst = {};
  for (const x of varsInOrder(hist)) rename[x] = names.has(x) ? { v: names.get(x)! } : pinTo;
  const lemma: Chain = {
    terms: hist.map((t) => applySubst(t, rename)),
    steps: symSteps.map((s) => ({ ...s, sigma: mapSubst(s.sigma, (t) => applySubst(t, rename)) })),
    marks: chain.marks
      .filter((m) => m.from >= from && m.to <= to && !(m.from === from && m.to === to))
      .map((m) => ({ ...m, from: m.from - from, to: m.to - from })),
  };

  // How the lemma was used here: match the ends against the original stretch.
  let sigma: Subst | null = match(lemma.terms[0], concrete[0]);
  if (sigma) sigma = match(lemma.terms[lemma.terms.length - 1], concrete[concrete.length - 1], sigma);
  if (!sigma) throw new Error('generalize: lemma does not match its origin');
  return { lhs: lemma.terms[0], rhs: lemma.terms[lemma.terms.length - 1], chain: lemma, at, sigma };
}

const LETTERS = ['x', 'y', 'z', 'u', 'v', 'w', 'p', 'q', 'r', 's'];

// ---------------------------------------------------------------------------
// Collapsing every stretch of a chain that one use of a lemma can replace.

/** The smallest position outside of which s and t agree (null if equal). */
function diffPos(s: Term, t: Term): Pos | null {
  if (termEq(s, t)) return null;
  const p: Pos = [];
  let a = s;
  let b = t;
  for (;;) {
    if (isVar(a) || isVar(b) || a.f !== b.f) return p;
    let idx = -1;
    for (let i = 0; i < a.a.length; i++) {
      if (!termEq(a.a[i], b.a[i])) {
        if (idx >= 0) return p;
        idx = i;
      }
    }
    p.push(idx);
    a = a.a[idx];
    b = b.a[idx];
  }
}

/** One step of `ref` taking a to b, if there is one. */
function linkStep(doc: Doc, ref: string, a: Term, b: Term): Step | null {
  const p = diffPos(a, b);
  if (!p) return null;
  const [l, r] = statementOf(doc, ref);
  for (let d = p.length; d >= 0; d--) {
    const pos = p.slice(0, d);
    const sa = subtermAt(a, pos);
    const sb = subtermAt(b, pos);
    for (const dir of [1, -1] as const) {
      const from = dir === 1 ? l : r;
      const to = dir === 1 ? r : l;
      let sigma = match(from, sa);
      if (sigma) sigma = match(to, sb, sigma);
      if (sigma) return { ref, dir, pos, sigma };
    }
  }
  return null;
}

export function collapse(doc: Doc, c: Chain, ref: string, window: number): Chain {
  const terms: Term[] = [c.terms[0]];
  const steps: Step[] = [];
  const index: number[] = [0];
  let i = 0;
  while (i < c.terms.length - 1) {
    let taken = false;
    for (let j = Math.min(c.terms.length - 1, i + window); j >= i + 2; j--) {
      const s = linkStep(doc, ref, c.terms[i], c.terms[j]);
      if (s) {
        steps.push(s);
        terms.push(c.terms[j]);
        for (let k = i + 1; k < j; k++) index[k] = -1;
        index[j] = terms.length - 1;
        i = j;
        taken = true;
        break;
      }
    }
    if (!taken) {
      steps.push(c.steps[i]);
      terms.push(c.terms[i + 1]);
      index[i + 1] = terms.length - 1;
      i++;
    }
  }
  const marks = c.marks
    .filter((m) => index[m.from] >= 0 && index[m.to] >= 0 && index[m.to] - index[m.from] >= 2)
    .map((m) => ({ ...m, from: index[m.from], to: index[m.to] }));
  return tidy({ terms, steps, marks });
}

// ---------------------------------------------------------------------------
// The reader's two moves.

export function carve(doc: Doc, itemId: string, from: number, to: number): { doc: Doc; lemma: string } {
  const host = doc.items.findIndex((i) => i.id === itemId);
  if (host < 0 || to - from < 2) throw new Error('carve: need at least two steps');
  if (from === 0 && to === doc.items[host].chain.steps.length) throw new Error('carve: that is the whole proof');
  const g = generalize(doc, doc.items[host].chain, from, to);

  // Already known (maybe the other way round)? Then just use it.
  const known = [...doc.items.slice(0, host).map((i) => i.id), ...doc.axioms.map((a) => a.label)].find((ref) => {
    const [l, r] = statementOf(doc, ref);
    return sameUpToRenaming([l, r], [g.lhs, g.rhs]) || sameUpToRenaming([r, l], [g.lhs, g.rhs]);
  });
  let next: Doc;
  let ref: string;
  if (known) {
    next = doc;
    ref = known;
  } else {
    ref = `L${doc.nextId}`;
    const lemma: Item = { id: ref, lhs: g.lhs, rhs: g.rhs, chain: g.chain };
    const items = doc.items.slice();
    items.splice(host, 0, lemma);
    next = { ...doc, items, nextId: doc.nextId + 1 };
  }

  const window = Math.max(8, 3 * (to - from) + 6);
  const at = next.items.findIndex((i) => i.id === ref);
  next = {
    ...next,
    items: next.items.map((it, k) => (k > at ? { ...it, chain: collapse(next, it.chain, ref, window) } : it)),
  };
  checkDoc(next);
  return { doc: next, lemma: ref };
}

export function erase(doc: Doc, lemmaId: string): Doc {
  const lemma = doc.items.find((i) => i.id === lemmaId);
  if (!lemma || lemmaId === THEOREM) throw new Error('erase: no such lemma');
  let fresh = 0;
  const inline = (c: Chain): Chain => {
    const out: Chain = { terms: [c.terms[0]], steps: [], marks: [] };
    const index = [0];
    const added: Mark[] = [];
    c.steps.forEach((s, i) => {
      if (s.ref !== lemmaId) {
        out.steps.push(s);
        out.terms.push(c.terms[i + 1]);
      } else {
        const body = s.dir === 1 ? lemma.chain : reverse(lemma.chain);
        const tag = `_e${fresh++}`;
        const sigma: Subst = { ...s.sigma };
        for (const x of varsInOrder(body.terms)) if (!sigma[x]) sigma[x] = { v: x + tag };
        const start = out.terms.length - 1;
        body.steps.forEach((b, k) => {
          out.steps.push({ ...b, pos: [...s.pos, ...b.pos], sigma: mapSubst(b.sigma, (t) => applySubst(t, sigma)) });
          out.terms.push(replaceAt(c.terms[i], s.pos, applySubst(body.terms[k + 1], sigma)));
        });
        // The erased lemma's own brackets come along, and the whole stretch is marked.
        for (const m of body.marks) added.push({ ...m, from: start + m.from, to: start + m.to });
        added.push({ key: `lemma:${lemmaId}`, from: start, to: out.terms.length - 1 });
      }
      index[i + 1] = out.terms.length - 1;
    });
    const carried = c.marks.map((m) => ({ ...m, from: index[m.from], to: index[m.to] }));
    return tidy({ ...out, marks: [...carried, ...added] });
  };
  const next: Doc = {
    ...doc,
    items: doc.items.filter((i) => i.id !== lemmaId).map((it) => ({ ...it, chain: inline(it.chain) })),
  };
  checkDoc(next);
  return next;
}

function reverse(c: Chain): Chain {
  const n = c.terms.length - 1;
  return {
    terms: c.terms.slice().reverse(),
    steps: c.steps
      .slice()
      .reverse()
      .map((x) => ({ ...x, dir: (x.dir === 1 ? -1 : 1) as 1 | -1 })),
    marks: c.marks.map((m) => ({ ...m, from: n - m.to, to: n - m.from })),
  };
}

function sameUpToRenaming(a: [Term, Term], b: [Term, Term]): boolean {
  const s = match(a[0], b[0]);
  const s2 = s && match(a[1], b[1], s);
  if (!s2) return false;
  const back = match(b[0], a[0]);
  return !!(back && match(b[1], a[1], back));
}

/** Every proof, as lines; for measuring how much page it needs. */
export function totalSteps(doc: Doc): number {
  return doc.items.reduce((n, it) => n + it.chain.steps.length, 0);
}
