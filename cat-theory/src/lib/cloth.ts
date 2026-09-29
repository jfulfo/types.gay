// Book cloth over board: a fine weave, faded and rubbed at the edges and corners.

import { fbm, rng, valueNoise } from './noise';

export function paintCloth(canvas: HTMLCanvasElement, width: number, height: number, seed: number) {
  const scale = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const fade = fbm(valueNoise(seed), 4);
  const fine = valueNoise(seed + 5);
  const r = rng(seed);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / scale;
      const v = y / scale;
      // Weave: alternating warp and weft threads.
      const warp = Math.sin(u * 2.4) * 0.5 + 0.5;
      const weft = Math.sin(v * 2.4) * 0.5 + 0.5;
      const cell = (Math.floor(u / 1.3) + Math.floor(v / 1.3)) % 2 ? warp : weft;
      let k = 0.82 + cell * 0.1 + (fine(u * 0.7, v * 0.7) - 0.5) * 0.12;
      k *= 0.9 + (fade(u / 120, v / 120) - 0.5) * 0.25;
      // Rubbed edges and corners show lighter, worn cloth.
      const edge = Math.min(u, v, width - u, height - v);
      const corner = Math.min(Math.hypot(u, v), Math.hypot(width - u, v), Math.hypot(u, height - v), Math.hypot(width - u, height - v));
      const wear = Math.max(0, 1 - edge / 7) * 0.5 + Math.max(0, 1 - corner / 26) * 0.6;
      const i = (y * w + x) * 4;
      d[i] = 74 * k + wear * 60;
      d[i + 1] = 31 * k + wear * 40;
      d[i + 2] = 28 * k + wear * 30;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.scale(scale, scale);
  // A blind-stamped double rule.
  for (const [inset, alpha] of [
    [26, 0.35],
    [32, 0.25],
  ] as const) {
    ctx.strokeStyle = `rgba(20,5,5,${alpha})`;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(inset, inset, width - 2 * inset, height - 2 * inset);
    ctx.strokeStyle = `rgba(255,220,200,${alpha * 0.25})`;
    ctx.strokeRect(inset + 1, inset + 1, width - 2 * inset, height - 2 * inset);
  }
  // Scuffs.
  for (let n = 0; n < 60; n++) {
    ctx.strokeStyle = `rgba(200,150,130,${0.03 + r() * 0.05})`;
    ctx.lineWidth = 0.5 + r();
    const x = r() * width;
    const y = r() * height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 8);
    ctx.stroke();
  }
}
