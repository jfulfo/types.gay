// Asking the server's Lean whether the facing pages are right.

export interface LeanError {
  line: number;
  col: number;
  kind: string;
  msg: string;
}

export type CheckState =
  | { status: 'checking' }
  | { status: 'ok'; ms: number; version: string; cached: boolean }
  | { status: 'failed'; errors: LeanError[]; version: string }
  | { status: 'unreachable'; message: string };

const ENDPOINT = `${import.meta.env.BASE_URL}api/check`;
const memo = new Map<string, CheckState>();

export async function checkLean(body: string, signal: AbortSignal): Promise<CheckState> {
  const known = memo.get(body);
  if (known) return known;
  let res: Response;
  try {
    res = await fetch(ENDPOINT, { method: 'POST', body, signal, headers: { 'Content-Type': 'text/plain' } });
  } catch (err) {
    if (signal.aborted) throw err;
    return { status: 'unreachable', message: 'no answer from Lean' };
  }
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || data.error) return { status: 'unreachable', message: data.error ?? `HTTP ${res.status}` };
  const state: CheckState = data.ok
    ? { status: 'ok', ms: data.ms, version: shortVersion(data.version), cached: data.cached }
    : { status: 'failed', errors: data.errors, version: shortVersion(data.version) };
  memo.set(body, state);
  return state;
}

function shortVersion(v: string | undefined): string {
  const m = v?.match(/version ([\d.]+)/);
  return m ? `Lean ${m[1]}` : 'Lean';
}
