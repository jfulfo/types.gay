<script lang="ts">
  import { onMount } from 'svelte';
  import { checkLean, type CheckState } from './book/check';
  import { layout, leanFor, PROOF_SPREADS, type Hint } from './book/layout';
  import { buildMonolith, carve, erase, type Doc } from './engine/doc';
  import { leanBody, leanItems, LEAN_PRELUDE } from './engine/lean';
  import { paintWood } from './lib/wood';
  import Book, { PAGE_H, PAGE_W } from './ui/Book.svelte';
  import { equationHtml } from './ui/format';
  import LeanPage from './ui/LeanPage.svelte';
  import Paper from './ui/Paper.svelte';
  import PencilPage, { type Selection } from './ui/PencilPage.svelte';

  const LAW_SRC = "((xy)z)(xz)' = y";
  const GOAL_SRC = 'xy = yx';

  // --- the document, and the reader's history of changes to it ----------------

  type Op = { op: 'carve'; item: string; from: number; to: number } | { op: 'erase'; id: string };
  const STORE = 'loose-pages:v2';
  const base = buildMonolith(LAW_SRC, GOAL_SRC);

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
  const items = $derived(leanItems(doc));
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
        const r = await checkLean(b, ctrl.signal);
        check = r;
        checkedBody = b;
      } catch {
        /* superseded by a newer proof */
      }
    }, 450);
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
  }

  // --- the book ----------------------------------------------------------------------
  //
  //  0 cover · 1 endpaper | 2 the law · 3 §1 | 4 Lean prelude ·
  //  5 pencil | 6 Lean · 7 | 8 · 9 | 10 · 11 notes | 12 uncut · 13 | 14 part two

  const PAGES = 15;
  const FIRST_PROOF = 5;
  const NOTES = FIRST_PROOF + 2 * PROOF_SPREADS;
  const UNCUT = NOTES + 1;
  const UNCUT_SPREAD = UNCUT / 2;

  let spread = $state(0);
  let opened = $state(false);
  let book: Book | undefined = $state();
  let resisted = $state(false);

  const canTurn = (from: number) => from !== UNCUT_SPREAD || cut;
  const selectionRows = $derived(selection ? selection.to - selection.from + 1 : 0);
  const folio = (i: number) => (i >= 3 ? i - 2 : null);

  // --- camera over the desk --------------------------------------------------------

  const BOOK_W = 2 * PAGE_W;
  const DESK = { x: -900, y: -500, w: BOOK_W + 1800, h: PAGE_H + 1000 };
  let vw = $state(window.innerWidth);
  let vh = $state(window.innerHeight);
  let cam = $state({ x: 0, y: 0, z: 1 });

  function home() {
    const z = Math.max(0.2, Math.min((vw - 40) / (BOOK_W + 60), (vh - 40) / (PAGE_H + 60)));
    cam = { z, x: BOOK_W / 2 - vw / 2 / z, y: PAGE_H / 2 - vh / 2 / z };
  }
  home();

  let viewport: HTMLDivElement;
  const pointers = new Map<number, { x: number; y: number }>();
  let panning = false;
  let pinch: { dist: number; z: number; wx: number; wy: number } | null = null;
  const toWorld = (sx: number, sy: number) => ({ x: sx / cam.z + cam.x, y: sy / cam.z + cam.y });
  const minZoom = () => Math.max(0.15, vw / DESK.w, vh / DESK.h);

  function clampCam() {
    cam.z = Math.min(8, Math.max(cam.z, minZoom()));
    cam.x = Math.min(Math.max(cam.x, DESK.x), DESK.x + DESK.w - vw / cam.z);
    cam.y = Math.min(Math.max(cam.y, DESK.y), DESK.y + DESK.h - vh / cam.z);
  }

  function onpointerdown(e: PointerEvent) {
    const t = e.target as HTMLElement;
    if (t.closest('button, [role="button"]')) return;
    // With a mouse, the book is for reading and clicking; drag the desk to move.
    if (e.pointerType === 'mouse' && t.closest('.book')) return;
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const mid = toWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z, wx: mid.x, wy: mid.y };
    } else panning = true;
  }

  function onpointermove(e: PointerEvent) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      cam.z = (pinch.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.dist;
      clampCam();
      cam.x = pinch.wx - (a.x + b.x) / 2 / cam.z;
      cam.y = pinch.wy - (a.y + b.y) / 2 / cam.z;
    } else if (panning) {
      cam.x -= (e.clientX - prev.x) / cam.z;
      cam.y -= (e.clientY - prev.y) / cam.z;
    }
    clampCam();
  }

  function onpointerup(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) panning = false;
  }

  function onwheel(e: WheelEvent) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const before = toWorld(e.clientX, e.clientY);
      cam.z *= Math.exp(-e.deltaY * 0.01);
      clampCam();
      cam.x = before.x - e.clientX / cam.z;
      cam.y = before.y - e.clientY / cam.z;
    } else {
      cam.x += (e.shiftKey ? e.deltaY : e.deltaX) / cam.z;
      cam.y += (e.shiftKey ? 0 : e.deltaY) / cam.z;
    }
    clampCam();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') book?.turn(1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') book?.turn(-1);
    else if (e.key === 'Escape') {
      selection = null;
      pending = null;
    } else if (e.key === '0' && !e.ctrlKey) home();
  }

  let desk: HTMLCanvasElement;
  onMount(() => {
    paintWood(desk, DESK.w, DESK.h);
    viewport.addEventListener('wheel', onwheel, { passive: false });
    const resize = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      home();
    };
    window.addEventListener('resize', resize);
    return () => {
      viewport.removeEventListener('wheel', onwheel);
      window.removeEventListener('resize', resize);
    };
  });
</script>

<svelte:window {onkeydown} />

<svg class="defs" aria-hidden="true">
  <filter id="ink" x="-2%" y="-10%" width="104%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="4" result="n" />
    <feDisplacementMap in="SourceGraphic" in2="n" scale="0.9" xChannelSelector="R" yChannelSelector="G" result="d" />
    <feComponentTransfer in="n" result="speckle">
      <feFuncA type="linear" slope="-0.9" intercept="1.35" />
    </feComponentTransfer>
    <feComposite in="d" in2="speckle" operator="in" />
  </filter>
  <filter id="graphite" x="-2%" y="-5%" width="104%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="9" result="n" />
    <feComponentTransfer in="n" result="grain">
      <feFuncA type="linear" slope="-1.5" intercept="1.6" />
    </feComponentTransfer>
    <feComposite in="SourceGraphic" in2="grain" operator="in" result="g" />
    <feDisplacementMap in="g" in2="n" scale="0.7" xChannelSelector="R" yChannelSelector="G" />
  </filter>
</svg>

{#snippet folioMark(i: number)}
  {@const f = folio(i)}
  {#if f}<span class="folio print" class:l={i % 2 === 1}>{f}</span>{/if}
{/snippet}

{#snippet page(i: number)}
  {@const side = i % 2 === 1 ? 'left' : 'right'}
  {#if i === 0}
    <Paper seed={3} kind="cover" side="right" />
  {:else if i === 1 || i === PAGES - 1}
    <Paper seed={i + 40} kind="endpaper" {side} />
  {:else if i === 2}
    <Paper seed={i} {side}>
      <div class="title print">
        <div class="law">{@html equationHtml(LAW_SRC)}</div>
        <div class="ornament">❦</div>
      </div>
    </Paper>
  {:else if i === 3}
    <Paper seed={i} {side}>
      {@render folioMark(i)}
      <div class="text print">
        <h2>§1. A single law</h2>
        <p>
          Let <i>G</i> be a set with a multiplication (<i>x</i>, <i>y</i>) ↦ <i>xy</i> and a map
          <i>x</i> ↦ <i>x</i><sup>−1</sup>, subject to one law:
        </p>
        <p class="display"><span class="tag">(A)</span>{@html equationHtml(LAW_SRC)}</p>
        <p>
          Nothing else is assumed: not that multiplication is associative, nor that there is an identity. It is a
          remarkable fact, first found by machine,<sup>1</sup> that (A) alone makes <i>G</i> an abelian group. We prove
          the part that is hardest to believe.
        </p>
        <p class="thm"><span class="sc">Theorem.</span> <em>For all <i>x</i>, <i>y</i> in <i>G</i>,</em></p>
        <p class="display">{@html equationHtml(GOAL_SRC)}</p>
        <p class="small">The proof is left to the reader.</p>
        <p class="footnote"><sup>1</sup> W. McCune, 1993.</p>
      </div>
    </Paper>
  {:else if i === 4}
    <Paper seed={i} {side}>
      {@render folioMark(i)}
      <div class="text print">
        <p class="small center">The same, in Lean 4.</p>
        <pre class="code">{LEAN_PRELUDE}
theorem comm (x y : G) :
    x * y = y * x :=
  -- see the pages that follow</pre>
      </div>
    </Paper>
  {:else if i >= FIRST_PROOF && i < NOTES}
    {@const p = Math.floor((i - FIRST_PROOF) / 2)}
    {@const slice = lay.lines.slice(lay.pages[p][0], lay.pages[p][1])}
    <Paper seed={i} {side}>
      {@render folioMark(i)}
      {#if side === 'left'}
        <PencilPage
          lines={slice}
          scale={lay.scale}
          hints={lay.hints}
          {selection}
          {hovered}
          onPick={pick}
          onHint={pickHint}
          onHead={headClicked}
          onHover={(k) => (hovered = k)}
        />
        {@const here = selection && slice.some((l) => l.kind === 'row' && l.item === selection!.item && l.row === selection!.to)}
        {@const headHere = pending && slice.some((l) => l.kind === 'head' && l.item === pending!.id)}
        {#if here || headHere || (note && p === 0)}
          <div class="aside">
            {#if note}
              <span>{note}</span>
            {:else if headHere}
              <button class="pencil-btn" onclick={rubOut}>rub out Lemma {pending!.number}?</button>
              <button class="pencil-btn faint" onclick={() => (pending = null)}>no</button>
            {:else if selectionRows >= 2}
              <button class="pencil-btn" onclick={makeLemma}>make these {selectionRows} lines a lemma</button>
            {:else}
              <span class="faint">…down to which line?</span>
            {/if}
          </div>
        {/if}
      {:else}
        <LeanPage lines={leanFor(slice, items)} {check} {hovered} />
      {/if}
    </Paper>
  {:else if i === NOTES}
    <Paper seed={i} {side}>
      {@render folioMark(i)}
      <div class="text print">
        <p class="small center">Notes</p>
      </div>
      {#if complete}
        <div class="stamp">
          <div>Q.E.D.</div>
          <div class="sub">checked · {check?.status === 'ok' ? check.version : 'Lean'}</div>
        </div>
      {:else}
        <div class="pencil-note">
          {#if !lay.fits}
            too cramped to read: {lay.lines.length} lines where there is room for {Math.round(lay.lines.length * lay.scale)}.
          {:else if check?.status === 'checking'}
            waiting on Lean…
          {/if}
        </div>
      {/if}
      {#if ops.length}
        <button class="pencil-btn restart" onclick={startOver}>(erase all of it and start over)</button>
      {/if}
    </Paper>
  {:else if i === UNCUT}
    <Paper seed={i} {side}>
      {@render folioMark(i)}
      <div class="text print">
        <p class="center part">PART TWO</p>
      </div>
      {#if !cut}
        <div class="fold"></div>
        {#if complete}
          <button class="slit pencil-btn" onclick={() => (cut = true)}>slit the pages open</button>
        {:else if resisted}
          <div class="pencil-note low">still uncut.</div>
        {/if}
      {/if}
    </Paper>
  {:else}
    <Paper seed={i} {side}>
      {@render folioMark(i)}
      {#if i === UNCUT + 1}
        <div class="text print">
          <p class="small center">[the rest of this book has not been printed yet]</p>
        </div>
      {/if}
    </Paper>
  {/if}
{/snippet}

<div
  class="viewport"
  bind:this={viewport}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}
  role="application"
  aria-label="An old book lying on a desk"
>
  <div class="world" style:transform="translate({-cam.x * cam.z}px, {-cam.y * cam.z}px) scale({cam.z})">
    <canvas
      class="desk"
      bind:this={desk}
      style:left="{DESK.x}px"
      style:top="{DESK.y}px"
      style:width="{DESK.w}px"
      style:height="{DESK.h}px"
    ></canvas>
    <div class="book-at" class:closed={!opened}>
      <Book
        bind:this={book}
        bind:spread
        pageCount={PAGES}
        {page}
        {canTurn}
        onTurn={(to) => (opened = to > 0)}
        onResist={() => (resisted = true)}
      />
    </div>
  </div>
  <div class="lamp"></div>
</div>

<style>
  .defs {
    position: absolute;
    width: 0;
    height: 0;
  }
  .viewport {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #1c130c;
    touch-action: none;
  }
  .world {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
  }
  .desk {
    position: absolute;
  }
  .book-at {
    position: absolute;
    left: 0;
    top: 0;
    transition: transform 900ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .book-at.closed {
    transform: translateX(-280px);
  }
  .lamp {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(90% 80% at 40% 30%, rgba(255, 214, 150, 0.08), transparent 60%),
      radial-gradient(150% 120% at 50% 45%, transparent 55%, rgba(0, 0, 0, 0.55));
  }

  /* printed matter */
  .print {
    font-family: 'Old Standard TT', serif;
    color: #1f1a14;
    filter: url(#ink);
    mix-blend-mode: multiply;
  }
  .folio {
    position: absolute;
    top: 38px;
    right: 48px;
    font-size: 14px;
  }
  .folio.l {
    right: auto;
    left: 48px;
  }
  .text {
    position: absolute;
    inset: 90px 64px 60px 64px;
    font-size: 17px;
    line-height: 1.5;
  }
  .text p {
    margin: 0 0 0.8em;
    text-align: justify;
    hyphens: auto;
  }
  .text h2 {
    font-weight: normal;
    font-size: 18px;
    font-variant: small-caps;
    letter-spacing: 0.06em;
    text-align: center;
    margin: 0 0 1.4em;
  }
  .display {
    text-align: center !important;
    font-size: 19px;
    position: relative;
  }
  .tag {
    position: absolute;
    left: 0;
    font-size: 16px;
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
  .footnote {
    position: absolute;
    bottom: 0;
    font-size: 13px;
    border-top: 1px solid rgba(40, 30, 20, 0.5);
    padding-top: 4px;
    width: 40%;
  }
  .part {
    margin-top: 40%;
    letter-spacing: 0.3em;
    font-size: 16px;
  }
  .title {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 30px;
  }
  .title .law {
    font-size: 30px;
  }
  .ornament {
    font-size: 22px;
  }
  .code {
    font-family: 'Courier Prime', monospace;
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    margin: 1.5em 0 0;
  }
  :global(.paper sup) {
    font-size: 0.66em;
    line-height: 0;
    vertical-align: 0.55em;
  }
  :global(.print i) {
    font-style: italic;
  }

  /* pencil in the margins */
  .aside {
    position: absolute;
    left: 58px;
    right: 40px;
    bottom: 26px;
    display: flex;
    gap: 1.2em;
    align-items: baseline;
    font-family: 'Kalam', cursive;
    font-weight: 300;
    font-size: 19px;
    color: #2c2b30;
    filter: url(#graphite);
  }
  .pencil-btn {
    all: unset;
    cursor: pointer;
    font-family: 'Kalam', cursive;
    font-weight: 300;
    font-size: 19px;
    color: #2c2b30;
    border-bottom: 1px solid rgba(44, 43, 48, 0.5);
  }
  .pencil-btn:hover,
  .pencil-btn:focus-visible {
    border-bottom-width: 2px;
  }
  .faint {
    opacity: 0.6;
  }
  .restart {
    position: absolute;
    left: 64px;
    bottom: 40px;
    font-size: 16px;
    opacity: 0.7;
    filter: url(#graphite);
  }
  .pencil-note {
    position: absolute;
    left: 64px;
    right: 64px;
    top: 200px;
    font-family: 'Kalam', cursive;
    font-weight: 300;
    font-size: 20px;
    color: #2c2b30;
    filter: url(#graphite);
    transform: rotate(-2deg);
  }
  .pencil-note.low {
    top: auto;
    bottom: 120px;
  }
  .stamp {
    position: absolute;
    left: 50%;
    top: 42%;
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
    right: 40px;
    top: 45%;
    transform: rotate(-4deg);
    filter: url(#graphite);
  }
</style>
