// Mission timing around the drop: the game starts on the B-52 a minute and a half before the ideal
// release point, which is where the guide-box flight profiles begin.
import { DROP } from '../world/terrain';
import type { V3 } from './math';
import type { Telemetry } from './sim';

/** Captive-carry time before the ideal release, s */
export const PRE_DROP_S = 90;
/** A release within this many seconds of the mark counts as on time */
export const RELEASE_WINDOW_S = 2;

/** Where a new flight starts: on the B-52's track, PRE_DROP_S short of the drop point. */
export const GAME_START: V3 = [DROP.x - PRE_DROP_S * DROP.speed, DROP.altitude, DROP.z];

/** Seconds until the B-52 reaches the ideal release point (negative once past it). */
export const timeToDrop = (t: Pick<Telemetry, 'position' | 'velocity'>): number =>
  (DROP.x - t.position[0]) / Math.max(1, t.velocity[0]);

/** "1:05" or "8" style countdown text. */
export function fmtCountdown(s: number): string {
  const n = Math.ceil(Math.max(0, s));
  return n >= 60 ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` : `${n}`;
}
