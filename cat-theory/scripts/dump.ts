import { LEAVES } from '../src/book';
import { solveBook, type LeafSpec } from '../src/engine/solve';
import { show } from '../src/engine/term';

const order = (process.argv[2] ?? LEAVES.map((l) => l.id).join(',')).split(',');
const crossed = new Set((process.argv[3] ?? '').split(',').filter(Boolean));
const specs: LeafSpec[] = order.map((id) => {
  const l = LEAVES.find((x) => x.id === id)!;
  return { id, label: l.label, statement: l.statement,
    premises: l.premises.map((p) => ({ label: p.label, src: p.src, crossed: crossed.has(p.label), global: l.premisesGlobal })) };
});
for (const { id, result } of solveBook(specs, new Map())) {
  const t0 = performance.now();
  const leaf = LEAVES.find((x) => x.id === id)!;
  console.log(`\n=== ${leaf.label ?? 'Axioms'}: ${leaf.statement ?? ''}  [${result.status}]`);
  if (result.status === 'proved') {
    for (const [i, c] of result.proof.claims.entries()) {
      console.log(`  (${i + 1}) ${show(c.lhs)} = ${show(c.rhs)}:`);
      for (const l of c.lines) console.log(`        ${l.by ? '= ' : '  '}${show(l.term)}${l.by ? '   [' + l.by + ']' : ''}`);
    }
    for (const l of result.proof.main) console.log(`    ${l.by ? '= ' : '  '}${show(l.term)}${l.by ? '   [' + l.by + ']' : ''}`);
  } else if (result.status === 'refuted') {
    const m = result.cx.model;
    console.log('  n =', m.n, 'consts', m.consts, 'inv', m.inv, 'assign', result.cx.assignment);
    m.mul?.forEach((row) => console.log('   ', row.join(' ')));
  }
}
