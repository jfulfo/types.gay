<script lang="ts" module>
  export const LEAF_W = 440;
  export const LEAF_H = 640;
</script>

<script lang="ts">
  import type { Leaf } from '../book';
  import type { LeafResult } from '../engine/solve';
  import { paintPaper } from '../lib/paper';
  import { rng } from '../lib/noise';
  import { equationHtml, hash } from './format';
  import Pencil from './Pencil.svelte';
  import Strike from './Strike.svelte';

  let {
    leaf,
    entry,
    crossed,
    lifted = false,
    onToggle,
  }: {
    leaf: Leaf;
    entry?: { key: string; result: LeafResult };
    crossed: string[];
    lifted?: boolean;
    onToggle: (label: string) => void;
  } = $props();

  let canvas: HTMLCanvasElement | undefined = $state();

  $effect(() => {
    if (canvas) paintPaper(canvas, { seed: leaf.folio * 31 + 7, width: LEAF_W, height: LEAF_H, bound: 'left' });
  });

  // Cut edges are nearly straight; the spine edge is torn from the binding.
  const clip = $derived.by(() => {
    const r = rng(hash(leaf.id) + 3);
    const pts: string[] = [];
    const wob = () => (r() - 0.5) * 0.8;
    for (let x = 0; x <= LEAF_W; x += 40) pts.push(`${x + wob()}px ${Math.max(0, wob())}px`);
    for (let y = 0; y <= LEAF_H; y += 40) pts.push(`${LEAF_W - Math.max(0, wob())}px ${y}px`);
    for (let x = LEAF_W; x >= 0; x -= 40) pts.push(`${x}px ${LEAF_H - Math.max(0, wob())}px`);
    for (let y = LEAF_H; y >= 0; y -= 3 + r() * 5) pts.push(`${r() * 2.6}px ${y}px`);
    return `polygon(${pts.join(',')})`;
  });

  const fmt = (s: string) => s.replace(/\b([xyze]{1,2}|G)\b/g, '<i>$1</i>').replace(/⁻¹/g, '<sup>−1</sup>');
</script>

<div class="leaf" class:lifted>
  <div class="sheet" style:clip-path={clip}>
    <canvas bind:this={canvas}></canvas>
    <div class="verso" aria-hidden="true">
      {#each leaf.verso as line}<p>{line}</p>{/each}
    </div>
    <div class="content">
      <header class="print">
        <span class="rh">{leaf.runningHead}</span>
        <span class="folio">{leaf.folio}</span>
      </header>

      {#if leaf.intro}
        <p class="print">{@html fmt(leaf.intro)}</p>
      {/if}

      {#if leaf.premises.length}
        <div class="premises">
          {#each leaf.premises as p (p.label)}
            {@const isCrossed = crossed.includes(p.label)}
            <button
              class="premise print"
              aria-pressed={isCrossed}
              title={isCrossed ? `rub out the line through ${p.label}` : `strike out ${p.label}`}
              onclick={() => onToggle(p.label)}
            >
              <span class="lbl">({p.label})</span>
              <span class="formula">
                {@html equationHtml(p.src)}
                <Strike crossed={isCrossed} seed={hash(p.label + leaf.id)} />
              </span>
            </button>
          {/each}
        </div>
      {/if}

      {#if leaf.outro}
        <p class="print">{@html fmt(leaf.outro)}</p>
      {/if}

      {#if leaf.kind === 'result'}
        <p class="print statement">
          <span class="sc">{leaf.label}.</span>
          <em>{@html fmt(leaf.lead ?? '')}</em>
        </p>
        <div class="display print">{@html equationHtml(leaf.statement!)}</div>
        {#if leaf.tail}<p class="print"><em>{@html fmt(leaf.tail)}</em></p>{/if}
        <p class="print exercise">The proof is left to the reader.</p>
        <Pencil {entry} />
      {/if}
    </div>
    <div class="shade"></div>
  </div>
</div>

<style>
  .leaf {
    width: 440px;
    height: 640px;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.45)) drop-shadow(3px 10px 14px rgba(0, 0, 0, 0.38));
    transition: filter 200ms;
  }
  .leaf.lifted {
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35)) drop-shadow(14px 34px 30px rgba(0, 0, 0, 0.42));
  }
  .sheet {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #ece0c4;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .verso {
    position: absolute;
    inset: 44% 60px auto 52px;
    transform: scaleX(-1);
    font-family: 'Old Standard TT', serif;
    font-size: 15px;
    line-height: 1.5;
    color: rgba(50, 36, 20, 0.06);
    filter: blur(0.5px);
    text-align: left;
  }
  .verso p {
    margin: 0;
  }
  .shade {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(90deg, rgba(80, 55, 25, 0.12), transparent 7%, transparent 88%, rgba(255, 250, 235, 0.06)),
      radial-gradient(120% 90% at 60% 40%, transparent 60%, rgba(70, 45, 15, 0.1));
    mix-blend-mode: multiply;
  }
  .content {
    position: absolute;
    inset: 34px 44px 34px 54px;
    display: flex;
    flex-direction: column;
    font-family: 'Old Standard TT', serif;
    font-size: 15.5px;
    line-height: 1.42;
    color: #1f1a14;
  }
  .print {
    filter: url(#ink);
    mix-blend-mode: multiply;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 11px;
    letter-spacing: 0.14em;
    margin-bottom: 26px;
  }
  header .rh {
    flex: 1;
    text-align: center;
    padding-left: 2em;
  }
  header .folio {
    letter-spacing: 0;
    font-size: 13px;
  }
  p {
    margin: 0 0 0.7em;
    text-align: justify;
    hyphens: auto;
  }
  .sc {
    font-variant: small-caps;
    letter-spacing: 0.06em;
    font-style: normal;
    margin-right: 0.3em;
  }
  .statement {
    margin-top: 0.4em;
  }
  .display {
    text-align: center;
    font-size: 17px;
    margin: 0.2em 0 0.8em;
  }
  .exercise {
    font-size: 13.5px;
    margin-top: 0.3em;
    margin-bottom: 0.4em;
  }
  .premises {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    margin: 0.2em 0 0.9em;
  }
  .premise {
    all: unset;
    display: grid;
    grid-template-columns: 3.2em auto;
    align-items: baseline;
    width: 13em;
    font-size: 16.5px;
    cursor: url('/cat-theory/pencil.svg') 5 27, pointer;
    border-radius: 2px;
  }
  .premise:focus-visible {
    outline: 1px dashed rgba(60, 50, 40, 0.5);
    outline-offset: 3px;
  }
  .premise .lbl {
    font-size: 14.5px;
  }
  .formula {
    position: relative;
    justify-self: center;
  }
  :global(.leaf sup) {
    font-size: 0.66em;
    line-height: 0;
    vertical-align: 0.55em;
  }
  :global(.leaf .print i) {
    font-style: italic;
  }
</style>
