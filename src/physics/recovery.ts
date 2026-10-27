// Recovery autopilot: from re-entry to a stop on Rogers Dry Lake. Used to record the re-entry and
// landing leg of the guide boxes (scripts/gen-profiles.ts) and by the tests that prove that leg is flyable.
//
// Phases: entry (6 g pull-out) -> cruise (steer for the lake, managing energy with alpha and S-turns)
// -> orbit (left-hand spiral over the lake down to the approach height) -> final (15° glide path in
// from the west, ventral off, gear down) -> flare -> rollout.
import type { Controls, Telemetry } from './sim';
import { clamp } from './math';
import { holdAlpha, holdPitch, nullSideslip } from './autopilot';
import { LAKE, LAKE_ELEV } from '../world/terrain';

const deg = Math.PI / 180;
/** Start the flare this high above the lakebed, m (~1,000 ft) */
const FLARE_AGL = 300;
/** Load factor to hold through the re-entry pull-out, g (structural limit ~7.3) */
const ENTRY_G = 6;

/** Touchdown aim point on the lakebed; the final approach runs east along +x. */
export const TOUCHDOWN = { x: LAKE.x - 3000, z: LAKE.z };
/** Orbit centre over the west half of the lake, and radius, m */
const ORBIT = { x: TOUCHDOWN.x - 12000, z: TOUCHDOWN.z - 5000, r: 5000 };
/** Final approach glide path, rad */
const FINAL_GAMMA = 15 * deg;
/** Glide target speeds, m/s (≈300 kt in the pattern) */
const V_PATTERN = 155;
/** High key: arrive over the lake about this high, m (~40,000 ft above the lakebed) */
const HIGH_KEY_AGL = 12000;
/** Subsonic glide ratio used for the energy check */
const GLIDE_RATIO = 5;
/** Load factor the cruise alpha schedule stays under, g */
const CRUISE_G = 4;
/** Cruise alpha target slew rate, rad/s */
const ALPHA_SLEW = 2 * deg;

export type RecoveryPhase = 'entry' | 'cruise' | 'orbit' | 'final' | 'flare' | 'rollout';

export interface RecoveryCommand {
  controls: Controls;
  gear: boolean;
  jettison: boolean;
}

const wrap = (a: number) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};

/** Roll stick to fly a heading with a bank limit. */
function steer(t: Telemetry, heading: number, maxBank: number): number {
  const err = wrap(heading - t.psi);
  const bank = clamp(2 * err, -maxBank, maxBank);
  return clamp(2.5 * (bank - t.phi) - 0.8 * t.p, -1, 1);
}

/** Alpha that holds a target speed: fly faster than target -> raise alpha. */
const speedAlpha = (t: Telemetry, v: number, lo: number, hi: number) =>
  clamp(6 * deg + 0.012 * (t.speed - v), lo, hi) / Math.max(0.5, Math.cos(t.phi));

export class Recovery {
  phase: RecoveryPhase = 'entry';
  private entryStick = 1;
  private weave = 1;
  private alphaCmd = 0;
  private trim = 0;
  private lastT = 0;

  /** Rough track distance still to fly to the aim point: the turn onto the centreline plus the straight. */
  private trackToGo(t: Telemetry): number {
    const dx = TOUCHDOWN.x - t.position[0], dz = TOUCHDOWN.z - t.position[2];
    const turn = Math.abs(wrap(Math.atan2(dz, dx) - t.psi)) + Math.abs(wrap(Math.atan2(dz, dx)));
    return Math.hypot(dx, dz) + 0.5 * ORBIT.r * turn;
  }

  /** Alpha hold with an integrator, so the stick keeps the trim it needs at high dynamic pressure. */
  private alphaPI(t: Telemetry, alpha: number, dt: number): number {
    this.trim = clamp(this.trim + 1.5 * (alpha - t.alpha) * dt, -1, 1);
    return clamp(this.trim + holdAlpha(t, alpha), -1, 1);
  }

  update(t: Telemetry): RecoveryCommand {
    const agl = t.altitude - LAKE_ELEV;
    const dxTd = t.position[0] - TOUCHDOWN.x;
    let pitch = 0;
    let roll = 0;
    const throttle = 0;

    if (this.phase === 'entry' && t.flightPathAngle > -2 * deg && t.altitude < 40000) {
      this.phase = 'cruise';
      this.alphaCmd = t.alpha;
      this.trim = this.entryStick;
    }
    if (this.phase === 'cruise' && Math.hypot(t.position[0] - ORBIT.x, t.position[2] - ORBIT.z) < ORBIT.r * 3 && t.mach < 0.95) this.phase = 'orbit';
    // Leave the orbit once at glide-path height for the track still to fly: normally on the west side
    // heading roughly east, or anywhere if well below it.
    if (this.phase === 'orbit' || (this.phase === 'cruise' && t.mach < 0.95 && Math.hypot(t.position[0] - ORBIT.x, t.position[2] - ORBIT.z) < 25000)) {
      const need = Math.tan(FINAL_GAMMA) * this.trackToGo(t);
      const gate = Math.abs(wrap(t.psi)) < 90 * deg && dxTd < -7000;
      if ((gate && agl < need) || agl < 0.7 * need) this.phase = 'final';
    }
    if (this.phase === 'final' && agl < FLARE_AGL) this.phase = 'flare';
    if (this.phase === 'flare' && t.touchdown) this.phase = 'rollout';

    switch (this.phase) {
      case 'entry': {
        // Pull-out: start with full back stick and integrate it toward the target load factor,
        // never past the alpha limit.
        const dt = Math.max(0, t.t - this.lastT);
        this.entryStick = clamp(this.entryStick + 0.4 * (ENTRY_G - t.nz) * dt, -1, 1);
        pitch = Math.min(this.entryStick, holdAlpha(t, 30 * deg));
        roll = steer(t, t.psi, 0);
        break;
      }
      case 'cruise': {
        const dt = Math.max(0, t.t - this.lastT);
        // Energy management on the way to the lake: alpha (drag) rises with surplus energy, and a big
        // surplus adds S-turns either side of the lake bearing.
        const dist = Math.hypot(ORBIT.x - t.position[0], ORBIT.z - t.position[2]);
        const energy = agl + (t.speed * t.speed) / 19.6;
        const needed = HIGH_KEY_AGL + (V_PATTERN * V_PATTERN) / 19.6 + dist / GLIDE_RATIO;
        const surplus = energy / needed - 1;
        const bearing = Math.atan2(ORBIT.z - t.position[2], ORBIT.x - t.position[0]);
        const cross = Math.sin(t.psi - bearing) * dist; // m off the direct line
        // No S-turns while the dynamic pressure is still high from the pull-out.
        const calm = t.qbar < 40000;
        if (calm && surplus > 0.1 && dist > 30000) {
          if (Math.abs(cross) > 12000) this.weave = cross > 0 ? -1 : 1;
        } else this.weave = 0;
        roll = steer(t, bearing + this.weave * 45 * deg, calm ? 50 * deg : 10 * deg);
        let target = t.mach > 1.2 ? clamp(9 * deg + 25 * deg * surplus, 6 * deg, 20 * deg) : speedAlpha(t, V_PATTERN, 3 * deg, 14 * deg);
        if (t.nz > CRUISE_G) target = Math.min(target, (t.alpha * CRUISE_G) / t.nz); // lift ∝ alpha
        // Slew the alpha target so the hand-over from the pull-out stays smooth at high dynamic pressure.
        this.alphaCmd += clamp(target - this.alphaCmd, -ALPHA_SLEW * dt, ALPHA_SLEW * dt);
        pitch = this.alphaPI(t, this.alphaCmd, dt);
        break;
      }
      case 'orbit': {
        // Left-hand circle over the lake: aim at a point ahead on the circle.
        const ang = Math.atan2(t.position[2] - ORBIT.z, t.position[0] - ORBIT.x);
        const lead = ang - 0.5;
        const tx = ORBIT.x + ORBIT.r * Math.cos(lead), tz = ORBIT.z + ORBIT.r * Math.sin(lead);
        roll = steer(t, Math.atan2(tz - t.position[2], tx - t.position[0]), 45 * deg);
        pitch = holdAlpha(t, speedAlpha(t, V_PATTERN, 3 * deg, 14 * deg));
        break;
      }
      case 'final': {
        // Intercept the extended centreline (z = TOUCHDOWN.z, landing east) and ride a glide path
        // to the aim point.
        const px = Math.min(TOUCHDOWN.x, t.position[0] + 4000);
        roll = steer(t, Math.atan2(TOUCHDOWN.z - t.position[2], px - t.position[0]), 45 * deg);
        const dist = Math.max(500, this.trackToGo(t));
        const gammaCmd = clamp(-Math.atan2(agl, dist) * 1.5 + FINAL_GAMMA * 0.5, -25 * deg, -5 * deg);
        pitch = holdPitch(t, gammaCmd + t.alpha + 0.8 * (gammaCmd - t.flightPathAngle));
        break;
      }
      case 'flare': {
        // Exponential flare: the sink rate target falls with height.
        const sinkCmd = clamp(0.12 * agl + 0.8, 0.8, 45);
        const gammaCmd = -Math.asin(clamp(sinkCmd / Math.max(t.speed, 1), 0, 1));
        pitch = holdPitch(t, clamp(gammaCmd + t.alpha + 0.8 * (gammaCmd - t.flightPathAngle), -10 * deg, 12 * deg));
        roll = steer(t, 0, 5 * deg);
        break;
      }
      case 'rollout': {
        const td = t.touchdown!;
        pitch = holdPitch(t, Math.max(0, 8 * deg - 2.5 * deg * (t.t - td.t)));
        roll = steer(t, 0, 0);
        break;
      }
    }
    // Last-ditch load limiter after the pull-out: ease the stick off above 7 g.
    if (this.phase === 'cruise' || this.phase === 'orbit' || this.phase === 'final') pitch = Math.min(pitch, clamp(1 - 0.5 * (t.nz - 7), 0, 1));
    this.lastT = t.t;
    return {
      controls: { pitch, roll, yaw: nullSideslip(t), throttle },
      gear: (this.phase === 'final' && agl < 600) || this.phase === 'flare',
      jettison: this.phase === 'final' || this.phase === 'flare',
    };
  }
}
