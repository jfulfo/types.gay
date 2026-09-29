<script lang="ts">
  import type { Snippet } from 'svelte';
  import { paintCloth } from '../lib/cloth';
  import { paintPaper } from '../lib/paper';
  import { PAGE_H, PAGE_W } from './Book.svelte';

  let {
    seed,
    kind = 'page',
    side,
    children,
  }: {
    seed: number;
    kind?: 'page' | 'cover' | 'endpaper';
    side: 'left' | 'right';
    children?: Snippet;
  } = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  $effect(() => {
    if (!canvas) return;
    if (kind === 'cover') paintCloth(canvas, PAGE_W, PAGE_H, seed);
    else
      paintPaper(canvas, {
        seed,
        width: PAGE_W,
        height: PAGE_H,
        bound: 'none',
        base: kind === 'endpaper' ? [214, 200, 168] : undefined,
      });
  });
</script>

<div class="paper {kind} {side}">
  <canvas bind:this={canvas}></canvas>
  {#if children}<div class="content">{@render children()}</div>{/if}
</div>

<style>
  .paper {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  .paper.cover {
    border-radius: 2px 5px 5px 2px;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .content {
    position: absolute;
    inset: 0;
  }
</style>
