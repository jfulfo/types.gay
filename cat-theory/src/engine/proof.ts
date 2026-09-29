// Turning completion output into a proof a person could have written:
// equations the prover derived along the way are either inlined into the
// calculation (when short) or pulled out as numbered claims. Every proof is
// re-checked step by step before it is returned.

import { concatChains, reverseChain, type Chain, type Equation, type Step } from './completion';
import {
  applySubst,
  constantsOf,
  renameVars,
  replaceAt,
  subtermAt,
  termEq,
  termKey,
  varsInOrder,
  varsOf,
  type Subst,
  type Term,
} from './term';

/** Derived facts whose written-out proof is at most this long are inlined. */
const INLINE_MAX = 4;

export interface Line {
  term: Term;
  /** How this line follows from the previous one (absent on the first line). */
  by?: string;
}

export interface Claim {
  lhs: Term;
  rhs: Term;
  lines: Line[];
}

export interface Proof {
  claims: Claim[];
  main: Line[];
}

export function writeProof(store: Equation[], chain: Chain, goal: [Term, Term]): Proof {
  const full = new Map<number, number>();
  const fullLength = (id: number): number => {
    const e = store[id];
    if (e.label) return 1;
    const memo = full.get(id);
    if (memo !== undefined) return memo;
    full.set(id, 1e6); // cycle guard; derivations are acyclic in practice
    let n = 0;
    for (const s of e.chain!.steps) n = Math.min(1e6, n + fullLength(s.eq));
    full.set(id, n);
    return n;
  };

  const claimOrder: number[] = [];
  const claimChains = new Map<number, Chain>();
  let fresh = 0;

  const expand = (c: Chain): Chain => {
    let out: Chain = { terms: [c.terms[0]], steps: [] };
    c.steps.forEach((step, i) => {
      const e = store[step.eq];
      if (e.label || fullLength(step.eq) > INLINE_MAX) {
        if (!e.label) ensureClaim(step.eq);
        out.terms.push(c.terms[i + 1]);
        out.steps.push(step);
      } else {
        out = concatChains(out, expand(instantiate(e, step, c.terms[i], `_i${fresh++}`)));
      }
    });
    return removeDetours(out);
  };

  const ensureClaim = (id: number) => {
    if (claimChains.has(id)) return;
    claimChains.set(id, { terms: [], steps: [] }); // placeholder against re-entry
    claimChains.set(id, expand(store[id].chain!));
    claimOrder.push(id);
  };

  let main = expand(chain);
  // Variables left over inside a closed calculation are arbitrary; pick a constant.
  const free = new Set<string>();
  for (const t of main.terms) varsOf(t, free);
  if (free.size) {
    const consts = constantsOf(goal[0], constantsOf(goal[1]));
    const pick: Term = consts.has('e') ? { f: 'e', a: [] } : { f: [...consts][0] ?? 'e', a: [] };
    const s: Subst = Object.fromEntries([...free].map((v) => [v, pick]));
    main = substChain(main, s);
  }

  // A claim cited only once reads better written out where it is used.
  const uses = () => {
    const count = new Map<number, number>();
    const seen = new Set<number>();
    const walk = (c: Chain) =>
      c.steps.forEach((s) => {
        if (store[s.eq].label) return;
        count.set(s.eq, (count.get(s.eq) ?? 0) + 1);
        if (!seen.has(s.eq)) {
          seen.add(s.eq);
          walk(claimChains.get(s.eq)!);
        }
      });
    walk(main);
    return count;
  };
  const inlineOnce = (c: Chain, count: Map<number, number>): Chain => {
    let out: Chain = { terms: [c.terms[0]], steps: [] };
    c.steps.forEach((step, i) => {
      if (!store[step.eq].label && count.get(step.eq) === 1) {
        const body = { ...store[step.eq], chain: claimChains.get(step.eq)! };
        out = concatChains(out, inlineOnce(instantiate(body, step, c.terms[i], `_o${fresh++}`), count));
      } else {
        out.terms.push(c.terms[i + 1]);
        out.steps.push(step);
      }
    });
    return removeDetours(out);
  };
  for (let round = 0; round < 10; round++) {
    const count = uses();
    if (![...count.values()].includes(1)) break;
    main = inlineOnce(main, count);
    for (const id of claimOrder) if ((count.get(id) ?? 0) > 1) claimChains.set(id, inlineOnce(claimChains.get(id)!, count));
  }

  // Only claims still referenced survive, renumbered.
  const used = new Set(uses().keys());
  const numbered = claimOrder.filter((id) => used.has(id));
  const number = new Map(numbered.map((id, i) => [id, i + 1]));

  const cite = (s: Step) => {
    const e = store[s.eq];
    return e.label ?? `(${number.get(s.eq)})`;
  };
  const toLines = (c: Chain): Line[] => c.terms.map((term, i) => (i === 0 ? { term } : { term, by: cite(c.steps[i - 1]) }));

  const proof: Proof = {
    claims: numbered.map((id) => {
      const e = store[id];
      const c = claimChains.get(id)!;
      const names = displayNames([e.lhs, e.rhs, ...c.terms]);
      const ren = (t: Term) => renameVars(t, names);
      return {
        lhs: ren(e.lhs),
        rhs: ren(e.rhs),
        lines: toLines(c).map((l) => ({ ...l, term: ren(l.term) })),
      };
    }),
    main: toLines(main),
  };

  // The kernel: nothing gets written down unless every step checks.
  const statement = (s: Step): [Term, Term] => [store[s.eq].lhs, store[s.eq].rhs];
  for (const id of numbered) {
    const c = claimChains.get(id)!;
    const e = store[id];
    checkChain(c, statement, (s) => store[s.eq].label !== undefined || (number.get(s.eq) ?? 1e9) < number.get(id)!);
    if (!termEq(c.terms[0], e.lhs) || !termEq(c.terms[c.terms.length - 1], e.rhs)) {
      throw new Error(`kernel: claim ${number.get(id)} proves the wrong thing`);
    }
  }
  checkChain(main, statement, () => true);
  if (!termEq(main.terms[0], goal[0]) || !termEq(main.terms[main.terms.length - 1], goal[1])) {
    throw new Error('kernel: proof does not reach the goal');
  }
  return proof;
}

function instantiate(e: Equation, step: Step, context: Term, tag: string): Chain {
  let c = e.chain!;
  if (step.dir === -1) c = reverseChain(c);
  // Variables internal to e's derivation are renamed apart from the context.
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

function removeDetours(c: Chain): Chain {
  const terms: Term[] = [];
  const steps: Step[] = [];
  const seen = new Map<string, number>();
  c.terms.forEach((t, i) => {
    const k = termKey(t);
    const at = seen.get(k);
    if (at !== undefined) {
      for (const dropped of terms.splice(at + 1)) seen.delete(termKey(dropped));
      steps.splice(at);
      return;
    }
    if (i > 0) steps.push(c.steps[i - 1]);
    seen.set(k, terms.length);
    terms.push(t);
  });
  return { terms, steps };
}

function substChain(c: Chain, s: Subst): Chain {
  return {
    terms: c.terms.map((t) => applySubst(t, s)),
    steps: c.steps.map((st) => ({ ...st, sigma: mapSubst(st.sigma, (t) => applySubst(t, s)) })),
  };
}

const mapSubst = (s: Subst, f: (t: Term) => Term): Subst =>
  Object.fromEntries(Object.entries(s).map(([k, t]) => [k, f(t)]));

const LETTERS = ['x', 'y', 'z', 'u', 'v', 'w', 'p', 'q', 'r', 's'];

function displayNames(ts: Term[]): (v: string) => string {
  const order = varsInOrder(ts);
  const m = new Map(order.map((v, i) => [v, LETTERS[i] ?? `x${i}`]));
  return (v) => m.get(v) ?? v;
}

export function checkChain(
  c: Chain,
  statement: (s: Step) => [Term, Term],
  allowed: (s: Step) => boolean,
): void {
  if (c.terms.length !== c.steps.length + 1) throw new Error('kernel: malformed chain');
  c.steps.forEach((s, i) => {
    if (!allowed(s)) throw new Error('kernel: circular citation');
    const [l, r] = statement(s);
    const from = s.dir === 1 ? l : r;
    const to = s.dir === 1 ? r : l;
    const before = c.terms[i];
    if (!termEq(subtermAt(before, s.pos), applySubst(from, s.sigma))) {
      throw new Error(`kernel: step ${i + 1} does not match`);
    }
    if (!termEq(c.terms[i + 1], replaceAt(before, s.pos, applySubst(to, s.sigma)))) {
      throw new Error(`kernel: step ${i + 1} rewrites wrongly`);
    }
  });
}
