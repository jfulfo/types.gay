// Dev check: carve the book greedily and have a local Lean (4.34.1 in ~/.local/lib/lean)
// check every stage. Usage: npx tsx scripts/pipeline.ts [out.lean]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { buildMonolith, carve, totalSteps, THEOREM, type Doc } from '../src/engine/doc';
import { leanFile } from '../src/engine/lean';

const LEAN = `${process.env.HOME}/.local/lib/lean/lean-4.34.1-linux/bin/lean`;
const OUT = process.argv[2] ?? '/tmp/pipeline.lean';
function lean(doc: Doc, label: string) {
  writeFileSync(OUT, leanFile(doc));
  const t = performance.now();
  try {
    execFileSync(LEAN, [OUT], { stdio: 'pipe' });
    console.log(`  lean ok (${label}) in ${(performance.now() - t).toFixed(0)}ms, ${leanFile(doc).length} chars`);
  } catch (e: any) {
    console.log(`  LEAN FAILED (${label}):\n${String(e.stdout).slice(0, 1500)}`);
    process.exit(1);
  }
}

let t = performance.now();
let doc = buildMonolith("((xy)z)(xz)' = y", 'xy = yx');
console.log(`monolith: ${totalSteps(doc)} steps, ${doc.items[0].chain.marks.length} marks, built in ${(performance.now() - t).toFixed(0)}ms`);
lean(doc, 'monolith');

// Carve the most repeated bracketed passage, again and again.
for (let round = 1; round <= 12; round++) {
  const counts = new Map<string, { n: number; item: string; from: number; to: number }>();
  for (const it of doc.items) for (const m of it.chain.marks) {
    const c = counts.get(m.key);
    if (c) c.n++;
    else counts.set(m.key, { n: 1, item: it.id, from: m.from, to: m.to });
  }
  const best = [...counts.values()].filter((c) => c.n >= 2).sort((a, b) => b.n * (b.to - b.from) - a.n * (a.to - a.from))[0];
  if (!best) break;
  t = performance.now();
  const r = carve(doc, best.item, best.from, best.to);
  doc = r.doc;
  const lem = doc.items.find((i) => i.id === r.lemma)!;
  console.log(`round ${round}: carved ${best.to - best.from} steps (x${best.n}) from ${best.item} -> ${r.lemma}; now ${totalSteps(doc)} steps in ${doc.items.length} items (${(performance.now() - t).toFixed(0)}ms)`);
  lean(doc, `round ${round}`);
}
for (const it of doc.items) console.log(`  ${it.id === THEOREM ? 'theorem' : it.id}: ${it.chain.steps.length} steps`);
