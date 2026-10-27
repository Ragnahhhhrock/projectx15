// US Standard Atmosphere 1976, 0–86 km, with an exponential density tail above.

export const R_AIR = 287.05287; // J/(kg·K)
export const GAMMA = 1.4;
export const G0 = 9.80665; // m/s²
export const R_EARTH = 6371000; // mean radius, m (gravity)
const R_GEOPOT = 6356766; // m, used for geopotential altitude

const H_BASE = [0, 11000, 20000, 32000, 47000, 51000, 71000, 84852];
const LAPSE = [-0.0065, 0, 0.001, 0.0028, 0, -0.0028, -0.002, 0];
const T_BASE = [288.15, 216.65, 216.65, 228.65, 270.65, 270.65, 214.65, 186.946];
const P_BASE = [101325, 22632.06, 5474.889, 868.0187, 110.9063, 66.93887, 3.95642, 0.3734];

const Z_TOP = 86000;
const T_TOP = 186.946;
const RHO_TOP = 0.3734 / (R_AIR * T_TOP);
const SCALE_HEIGHT_TOP = 5600; // m, fitted so rho(100 km) ≈ 5.6e-7 kg/m³

export interface Atmo {
  /** Temperature, K */
  T: number;
  /** Pressure, Pa */
  p: number;
  /** Density, kg/m³ */
  rho: number;
  /** Speed of sound, m/s */
  a: number;
}

/** Atmosphere at geometric altitude z (m above mean sea level). */
export function atmosphere(z: number): Atmo {
  const zc = Math.max(z, -1000);
  if (zc > Z_TOP) {
    const rho = RHO_TOP * Math.exp(-(zc - Z_TOP) / SCALE_HEIGHT_TOP);
    return { T: T_TOP, p: rho * R_AIR * T_TOP, rho, a: Math.sqrt(GAMMA * R_AIR * T_TOP) };
  }
  const h = (R_GEOPOT * zc) / (R_GEOPOT + zc);
  let i = H_BASE.length - 1;
  while (i > 0 && h < H_BASE[i]) i--;
  const dh = h - H_BASE[i];
  const L = LAPSE[i];
  const Tb = T_BASE[i];
  const T = Tb + L * dh;
  const p = L === 0 ? P_BASE[i] * Math.exp((-G0 * dh) / (R_AIR * Tb)) : P_BASE[i] * Math.pow(Tb / T, G0 / (R_AIR * L));
  const rho = p / (R_AIR * T);
  return { T, p, rho, a: Math.sqrt(GAMMA * R_AIR * T) };
}

/** Gravitational acceleration at altitude z, m/s². */
export function gravity(z: number): number {
  const r = R_EARTH / (R_EARTH + z);
  return G0 * r * r;
}
