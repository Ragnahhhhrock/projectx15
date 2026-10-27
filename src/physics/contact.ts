// Ground contact points on the X-15 (body frame: +x nose, +y up, +z right wing).
// Landing gear is a nose wheel plus two rear skids; everything else is airframe that
// should never touch the ground.
import type { V3 } from './math';

export type ContactKind = 'nose' | 'skid' | 'belly' | 'struct';

export interface ContactPoint {
  id: string;
  kind: ContactKind;
  p: V3;
  /** When the point exists */
  needs: 'gear' | 'noGear' | 'ventral' | 'always';
  /** Human-readable cause if this point causes a crash */
  label: string;
}

export const CONTACT_POINTS: ContactPoint[] = [
  { id: 'nose-wheel', kind: 'nose', p: [4.4, -1.35, 0], needs: 'gear', label: 'nose gear' },
  { id: 'skid-l', kind: 'skid', p: [-1.6, -1.35, -1.35], needs: 'gear', label: 'left skid' },
  { id: 'skid-r', kind: 'skid', p: [-1.6, -1.35, 1.35], needs: 'gear', label: 'right skid' },
  { id: 'belly-nose', kind: 'belly', p: [4.0, -0.68, 0], needs: 'noGear', label: 'forward belly' },
  { id: 'belly-mid', kind: 'belly', p: [0, -0.78, 0], needs: 'always', label: 'belly' },
  { id: 'belly-aft', kind: 'belly', p: [-3.6, -0.72, 0], needs: 'noGear', label: 'aft belly' },
  { id: 'ventral', kind: 'struct', p: [-5.2, -1.9, 0], needs: 'ventral', label: 'ventral fin strike' },
  { id: 'nose-tip', kind: 'struct', p: [8.4, 0, 0], needs: 'always', label: 'nose' },
  { id: 'tail', kind: 'struct', p: [-7.05, 0, 0], needs: 'always', label: 'tail' },
  { id: 'wing-l', kind: 'struct', p: [-0.8, -0.3, -3.4], needs: 'always', label: 'left wing' },
  { id: 'wing-r', kind: 'struct', p: [-0.8, -0.3, 3.4], needs: 'always', label: 'right wing' },
  { id: 'stab-l', kind: 'struct', p: [-5.9, -0.55, -2.7], needs: 'always', label: 'left stabilizer' },
  { id: 'stab-r', kind: 'struct', p: [-5.9, -0.55, 2.7], needs: 'always', label: 'right stabilizer' },
  { id: 'fin', kind: 'struct', p: [-5.0, 2.2, 0], needs: 'always', label: 'vertical fin' },
  { id: 'canopy', kind: 'struct', p: [3.6, 0.98, 0], needs: 'always', label: 'canopy' },
];

export interface SpringParams {
  k: number;
  c: number;
}

export const SPRINGS: Record<ContactKind, SpringParams> = {
  nose: { k: 1.5e6, c: 1.1e5 },
  skid: { k: 2.5e6, c: 1.5e5 },
  belly: { k: 5e6, c: 3e5 },
  struct: { k: 5e6, c: 3e5 },
};

/** Friction coefficients on dry lakebed. `long`/`lat` are along/across the heading. */
export const FRICTION: Record<ContactKind, { long: number; lat: number }> = {
  nose: { long: 0.03, lat: 0.25 },
  skid: { long: 0.3, lat: 0.3 },
  belly: { long: 0.5, lat: 0.5 },
  struct: { long: 0.6, lat: 0.6 },
};

/** Landing limits */
export const LANDING = {
  /** Max sink rate at skid touchdown, m/s (~18 ft/s) */
  skidSink: 5.5,
  /** Max sink rate at nose-wheel touchdown, m/s */
  noseSink: 4.5,
  /** Max sideways speed of a touchdown point, m/s */
  sideSpeed: 9,
  /** Max sink rate for a survivable belly landing, m/s */
  bellySink: 3.0,
  /** Max pitch and roll for a survivable belly landing, rad */
  bellyAttitude: (14 * Math.PI) / 180,
  /** Terrain slope above which any contact is fatal */
  maxSlope: 0.12,
};

export const STRUCTURE = {
  /** Positive and negative load factor limits (ultimate), g */
  nzMax: 11,
  nzMin: -5.5,
  /** Dynamic pressure limit, Pa (~3,300 psf; design limit was 2,500 psf) */
  qMax: 158000,
  /** Warning thresholds, g and Pa */
  nzWarn: 7.33,
  qWarn: 119700,
};
