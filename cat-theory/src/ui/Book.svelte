<script lang="ts" module>
  export const PAGE_W = 560;
  export const PAGE_H = 800;
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Tween } from 'svelte/motion';
  import { cubicInOut } from 'svelte/easing';

  let {
    pageCount,
    single = false,
    at = $bindable(1),
    page,
    canLeave = () => true,
    onResist,
  }: {
    /** Pages are numbered from 1; odd pages are on the left of a spread. */
    pageCount: number;
    /** One page at a time (narrow screens) instead of spreads. */
    single?: boolean;
    /** The page in view (in spread mode, the left page of the spread). */
    at?: number;
    page: Snippet<[number]>;
    /** Whether the reader may turn forward past page `p`. */
    canLeave?: (p: number) => boolean;
    onResist?: () => void;
  } = $props();

  const step = $derived(single ? 1 : 2);
  const last = $derived(single ? pageCount : pageCount % 2 ? pageCount : pageCount - 1);

  let turning = $state<{ dir: 1 | -1; leaf: number } | null>(null);
  let resisting = $state(false);
  const angle = new Tween(0, { duration: 850, easing: cubicInOut });

  export async function turn(dir: 1 | -1) {
    if (turning) return;
    const to = at + dir * step;
    if (to < 1 || to > last) return;
    // The last page in view must allow it (in spread mode, the right-hand one).
    if (dir === 1 && !canLeave(single ? at : at + 1)) {
      resisting = true;
      onResist?.();
      setTimeout(() => (resisting = false), 650);
      return;
    }
    if (single) {
      turning = { dir, leaf: at };
      await angle.set(0, { duration: 0 });
      await angle.set(1, { duration: 380 });
      at = to;
      turning = null;
      return;
    }
    // The leaf that turns: its front is the right page (at+1), its back the next left (at+2).
    const leaf = dir === 1 ? at + 1 : at - 1;
    turning = { dir, leaf };
    await angle.set(dir === 1 ? 0 : -180, { duration: 0 });
    await angle.set(dir === 1 ? -180 : 0);
    at = to;
    turning = null;
  }

  // What lies flat underneath a turning leaf.
  const leftPage = $derived(turning && !single ? (turning.dir === 1 ? at : at - 2) : at);
  const rightPage = $derived(turning && !single ? (turning.dir === 1 ? at + 3 : at + 1) : at + 1);
  const shade = $derived(Math.sin((-angle.current * Math.PI) / 180));
</script>

{#if single}
  <div class="book single" class:resisting>
    <div class="slot solo" style:opacity={turning ? 1 - angle.current : 1} style:transform="translateX({turning ? -turning.dir * 40 * angle.current : 0}px)">
      {@render page(at)}
    </div>
    {#if at > 1 && !turning}
      <button class="corner prev" aria-label="previous page" onclick={() => turn(-1)}></button>
    {/if}
    {#if at < last && !turning}
      <button class="corner next" aria-label="next page" onclick={() => turn(1)}></button>
    {/if}
  </div>
{:else}
  <div class="book">
    <div class="board"></div>
    <div class="slot left">{@render page(leftPage)}<div class="gutter"></div></div>
    {#if rightPage <= pageCount}
      <div class="slot right" class:resisting>
        {@render page(rightPage)}
        <div class="gutter"></div>
      </div>
    {/if}
    {#if !turning && at > 1}
      <button class="corner prev" aria-label="turn back" onclick={() => turn(-1)}></button>
    {/if}
    {#if !turning && at < last}
      <button class="corner next" aria-label="turn the page" onclick={() => turn(1)}></button>
    {/if}
    {#if turning}
      <div class="leaf" style:transform="rotateY({angle.current}deg)">
        <div class="face front">
          {@render page(turning.leaf)}
          <div class="gutter"></div>
          <div class="light" style:opacity={shade * 0.35}></div>
        </div>
        <div class="face back">
          {@render page(turning.leaf + 1)}
          <div class="gutter"></div>
          <div class="light" style:opacity={(1 - shade) * 0.25 + 0.05}></div>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .book {
    position: relative;
    width: 1120px;
    height: 800px;
    perspective: 3200px;
  }
  .book.single {
    width: 560px;
  }
  .board {
    position: absolute;
    inset: -12px -14px;
    background: #3b1d1a;
    border-radius: 5px;
    box-shadow:
      0 2px 3px rgba(0, 0, 0, 0.6),
      6px 20px 40px rgba(0, 0, 0, 0.5);
  }
  /* the page block's edges, seen side-on */
  .board::before,
  .board::after {
    content: '';
    position: absolute;
    top: 14px;
    bottom: 14px;
    width: 6px;
    background: repeating-linear-gradient(90deg, #d9ccae 0 1px, #b9aa88 1px 2px);
  }
  .board::before {
    left: 8px;
  }
  .board::after {
    right: 8px;
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
  .slot.solo {
    left: 0;
    box-shadow:
      0 2px 3px rgba(0, 0, 0, 0.5),
      4px 16px 30px rgba(0, 0, 0, 0.45);
  }
  .book.single.resisting .slot {
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
  .slot.right.resisting {
    animation: resist 650ms ease-out;
    transform-origin: left center;
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
  .corner {
    all: unset;
    position: absolute;
    bottom: 0;
    width: 80px;
    height: 80px;
    cursor: pointer;
    z-index: 6;
  }
  /* a slightly dog-eared corner says "turn me" */
  .corner.next {
    right: 0;
    background: linear-gradient(315deg, #e2d5b2 0 7%, rgba(70, 45, 15, 0.25) 7.5%, transparent 13%);
  }
  .corner.prev {
    left: 0;
    background: linear-gradient(45deg, #e2d5b2 0 7%, rgba(70, 45, 15, 0.25) 7.5%, transparent 13%);
  }
  .corner.next:hover,
  .corner.next:focus-visible {
    background: linear-gradient(315deg, #d8c9a4 0 16%, rgba(70, 45, 15, 0.35) 16.5%, transparent 28%);
  }
  .corner.prev:hover,
  .corner.prev:focus-visible {
    background: linear-gradient(45deg, #d8c9a4 0 16%, rgba(70, 45, 15, 0.35) 16.5%, transparent 28%);
  }
</style>
