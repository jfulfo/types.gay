// Procedural aged paper: uneven toning, fibres, foxing, browned edges, and
// the sewing holes and glue left along the edge where the leaf was bound.

import { fbm, rng, valueNoise } from './noise';

export interface PaperOptions {
  seed: number;
  width: number;
  height: number;
  /** Which edge was the spine, if any. */
  bound: 'left' | 'right' | 'none';
  /** Base colour of the sheet. */
  base?: [number, number, number];
}

export function paintPaper(canvas: HTMLCanvasElement, o: PaperOptions) {
  const scale = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(o.width * scale);
  const h = Math.round(o.height * scale);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const r = rng(o.seed * 7919 + 1);
  const tone = fbm(valueNoise(o.seed), 5);
  const blotch = fbm(valueNoise(o.seed + 101), 4);
  const grain = valueNoise(o.seed + 202);

  const base = o.base ?? [236, 224, 192];
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const edgeWidth = 0.13 * Math.min(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / scale;
      const v = y / scale;
      // Base: warm cream, gently mottled.
      let k = 0.93 + (tone(u / 90, v / 90) - 0.5) * 0.07 + (grain(u * 0.9, v * 0.9) - 0.5) * 0.035;
      // Browning towards the edges, ragged rather than a clean vignette.
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      const ragged = edgeWidth * (0.6 + blotch(u / 40, v / 40) * 0.9);
      const brown = Math.max(0, 1 - edge / ragged) ** 2.2;
      // Large faint stains.
      const stain = Math.max(0, blotch(u / 160 + 3, v / 160) - 0.62) * 1.6;
      const i = (y * w + x) * 4;
      const warm = brown * 0.4 + stain * 0.14 + 0.05;
      d[i] = base[0] * k - warm * 40;
      d[i + 1] = base[1] * k - warm * 70;
      d[i + 2] = base[2] * k - warm * 110;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.scale(scale, scale);

  // Fibres: short faint strokes, some lighter and some darker than the sheet.
  for (let n = 0; n < 900; n++) {
    const x = r() * o.width;
    const y = r() * o.height;
    const len = 2 + r() * 7;
    const a = r() * Math.PI;
    ctx.strokeStyle = r() < 0.5 ? `rgba(255,250,235,${0.05 + r() * 0.1})` : `rgba(110,85,50,${0.03 + r() * 0.05})`;
    ctx.lineWidth = 0.4 + r() * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + r() * 2, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }

  // Foxing: rusty spots, clustered, denser near the edges.
  const clusters = 3 + Math.floor(r() * 5);
  for (let c = 0; c < clusters; c++) {
    const cx = r() < 0.5 ? r() * o.width : (r() < 0.5 ? 0.08 : 0.92) * o.width;
    const cy = r() * o.height;
    const spots = 4 + Math.floor(r() * 18);
    for (let s = 0; s < spots; s++) {
      const x = cx + (r() - 0.5) * 70;
      const y = cy + (r() - 0.5) * 90;
      const rad = 0.6 + r() ** 3 * 5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 2.2);
      const alpha = 0.08 + r() * 0.3;
      g.addColorStop(0, `rgba(140,82,38,${alpha})`);
      g.addColorStop(0.45, `rgba(150,95,45,${alpha * 0.5})`);
      g.addColorStop(1, 'rgba(150,95,45,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Occasionally a water ring.
  if (r() < 0.35) {
    const x = o.width * (0.2 + r() * 0.6);
    const y = o.height * (0.2 + r() * 0.6);
    const rad = 30 + r() * 40;
    ctx.strokeStyle = `rgba(130,95,50,${0.05 + r() * 0.05})`;
    ctx.lineWidth = 2 + r() * 2;
    ctx.beginPath();
    for (let t = 0; t <= Math.PI * 2 + 0.01; t += 0.05) {
      const rr = rad * (1 + (blotch(t * 2, 5) - 0.5) * 0.15);
      const px = x + Math.cos(t) * rr;
      const py = y + Math.sin(t) * rr;
      if (t === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  if (o.bound === 'none') return;
  // The spine edge: glue residue and a column of sewing holes.
  const sx = o.bound === 'left' ? 0 : o.width;
  const dir = o.bound === 'left' ? 1 : -1;
  const glue = ctx.createLinearGradient(sx, 0, sx + dir * 14, 0);
  glue.addColorStop(0, 'rgba(150,120,70,0.35)');
  glue.addColorStop(1, 'rgba(150,120,70,0)');
  ctx.fillStyle = glue;
  ctx.fillRect(o.bound === 'left' ? 0 : o.width - 14, 0, 14, o.height);
  for (let y = o.height * 0.12; y < o.height * 0.9; y += o.height * 0.155) {
    const hx = sx + dir * (5 + r() * 1.5);
    ctx.fillStyle = 'rgba(60,45,30,0.55)';
    ctx.beginPath();
    ctx.arc(hx, y + (r() - 0.5) * 3, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,70,40,0.25)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(hx, y - 6);
    ctx.lineTo(hx, y + 6);
    ctx.stroke();
  }
}
