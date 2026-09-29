// Unfailing Knuth–Bendix completion with proof recording.
//
// Every equation the prover ever derives keeps a Chain: a sequence of terms,
// each obtained from the previous one by rewriting a single subterm with an
// instance of some earlier equation. Input equations (axioms, hypotheses and
// lemmas from earlier pages) are the leaves; everything else can be expanded
// back into them, which is what lets us write the proof out afterwards.

import { kboGreater } from './order';
import {
  applySubst,
  funPositions,
  isVar,
  match,
  renameVars,
  replaceAt,
  size,
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

export interface Step {
  eq: number;
  /** 1: rewrite an instance of lhs into rhs; -1: the other way. */
  dir: 1 | -1;
  pos: Pos;
  sigma: Subst;
}

export interface Chain {
  terms: Term[];
  steps: Step[];
}

export interface Equation {
  id: number;
  lhs: Term;
  rhs: Term;
  /** Input equations carry the name they are cited by. */
  label?: string;
  /** How the equation was derived; absent for inputs. */
  chain?: Chain;
  oriented: boolean;
}

export interface Input {
  lhs: Term;
  rhs: Term;
  label: string;
}

export interface CompletionResult {
  status: 'proved' | 'saturated' | 'gave-up';
  store: Equation[];
  /** Chain from goal lhs to goal rhs (skolemized), when proved. */
  proof?: Chain;
  goal: [Term, Term];
}

export interface Budget {
  maxSteps: number;
  maxTermSize: number;
  deadline: number;
}

interface Candidate {
  lhs: Term;
  rhs: Term;
  chain: Chain;
  weight: number;
  seq: number;
}

export const reverseChain = (c: Chain): Chain => ({
  terms: c.terms.slice().reverse(),
  steps: c.steps
    .slice()
    .reverse()
    .map((s) => ({ ...s, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 })),
});

export function concatChains(a: Chain, b: Chain): Chain {
  if (!termEq(a.terms[a.terms.length - 1], b.terms[0])) throw new Error('chains do not meet');
  return { terms: [...a.terms, ...b.terms.slice(1)], steps: [...a.steps, ...b.steps] };
}

const trivialChain = (t: Term): Chain => ({ terms: [t], steps: [] });

/** Replace variables by skolem constants: x ↦ $x. */
export function skolemize(t: Term): Term {
  if (isVar(t)) return { f: '$' + t.v, a: [] };
  if (t.a.length === 0) return t;
  return { f: t.f, a: t.a.map(skolemize) };
}

export function complete(inputs: Input[], goal: [Term, Term], budget: Budget): CompletionResult {
  const store: Equation[] = [];
  const active: Equation[] = [];
  const passive: Candidate[] = [];
  const activeKeys = new Set<string>();
  let seq = 0;

  const goalL = skolemize(goal[0]);
  const goalR = skolemize(goal[1]);

  const push = (lhs: Term, rhs: Term, chain: Chain) => {
    if (size(lhs) > budget.maxTermSize || size(rhs) > budget.maxTermSize) return;
    passive.push({ lhs, rhs, chain, weight: size(lhs) + size(rhs), seq: seq++ });
  };

  for (const inp of inputs) {
    const id = store.length;
    store.push({ id, lhs: inp.lhs, rhs: inp.rhs, label: inp.label, oriented: false });
    push(inp.lhs, inp.rhs, {
      terms: [inp.lhs, inp.rhs],
      steps: [{ eq: id, dir: 1, pos: [], sigma: identity(inp.lhs, inp.rhs) }],
    });
  }

  // --- rewriting -----------------------------------------------------------

  const rewriteOnce = (t: Term): { term: Term; step: Step } | null => {
    for (const pos of funPositions(t)) {
      const sub = subtermAt(t, pos);
      for (const e of active) {
        for (const dir of e.oriented ? [1 as const] : [1 as const, -1 as const]) {
          const from = dir === 1 ? e.lhs : e.rhs;
          const to = dir === 1 ? e.rhs : e.lhs;
          const sigma = match(from, sub);
          if (!sigma) continue;
          const inst = applySubst(to, sigma);
          if (!e.oriented) {
            // Ordered rewriting: only use an instance that goes down.
            if (![...varsOf(to)].every((v) => sigma[v]) || !kboGreater(sub, inst)) continue;
          }
          return { term: replaceAt(t, pos, inst), step: { eq: e.id, dir, pos, sigma } };
        }
      }
    }
    return null;
  };

  const normalize = (t: Term): Chain => {
    const chain = trivialChain(t);
    let cur = t;
    for (let guard = 0; guard < 200; guard++) {
      const r = rewriteOnce(cur);
      if (!r) break;
      chain.terms.push(r.term);
      chain.steps.push(r.step);
      cur = r.term;
    }
    return chain;
  };

  const tryGoal = (): Chain | null => {
    const nl = normalize(goalL);
    const nr = normalize(goalR);
    if (!termEq(nl.terms[nl.terms.length - 1], nr.terms[nr.terms.length - 1])) return null;
    return concatChains(nl, reverseChain(nr));
  };

  // --- main loop -----------------------------------------------------------

  let proof = tryGoal();
  let steps = 0;
  while (!proof && passive.length) {
    if (++steps > budget.maxSteps || Date.now() > budget.deadline) {
      return { status: 'gave-up', store, goal: [goalL, goalR] };
    }
    const c = popLightest(passive);
    const nl = normalize(c.lhs);
    const nr = normalize(c.rhs);
    let lhs = nl.terms[nl.terms.length - 1];
    let rhs = nr.terms[nr.terms.length - 1];
    if (termEq(lhs, rhs)) continue;
    let chain = concatChains(concatChains(reverseChain(nl), c.chain), nr);

    let oriented = true;
    if (kboGreater(rhs, lhs)) {
      [lhs, rhs] = [rhs, lhs];
      chain = reverseChain(chain);
    } else if (!kboGreater(lhs, rhs)) oriented = false;

    // Canonical variable names keep the store readable and dedupe easy.
    const ren = canonicalRenaming(lhs, rhs, chain);
    lhs = renameVars(lhs, ren);
    rhs = renameVars(rhs, ren);
    chain = renameChain(chain, ren);

    const key = termKey(lhs) + '=' + termKey(rhs);
    const keyRev = termKey(rhs) + '=' + termKey(lhs);
    if (activeKeys.has(key) || (!oriented && activeKeys.has(keyRev))) continue;

    const eq: Equation = { id: store.length, lhs, rhs, chain, oriented };
    store.push(eq);

    // Interreduction: anything the new equation simplifies goes back to passive.
    for (let i = active.length - 1; i >= 0; i--) {
      const old = active[i];
      if (reducibleBy(old.lhs, eq) || reducibleBy(old.rhs, eq)) {
        active.splice(i, 1);
        activeKeys.delete(termKey(old.lhs) + '=' + termKey(old.rhs));
        push(old.lhs, old.rhs, {
          terms: [old.lhs, old.rhs],
          steps: [{ eq: old.id, dir: 1, pos: [], sigma: identity(old.lhs, old.rhs) }],
        });
      }
    }

    active.push(eq);
    activeKeys.add(key);
    for (const other of active) {
      for (const cp of criticalPairs(eq, other, store.length)) push(cp.lhs, cp.rhs, cp.chain);
      if (other !== eq) for (const cp of criticalPairs(other, eq, store.length)) push(cp.lhs, cp.rhs, cp.chain);
    }
    proof = tryGoal();
  }

  if (proof) return { status: 'proved', store, proof, goal: [goalL, goalR] };
  return { status: 'saturated', store, goal: [goalL, goalR] };
}

function reducibleBy(t: Term, e: Equation): boolean {
  for (const pos of funPositions(t)) {
    const sub = subtermAt(t, pos);
    for (const dir of e.oriented ? [1] : [1, -1]) {
      const from = dir === 1 ? e.lhs : e.rhs;
      const to = dir === 1 ? e.rhs : e.lhs;
      const sigma = match(from, sub);
      if (!sigma) continue;
      if (e.oriented) return true;
      if ([...varsOf(to)].every((v) => sigma[v]) && kboGreater(sub, applySubst(to, sigma))) return true;
    }
  }
  return false;
}

function identity(...ts: Term[]): Subst {
  const s: Subst = {};
  for (const t of ts) for (const v of varsOf(t)) s[v] = { v };
  return s;
}

function popLightest(q: Candidate[]): Candidate {
  let best = 0;
  for (let i = 1; i < q.length; i++) {
    if (q[i].weight < q[best].weight || (q[i].weight === q[best].weight && q[i].seq < q[best].seq)) best = i;
  }
  const [c] = q.splice(best, 1);
  return c;
}

function canonicalRenaming(lhs: Term, rhs: Term, chain: Chain): (v: string) => string {
  const order = varsInOrder([lhs, rhs, ...chain.terms]);
  const m = new Map(order.map((v, i) => [v, 'x' + i]));
  return (v) => m.get(v) ?? v;
}

function renameChain(c: Chain, ren: (v: string) => string): Chain {
  return {
    terms: c.terms.map((t) => renameVars(t, ren)),
    steps: c.steps.map((s) => ({
      ...s,
      sigma: Object.fromEntries(Object.entries(s.sigma).map(([k, t]) => [k, renameVars(t, ren)])),
    })),
  };
}

interface Rule {
  eq: Equation;
  dir: 1 | -1;
  l: Term;
  r: Term;
}

function rulesOf(e: Equation): Rule[] {
  const rs: Rule[] = [{ eq: e, dir: 1, l: e.lhs, r: e.rhs }];
  if (!e.oriented) rs.push({ eq: e, dir: -1, l: e.rhs, r: e.lhs });
  return rs.filter((r) => !isVar(r.l));
}

/** Overlaps of rule2 into non-variable positions of rule1's left side. */
function criticalPairs(e1: Equation, e2: Equation, fresh: number): { lhs: Term; rhs: Term; chain: Chain }[] {
  const out: { lhs: Term; rhs: Term; chain: Chain }[] = [];
  const tag = `_${fresh}`;
  for (const r1 of rulesOf(e1)) {
    for (const r2raw of rulesOf(e2)) {
      const ren = (v: string) => v + tag;
      const r2 = { ...r2raw, l: renameVars(r2raw.l, ren), r: renameVars(r2raw.r, ren) };
      for (const pos of funPositions(r1.l)) {
        if (pos.length === 0 && e1 === e2 && r1.dir === r2.dir) continue;
        const sigma = unify(subtermAt(r1.l, pos), r2.l);
        if (!sigma) continue;
        const peak = applySubst(r1.l, sigma);
        const left = applySubst(r1.r, sigma);
        const right = replaceAt(peak, pos, applySubst(r2.r, sigma));
        // Unfailing completion: skip peaks that go up on either side.
        if (!e1.oriented && kboGreater(left, peak)) continue;
        if (!e2.oriented && kboGreater(subtermAt(right, pos), subtermAt(peak, pos))) continue;
        if (termEq(left, right)) continue;
        const sigma1: Subst = {};
        for (const v of varsOf(e1.rhs, varsOf(e1.lhs))) sigma1[v] = applySubst({ v }, sigma);
        const sigma2: Subst = {};
        for (const v of varsOf(e2.rhs, varsOf(e2.lhs))) sigma2[v] = applySubst({ v: ren(v) }, sigma);
        out.push({
          lhs: left,
          rhs: right,
          chain: {
            terms: [left, peak, right],
            steps: [
              { eq: e1.id, dir: r1.dir === 1 ? -1 : 1, pos: [], sigma: sigma1 },
              { eq: e2.id, dir: r2.dir, pos, sigma: sigma2 },
            ],
          },
        });
      }
    }
  }
  return out;
}
