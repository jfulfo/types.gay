<script lang="ts">
  import type { CheckState } from '../book/check';
  import type { LeanLine } from '../book/layout';

  let {
    prelude,
    lines,
    check,
    hovered,
  }: {
    prelude: string;
    lines: LeanLine[];
    check: CheckState | null;
    hovered: string | null;
  } = $props();

  let box: HTMLDivElement | undefined = $state();
  let content: HTMLDivElement | undefined = $state();
  let fit = $state(1);

  // Set a little smaller when there's a lot of it, but never unreadably so.
  $effect(() => {
    void lines;
    fit = 1;
    requestAnimationFrame(() => {
      if (box && content) fit = Math.max(0.72, Math.min(1, box.clientHeight / content.scrollHeight));
    });
  });
</script>

<div class="lean" bind:this={box}>
  <div class="code" bind:this={content} style:font-size="{13 * fit}px">
    <div class="prelude">{prelude}</div>
    {#each lines as l, i (i)}
      <div class="ln {l.kind}" class:hover={l.key !== undefined && l.key === hovered}>{l.text}</div>
    {/each}
  </div>
</div>
<div class="status" class:bad={check?.status === 'failed' || check?.status === 'unreachable'}>
  {#if !check || check.status === 'checking'}
    <span class="working">Lean is checking this page…</span>
  {:else if check.status === 'ok'}
    ✓ checked by {check.version}, no errors
  {:else if check.status === 'failed'}
    ✗ {check.version}: {check.errors[0]?.msg}
  {:else}
    Lean could not be reached ({check.message})
  {/if}
</div>

<style>
  .lean {
    position: absolute;
    inset: 64px 44px 84px 50px;
    overflow: hidden;
  }
  .code {
    font-family: 'Courier Prime', monospace;
    line-height: 1.45;
    color: #1d1a22;
    filter: url(#ink);
    mix-blend-mode: multiply;
  }
  .prelude {
    white-space: pre-wrap;
    color: #4a4540;
    margin-bottom: 0.4em;
  }
  .ln {
    white-space: pre-wrap;
    padding-left: 6ch;
    text-indent: -6ch;
    min-height: 1.45em;
  }
  .ln.gap {
    min-height: 0.6em;
  }
  .ln.hover {
    background: rgba(120, 100, 60, 0.16);
  }
  .status {
    position: absolute;
    left: 50px;
    right: 44px;
    bottom: 40px;
    font-family: 'Courier Prime', monospace;
    font-size: 14px;
    color: #2d4a2a;
    border-top: 1px solid rgba(60, 50, 40, 0.35);
    padding-top: 8px;
    filter: url(#ink);
  }
  .status.bad {
    color: #7a2020;
  }
  .working {
    color: #3a3530;
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
</style>
