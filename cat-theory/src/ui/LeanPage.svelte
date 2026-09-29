<script lang="ts">
  import type { CheckState } from '../book/check';
  import type { LeanLine } from '../book/layout';

  let {
    lines,
    check,
    hovered,
  }: {
    lines: LeanLine[];
    check: CheckState | null;
    hovered: string | null;
  } = $props();

  let box: HTMLDivElement | undefined = $state();
  let content: HTMLDivElement | undefined = $state();
  let fit = $state(1);

  $effect(() => {
    void lines;
    fit = 1;
    requestAnimationFrame(() => {
      if (!box || !content) return;
      // Past a point it just runs off the foot of the page, as it would.
      fit = Math.max(0.14, Math.min(1, box.clientHeight / content.scrollHeight, box.clientWidth / content.scrollWidth));
    });
  });
</script>

<div class="lean" bind:this={box}>
  <div class="code" bind:this={content} style:transform="scale({fit})" style:width="{100 / fit}%">
    {#each lines as l, i (i)}
      <div class="ln {l.kind}" class:hover={l.key !== undefined && l.key === hovered}>{l.text}</div>
    {/each}
  </div>
</div>
<div class="status">
  {#if !check || check.status === 'checking'}
    <span class="working">checking with Lean…</span>
  {:else if check.status === 'ok'}
    checked by {check.version}: no errors
  {:else if check.status === 'failed'}
    {check.version}: {check.errors.length} error{check.errors.length === 1 ? '' : 's'} — {check.errors[0]?.msg}
  {:else}
    Lean could not be reached ({check.message})
  {/if}
</div>

<style>
  .lean {
    position: absolute;
    inset: 70px 52px 90px 46px;
    overflow: hidden;
  }
  .code {
    transform-origin: top left;
    font-family: 'Courier Prime', monospace;
    font-size: 12.5px;
    line-height: 1.5;
    color: #1d1a22;
    filter: url(#ink);
    mix-blend-mode: multiply;
  }
  .ln {
    white-space: pre-wrap;
    word-break: break-all;
    padding-left: 4ch;
    text-indent: -4ch;
    min-height: 1.5em;
  }
  .ln.gap {
    min-height: 0.8em;
  }
  .ln.hover {
    background: rgba(120, 100, 60, 0.14);
  }
  .status {
    position: absolute;
    left: 46px;
    right: 52px;
    bottom: 46px;
    font-family: 'Courier Prime', monospace;
    font-size: 11.5px;
    color: #3a3530;
    border-top: 1px solid rgba(60, 50, 40, 0.35);
    padding-top: 6px;
    filter: url(#ink);
  }
  .working {
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
</style>
