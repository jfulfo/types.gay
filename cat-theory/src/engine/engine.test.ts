import { describe, expect, it } from 'vitest';
import { LEAVES } from '../book';
import type { Counterexample } from './models';
import { settle, solveBook, type LeafResult, type LeafSpec } from './solve';
import { isVar, parseEquation, parseTerm, show, varsInOrder, type Term } from './term';

const OPTS = { proverMs: 3000, modelMs: 3000, maxModelSize: 6 };

function specs(order: string[], crossed: string[] = []): LeafSpec[] {
  return order.map((id) => {
    const l = LEAVES.find((x) => x.id === id)!;
    return {
      id,
      label: l.label,
      statement: l.statement,
      premises: l.premises.map((p) => ({
        label: p.label,
        src: p.src,
        crossed: crossed.includes(p.label),
        global: l.premisesGlobal,
      })),
    };
  });
}

function run(order: string[], crossed: string[] = []) {
  const out: Record<string, LeafResult> = {};
  for (const { id, result } of solveBook(specs(order, crossed), new Map(), OPTS)) out[id] = result;
  return out;
}

/** Evaluate independently of the model finder. */
function evaluate(t: Term, cx: Counterexample, env: Record<string, number>): number {
  if (isVar(t)) return env[t.v];
  if (t.a.length === 0) return cx.model.consts[t.f];
  if (t.f === 'inv') return cx.model.inv![evaluate(t.a[0], cx, env)];
  return cx.model.mul![evaluate(t.a[0], cx, env)][evaluate(t.a[1], cx, env)];
}

function holdsEverywhere([l, r]: [Term, Term], cx: Counterexample): boolean {
  const vars = varsInOrder([l, r]);
  const n = cx.model.n;
  for (let idx = 0; idx < n ** vars.length; idx++) {
    const env: Record<string, number> = {};
    let rest = idx;
    for (const v of vars) {
      env[v] = rest % n;
      rest = Math.floor(rest / n);
    }
    if (evaluate(l, cx, env) !== evaluate(r, cx, env)) return false;
  }
  return true;
}

const STANDARD = ['axioms', 'l1', 'l2', 'l3', 'l4', 'l5', 't6'];

describe('terms', () => {
  it('parses and prints', () => {
    expect(show(parseTerm("(xy)'"))).toBe('(xy)⁻¹');
    expect(show(parseTerm("x'(xy)"))).toBe('x⁻¹(xy)');
    expect(show(parseTerm('xyz'))).toBe('(xy)z');
  });
});

describe('the book in its printed order', () => {
  const r = run(STANDARD);
  it('proves every result', () => {
    for (const id of STANDARD.slice(1)) expect(r[id].status, id).toBe('proved');
  });
  it('cites earlier lemmas', () => {
    const p = r.l4;
    expect(p.status).toBe('proved');
    if (p.status === 'proved') expect(p.proof.main.some((l) => l.by?.startsWith('Lemma'))).toBe(true);
  });
});

describe('rearranging', () => {
  it('never cites a result that comes later', () => {
    const r = run(['axioms', 'l5', 'l4', 'l3', 'l2', 'l1']);
    const later: Record<string, string[]> = {
      l5: ['Lemma 1', 'Lemma 2', 'Lemma 3', 'Lemma 4'],
      l4: ['Lemma 1', 'Lemma 2', 'Lemma 3'],
      l3: ['Lemma 1', 'Lemma 2'],
    };
    for (const [id, banned] of Object.entries(later)) {
      const p = r[id];
      expect(p.status, id).toBe('proved');
      if (p.status !== 'proved') continue;
      const cites = [...p.proof.main, ...p.proof.claims.flatMap((c) => c.lines)].map((l) => l.by);
      for (const b of banned) expect(cites, id).not.toContain(b);
    }
  });

  it('with the axioms last, nothing before them can be proved', () => {
    const r = run(['l1', 'l2', 'axioms']);
    expect(r.l1.status).toBe('refuted');
    expect(r.l2.status).toBe('refuted');
  });

  it('does not let a theorem with its own hypothesis leak into later pages', () => {
    const r = run(['axioms', 't6', 'l3']);
    expect(r.l3.status).toBe('proved');
    if (r.l3.status === 'proved') {
      const cites = [...r.l3.proof.main, ...r.l3.proof.claims.flatMap((c) => c.lines)].map((l) => l.by);
      expect(cites).not.toContain('Theorem 6');
    }
  });
});

describe('crossing things out', () => {
  it('finds a non-abelian group when H is crossed out', () => {
    const r = run(STANDARD, ['H']);
    expect(r.t6.status).toBe('refuted');
    if (r.t6.status === 'refuted') expect(r.t6.cx.model.n).toBe(6);
  });

  for (const ax of ['G1', 'G2', 'G3']) {
    it(`settles every page without ${ax}`, () => {
      const r = run(STANDARD, [ax]);
      for (const id of STANDARD.slice(1)) expect(['proved', 'refuted', 'open'], id).toContain(r[id].status);
      expect(Object.values(r).some((x) => x.status === 'refuted')).toBe(true);
    });
  }
});

describe('soundness under random configurations', () => {
  // A small deterministic PRNG so failures reproduce.
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  for (let trial = 0; trial < 60; trial++) {
    const order = STANDARD.slice().sort(() => rand() - 0.5).filter(() => rand() > 0.15);
    const crossed = ['G1', 'G2', 'G3', 'H'].filter(() => rand() < 0.25);
    it(`${order.join(' ')} / crossed: ${crossed.join(',') || 'none'}`, () => {
      const leaves = specs(order, crossed);
      const available: [Term, Term][] = [];
      for (const { id, result } of solveBook(leaves, new Map(), OPTS)) {
        const leaf = leaves.find((l) => l.id === id)!;
        const local = leaf.premises.filter((p) => !p.global && !p.crossed).map((p) => parseEquation(p.src));
        for (const p of leaf.premises) if (p.global && !p.crossed) available.push(parseEquation(p.src));
        if (!leaf.statement) continue;
        const goal = parseEquation(leaf.statement);
        if (result.status === 'refuted') {
          for (const ax of [...available, ...local]) expect(holdsEverywhere(ax, result.cx), 'premise holds').toBe(true);
          expect(holdsEverywhere(goal, result.cx), 'goal fails').toBe(false);
        }
        if (result.status === 'proved') {
          // Proved facts must hold in every model of the premises we can find.
          const inputs = [...available, ...local].map(([lhs, rhs], i) => ({ lhs, rhs, label: `P${i}` }));
          const again = settle(goal, inputs, { proverMs: 0, modelMs: 800, maxModelSize: 4 });
          expect(again.status, 'no counterexample to a proved result').not.toBe('refuted');
          if (local.length === 0) available.push(goal);
        }
      }
    });
  }
});
