// Deterministic 2D value noise. Shared by physics (collision) and rendering (terrain mesh).

function hash2(ix: number, iz: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Smooth value noise in [0, 1]. */
export function vnoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fz = fade(z - iz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** Fractal Brownian motion, normalised to [0, 1]. */
export function fbm(x: number, z: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * f + i * 17.17, z * f - i * 9.31);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/** Ridged multifractal in [0, 1], for mountain ranges. */
export function ridged(x: number, z: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(vnoise(x * f + i * 5.7, z * f + i * 3.3) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return sum / norm;
}

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
