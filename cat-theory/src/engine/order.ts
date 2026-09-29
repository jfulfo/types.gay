// Knuth–Bendix ordering. inv has weight 0 and must therefore be the
// largest symbol in the precedence; everything else weighs 1.

import { isVar, occurs, type Term } from './term';

function precedence(f: string): number {
  if (f === 'inv') return 1000;
  if (f === 'mul') return 900;
  if (f === 'e') return 800;
  if (f.startsWith('$')) return 100 - f.charCodeAt(1) / 1000;
  return 500 - f.charCodeAt(0) / 1000;
}

function weight(t: Term): number {
  if (isVar(t)) return 1;
  let w = t.f === 'inv' ? 0 : 1;
  for (const s of t.a) w += weight(s);
  return w;
}

function countVars(t: Term, m: Map<string, number>) {
  if (isVar(t)) m.set(t.v, (m.get(t.v) ?? 0) + 1);
  else for (const s of t.a) countVars(s, m);
}

export function kboGreater(s: Term, t: Term): boolean {
  if (isVar(s)) return false;
  if (isVar(t)) return occurs(t.v, s);
  const vs = new Map<string, number>();
  const vt = new Map<string, number>();
  countVars(s, vs);
  countVars(t, vt);
  for (const [x, n] of vt) if ((vs.get(x) ?? 0) < n) return false;
  const ws = weight(s);
  const wt = weight(t);
  if (ws !== wt) return ws > wt;
  if (s.f !== t.f) return precedence(s.f) > precedence(t.f);
  for (let i = 0; i < s.a.length; i++) {
    const a = s.a[i];
    const b = t.a[i];
    if (!sameTerm(a, b)) return kboGreater(a, b);
  }
  return false;
}

function sameTerm(s: Term, t: Term): boolean {
  if (isVar(s)) return isVar(t) && s.v === t.v;
  if (isVar(t) || s.f !== t.f) return false;
  return s.a.every((u, i) => sameTerm(u, t.a[i]));
}
