// X-15 mass, geometry, engine and RCS data (approximate).
import aeroTable from '../data/x15-aero.json';
import { interp } from './math';

export const GEOMETRY = {
  /** Wing reference area, m² (200 ft²) */
  S: 18.58,
  /** Span, m (22.36 ft) */
  b: 6.81,
  /** Mean aerodynamic chord, m (10.27 ft) */
  c: 3.13,
};

export const MASS = {
  /** Burnout mass incl. pilot, kg (~14,600 lb) */
  dry: 6620,
  /** LOX + ammonia + turbopump H2O2, kg; launch mass ≈ 15,420 kg (~34,000 lb) */
  mainProp: 8750,
  /** Reaction-control H2O2, kg */
  rcsProp: 50,
  /** Principal inertias [roll x, yaw y, pitch z], kg·m², full and empty */
  inertiaFull: [5000, 112000, 110000] as const,
  inertiaDry: [4500, 77000, 75000] as const,
};

export const XLR99 = {
  /** Vacuum thrust at 100 %, N (~57,000 lbf) */
  thrustVac: 253500,
  /** Effective nozzle exit area for the pressure term, m² (gives ~50,000 lbf at sea level) */
  exitArea: 0.307,
  /** Effective specific impulse incl. turbopump propellant, s */
  isp: 253,
  minThrottle: 0.5,
  /** Ignition-to-thrust delay, s */
  ignitionDelay: 0.8,
  /** Throttle response time constant, s */
  throttleTau: 0.3,
};

export const RCS = {
  /** Nose pitch/yaw jet thrust, N (~113 lbf) and moment arm, m */
  noseJet: 500,
  noseArm: 7.0,
  /** Wingtip roll jet thrust, N (~40 lbf), arm m; fired as a couple */
  rollJet: 178,
  rollArm: 3.4,
  isp: 140,
};

export const LIMITS = {
  /** Horizontal stabilizer (pitch), rad */
  de: (25 * Math.PI) / 180,
  /** Differential stabilizer (roll), rad */
  da: (15 * Math.PI) / 180,
  /** Rudder, rad */
  dr: (7.5 * Math.PI) / 180,
  /** Alpha range the coefficient tables are used over, rad */
  alpha: (40 * Math.PI) / 180,
};

/** Stability augmentation (damper) gains, rad of surface per rad/s of body rate. */
export const SAS_GAINS = { pitch: 0.3, roll: 0.15, yaw: 0.3 };

type AeroKey = Exclude<keyof typeof aeroTable, 'mach' | '_note'>;
export type AeroCoeffs = Record<AeroKey, number>;

const KEYS = Object.keys(aeroTable).filter((k) => k !== 'mach' && k !== '_note') as AeroKey[];

/** Interpolate every aero coefficient at a Mach number. */
export function aeroAt(mach: number): AeroCoeffs {
  const out = {} as AeroCoeffs;
  for (const k of KEYS) out[k] = interp(aeroTable.mach, aeroTable[k], mach);
  return out;
}

/** Principal inertias, interpolated by the fraction of propellant remaining. */
export function inertia(propFraction: number): [number, number, number] {
  const f = Math.max(0, Math.min(1, propFraction));
  const d = MASS.inertiaDry;
  const w = MASS.inertiaFull;
  return [d[0] + f * (w[0] - d[0]), d[1] + f * (w[1] - d[1]), d[2] + f * (w[2] - d[2])];
}
