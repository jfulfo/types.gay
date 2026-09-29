// Seeded value noise and fractal sums, enough for paper and wood.

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export function valueNoise(seed: number): (x: number, y: number) => number {
  const r = rng(seed);
  const SIZE = 256;
  const table = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < table.length; i++) table[i] = r();
  const at = (i: number, j: number) => table[(j & (SIZE - 1)) * SIZE + (i & (SIZE - 1))];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = smooth(x - i);
    const fy = smooth(y - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
    return a + (b - a) * fy;
  };
}

export function fbm(noise: (x: number, y: number) => number, octaves: number) {
  return (x: number, y: number) => {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(x * f + o * 17.3, y * f - o * 9.1);
      f *= 2;
      amp *= 0.5;
    }
    return sum / (1 - 0.5 ** octaves);
  };
}
