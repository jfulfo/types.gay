import { describe, expect, it } from 'vitest';
import { layout, ROOM } from '../book/layout';
import { AXIOMS, THEOREM_SRC } from '../book/theory';
import { buildMonolith, carve, checkDoc, erase, THEOREM, type Doc } from './doc';
import { leanBody, LEAN_POSTLUDE, LEAN_PRELUDE } from './lean';
import { parseTerm, show } from './term';

const base = buildMonolith(AXIOMS, THEOREM_SRC);

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

describe('the book as printed', () => {
  it('starts with a proof that runs over the page, with repeats bracketed', () => {
    expect(() => checkDoc(base)).not.toThrow();
    const lay = layout(base);
    expect(lay.fits).toBe(false);
    expect(lay.hints.some((h) => h.count >= 5)).toBe(true);
  });

  it('fits once the most repeated passage becomes a lemma', () => {
    const lay = layout(base);
    const h = lay.hints.reduce((a, b) => (b.count > a.count ? b : a));
    const { doc } = carve(base, h.item, h.fromRow - 1, h.toRow);
    expect(layout(doc).lines.length).toBeLessThanOrEqual(ROOM);
  });
});

describe('carving', () => {
  it('works on arbitrary stretches, and erasing undoes it soundly', () => {
    let doc: Doc = base;
    for (let k = 0; k < 60; k++) {
      const it = doc.items[Math.floor(rand() * doc.items.length)];
      const n = it.chain.steps.length;
      if (n < 3) continue;
      const from = Math.floor(rand() * (n - 2));
      const to = Math.min(n, from + 2 + Math.floor(rand() * 8));
      if (from === 0 && to === n) continue;
      doc = carve(doc, it.id, from, to).doc;
      expect(() => checkDoc(doc)).not.toThrow();
      if (rand() < 0.3 && doc.items.length > 1) {
        doc = erase(doc, doc.items[Math.floor(rand() * (doc.items.length - 1))].id);
        expect(() => checkDoc(doc)).not.toThrow();
      }
    }
    expect(doc.items[doc.items.length - 1].id).toBe(THEOREM);
  });

  it('refuses to carve a whole proof', () => {
    expect(() => carve(base, THEOREM, 0, base.items[0].chain.steps.length)).toThrow();
  });
});

describe('lean', () => {
  it('uses only the vocabulary the checking server accepts', () => {
    const lay = layout(base);
    const h = lay.hints[0];
    const body = leanBody(carve(base, h.item, h.fromRow - 1, h.toRow).doc);
    const tokens = body.match(/[A-Za-z_][A-Za-z0-9_]*|:=|=>|⁻¹|[():=*._{}·]|\S/g)!;
    const ok = /^(theorem|calc|fun|congrArg|symm|assoc|e_mul|inv_mul|mul_inv_rev|e|lemma\d+|G|[xyzuvwpqrst]|:=|=>|⁻¹|[():=*._{}·])$/;
    expect(tokens.filter((t) => !ok.test(t))).toEqual([]);
  });

  it('matches the prelude the checking server wraps proofs in', async () => {
    const { readFileSync } = await import('node:fs');
    const cgi = readFileSync(new URL('../../../cgi-bin/lean/check.cgi', import.meta.url), 'utf8');
    const grab = (name: string) => cgi.match(new RegExp(`${name} = """([\\s\\S]*?)"""`))![1];
    expect(grab('PRELUDE')).toBe(LEAN_PRELUDE);
    expect(grab('POSTLUDE')).toBe(LEAN_POSTLUDE);
  });
});

describe('terms', () => {
  it('parse and print', () => {
    expect(show(parseTerm("(xy)'"))).toBe('(xy)⁻¹');
    expect(show(parseTerm("x'(xy)"))).toBe('x⁻¹(xy)');
  });
});
