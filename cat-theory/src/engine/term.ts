// First-order terms over a small algebraic signature.
//   mul(s, t)  written  st
//   inv(s)     written  s⁻¹
//   e, a, b, …  constants;  $x  skolem constant displayed as x
//   x, y, z, …  variables

export type Term = Var | App;
export interface Var {
  v: string;
}
export interface App {
  f: string;
  a: Term[];
}
export type Pos = number[];
export type Subst = Record<string, Term>;

export const isVar = (t: Term): t is Var => 'v' in t;
export const mkVar = (v: string): Var => ({ v });
export const mkApp = (f: string, ...a: Term[]): App => ({ f, a });

export function termEq(s: Term, t: Term): boolean {
  if (isVar(s)) return isVar(t) && s.v === t.v;
  if (isVar(t) || s.f !== t.f || s.a.length !== t.a.length) return false;
  for (let i = 0; i < s.a.length; i++) if (!termEq(s.a[i], t.a[i])) return false;
  return true;
}

export function termKey(t: Term): string {
  if (isVar(t)) return '?' + t.v;
  if (t.a.length === 0) return t.f;
  return t.f + '(' + t.a.map(termKey).join(',') + ')';
}

export function size(t: Term): number {
  if (isVar(t)) return 1;
  let n = 1;
  for (const s of t.a) n += size(s);
  return n;
}

export function subtermAt(t: Term, pos: Pos): Term {
  let cur = t;
  for (const i of pos) {
    if (isVar(cur)) throw new Error('bad position');
    cur = cur.a[i];
  }
  return cur;
}

export function replaceAt(t: Term, pos: Pos, u: Term, depth = 0): Term {
  if (depth === pos.length) return u;
  if (isVar(t)) throw new Error('bad position');
  const i = pos[depth];
  const a = t.a.slice();
  a[i] = replaceAt(t.a[i], pos, u, depth + 1);
  return { f: t.f, a };
}

/** All positions of non-variable subterms, outermost first. */
export function funPositions(t: Term, prefix: Pos = [], out: Pos[] = []): Pos[] {
  if (isVar(t)) return out;
  out.push(prefix);
  t.a.forEach((s, i) => funPositions(s, [...prefix, i], out));
  return out;
}

export function varsOf(t: Term, out: Set<string> = new Set()): Set<string> {
  if (isVar(t)) out.add(t.v);
  else for (const s of t.a) varsOf(s, out);
  return out;
}

/** Variables in order of first occurrence (left to right). */
export function varsInOrder(ts: Term[]): string[] {
  const seen: string[] = [];
  const go = (t: Term) => {
    if (isVar(t)) {
      if (!seen.includes(t.v)) seen.push(t.v);
    } else t.a.forEach(go);
  };
  ts.forEach(go);
  return seen;
}

export function occurs(v: string, t: Term): boolean {
  if (isVar(t)) return t.v === v;
  return t.a.some((s) => occurs(v, s));
}

export function applySubst(t: Term, s: Subst): Term {
  if (isVar(t)) return s[t.v] ?? t;
  if (t.a.length === 0) return t;
  return { f: t.f, a: t.a.map((u) => applySubst(u, s)) };
}

/** One-way matching: find σ with σ(pattern) = t, extending `s`. */
export function match(pattern: Term, t: Term, s: Subst = {}): Subst | null {
  if (isVar(pattern)) {
    const bound = s[pattern.v];
    if (bound) return termEq(bound, t) ? s : null;
    return { ...s, [pattern.v]: t };
  }
  if (isVar(t) || pattern.f !== t.f || pattern.a.length !== t.a.length) return null;
  let cur: Subst | null = s;
  for (let i = 0; i < pattern.a.length && cur; i++) cur = match(pattern.a[i], t.a[i], cur);
  return cur;
}

/** Most general unifier, as an idempotent substitution. */
export function unify(s: Term, t: Term): Subst | null {
  const sub: Subst = {};
  const walk = (u: Term): Term => {
    while (isVar(u) && sub[u.v]) u = sub[u.v];
    return u;
  };
  const stack: [Term, Term][] = [[s, t]];
  while (stack.length) {
    const [p, q] = stack.pop()!;
    const a = walk(p);
    const b = walk(q);
    if (isVar(a) && isVar(b) && a.v === b.v) continue;
    if (isVar(a)) {
      if (occursDeep(a.v, b, walk)) return null;
      sub[a.v] = b;
    } else if (isVar(b)) {
      if (occursDeep(b.v, a, walk)) return null;
      sub[b.v] = a;
    } else {
      if (a.f !== b.f || a.a.length !== b.a.length) return null;
      for (let i = 0; i < a.a.length; i++) stack.push([a.a[i], b.a[i]]);
    }
  }
  const resolve = (u: Term): Term => {
    u = walk(u);
    if (isVar(u) || u.a.length === 0) return u;
    return { f: u.f, a: u.a.map(resolve) };
  };
  const out: Subst = {};
  for (const k of Object.keys(sub)) out[k] = resolve(sub[k]);
  return out;
}

function occursDeep(v: string, t: Term, walk: (u: Term) => Term): boolean {
  t = walk(t);
  if (isVar(t)) return t.v === v;
  return t.a.some((s) => occursDeep(v, s, walk));
}

export function renameVars(t: Term, f: (v: string) => string): Term {
  if (isVar(t)) return { v: f(t.v) };
  if (t.a.length === 0) return t;
  return { f: t.f, a: t.a.map((s) => renameVars(s, f)) };
}

export function constantsOf(t: Term, out: Set<string> = new Set()): Set<string> {
  if (!isVar(t)) {
    if (t.a.length === 0) out.add(t.f);
    t.a.forEach((s) => constantsOf(s, out));
  }
  return out;
}

export function functionsOf(t: Term, out: Set<string> = new Set()): Set<string> {
  if (!isVar(t)) {
    if (t.a.length > 0) out.add(t.f);
    t.a.forEach((s) => functionsOf(s, out));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parsing and plain-text printing (used for statements and debugging).
//
//   product := postfix postfix*          juxtaposition, left associative
//   postfix := atom ("'" | "^-1" | "⁻¹")*
//   atom    := letter | "(" product ")"
// Letters u–z are variables; any other letter is a constant.

const VARIABLE_LETTERS = 'uvwxyz';

export function parseTerm(src: string): Term {
  let i = 0;
  const s = src.replace(/\s+/g, '');
  const peek = () => s[i];
  const product = (): Term => {
    let t = postfix();
    while (i < s.length && (peek() === '(' || /[a-zA-Z$]/.test(peek()))) {
      t = mkApp('mul', t, postfix());
    }
    return t;
  };
  const postfix = (): Term => {
    let t = atom();
    for (;;) {
      if (s.startsWith("'", i)) i += 1;
      else if (s.startsWith('^-1', i)) i += 3;
      else if (s.startsWith('⁻¹', i)) i += 2;
      else break;
      t = mkApp('inv', t);
    }
    return t;
  };
  const atom = (): Term => {
    const c = peek();
    if (c === '(') {
      i++;
      const t = product();
      if (peek() !== ')') throw new Error(`expected ) in ${src}`);
      i++;
      return t;
    }
    if (c === '$') {
      i += 2;
      return mkApp('$' + s[i - 1]);
    }
    if (c && /[a-zA-Z]/.test(c)) {
      i++;
      return VARIABLE_LETTERS.includes(c) ? mkVar(c) : mkApp(c);
    }
    throw new Error(`unexpected '${c}' in ${src}`);
  };
  const t = product();
  if (i !== s.length) throw new Error(`trailing input in ${src}`);
  return t;
}

export function parseEquation(src: string): [Term, Term] {
  const [l, r] = src.split('=');
  return [parseTerm(l), parseTerm(r)];
}

export function show(t: Term): string {
  if (isVar(t)) return t.v;
  if (t.f === 'mul') {
    const side = (u: Term) => (!isVar(u) && u.f === 'mul' ? `(${show(u)})` : show(u));
    return side(t.a[0]) + side(t.a[1]);
  }
  if (t.f === 'inv') {
    const u = t.a[0];
    const inner = isVar(u) || u.a.length === 0 ? show(u) : `(${show(u)})`;
    return inner + '⁻¹';
  }
  if (t.a.length === 0) return t.f.startsWith('$') ? t.f.slice(1) : t.f;
  return `${t.f}(${t.a.map(show).join(', ')})`;
}
