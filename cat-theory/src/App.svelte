<script lang="ts">
  import { onMount } from 'svelte';
  import { LEAVES } from './book';
  import type { LeafResult, LeafSpec } from './engine/solve';
  import { rng } from './lib/noise';
  import { paintPaper } from './lib/paper';
  import { paintWood } from './lib/wood';
  import { hash } from './ui/format';
  import Leaf, { LEAF_H as H, LEAF_W as W } from './ui/Leaf.svelte';
  import type { SolveReply, SolveRequest } from './worker';

  const GAP = 46;
  const CARD = { x: -380, y: 90, w: 300, h: 190 };
  /** Leaves whose middle ends up below this line are out of the book. */
  const ASIDE_LINE = H + 110;
  const FOLDER = { x: 30, y: H + 170, w: 2 * W + 170, h: H + 150 };
  const DESK = { x: -700, y: -450, w: LEAVES.length * (W + GAP) + 1400, h: FOLDER.y + FOLDER.h + 900 };

  let order = $state<string[]>(LEAVES.map((l) => l.id));
  let aside = $state<Record<string, { x: number; y: number; rot: number }>>({});
  let crossed = $state<string[]>([]);
  let results = $state.raw<Record<string, { key: string; result: LeafResult }>>({});
  let stack = $state<string[]>([]); // aside leaves, bottom to top

  let vw = $state(window.innerWidth);
  let vh = $state(window.innerHeight);
  let cam = $state(initialCamera());

  function initialCamera() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    let z = Math.min(1.05, (h - 50) / (H + 60));
    if (w < 700) z = Math.min(z, (w - 20) / (W + 20));
    z = Math.max(0.3, z);
    const x = CARD.x - (w < 700 ? 12 : 40) / z;
    return { x, y: -(h / z - H) / 2, z };
  }

  // --- the prover ------------------------------------------------------------

  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  let rid = 0;
  let busy = $state(false);
  worker.onmessage = (ev: MessageEvent<SolveReply>) => {
    const m = ev.data;
    if (m.rid !== rid) return;
    if ('done' in m) {
      busy = false;
      return;
    }
    results = { ...results, [m.id]: { key: m.key, result: m.result } };
  };

  $effect(() => {
    const leaves: LeafSpec[] = order.map((id) => {
      const l = LEAVES.find((x) => x.id === id)!;
      return {
        id,
        label: l.label,
        statement: l.statement,
        premises: l.premises.map((p) => ({
          label: p.label,
          src: p.src,
          crossed: crossed.includes(p.label),
          global: l.premisesGlobal,
        })),
      };
    });
    busy = true;
    worker.postMessage({ rid: ++rid, leaves } satisfies SolveRequest);
  });

  const toggle = (label: string) => {
    crossed = crossed.includes(label) ? crossed.filter((c) => c !== label) : [...crossed, label];
  };

  // --- layout ----------------------------------------------------------------

  const jitter = (id: string) => {
    const r = rng(hash(id) + 11);
    return { dx: (r() - 0.5) * 12, dy: (r() - 0.5) * 20, rot: (r() - 0.5) * 2.4 };
  };

  interface Drag {
    id: string;
    x: number;
    y: number;
    gx: number;
    gy: number;
    tilt: number;
  }
  let drag = $state<Drag | null>(null);

  function target(d: Drag): { kind: 'book'; index: number } | { kind: 'aside' } {
    if (d.y + H / 2 > ASIDE_LINE) return { kind: 'aside' };
    const n = order.filter((id) => id !== d.id).length;
    return { kind: 'book', index: Math.max(0, Math.min(n, Math.round(d.x / (W + GAP)))) };
  }

  const preview = $derived.by(() => {
    if (!drag) return order;
    const rest = order.filter((id) => id !== drag!.id);
    const t = target(drag);
    if (t.kind === 'book') rest.splice(t.index, 0, drag.id);
    return rest;
  });

  function pose(id: string) {
    if (drag?.id === id) return { x: drag.x, y: drag.y, rot: drag.tilt, z: 1000 };
    const i = preview.indexOf(id);
    if (i >= 0) {
      const j = jitter(id);
      return { x: i * (W + GAP) + j.dx, y: j.dy, rot: j.rot, z: 10 + i };
    }
    const a = aside[id] ?? { x: 0, y: FOLDER.y + 60, rot: 0 };
    return { x: a.x, y: a.y, rot: a.rot, z: 200 + stack.indexOf(id) };
  }

  function drop(d: Drag) {
    const t = target(d);
    const rest = order.filter((id) => id !== d.id);
    if (t.kind === 'book') {
      rest.splice(t.index, 0, d.id);
      stack = stack.filter((s) => s !== d.id);
    } else {
      // Tossed onto the folder: roughly where it was let go, never tidily.
      const r = rng(hash(d.id) + Date.now());
      aside[d.id] = {
        x: Math.min(Math.max(d.x + (r() - 0.5) * 60, FOLDER.x + 20), FOLDER.x + FOLDER.w - W - 20),
        y: Math.min(Math.max(d.y + (r() - 0.5) * 40, FOLDER.y + 40), FOLDER.y + FOLDER.h - H - 30),
        rot: (r() - 0.5) * 12,
      };
      stack = [...stack.filter((s) => s !== d.id), d.id];
    }
    if (rest.join() !== order.join()) order = rest;
  }

  // --- pointer handling ----------------------------------------------------------

  let viewport: HTMLDivElement;
  const pointers = new Map<number, { x: number; y: number }>();
  let mode: 'idle' | 'pan' | 'press' | 'drag' | 'pinch' = 'idle';
  let press: { id: string; sx: number; sy: number; timer?: number } | null = null;
  let pinch: { dist: number; z: number; wx: number; wy: number } | null = null;

  const toWorld = (sx: number, sy: number) => ({ x: sx / cam.z + cam.x, y: sy / cam.z + cam.y });

  const minZoom = () => Math.max(0.25, vw / DESK.w, vh / DESK.h);

  function clampCam() {
    cam.z = Math.max(cam.z, minZoom());
    const minX = DESK.x;
    const maxX = DESK.x + DESK.w - vw / cam.z;
    const minY = DESK.y;
    const maxY = DESK.y + DESK.h - vh / cam.z;
    cam.x = Math.min(Math.max(cam.x, minX), Math.max(minX, maxX));
    cam.y = Math.min(Math.max(cam.y, minY), Math.max(minY, maxY));
  }

  function startDrag(id: string, sx: number, sy: number) {
    const p = pose(id);
    const w = toWorld(sx, sy);
    drag = { id, x: p.x, y: p.y, gx: w.x - p.x, gy: w.y - p.y, tilt: p.rot };
    mode = 'drag';
  }

  function onpointerdown(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      clearTimeout(press?.timer);
      press = null;
      drag = null;
      const [a, b] = [...pointers.values()];
      const mid = toWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z, wx: mid.x, wy: mid.y };
      mode = 'pinch';
      return;
    }
    const leafEl = (e.target as HTMLElement).closest<HTMLElement>('[data-leaf]');
    if (leafEl) {
      const id = leafEl.dataset.leaf!;
      press = { id, sx: e.clientX, sy: e.clientY };
      mode = 'press';
      if (e.pointerType === 'touch') {
        press.timer = window.setTimeout(() => {
          if (mode === 'press' && press) startDrag(press.id, press.sx, press.sy);
          navigator.vibrate?.(8);
        }, 320);
      }
    } else mode = 'pan';
  }

  function onpointermove(e: PointerEvent) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'pinch' && pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const z = Math.min(2.5, Math.max(minZoom(), (pinch.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.dist));
      cam.z = z;
      cam.x = pinch.wx - (a.x + b.x) / 2 / z;
      cam.y = pinch.wy - (a.y + b.y) / 2 / z;
      clampCam();
      return;
    }
    if (mode === 'press' && press) {
      const moved = Math.hypot(e.clientX - press.sx, e.clientY - press.sy);
      if (e.pointerType === 'touch') {
        if (moved > 10) {
          clearTimeout(press.timer);
          press = null;
          mode = 'pan';
        }
      } else if (moved > 4) startDrag(press.id, press.sx, press.sy);
    }
    if (mode === 'pan') {
      cam.x -= (e.clientX - prev.x) / cam.z;
      cam.y -= (e.clientY - prev.y) / cam.z;
      clampCam();
    } else if (mode === 'drag' && drag) {
      const w = toWorld(e.clientX, e.clientY);
      const nx = w.x - drag.gx;
      drag.tilt = Math.max(-6, Math.min(6, drag.tilt * 0.8 + (nx - drag.x) * 0.12));
      drag.x = nx;
      drag.y = w.y - drag.gy;
    }
  }

  function onpointerup(e: PointerEvent) {
    pointers.delete(e.pointerId);
    clearTimeout(press?.timer);
    if (mode === 'drag' && drag) {
      drop(drag);
      drag = null;
    }
    press = null;
    if (pointers.size === 0) mode = 'idle';
    else if (mode === 'pinch') mode = 'pan';
    pinch = null;
  }

  function onwheel(e: WheelEvent) {
    e.preventDefault();
    if (e.ctrlKey) {
      const before = toWorld(e.clientX, e.clientY);
      cam.z = Math.min(2.5, Math.max(minZoom(), cam.z * Math.exp(-e.deltaY * 0.01)));
      cam.x = before.x - e.clientX / cam.z;
      cam.y = before.y - e.clientY / cam.z;
    } else {
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      const dy = e.shiftKey ? 0 : e.deltaY;
      cam.x += dx / cam.z;
      cam.y += dy / cam.z;
    }
    clampCam();
  }

  // Keyboard: arrows move a focused leaf, Delete sets it aside, Enter puts it back.
  function onkeydown(e: KeyboardEvent, id: string) {
    const i = order.indexOf(id);
    if (i >= 0 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const j = i + (e.key === 'ArrowLeft' ? -1 : 1);
      if (j < 0 || j >= order.length) return;
      const next = order.slice();
      [next[i], next[j]] = [next[j], next[i]];
      order = next;
      e.preventDefault();
    } else if (i >= 0 && (e.key === 'Delete' || e.key === 'Backspace')) {
      drop({ id, x: i * (W + GAP), y: FOLDER.y + 60, gx: 0, gy: 0, tilt: 0 });
      e.preventDefault();
    } else if (i < 0 && e.key === 'Enter') {
      drop({ id, x: order.length * (W + GAP), y: 0, gx: 0, gy: 0, tilt: 0 });
      e.preventDefault();
    }
  }

  let desk: HTMLCanvasElement;
  let folderPaper: HTMLCanvasElement;
  let tabPaper: HTMLCanvasElement;
  onMount(() => {
    paintWood(desk, DESK.w, DESK.h);
    const manila: [number, number, number] = [222, 192, 130];
    paintPaper(folderPaper, { seed: 90, width: FOLDER.w, height: FOLDER.h, bound: 'none', base: manila });
    paintPaper(tabPaper, { seed: 91, width: 230, height: 40, bound: 'none', base: manila });
    clampCam();
    viewport.addEventListener('wheel', onwheel, { passive: false });
    const resize = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      clampCam();
    };
    window.addEventListener('resize', resize);
    return () => {
      viewport.removeEventListener('wheel', onwheel);
      window.removeEventListener('resize', resize);
      worker.terminate();
    };
  });
</script>

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

<div
  class="viewport"
  class:dragging={drag !== null}
  bind:this={viewport}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}
  role="application"
  aria-label="A desk with the loose pages of an old algebra book"
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

    <div
      class="folder"
      style:left="{FOLDER.x}px"
      style:top="{FOLDER.y}px"
      style:width="{FOLDER.w}px"
      style:height="{FOLDER.h}px"
    >
      <canvas bind:this={folderPaper}></canvas>
      <span class="tab"><canvas bind:this={tabPaper}></canvas><span>not in the book</span></span>
    </div>

    <div class="card" style:left="{CARD.x}px" style:top="{CARD.y}px" style:width="{CARD.w}px" style:height="{CARD.h}px">
      <p>The binding's gone.</p>
      <p>Put the pages in any order, pull some out, strike things through.</p>
      <p>The proofs will keep up.</p>
    </div>

    {#each LEAVES as leaf (leaf.id)}
      {@const p = pose(leaf.id)}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="slot"
        class:held={drag?.id === leaf.id}
        data-leaf={leaf.id}
        style:transform="translate({p.x}px, {p.y}px) rotate({p.rot}deg)"
        style:z-index={p.z}
        tabindex="0"
        role="group"
        aria-label="{leaf.label ?? 'Axioms'}, page {leaf.folio}{order.includes(leaf.id) ? '' : ', set aside'}"
        onkeydown={(e) => onkeydown(e, leaf.id)}
      >
        <Leaf {leaf} entry={results[leaf.id]} {crossed} lifted={drag?.id === leaf.id} onToggle={toggle} />
      </div>
    {/each}
  </div>
  <div class="lamp"></div>
  {#if busy}<div class="thinking" aria-live="polite">…</div>{/if}
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
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
  }
  .viewport.dragging {
    cursor: grabbing;
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
  .slot {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 50% 50%;
    transition: transform 380ms cubic-bezier(0.2, 0.7, 0.2, 1);
    outline: none;
  }
  .slot.held {
    transition: none;
  }
  .slot:focus-visible :global(.sheet) {
    outline: 2px solid rgba(255, 230, 170, 0.6);
    outline-offset: 6px;
  }
  .folder {
    position: absolute;
    transform: rotate(1.2deg);
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.5)) drop-shadow(4px 12px 16px rgba(0, 0, 0, 0.4));
  }
  .folder > canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border-radius: 2px 4px 4px 4px;
  }
  .folder::after {
    /* the fold, where the front cover would close */
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 10px;
    height: 3px;
    background: linear-gradient(rgba(90, 60, 20, 0.18), rgba(255, 240, 200, 0.2));
  }
  .tab {
    position: absolute;
    top: -38px;
    left: 60px;
    width: 230px;
    height: 40px;
    clip-path: polygon(6% 0, 94% 0, 100% 100%, 0 100%);
  }
  .tab canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .tab span {
    position: absolute;
    inset: 6px 0 0;
    text-align: center;
    font-family: 'Kalam', cursive;
    font-weight: 300;
    font-size: 19px;
    color: #2c2b30;
    filter: url(#graphite);
  }
  .card {
    position: absolute;
    padding: 30px 22px 14px 30px;
    box-sizing: border-box;
    transform: rotate(-3deg);
    background:
      linear-gradient(90deg, transparent 22px, rgba(200, 80, 80, 0.45) 22px, rgba(200, 80, 80, 0.45) 23px, transparent 23px),
      repeating-linear-gradient(transparent 0 25px, rgba(90, 130, 190, 0.35) 25px 26px),
      #f4efe2;
    background-position: 0 0, 0 4px, 0 0;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.5),
      3px 10px 16px rgba(0, 0, 0, 0.35);
    font-family: 'Kalam', cursive;
    font-weight: 300;
    font-size: 17px;
    line-height: 26px;
    color: #3d3c40;
  }
  .card p {
    margin: 0;
    filter: url(#graphite);
  }
  .lamp {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(90% 80% at 35% 30%, rgba(255, 214, 150, 0.1), transparent 60%),
      radial-gradient(150% 120% at 50% 45%, transparent 55%, rgba(0, 0, 0, 0.55));
  }
  .thinking {
    position: absolute;
    right: 18px;
    bottom: 12px;
    font-family: 'Kalam', cursive;
    font-size: 28px;
    color: rgba(240, 225, 190, 0.5);
    pointer-events: none;
    animation: blink 1.2s ease-in-out infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0.2;
    }
  }
</style>
