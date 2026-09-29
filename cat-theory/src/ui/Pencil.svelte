<script lang="ts">
  import { untrack } from 'svelte';
  import type { LeafResult } from '../engine/solve';
  import { termHtml, shortCite, pick } from './format';
  import type { Term } from '../engine/term';

  interface Entry {
    key: string;
    result: LeafResult;
  }

  let { entry }: { entry?: Entry } = $props();

  let current = $state<Entry | undefined>(undefined);
  let ghost = $state<Entry | undefined>(undefined);
  let animate = $state(false);
  let box: HTMLDivElement | undefined = $state();
  let content: HTMLDivElement | undefined = $state();
  let fit = $state(1);

  $effect(() => {
    const next = entry;
    untrack(() => {
      if (!next || (current && next.key === current.key)) return;
      ghost = current;
      // Nothing to animate the first time the page is looked at.
      animate = current !== undefined || next.result.status !== 'none';
      current = next;
    });
  });

  // Write smaller when running out of page.
  $effect(() => {
    void current;
    if (!box || !content) return;
    fit = 1;
    requestAnimationFrame(() => {
      if (!box || !content) return;
      const s = Math.min(1, box.clientHeight / content.scrollHeight, box.clientWidth / content.scrollWidth);
      fit = Math.max(0.42, s * 0.98);
    });
  });

  const STEP = 260;

  interface Row {
    left?: Term;
    right: Term;
    by?: string;
  }

  function rows(lines: { term: Term; by?: string }[]): Row[] {
    if (lines.length === 1) return [{ right: lines[0].term }];
    return lines.slice(1).map((l, i) => ({ left: i === 0 ? lines[0].term : undefined, right: l.term, by: l.by }));
  }

  function values(assign: Record<string, number>): string {
    return Object.entries(assign)
      .map(([v, n]) => `<i>${v}</i> = ${n}`)
      .join(', ');
  }
</script>

{#snippet body(e: Entry, writing: boolean)}
  {@const r = e.result}
  {@const d = (i: number) => (writing ? `--d:${350 + i * STEP}ms` : '')}
  {#if r.status === 'proved'}
    {@const claimRows = r.proof.claims.map((c) => rows(c.lines))}
    {@const mainRows = rows(r.proof.main)}
    {@const offsets = claimRows.reduce<number[]>((acc, cr, i) => [...acc, (acc[i] ?? 0) + cr.length + 1], [0])}
    {@const mainStart = offsets[offsets.length - 1]}
    {#if r.proof.claims.length}
      <p class="w" style={d(0)}>{pick(e.key, ['First, some facts.', 'Two things first.', 'We need:'])}</p>
    {/if}
    {#each r.proof.claims as c, ci}
      <p class="w claim" style={d(offsets[ci] + 1)}>
        ({ci + 1}) {@html termHtml(c.lhs)} = {@html termHtml(c.rhs)} :
      </p>
      <div class="calc indent">
        {#each claimRows[ci] as row, ri}
          <span class="w" style={d(offsets[ci] + 2 + ri)}>{#if row.left}{@html termHtml(row.left)}{/if}</span>
          <span class="w" style={d(offsets[ci] + 2 + ri)}>=</span>
          <span class="w" style={d(offsets[ci] + 2 + ri)}>{@html termHtml(row.right)}</span>
          <span class="w by" style={d(offsets[ci] + 2 + ri)}>{row.by ? shortCite(row.by) : ''}</span>
        {/each}
      </div>
    {/each}
    {#if r.proof.claims.length}
      <p class="w" style={d(mainStart + 1)}>{pick(e.key + 'm', ['So', 'Now', 'Then'])}</p>
    {/if}
    <div class="calc">
      {#each mainRows as row, ri}
        <span class="w" style={d(mainStart + 2 + ri)}>{#if row.left}{@html termHtml(row.left)}{/if}</span>
        <span class="w" style={d(mainStart + 2 + ri)}>=</span>
        <span class="w" style={d(mainStart + 2 + ri)}>{@html termHtml(row.right)}</span>
        <span class="w by" style={d(mainStart + 2 + ri)}>{row.by ? shortCite(row.by) : ''}</span>
      {/each}
    </div>
    <p class="w qed" style={d(mainStart + 2 + mainRows.length)}><span class="box" aria-label="end of proof"></span></p>
  {:else if r.status === 'refuted'}
    {@const m = r.cx.model}
    {@const els = Array.from({ length: m.n }, (_, i) => i)}
    <p class="w" style={d(0)}>
      {#if r.from.length === 0}
        {pick(e.key, ['Nothing before this page to go on!', 'Nothing earlier to use.'])}
      {:else}
        {pick(e.key, ["Doesn't follow from the pages before!", 'Not provable from what comes before.', 'False, given only the above:'])}
      {/if}
    </p>
    <p class="w" style={d(1)}>
      take <i>G</i> = {'{'}{els.join(', ')}{'}'}{#if 'e' in m.consts}, <i>e</i> = {m.consts.e}{/if}{#if m.mul},{/if}
    </p>
    {#if m.mul}
      <table class="w cayley" style={d(2)}>
        <tbody>
          <tr><th></th>{#each els as j}<th>{j}</th>{/each}</tr>
          {#each m.mul as row, i}
            <tr><th>{i}</th>{#each row as c}<td>{c}</td>{/each}</tr>
          {/each}
        </tbody>
      </table>
    {/if}
    {#if m.inv}
      <table class="w cayley inv" style={d(3)}>
        <tbody>
          <tr><th><i>x</i></th>{#each els as j}<td>{j}</td>{/each}</tr>
          <tr><th><i>x</i><sup>−1</sup></th>{#each m.inv as j}<td>{j}</td>{/each}</tr>
        </tbody>
      </table>
    {/if}
    <p class="w" style={d(4)}>
      {#if Object.keys(r.cx.assignment).length}{@html values(r.cx.assignment)}:{/if}
      {@html termHtml(r.goal[0])} = {r.cx.lhs} but {@html termHtml(r.goal[1])} = {r.cx.rhs}.
    </p>
  {:else if r.status === 'open'}
    <p class="w" style={d(0)}>{pick(e.key, ["? can't settle this one.", '? no proof, no counterexample.'])}</p>
  {/if}
{/snippet}

<div class="pencil" bind:this={box}>
  {#if ghost}
    {#key ghost.key}
      <div class="layer ghost" style="transform: scale({fit}); width: {100 / fit}%">{@render body(ghost, false)}</div>
    {/key}
  {/if}
  {#if current}
    {#key current.key}
      <div
        class="layer"
        class:writing={animate}
        bind:this={content}
        style="transform: scale({fit}); width: {100 / fit}%"
      >
        {@render body(current, animate)}
      </div>
    {/key}
  {/if}
</div>

<style>
  .pencil {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    font-family: 'Kalam', cursive;
    font-weight: 300;
    font-size: 19px;
    line-height: 1.32;
    color: #2c2b30;
    filter: url(#graphite);
    padding-top: 6px;
  }
  .layer {
    position: absolute;
    inset: 0 auto auto 0;
    transform-origin: top left;
    padding-left: 4px;
  }
  .ghost {
    animation: erase 500ms ease-out forwards;
    pointer-events: none;
  }
  @keyframes erase {
    to {
      opacity: 0.07;
      filter: blur(0.6px);
    }
  }
  p {
    margin: 0 0 2px;
  }
  .claim {
    margin-top: 4px;
  }
  .calc {
    display: grid;
    grid-template-columns: auto auto auto 1fr;
    column-gap: 0.45em;
    align-items: baseline;
    margin: 0 0 4px;
  }
  .indent {
    margin-left: 1.4em;
  }
  .by {
    font-size: 0.8em;
    padding-left: 0.9em;
    color: #3c3b40;
  }
  .qed {
    text-align: right;
    padding-right: 1.4em;
  }
  .box {
    display: inline-block;
    width: 0.5em;
    height: 0.55em;
    border: 1.5px solid currentColor;
    border-radius: 1px 2px 1px 1px;
    transform: rotate(-2deg);
  }
  :global(.pencil i) {
    font-style: normal;
  }
  :global(.pencil sup) {
    font-size: 0.62em;
    line-height: 0;
  }
  .cayley {
    border-collapse: collapse;
    margin: 4px 0 6px 1.2em;
    font-size: 0.92em;
  }
  .cayley th,
  .cayley td {
    padding: 0 0.42em;
    text-align: center;
    font-weight: 300;
  }
  .cayley tr:first-child th,
  .cayley tr:first-child td {
    border-bottom: 1px solid rgba(60, 60, 64, 0.7);
  }
  .cayley th:first-child {
    border-right: 1px solid rgba(60, 60, 64, 0.7);
  }
  .cayley.inv tr:first-child th,
  .cayley.inv tr:first-child td {
    border-bottom: none;
  }
  .writing .w {
    clip-path: inset(0 100% 0 0);
    animation: write 420ms ease-in-out var(--d, 0ms) forwards;
  }
  @keyframes write {
    to {
      clip-path: inset(0 0 0 0);
    }
  }
</style>
