import { isVar, parseTerm, type Term } from '../engine/term';

/** HTML for a term, typeset the way an old book would: italic letters, upright brackets. */
export function termHtml(t: Term): string {
  if (isVar(t)) return `<i>${t.v}</i>`;
  if (t.a.length === 0) return `<i>${t.f.startsWith('$') ? t.f.slice(1) : t.f}</i>`;
  if (t.f === 'mul') {
    const side = (u: Term) => (!isVar(u) && u.f === 'mul' ? `(${termHtml(u)})` : termHtml(u));
    return side(t.a[0]) + side(t.a[1]);
  }
  if (t.f === 'inv') {
    const u = t.a[0];
    const inner = isVar(u) || u.a.length === 0 ? termHtml(u) : `(${termHtml(u)})`;
    return `${inner}<sup>−1</sup>`;
  }
  return `${t.f}(${t.a.map(termHtml).join(', ')})`;
}

export function equationHtml(src: string): string {
  const [l, r] = src.split('=');
  return `${termHtml(parseTerm(l))} = ${termHtml(parseTerm(r))}`;
}
