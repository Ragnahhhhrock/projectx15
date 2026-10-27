// Cockpit warning logic shared by the panel lights and the audio cues.
import type { Telemetry } from '../physics/sim';

export interface Warnings {
  /** Dynamic pressure over the 2,500 psf limit, or close to it */
  qHigh: boolean;
  qCaution: boolean;
  /** Load factor over 7.33 g or under −3.5 g */
  gHigh: boolean;
  gCaution: boolean;
  /** Descending fast close to the ground */
  terrain: boolean;
  /** Low and slow with the gear still up */
  gearUnsafe: boolean;
}

export const Q_LIMIT = 119700; // Pa, 2,500 psf
export const G_LIMIT = 7.33;

export function warnings(t: Telemetry): Warnings {
  const live = !t.crashed && !t.landed && !t.attached;
  return {
    qHigh: live && t.qbar > Q_LIMIT,
    qCaution: live && t.qbar > Q_LIMIT * 0.85,
    gHigh: live && (t.nz > G_LIMIT || t.nz < -3.5),
    gCaution: live && (t.nz > G_LIMIT * 0.85 || t.nz < -2.5),
    terrain: live && t.agl < 600 && t.verticalSpeed < -45 && t.agl / Math.max(1, -t.verticalSpeed) < 9,
    gearUnsafe: live && !t.gearDown && t.agl < 450 && t.verticalSpeed < -3 && t.speed < 220,
  };
}
