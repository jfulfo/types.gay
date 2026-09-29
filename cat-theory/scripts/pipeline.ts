// Dev check: build the book, carve it greedily and at random, and have a local
// Lean (4.34.1 in ~/.local/lib/lean) check every stage.
// Usage: npx tsx scripts/pipeline.ts [out.lean]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { AXIOMS, THEOREM_SRC } from '../src/book/theory';
import { buildMonolith, carve, erase, THEOREM, type Doc } from '../src/engine/doc';
import { leanFile } from '../src/engine/lean';

const LEAN = `${process.env.HOME}/.local/lib/lean/lean-4.34.1-linux/bin/lean`;
const OUT = process.argv[2] ?? '/tmp/pipeline.lean';
function lean(doc: Doc, label: string) {
  writeFileSync(OUT, leanFile(doc));
  try {
    execFileSync(LEAN, [OUT], { stdio: 'pipe' });
  } catch (e: any) {
    console.log(`LEAN FAILED (${label}):\n${String(e.stdout).slice(0, 1500)}`);
    console.log(leanFile(doc));
    process.exit(1);
  }
}

const base = buildMonolith(AXIOMS, THEOREM_SRC);
lean(base, 'monolith');
console.log('monolith ok');
let doc = base;
for (let round = 1; round <= 4; round++) {
  const counts = new Map<string, { n: number; item: string; from: number; to: number }>();
  for (const it of doc.items) for (const m of it.chain.marks) {
    const c = counts.get(m.key);
    if (c) c.n++;
    else counts.set(m.key, { n: 1, item: it.id, from: m.from, to: m.to });
  }
  const best = [...counts.values()].filter((c) => c.n >= 2).sort((a, b) => b.n * (b.to - b.from) - a.n * (a.to - a.from))[0];
  if (!best) break;
  doc = carve(doc, best.item, best.from, best.to).doc;
  lean(doc, `greedy ${round}`);
}
console.log('greedy ok');
let seed = 3;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
doc = base;
for (let k = 0; k < 30; k++) {
  const it = doc.items[Math.floor(rand() * doc.items.length)];
  const n = it.chain.steps.length;
  if (n < 3) continue;
  const from = Math.floor(rand() * (n - 2));
  const to = Math.min(n, from + 2 + Math.floor(rand() * 6));
  if (from === 0 && to === n) continue;
  doc = carve(doc, it.id, from, to).doc;
  if (rand() < 0.25 && doc.items.length > 1) doc = erase(doc, doc.items[0].id);
  lean(doc, `random ${k}`);
}
console.log('random ok;', doc.items.length - 1, 'lemmas at the end');
console.log(leanFile(doc).split('\n').slice(0, 30).join('\n'));
void THEOREM;
