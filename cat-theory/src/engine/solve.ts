// Works through the leaves in their current order. Each result may use the
// axioms and results printed before it (and its own hypotheses); if the
// prover can't close it we go looking for a counterexample instead.

import { complete, type Input } from './completion';
import { findCounterexample, type Counterexample } from './models';
import { writeProof, type Proof } from './proof';
import { parseEquation, type Term } from './term';

export interface Premise {
  label: string;
  src: string;
  crossed: boolean;
  /** Axioms hold for every later page; hypotheses only for their own result. */
  global: boolean;
}

export interface LeafSpec {
  id: string;
  /** How later pages cite this result, e.g. "Lemma 2". Absent for the axioms page. */
  label?: string;
  statement?: string;
  premises: Premise[];
}

export type LeafResult =
  | { status: 'none' }
  | { status: 'proved'; proof: Proof; from: string[] }
  | { status: 'refuted'; cx: Counterexample; from: string[]; goal: [Term, Term] }
  | { status: 'open'; from: string[] };

export interface SolveOptions {
  proverMs: number;
  modelMs: number;
  maxModelSize: number;
}

export const DEFAULT_OPTIONS: SolveOptions = { proverMs: 1500, modelMs: 1500, maxModelSize: 6 };

/** Key that changes exactly when a leaf's result could change. */
export function leafKey(leaf: LeafSpec, available: Input[]): string {
  return JSON.stringify([
    leaf.id,
    leaf.premises.map((p) => p.crossed),
    available.map((a) => a.label),
  ]);
}

export function* solveBook(
  leaves: LeafSpec[],
  cache: Map<string, LeafResult>,
  opts: SolveOptions = DEFAULT_OPTIONS,
): Generator<{ id: string; key: string; result: LeafResult }> {
  const available: Input[] = [];
  for (const leaf of leaves) {
    const key = leafKey(leaf, available);
    const local: Input[] = [];
    for (const p of leaf.premises) {
      if (p.crossed) continue;
      const [lhs, rhs] = parseEquation(p.src);
      (p.global ? available : local).push({ lhs, rhs, label: p.label });
    }
    if (!leaf.statement) {
      yield { id: leaf.id, key, result: { status: 'none' } };
      continue;
    }
    let result = cache.get(key);
    if (!result) {
      result = settle(parseEquation(leaf.statement), [...available, ...local], opts);
      cache.set(key, result);
    }
    yield { id: leaf.id, key, result };
    // A result proved under its own hypotheses only holds conditionally, so later
    // pages may not use it as a plain equation.
    if (result.status === 'proved' && leaf.label && local.length === 0) {
      const [lhs, rhs] = parseEquation(leaf.statement);
      available.push({ lhs, rhs, label: leaf.label });
    }
  }
}

export function settle(goal: [Term, Term], inputs: Input[], opts: SolveOptions): LeafResult {
  const from = inputs.map((i) => i.label);
  const premises = inputs.map((i) => [i.lhs, i.rhs] as [Term, Term]);
  // Small counterexamples are cheap to find and save the prover a hopeless search.
  const quick = findCounterexample(premises, goal, Math.min(4, opts.maxModelSize), Date.now() + Math.min(150, opts.modelMs));
  if (quick) return { status: 'refuted', cx: quick, from, goal };
  const run = complete(inputs, goal, {
    maxSteps: 4000,
    maxTermSize: 21,
    deadline: Date.now() + opts.proverMs,
  });
  if (run.status === 'proved') {
    try {
      return { status: 'proved', proof: writeProof(run.store, run.proof!, run.goal), from };
    } catch (err) {
      // A kernel rejection is a bug in the prover; never write such a proof down.
      console.error(err);
      return { status: 'open', from };
    }
  }
  const cx = findCounterexample(premises, goal, opts.maxModelSize, Date.now() + opts.modelMs);
  if (cx) return { status: 'refuted', cx, from, goal };
  return { status: 'open', from };
}
