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

/** How the pencil abbreviates a citation in the margin. */
export function shortCite(label: string): string {
  if (label.startsWith('Lemma ')) return 'L' + label.slice(6);
  if (label.startsWith('Theorem ')) return 'Thm ' + label.slice(8);
  return label;
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pick<T>(key: string, options: T[]): T {
  return options[hash(key) % options.length];
}
