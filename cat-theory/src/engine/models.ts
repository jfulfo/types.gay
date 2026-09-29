// Finite counterexample search, in the style of Mace4: fill in a
// multiplication table (and inverse map, and constants) cell by cell,
// backtracking as soon as some instance of an axiom is already violated.

import { constantsOf, functionsOf, isVar, varsInOrder, type Term } from './term';

export interface Model {
  n: number;
  mul?: number[][];
  inv?: number[];
  consts: Record<string, number>;
}

export interface Counterexample {
  model: Model;
  /** Values of the statement's variables that break it. */
  assignment: Record<string, number>;
  lhs: number;
  rhs: number;
}

type Eqn = [Term, Term];

const UNSET = -1;

export function findCounterexample(axioms: Eqn[], goal: Eqn, maxSize: number, deadline: number): Counterexample | null {
  const all = [...axioms, goal];
  const fns = new Set<string>();
  const consts = new Set<string>();
  for (const [l, r] of all) {
    functionsOf(l, fns);
    functionsOf(r, fns);
    constantsOf(l, consts);
    constantsOf(r, consts);
  }
  const constList = [...consts].sort((a, b) => (a === 'e' ? -1 : b === 'e' ? 1 : a.localeCompare(b)));
  const axiomVars = axioms.map(([l, r]) => varsInOrder([l, r]));
  const goalVars = varsInOrder(goal);

  for (let n = 2; n <= maxSize; n++) {
    const mul = fns.has('mul') ? Array.from({ length: n }, () => new Array<number>(n).fill(UNSET)) : undefined;
    const inv = fns.has('inv') ? new Array<number>(n).fill(UNSET) : undefined;
    const cv: Record<string, number> = {};
    for (const c of constList) cv[c] = UNSET;

    const evalTerm = (t: Term, env: Record<string, number>): number => {
      if (isVar(t)) return env[t.v];
      if (t.a.length === 0) return cv[t.f];
      if (t.f === 'inv') {
        const x = evalTerm(t.a[0], env);
        return x === UNSET ? UNSET : inv![x];
      }
      const x = evalTerm(t.a[0], env);
      if (x === UNSET) return UNSET;
      const y = evalTerm(t.a[1], env);
      return y === UNSET ? UNSET : mul![x][y];
    };

    // Does every fully evaluable instance of every axiom hold?
    const consistent = (): boolean => {
      for (let k = 0; k < axioms.length; k++) {
        const vars = axiomVars[k];
        const [l, r] = axioms[k];
        const env: Record<string, number> = {};
        const total = n ** vars.length;
        for (let idx = 0; idx < total; idx++) {
          let rest = idx;
          for (const v of vars) {
            env[v] = rest % n;
            rest = Math.floor(rest / n);
          }
          const a = evalTerm(l, env);
          if (a === UNSET) continue;
          const b = evalTerm(r, env);
          if (b !== UNSET && a !== b) return false;
        }
      }
      return true;
    };

    const breaksGoal = (): Counterexample | null => {
      const env: Record<string, number> = {};
      const total = n ** goalVars.length;
      for (let idx = 0; idx < total; idx++) {
        let rest = idx;
        for (const v of goalVars) {
          env[v] = rest % n;
          rest = Math.floor(rest / n);
        }
        const a = evalTerm(goal[0], env);
        const b = evalTerm(goal[1], env);
        if (a !== b) {
          return {
            model: { n, mul: mul?.map((row) => row.slice()), inv: inv?.slice(), consts: { ...cv } },
            assignment: { ...env },
            lhs: a,
            rhs: b,
          };
        }
      }
      return null;
    };

    // Cells in the order they get filled: constants, inverses, table rows.
    type Cell = { args: number[]; set: (x: number) => void };
    const cells: Cell[] = [];
    for (const c of constList) cells.push({ args: [], set: (x) => (cv[c] = x) });
    if (inv) for (let i = 0; i < n; i++) cells.push({ args: [i], set: (x) => (inv[i] = x) });
    if (mul) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) cells.push({ args: [i, j], set: (x) => (mul[i][j] = x) });
      }
    }

    let timedOut = false;
    let nodes = 0;
    const search = (k: number, maxUsed: number): Counterexample | null => {
      if ((++nodes & 1023) === 0 && Date.now() > deadline) timedOut = true;
      if (timedOut) return null;
      if (k === cells.length) return breaksGoal();
      // Symmetry breaking: elements nobody has mentioned yet are interchangeable,
      // so a cell may introduce at most one new one.
      const used = Math.max(maxUsed, ...cells[k].args);
      const limit = Math.min(n - 1, used + 1);
      for (let x = 0; x <= limit; x++) {
        cells[k].set(x);
        if (consistent()) {
          const found = search(k + 1, Math.max(used, x));
          if (found) return found;
        }
        if (timedOut) break;
      }
      cells[k].set(UNSET);
      return null;
    };

    const found = search(0, -1);
    if (found) return found;
    if (timedOut) return null;
  }
  return null;
}
