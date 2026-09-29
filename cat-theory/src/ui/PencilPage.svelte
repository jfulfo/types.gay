<script lang="ts" module>
  export interface Selection {
    item: string;
    from: number;
    to: number;
  }
</script>

<script lang="ts">
  import type { Hint, Line } from '../book/layout';
  import { termHtml } from './format';

  let {
    lines,
    hints,
    selection,
    hovered,
    onPick,
    onHint,
    onHead,
    onHover,
  }: {
    lines: Line[];
    hints: Hint[];
    selection: Selection | null;
    hovered: string | null;
    onPick: (item: string, row: number) => void;
    onHint: (h: Hint) => void;
    onHead: (item: string) => void;
    onHover: (key: string | null) => void;
  } = $props();

  let content: HTMLDivElement | undefined = $state();

  // A row that runs into the margin gets squeezed, as someone writing would.
  $effect(() => {
    void lines;
    if (!content) return;
    const rows = [...content.querySelectorAll<HTMLElement>('.line')];
    for (const r of rows) r.style.removeProperty('--squeeze');
    requestAnimationFrame(() => {
      for (const r of rows) {
        const over = r.scrollWidth / r.clientWidth;
        if (over > 1.001) r.style.setProperty('--squeeze', String(1 / over));
      }
    });
  });

  const selected = (l: Line) =>
    l.kind === 'row' && selection !== null && selection.item === l.item && l.row >= selection.from && l.row <= selection.to;

  function bracket(l: Line): { h: Hint; top: boolean; bottom: boolean } | null {
    if (l.kind !== 'row') return null;
    const h = hints.find((x) => x.item === l.item && l.row >= x.fromRow && l.row <= x.toRow);
    return h ? { h, top: l.row === h.fromRow, bottom: l.row === h.toRow } : null;
  }
</script>

<div class="pencil" bind:this={content}>
  {#each lines as l, i (i)}
    {#if l.kind === 'head'}
      <button class="line head" onclick={() => onHead(l.item)}>
        <span class="sc">Lemma {l.number}.</span>&ensp;{@html termHtml(l.lhs)} = {@html termHtml(l.rhs)}
      </button>
    {:else if l.kind === 'thm'}
      <div class="line head"><span class="sc">Proof.</span></div>
    {:else if l.kind === 'row'}
      {@const b = bracket(l)}
      {@const key = `${l.item}:${l.row}`}
      <div
        class="line row"
        class:sel={selected(l)}
        class:hover={hovered === key}
        role="button"
        tabindex="0"
        onclick={() => onPick(l.item, l.row)}
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(l.item, l.row))}
        onmouseenter={() => onHover(key)}
        onmouseleave={() => onHover(null)}
        onfocus={() => onHover(key)}
        onblur={() => onHover(null)}
      >
        <span class="margin">
          {#if b}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <span
              class="bracket"
              class:top={b.top}
              class:bottom={b.bottom}
              title="these lines turn up {b.h.count} times"
              onclick={(e) => {
                e.stopPropagation();
                onHint(b.h);
              }}
            >
              {#if b.top}<i class="letter">{b.h.letter}</i>{/if}
              {#if b.bottom}<i class="times">{b.h.count}×</i>{/if}
            </span>
          {/if}
        </span>
        <span class="lhs">{#if l.left}{@html termHtml(l.left)}{/if}</span>
        <span class="eq">=</span>
        <span class="term">{@html termHtml(l.term)}</span>
        <span class="cite">{l.cite}</span>
      </div>
    {:else if l.kind === 'gap'}
      <div class="line gap"></div>
    {:else}
      <div class="line qed"><span class="box"></span></div>
    {/if}
  {/each}
</div>

<style>
  .pencil {
    font-family: 'Kalam', cursive;
    font-weight: 300;
    color: #2c2b30;
    font-size: 19px;
    line-height: 27px;
    filter: url(#graphite);
  }
  .line {
    all: unset;
    display: grid;
    grid-template-columns: 1.6em auto auto auto 1fr;
    column-gap: 0.35em;
    align-items: baseline;
    height: 27px;
    white-space: nowrap;
    box-sizing: border-box;
    width: 100%;
    transform: scaleX(var(--squeeze, 1));
    transform-origin: left center;
  }
  .row {
    cursor: pointer;
    border-radius: 3px;
  }
  .row.hover .term,
  .row:focus-visible .term {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 4px;
  }
  .row.sel {
    background: rgba(90, 90, 100, 0.14);
  }
  .head {
    display: block;
  }
  button.head {
    cursor: pointer;
  }
  .sc {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 4px;
  }
  .margin {
    position: relative;
    align-self: stretch;
  }
  .bracket {
    position: absolute;
    inset: 0 0.45em 0 0.55em;
    border-left: 1.5px solid currentColor;
    cursor: pointer;
  }
  .bracket.top {
    border-top: 1.5px solid currentColor;
    top: 6px;
  }
  .bracket.bottom {
    border-bottom: 1.5px solid currentColor;
    bottom: 6px;
  }
  .letter,
  .times {
    position: absolute;
    right: calc(100% + 3px);
    font-style: normal;
    font-size: 15px;
    line-height: 1;
  }
  .letter {
    top: -2px;
  }
  .times {
    bottom: -3px;
    font-size: 13px;
  }
  .lhs {
    min-width: 0.4em;
  }
  .cite {
    font-size: 15px;
    padding-left: 0.8em;
    color: #3c3b40;
  }
  .gap {
    height: 14px;
  }
  .qed {
    display: block;
    text-align: right;
    padding-right: 1.5em;
  }
  .box {
    display: inline-block;
    width: 9px;
    height: 10px;
    border: 1.5px solid currentColor;
    transform: rotate(-2deg);
  }
  :global(.pencil i) {
    font-style: normal;
  }
  :global(.pencil sup) {
    font-size: 0.62em;
    line-height: 0;
  }
</style>
