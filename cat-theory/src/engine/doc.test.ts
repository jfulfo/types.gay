import { describe, expect, it } from 'vitest';
import { buildMonolith, carve, checkDoc, erase, totalSteps, THEOREM, type Doc } from './doc';
import { leanBody } from './lean';

const LAW = "((xy)z)(xz)' = y";
const base = buildMonolith(LAW, 'xy = yx');

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

describe('the monolith', () => {
  it('is long, checked, and bracketed', () => {
    expect(totalSteps(base)).toBeGreaterThan(300);
    expect(base.items[0].chain.marks.length).toBeGreaterThan(10);
    expect(() => checkDoc(base)).not.toThrow();
  });
});

describe('carving', () => {
  it('collapses every repeat of a bracketed passage', () => {
    const marks = base.items[0].chain.marks;
    const count = (k: string) => marks.filter((x) => x.key === k).length;
    const m = marks.reduce((a, b) => (count(b.key) * (b.to - b.from) > count(a.key) * (a.to - a.from) ? b : a));
    const { doc, lemma } = carve(base, THEOREM, m.from, m.to);
    expect(doc.items[0].id).toBe(lemma);
    expect(totalSteps(doc)).toBeLessThan(totalSteps(base));
    expect(doc.items[1].chain.steps.some((s) => s.ref === lemma)).toBe(true);
  });

  it('works on arbitrary stretches, and erasing undoes it soundly', () => {
    let doc: Doc = base;
    for (let k = 0; k < 40; k++) {
      const it = doc.items[Math.floor(rand() * doc.items.length)];
      const n = it.chain.steps.length;
      if (n < 3) continue;
      const from = Math.floor(rand() * (n - 2));
      const to = Math.min(n, from + 2 + Math.floor(rand() * 12));
      if (from === 0 && to === n) continue;
      const r = carve(doc, it.id, from, to);
      expect(() => checkDoc(r.doc)).not.toThrow();
      doc = r.doc;
      if (rand() < 0.3 && doc.items.length > 1) {
        const victim = doc.items[Math.floor(rand() * (doc.items.length - 1))];
        doc = erase(doc, victim.id);
        expect(() => checkDoc(doc)).not.toThrow();
      }
    }
    expect(doc.items[doc.items.length - 1].id).toBe(THEOREM);
  });

  it('reuses a lemma it already has instead of stating it twice', () => {
    const m = base.items[0].chain.marks.find((x) => x.to - x.from >= 3)!;
    const once = carve(base, THEOREM, m.from, m.to);
    const again = once.doc.items[1].chain.marks.find((x) => x.key === m.key);
    if (!again) return; // every copy was collapsed already
    const twice = carve(once.doc, THEOREM, again.from, again.to);
    expect(twice.doc.items.length).toBe(once.doc.items.length);
  });
});

describe('lean', () => {
  it('uses only the vocabulary the checking server accepts', () => {
    const body = leanBody(carve(base, THEOREM, 0, 5).doc);
    const tokens = body.match(/[A-Za-z_][A-Za-z0-9_]*|:=|=>|⁻¹|[():=*._]|\S/g)!;
    const ok = /^(theorem|calc|fun|congrArg|symm|law|comm|lemma\d+|G|[xyzuvwpqrst]|:=|=>|⁻¹|[():=*._])$/;
    expect(tokens.filter((t) => !ok.test(t))).toEqual([]);
  });
});

describe('the checking server', () => {
  it('wraps proofs in the same prelude the book prints', async () => {
    const { readFileSync } = await import('node:fs');
    const { LEAN_PRELUDE, LEAN_POSTLUDE } = await import('./lean');
    const cgi = readFileSync(new URL('../../../cgi-bin/lean/check.cgi', import.meta.url), 'utf8');
    const grab = (name: string) => cgi.match(new RegExp(`${name} = """([\\s\\S]*?)"""`))![1];
    expect(grab('PRELUDE')).toBe(LEAN_PRELUDE);
    expect(grab('POSTLUDE')).toBe(LEAN_POSTLUDE);
  });
});

describe('terms', () => {
  it('parse and print', async () => {
    const { parseTerm, show } = await import('./term');
    expect(show(parseTerm("(xy)'"))).toBe('(xy)⁻¹');
    expect(show(parseTerm("((xy)z)(xz)'"))).toBe('((xy)z)(xz)⁻¹');
  });
});
