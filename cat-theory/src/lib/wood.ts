// A dark oak desk top, painted once at low resolution and scaled up.

import { fbm, valueNoise } from './noise';

export function paintWood(canvas: HTMLCanvasElement, width: number, height: number) {
  const scale = 0.5;
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const warp = fbm(valueNoise(7), 5);
  const fine = valueNoise(11);
  const plank = valueNoise(13);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const plankH = 180 * scale;
  for (let y = 0; y < h; y++) {
    const p = Math.floor(y / plankH);
    const seam = Math.min(y % plankH, plankH - (y % plankH));
    for (let x = 0; x < w; x++) {
      const u = x / scale;
      const v = y / scale;
      const shift = plank(p * 3.1, 0.5) * 400;
      const g = warp((u + shift) / 700, v / 70) * 9 + v / 26;
      const ring = 0.5 + 0.5 * Math.sin(g * Math.PI);
      const streak = fine(u / 3, v / 0.9);
      let k = 0.55 + ring * 0.25 + (streak - 0.5) * 0.18 + (plank(p, 1) - 0.5) * 0.25;
      if (seam < 1.2) k *= 0.45;
      const i = (y * w + x) * 4;
      d[i] = 70 * k;
      d[i + 1] = 44 * k;
      d[i + 2] = 26 * k;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
