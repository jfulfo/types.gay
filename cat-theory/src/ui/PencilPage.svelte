<script lang="ts">
  import type { Hint, Line } from '../book/layout';
  import { termHtml } from './format';

  export interface Selection {
    item: string;
    from: number;
    to: number;
  }

  let {
    lines,
    scale,
    hints,
    selection,
    hovered,
    onPick,
    onHint,
    onHead,
    onHover,
  }: {
    lines: Line[];
    scale: number;
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
    void scale;
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

  // Which bracket (if any) a row sits in, and whether it opens or closes it.
  function bracket(l: Line): { h: Hint; top: boolean; bottom: boolean } | null {
    if (l.kind !== 'row') return null;
    const h = hints.find((x) => x.item === l.item && l.row >= x.fromRow && l.row <= x.toRow);
    return h ? { h, top: l.row === h.fromRow, bottom: l.row === h.toRow } : null;
  }
</script>

<div class="pencil" style:--s={scale}>
  <div class="lines" bind:this={content}>
    {#each lines as l, i (i)}
      {#if l.kind === 'head'}
        <button class="line head" onclick={() => onHead(l.item)}>
          <span class="sc">Lemma {l.number}.</span>
          {@html termHtml(l.lhs)} = {@html termHtml(l.rhs)}
        </button>
      {:else if l.kind === 'thm'}
        <div class="line head">Proof of the Theorem.</div>
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
                title="this passage recurs"
                onclick={(e) => {
                  e.stopPropagation();
                  onHint(b.h);
                }}
              >{#if b.top}<i class="letter">{b.h.letter}</i>{/if}</span>
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
</div>

<style>
  .pencil {
    position: absolute;
    inset: 70px 40px 70px 58px;
    overflow: hidden;
    font-family: 'Kalam', cursive;
    font-weight: 300;
    color: #2c2b30;
    font-size: calc(18px * var(--s));
    line-height: 1.36;
    filter: url(#graphite);
  }
  .line {
    all: unset;
    transform: scaleX(var(--squeeze, 1));
    transform-origin: left center;
    display: grid;
    grid-template-columns: 1.3em auto auto auto 1fr;
    column-gap: 0.4em;
    align-items: baseline;
    min-height: 1.36em;
    white-space: nowrap;
    box-sizing: border-box;
    width: 100%;
  }
  .row {
    cursor: pointer;
  }
  .row.hover .term,
  .row:focus-visible .term {
    text-decoration: underline;
    text-decoration-thickness: 0.06em;
    text-underline-offset: 0.2em;
  }
  .row.sel {
    background: linear-gradient(transparent 12%, rgba(90, 90, 100, 0.13) 12%, rgba(90, 90, 100, 0.13) 88%, transparent 88%);
  }
  .head {
    display: block;
    margin-top: 0.15em;
    cursor: default;
  }
  button.head {
    cursor: pointer;
  }
  .sc {
    text-decoration: underline;
    text-decoration-thickness: 0.05em;
    text-underline-offset: 0.18em;
    margin-right: 0.3em;
  }
  .margin {
    position: relative;
    align-self: stretch;
  }
  .bracket {
    position: absolute;
    inset: 0 0.35em 0 0.2em;
    border-left: 0.08em solid currentColor;
    cursor: pointer;
    opacity: 0.8;
  }
  .bracket.top {
    border-top: 0.08em solid currentColor;
    top: 0.25em;
  }
  .bracket.bottom {
    border-bottom: 0.08em solid currentColor;
    bottom: 0.25em;
  }
  .letter {
    position: absolute;
    left: -1.1em;
    top: -0.45em;
    font-style: normal;
    font-size: 0.85em;
  }
  .lhs {
    min-width: 0.5em;
  }
  .cite {
    font-size: 0.78em;
    padding-left: 0.8em;
    color: #3c3b40;
  }
  .gap {
    min-height: 0.7em;
  }
  .qed {
    display: block;
    text-align: right;
    padding-right: 2em;
  }
  .box {
    display: inline-block;
    width: 0.5em;
    height: 0.55em;
    border: 0.08em solid currentColor;
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
