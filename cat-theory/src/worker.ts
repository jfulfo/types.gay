// Runs the prover off the main thread. Results stream back page by page;
// a newer request makes the worker drop whatever it was doing.

import { solveBook, type LeafResult, type LeafSpec } from './engine/solve';

export interface SolveRequest {
  rid: number;
  leaves: LeafSpec[];
}

export type SolveReply = { rid: number; id: string; key: string; result: LeafResult } | { rid: number; done: true };

const cache = new Map<string, LeafResult>();
let latest = 0;

self.onmessage = async (ev: MessageEvent<SolveRequest>) => {
  const { rid, leaves } = ev.data;
  latest = rid;
  // Let any queued newer request through before starting.
  await new Promise((r) => setTimeout(r));
  if (rid !== latest) return;
  for (const out of solveBook(leaves, cache)) {
    postMessage({ rid, ...out } satisfies SolveReply);
    await new Promise((r) => setTimeout(r));
    if (rid !== latest) return;
  }
  postMessage({ rid, done: true } satisfies SolveReply);
};
