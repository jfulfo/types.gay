<script lang="ts">
  import { rng } from '../lib/noise';

  let { crossed, seed }: { crossed: boolean; seed: number } = $props();

  // Once struck, an erased line still leaves a smudge.
  let everCrossed = $state(false);
  $effect(() => {
    if (crossed) everCrossed = true;
  });

  const paths = $derived.by(() => {
    const r = rng(seed);
    const stroke = (y: number) => {
      const j = () => (r() - 0.5) * 1.6;
      return `M ${-2 + r() * 3} ${y + j()} C ${30 + j() * 3} ${y + j()}, ${65 + j() * 3} ${y + j()}, ${101 + r() * 3} ${y - 1 + j()}`;
    };
    return [stroke(12), stroke(13.2)];
  });
</script>

{#if everCrossed}
  <svg class="strike" class:erased={!crossed} viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
    {#key crossed}
      {#each paths as d, i}
        <path {d} pathLength="1" style="animation-delay: {i * 120}ms" />
      {/each}
    {/key}
  </svg>
{/if}

<style>
  .strike {
    position: absolute;
    inset: -2px -6px;
    width: calc(100% + 12px);
    height: calc(100% + 4px);
    overflow: visible;
    pointer-events: none;
    filter: url(#graphite);
  }
  path + path {
    opacity: 0.45;
  }
  path {
    fill: none;
    stroke: #3a393d;
    stroke-width: 1.15px;
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: draw 260ms ease-out forwards;
  }
  .erased path {
    stroke-dashoffset: 0;
    animation: rub 450ms ease-out forwards;
  }
  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes rub {
    from {
      opacity: 1;
    }
    to {
      opacity: 0.1;
      stroke-width: 2.6px;
    }
  }
</style>
