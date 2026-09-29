<script lang="ts">
  import { onMount } from 'svelte';
  import { checkLean, type CheckState } from './book/check';
  import { layout, leanLines, type Hint } from './book/layout';
  import { AXIOMS, THEOREM_SRC } from './book/theory';
  import { buildMonolith, carve, erase, type Doc } from './engine/doc';
  import { leanBody, leanItems, LEAN_PRELUDE } from './engine/lean';
  import { paintWood } from './lib/wood';
  import Book, { PAGE_H, PAGE_W } from './ui/Book.svelte';
  import { equationHtml } from './ui/format';
  import LeanPage from './ui/LeanPage.svelte';
  import Paper from './ui/Paper.svelte';
  import PencilPage, { type Selection } from './ui/PencilPage.svelte';

  // --- the document, and the reader's history of changes to it ----------------

  type Op = { op: 'carve'; item: string; from: number; to: number } | { op: 'erase'; id: string };
  const STORE = 'loose-pages:v3';
  const base = buildMonolith(AXIOMS, THEOREM_SRC);

  function replay(ops: Op[]): Doc {
    let d = base;
    for (const o of ops) d = o.op === 'carve' ? carve(d, o.item, o.from, o.to).doc : erase(d, o.id);
    return d;
  }

  function load(): { ops: Op[]; cut: boolean } {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? 'null');
      if (saved && Array.isArray(saved.ops)) {
        replay(saved.ops);
        return { ops: saved.ops, cut: !!saved.cut };
      }
    } catch {
      /* start afresh */
    }
    return { ops: [], cut: false };
  }

  const saved = load();
  let ops = $state<Op[]>(saved.ops);
  let cut = $state(saved.cut);
  const doc = $derived(replay(ops));
  $effect(() => {
    const snapshot = JSON.stringify({ ops, cut });
    try {
      localStorage.setItem(STORE, snapshot);
    } catch {
      /* private mode: forget on reload */
    }
  });

  const lay = $derived(layout(doc));
  const lean = $derived(leanLines(leanItems(doc)));
  const body = $derived(leanBody(doc));

  // --- Lean, checking in the background ------------------------------------------

  let check = $state<CheckState | null>(null);
  let checkedBody = $state('');
  $effect(() => {
    const b = body;
    check = { status: 'checking' };
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        check = await checkLean(b, ctrl.signal);
        checkedBody = b;
      } catch {
        /* superseded by a newer proof */
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  });

  const complete = $derived(lay.fits && check?.status === 'ok' && checkedBody === body);

  // --- the reader's hand -----------------------------------------------------------

  let selection = $state<Selection | null>(null);
  let pending = $state<{ id: string; number: number } | null>(null);
  let note = $state<string | null>(null);
  let hovered = $state<string | null>(null);

  function pick(item: string, row: number) {
    pending = null;
    note = null;
    if (!selection || selection.item !== item) selection = { item, from: row, to: row };
    else if (selection.from === row && selection.to === row) selection = null;
    else selection = { item, from: Math.min(selection.from, row), to: Math.max(selection.to, row) };
  }

  function pickHint(h: Hint) {
    pending = null;
    note = null;
    selection = { item: h.item, from: h.fromRow, to: h.toRow };
  }

  function headClicked(id: string) {
    selection = null;
    note = null;
    pending = { id, number: lay.numbers.get(id)! };
  }

  function makeLemma() {
    if (!selection) return;
    const s = selection;
    try {
      carve(doc, s.item, s.from - 1, s.to);
      ops = [...ops, { op: 'carve', item: s.item, from: s.from - 1, to: s.to }];
      selection = null;
    } catch (e) {
      note = String(e).includes('whole proof') ? "that's the whole proof already." : "can't make a lemma of that.";
    }
  }

  function rubOut() {
    if (!pending) return;
    ops = [...ops, { op: 'erase', id: pending.id }];
    pending = null;
  }

  function startOver() {
    ops = [];
    cut = false;
    selection = null;
    pending = null;
    note = null;
  }

  const selectionRows = $derived(selection ? selection.to - selection.from + 1 : 0);
  const selectionHere = (lines: typeof lay.lines) =>
    !!selection && lines.some((l) => l.kind === 'row' && l.item === selection!.item && l.row === selection!.to);

  // --- the book ----------------------------------------------------------------------
  //
  //  1 theorem + pencil | 2 Lean
  //  3 run-on or notes  | 4 part two (uncut)
  //  5                  | 6

  const PAGES = 6;
  const UNCUT = 4;
  let at = $state(1);
  let book: Book | undefined = $state();
  let resisted = $state(false);
  const canLeave = (p: number) => p !== UNCUT || cut;

  // --- fitting the book to the window -------------------------------------------------

  let vw = $state(window.innerWidth);
  let vh = $state(window.innerHeight);
  const spreadScale = $derived(Math.min((vw - 40) / (2 * PAGE_W + 28), (vh - 40) / (PAGE_H + 24)));
  const pageScale = $derived(Math.min((vw - 16) / PAGE_W, (vh - 16) / PAGE_H));
  // Spreads while they stay legible; otherwise one page at a time.
  const single = $derived(spreadScale < 0.62 && pageScale > spreadScale * 1.3);
  const scale = $derived(single ? pageScale : spreadScale);

  $effect(() => {
    // Keep a sensible page in view when switching between spreads and single pages.
    if (!single && at % 2 === 0) at -= 1;
  });

  // On touch screens, a horizontal swipe turns the page.
  let swipe: { x: number; y: number } | null = null;
  function swipeStart(e: PointerEvent) {
    swipe = e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY } : null;
  }
  function swipeEnd(e: PointerEvent) {
    if (!swipe) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) book?.turn(dx < 0 ? 1 : -1);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') book?.turn(1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') book?.turn(-1);
    else if (e.key === 'Escape') {
      selection = null;
      pending = null;
    }
  }

  let desk: HTMLCanvasElement;
  onMount(() => {
    const paint = () => paintWood(desk, window.innerWidth, window.innerHeight);
    paint();
    let timer = 0;
    const resize = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      clearTimeout(timer);
      timer = window.setTimeout(paint, 200);
    };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  });
</script>

<svelte:window {onkeydown} />

<svg class="defs" aria-hidden="true">
  <filter id="ink" x="-2%" y="-10%" width="104%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="4" result="n" />
    <feDisplacementMap in="SourceGraphic" in2="n" scale="0.8" xChannelSelector="R" yChannelSelector="G" result="d" />
    <feComponentTransfer in="n" result="speckle">
      <feFuncA type="linear" slope="-0.7" intercept="1.3" />
    </feComponentTransfer>
    <feComposite in="d" in2="speckle" operator="in" />
  </filter>
  <filter id="graphite" x="-2%" y="-5%" width="104%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="9" result="n" />
    <feComponentTransfer in="n" result="grain">
      <feFuncA type="linear" slope="-1.2" intercept="1.55" />
    </feComponentTransfer>
    <feComposite in="SourceGraphic" in2="grain" operator="in" result="g" />
    <feDisplacementMap in="g" in2="n" scale="0.6" xChannelSelector="R" yChannelSelector="G" />
  </filter>
</svg>

{#snippet head(title: string, folio: number, left: boolean)}
  <div class="runhead print" class:left>
    <span class="folio">{folio}</span>
    <span class="rh">{title}</span>
  </div>
{/snippet}

{#snippet actions(lines: typeof lay.lines, main: boolean)}
  {@const here = selectionHere(lines)}
  {@const headHere = !!pending && lines.some((l) => l.kind === 'head' && l.item === pending!.id)}
  <div class="aside">
    {#if note && main}
      <span>{note}</span>
    {:else if headHere}
      <button class="pencil-btn" onclick={rubOut}>rub out Lemma {pending!.number}?</button>
      <button class="pencil-btn faint" onclick={() => (pending = null)}>keep it</button>
    {:else if here && selectionRows >= 2}
      <button class="pencil-btn" onclick={makeLemma}>make these {selectionRows} lines a lemma</button>
      <button class="pencil-btn faint" onclick={() => (selection = null)}>never mind</button>
    {:else if here}
      <span class="faint">…and down to which line?</span>
    {:else if main && !lay.fits && ops.length === 0}
      <span class="faint">it doesn't fit. the bracketed lines keep repeating: click one.</span>
    {:else if main && !lay.fits}
      <span class="faint">still doesn't fit.</span>
    {/if}
  </div>
{/snippet}

{#snippet page(i: number)}
  {@const side = i % 2 === 1 ? 'left' : 'right'}
  {#if i === 1}
    <Paper seed={11} {side}>
      {@render head('INVERSES', 47, true)}
      <div class="text print">
        <p class="small">Recall that <i>G</i> is a group:</p>
        <p class="axioms">
          {#each AXIOMS as a}<span class="ax"><span class="lbl">({a.label})</span> {@html equationHtml(a.src)}</span>{/each}
        </p>
        <p class="thm"><span class="sc">Theorem 4.</span> <em>For all <i>x</i>, <i>y</i> in <i>G</i>,</em></p>
        <p class="display">{@html equationHtml(THEOREM_SRC)}</p>
        <p class="small">The proof is left to the reader.</p>
      </div>
      <div class="space">
        <PencilPage
          lines={lay.here}
          hints={lay.hints}
          {selection}
          {hovered}
          onPick={pick}
          onHint={pickHint}
          onHead={headClicked}
          onHover={(k) => (hovered = k)}
        />
      </div>
      {@render actions(lay.here, true)}
      {#if !lay.fits}<div class="cont">cont. overleaf →</div>{/if}
    </Paper>
  {:else if i === 2}
    <Paper seed={12} {side}>
      {@render head('THE SAME, IN LEAN 4', 48, false)}
      <LeanPage prelude={LEAN_PRELUDE} lines={lean} {check} {hovered} />
    </Paper>
  {:else if i === 3}
    <Paper seed={13} {side}>
      {@render head('INVERSES', 49, true)}
      {#if !lay.fits}
        <div class="space top">
          <PencilPage
            lines={lay.overleaf}
            hints={lay.hints}
            {selection}
            {hovered}
            onPick={pick}
            onHint={pickHint}
            onHead={headClicked}
            onHover={(k) => (hovered = k)}
          />
        </div>
        {@render actions(lay.overleaf, false)}
      {:else}
        <div class="text print"><p class="small center">Notes</p></div>
        {#if complete}
          <div class="stamp">
            <div>Q.E.D.</div>
            <div class="sub">checked · {check?.status === 'ok' ? check.version : 'Lean'}</div>
          </div>
        {:else}
          <div class="pencil-note">it fits. waiting on Lean…</div>
        {/if}
      {/if}
      {#if ops.length}
        <button class="pencil-btn restart" onclick={startOver}>(rub it all out and start again)</button>
      {/if}
    </Paper>
  {:else if i === UNCUT}
    <Paper seed={14} {side}>
      {@render head('PART TWO', 50, false)}
      <div class="text print"><p class="center part">PART TWO</p></div>
      {#if !cut}
        <div class="fold"></div>
        {#if complete}
          <button class="slit pencil-btn" onclick={() => (cut = true)}>slit the pages open →</button>
        {:else if resisted}
          <div class="pencil-note low">uncut. finish the proof first.</div>
        {/if}
      {/if}
    </Paper>
  {:else}
    <Paper seed={10 + i} {side}>
      {@render head('PART TWO', 46 + i, side === 'left')}
      {#if i === 5}
        <div class="text print"><p class="small center">[the rest of this book has not been printed yet]</p></div>
      {/if}
    </Paper>
  {/if}
{/snippet}

<canvas class="desk" bind:this={desk}></canvas>
<main class="stage" onpointerdown={swipeStart} onpointerup={swipeEnd}>
  <div class="fit" style:transform="translate(-50%, -50%) scale({scale})">
    <Book bind:this={book} bind:at pageCount={PAGES} {single} {page} {canLeave} onResist={() => (resisted = true)} />
  </div>
</main>
<div class="lamp"></div>

<style>
  .defs {
    position: absolute;
    width: 0;
    height: 0;
  }
  .desk {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .stage {
    position: fixed;
    inset: 0;
    overflow: hidden;
    touch-action: pan-y pinch-zoom;
  }
  .fit {
    position: absolute;
    left: 50%;
    top: 50%;
    transform-origin: center center;
  }
  .lamp {
    position: fixed;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(90% 80% at 40% 30%, rgba(255, 214, 150, 0.08), transparent 60%),
      radial-gradient(150% 120% at 50% 45%, transparent 55%, rgba(0, 0, 0, 0.5));
  }

  /* printed matter */
  .print {
    font-family: 'Old Standard TT', serif;
    color: #1f1a14;
    filter: url(#ink);
    mix-blend-mode: multiply;
  }
  .runhead {
    position: absolute;
    top: 34px;
    left: 50px;
    right: 44px;
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    letter-spacing: 0.14em;
  }
  .runhead.left {
    left: 44px;
    right: 50px;
  }
  .runhead:not(.left) {
    flex-direction: row-reverse;
  }
  .runhead .folio {
    font-size: 14px;
    letter-spacing: 0;
  }
  .runhead .rh {
    flex: 1;
    text-align: center;
  }
  .text {
    position: absolute;
    inset: 78px 50px auto 48px;
    font-size: 17px;
    line-height: 1.5;
  }
  .text p {
    margin: 0 0 0.6em;
    text-align: justify;
    hyphens: auto;
  }
  .axioms {
    display: flex;
    justify-content: center;
    gap: 2em;
    font-size: 16px;
  }
  .ax {
    white-space: nowrap;
  }
  .lbl {
    font-size: 14px;
    margin-right: 0.3em;
  }
  .display {
    text-align: center !important;
    font-size: 20px;
  }
  .sc {
    font-variant: small-caps;
    letter-spacing: 0.06em;
  }
  .small {
    font-size: 14.5px;
  }
  .center {
    text-align: center !important;
  }
  .part {
    margin-top: 45%;
    letter-spacing: 0.3em;
    font-size: 16px;
  }
  :global(.paper sup) {
    font-size: 0.66em;
    line-height: 0;
    vertical-align: 0.55em;
  }
  :global(.print i) {
    font-style: italic;
  }

  /* where the pencil goes */
  .space {
    position: absolute;
    top: 272px;
    left: 30px;
    right: 44px;
  }
  .space.top {
    top: 78px;
  }
  .aside {
    position: absolute;
    left: 48px;
    right: 44px;
    bottom: 26px;
    display: flex;
    gap: 1.1em;
    align-items: baseline;
    font-family: 'Kalam', cursive;
    font-weight: 300;
    font-size: 18px;
    color: #2c2b30;
    filter: url(#graphite);
  }
  .cont {
    position: absolute;
    right: 44px;
    bottom: 58px;
    font-family: 'Kalam', cursive;
    font-weight: 300;
    font-size: 17px;
    color: #2c2b30;
    filter: url(#graphite);
  }
  .pencil-btn {
    all: unset;
    cursor: pointer;
    font-family: 'Kalam', cursive;
    font-weight: 300;
    font-size: 18px;
    color: #2c2b30;
    border-bottom: 1.5px solid rgba(44, 43, 48, 0.55);
  }
  .pencil-btn:hover,
  .pencil-btn:focus-visible {
    border-bottom-width: 2.5px;
  }
  .faint {
    opacity: 0.65;
  }
  .restart {
    position: absolute;
    left: 48px;
    bottom: 30px;
    font-size: 16px;
    opacity: 0.75;
    filter: url(#graphite);
  }
  .pencil-note {
    position: absolute;
    left: 60px;
    right: 60px;
    top: 220px;
    font-family: 'Kalam', cursive;
    font-weight: 300;
    font-size: 20px;
    color: #2c2b30;
    filter: url(#graphite);
    transform: rotate(-2deg);
  }
  .pencil-note.low {
    top: auto;
    bottom: 140px;
  }
  .stamp {
    position: absolute;
    left: 50%;
    top: 40%;
    transform: translate(-50%, -50%) rotate(-11deg);
    border: 4px double rgba(160, 30, 40, 0.75);
    padding: 12px 28px;
    color: rgba(160, 30, 40, 0.8);
    font-family: 'Old Standard TT', serif;
    text-align: center;
    letter-spacing: 0.2em;
    font-size: 34px;
    mix-blend-mode: multiply;
    filter: url(#ink);
  }
  .stamp .sub {
    font-size: 12px;
    letter-spacing: 0.15em;
    margin-top: 4px;
  }
  .fold {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    width: 10px;
    background: linear-gradient(90deg, transparent, rgba(80, 55, 20, 0.18) 60%, rgba(255, 245, 220, 0.25));
    pointer-events: none;
  }
  .slit {
    position: absolute;
    right: 50px;
    top: 48%;
    transform: rotate(-3deg);
    filter: url(#graphite);
    font-size: 20px;
  }
</style>
