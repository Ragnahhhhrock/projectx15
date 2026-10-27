// World layout and terrain height. +x = east (downrange), +y = up, +z = south.
// Rogers Dry Lake and the airbase sit 510 km downrange of the drop point, about as far as the real
// high-altitude flights launched from Edwards (flight 91 dropped over Smith Ranch Lake, Nevada).
import { fbm, mix, ridged, smoothstep } from './noise';

export const LAKE_ELEV = 700; // m MSL, Rogers Dry Lake is ~2,300 ft
export const TERRAIN_MAX = 3300; // m, anything above this cannot be touched

/** Ideal B-52 release point for both mission profiles: 45,000 ft, Mach 0.8, heading east. */
export const DROP = { x: -150000, z: 0, altitude: 13716, speed: 236 };

export const LAKE = {
  x: 360000,
  z: 0,
  /** Semi-axes, m (the real lake is ~11 km × 8 km) */
  a: 5600,
  b: 3800,
  /** Rotation of the long axis, rad */
  rot: 0.12,
};

/** Airbase on the south shore. */
export const BASE = { x: LAKE.x - 2500, z: 6900 };

const cosR = Math.cos(LAKE.rot);
const sinR = Math.sin(LAKE.rot);

/** Normalised elliptical distance from the lake centre: <1 is lakebed. */
export function lakeDistance(x: number, z: number): number {
  const dx = x - LAKE.x;
  const dz = z - LAKE.z;
  const u = dx * cosR + dz * sinR;
  const v = -dx * sinR + dz * cosR;
  return Math.hypot(u / LAKE.a, v / LAKE.b);
}

/** Soft box mask, 1 inside the rectangle and fading over `edge` metres. */
function boxMask(x: number, z: number, cx: number, cz: number, hx: number, hz: number, edge: number): number {
  const ax = 1 - smoothstep(hx, hx + edge, Math.abs(x - cx));
  const az = 1 - smoothstep(hz, hz + edge, Math.abs(z - cz));
  return ax * az;
}

/** Fraction of the airbase flattening applied at a point (0..1). */
export function baseMask(x: number, z: number): number {
  return boxMask(x, z, BASE.x, BASE.z, 4200, 1900, 900);
}

/**
 * Terrain height in metres MSL. `octaves` trades detail for speed on distant tiles.
 */
export function terrainHeight(x: number, z: number, octaves = 5): number {
  const dxl = x - LAKE.x;
  const dzl = z - LAKE.z;
  const d = Math.hypot(dxl, dzl);

  // Valley around the lake stays gentle; relief grows with distance.
  const far = smoothstep(16000, 48000, d);
  const broad = (fbm(x / 34000 + 3.1, z / 34000 - 1.7, 3) - 0.5) * 900;
  const range = smoothstep(0.5, 0.78, fbm(x / 70000 + 7.3, z / 70000 + 1.1, 3));
  const mountains = 1900 * ridged(x / 14000, z / 14000, Math.min(octaves, 5)) * range;

  const hills = (fbm(x / 1100, z / 1100, Math.min(octaves, 4)) - 0.5) * 70;
  const small = octaves > 3 ? (fbm(x / 140, z / 140, 3) - 0.5) * 7 : 0;
  const local = hills * (0.3 + 0.7 * far) + small;

  let h = LAKE_ELEV + far * (broad + mountains) + local;
  h = Math.max(h, LAKE_ELEV - 20);

  // Buttes rising out of the plain beside the lake
  const butte = Math.max(0, 1 - Math.hypot(x - (LAKE.x - 14000), z - 9000) / 2600);
  h += 160 * butte * butte;
  const butte2 = Math.max(0, 1 - Math.hypot(x - (LAKE.x + 12500), z + 8500) / 2000);
  h += 120 * butte2 * butte2;

  // Flat pad for the airbase
  h = mix(h, LAKE_ELEV + 3, baseMask(x, z));

  // Dead flat lakebed
  const e = lakeDistance(x, z);
  h = mix(LAKE_ELEV, h, smoothstep(1.0, 1.45, e));
  return h;
}

/** Terrain slope (rise over run) from central differences. */
export function terrainSlope(x: number, z: number, step = 4): number {
  const dx = terrainHeight(x + step, z) - terrainHeight(x - step, z);
  const dz = terrainHeight(x, z + step) - terrainHeight(x, z - step);
  return Math.hypot(dx, dz) / (2 * step);
}
