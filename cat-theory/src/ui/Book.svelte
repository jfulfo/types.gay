<script lang="ts" module>
  export const PAGE_W = 560;
  export const PAGE_H = 800;
  /** How far the boards stand proud of the pages. */
  export const BOARD = 12;
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Tween } from 'svelte/motion';
  import { cubicInOut } from 'svelte/easing';

  let {
    pageCount,
    spread = $bindable(0),
    page,
    canTurn = () => true,
    onResist,
    onTurn,
  }: {
    /** Pages 0 (front cover) … pageCount-1. Spread k shows pages 2k-1 and 2k. */
    pageCount: number;
    spread?: number;
    page: Snippet<[number]>;
    canTurn?: (from: number) => boolean;
    onResist?: () => void;
    /** Called as a leaf starts to move, with the spread it is heading for. */
    onTurn?: (to: number) => void;
  } = $props();

  const lastSpread = $derived(Math.floor((pageCount - 1) / 2));

  // A leaf in motion: its front face is page 2k, its back face page 2k+1.
  let turning = $state<{ from: number; to: number; leaf: number } | null>(null);
  const angle = new Tween(0, { duration: 900, easing: cubicInOut });

  export async function turn(dir: 1 | -1) {
    if (turning) return;
    const to = spread + dir;
    if (to < 0 || to > lastSpread) return;
    if (dir === 1 && !canTurn(spread)) {
      resist();
      return;
    }
    const leaf = dir === 1 ? spread : spread - 1;
    turning = { from: spread, to, leaf };
    onTurn?.(to);
    await angle.set(dir === 1 ? 0 : -180, { duration: 0 });
    await angle.set(dir === 1 ? -180 : 0);
    spread = to;
    turning = null;
  }

  let resisting = $state(false);
  function resist() {
    resisting = true;
    onResist?.();
    setTimeout(() => (resisting = false), 650);
  }

  // What lies flat underneath while a leaf turns.
  const leftPage = $derived(turning ? (turning.to > turning.from ? 2 * turning.from - 1 : 2 * turning.to - 1) : 2 * spread - 1);
  const rightPage = $derived(turning ? (turning.to > turning.from ? 2 * turning.to : 2 * turning.from) : 2 * spread);

  const shade = $derived(Math.sin((-angle.current * Math.PI) / 180));
  const closed = $derived(spread === 0 && !turning);

  // Thickness of the page block on each side.
  const leftThick = $derived(Math.min(10, spread * 1.6));
  const rightThick = $derived(Math.min(10, (lastSpread - spread) * 1.6));
</script>

<div class="book" class:closed>
  {#if !closed}
    <div class="board left-board" style:--thick="{leftThick}px"></div>
  {/if}
  <div class="board right-board" class:cover-closed={closed} style:--thick="{rightThick}px"></div>

  {#if leftPage >= 1}
    <div class="slot left" style:--thick="{leftThick}px">{@render page(leftPage)}<div class="gutter"></div></div>
  {/if}
  {#if rightPage < pageCount}
    <div class="slot right" class:resisting style:--thick="{rightThick}px">
      {@render page(rightPage)}
      <div class="gutter"></div>
      {#if !turning && spread < lastSpread}
        <button class="corner next" aria-label="turn the page" onclick={() => turn(1)}></button>
      {/if}
    </div>
  {/if}
  {#if !turning && spread > 0}
    <button class="corner prev" aria-label="turn back" onclick={() => turn(-1)}></button>
  {/if}

  {#if turning}
    <div class="leaf" style:transform="rotateY({angle.current}deg)">
      <div class="face front">
        {@render page(2 * turning.leaf)}
        <div class="gutter"></div>
        <div class="light" style:opacity={shade * 0.35}></div>
      </div>
      <div class="face back">
        {@render page(2 * turning.leaf + 1)}
        <div class="gutter"></div>
        <div class="light" style:opacity={(1 - shade) * 0.25 + 0.05}></div>
      </div>
    </div>
  {/if}
</div>

<style>
  .book {
    position: relative;
    width: 1120px;
    height: 800px;
    perspective: 3200px;
  }
  .slot,
  .leaf {
    position: absolute;
    top: 0;
    width: 560px;
    height: 800px;
  }
  .slot.left {
    left: 0;
  }
  .slot.right,
  .leaf {
    left: 560px;
  }
  /* the page block's edges, stacked sheets seen side-on */
  .slot.left::before,
  .slot.right::before {
    content: '';
    position: absolute;
    top: 2px;
    bottom: 2px;
    width: var(--thick);
    background: repeating-linear-gradient(90deg, #d9ccae 0 1px, #b9aa88 1px 2px);
  }
  .slot.left::before {
    left: calc(var(--thick) * -1);
  }
  .slot.right::before {
    right: calc(var(--thick) * -1);
  }
  .slot.right.resisting {
    animation: resist 650ms ease-out;
    transform-origin: left center;
  }
  @keyframes resist {
    30% {
      transform: perspective(3200px) rotateY(-9deg);
    }
    60% {
      transform: perspective(3200px) rotateY(-2deg);
    }
  }
  .leaf {
    transform-origin: left center;
    transform-style: preserve-3d;
    z-index: 5;
  }
  .face {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    overflow: hidden;
  }
  .face.back {
    transform: rotateY(180deg);
  }
  .light {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(90deg, rgba(40, 25, 10, 0.9), rgba(40, 25, 10, 0.3));
  }
  .gutter {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 70px;
    pointer-events: none;
  }
  .left .gutter,
  .back .gutter {
    right: 0;
    background: linear-gradient(270deg, rgba(60, 40, 15, 0.28), rgba(60, 40, 15, 0.08) 30%, transparent);
  }
  .right .gutter,
  .front .gutter {
    left: 0;
    background: linear-gradient(90deg, rgba(60, 40, 15, 0.32), rgba(60, 40, 15, 0.1) 30%, transparent);
  }
  .board {
    position: absolute;
    top: calc(-1 * var(--board, 12px));
    height: calc(800px + 24px);
    width: calc(560px + 12px + var(--thick));
    background: #3b1d1a;
    border-radius: 4px;
    box-shadow:
      0 2px 3px rgba(0, 0, 0, 0.6),
      6px 20px 40px rgba(0, 0, 0, 0.5);
  }
  .left-board {
    left: calc(-12px - var(--thick));
  }
  .right-board {
    left: 560px;
  }
  .board.cover-closed {
    display: none;
  }
  .corner {
    all: unset;
    position: absolute;
    bottom: 0;
    width: 90px;
    height: 90px;
    cursor: pointer;
    z-index: 6;
  }
  .corner.next {
    right: 0;
    background: linear-gradient(315deg, rgba(255, 250, 235, 0) 45%, transparent 46%);
  }
  .corner.next:hover,
  .corner.next:focus-visible {
    background: linear-gradient(315deg, #d8c9a4 0 18%, rgba(70, 45, 15, 0.35) 18.5%, transparent 30%);
  }
  .corner.prev {
    left: 0;
  }
  .corner.prev:hover,
  .corner.prev:focus-visible {
    background: linear-gradient(45deg, #d8c9a4 0 18%, rgba(70, 45, 15, 0.35) 18.5%, transparent 30%);
  }
</style>
