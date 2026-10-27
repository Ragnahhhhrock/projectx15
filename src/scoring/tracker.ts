// Watches telemetry through one flight and produces the inputs for computeScore() when it ends.
import type { Telemetry } from '../physics/sim';
import profiles from '../data/profiles.json';
import { lakeDistance } from '../world/terrain';
import { TRACK_ZERO_M, type Outcome, type ScoreInputs } from './score';

const FT = 3.28084;
const KT = 1.94384;
type Pt = number[]; // [t, x, y, z, mach]
type ProfileName = 'altitude' | 'speed';
const NAMES: ProfileName[] = ['altitude', 'speed'];
const MAX_DT = 2; // s, ignore bigger gaps in sim time (pauses, time warp)

/** Reference position at flight time tau (linear between recorded points), relative to the profile origin. */
export function profilePoint(pts: Pt[], tau: number): [number, number, number] {
  if (tau <= pts[0][0]) return [pts[0][1], pts[0][2], pts[0][3]];
  for (let i = 1; i < pts.length; i++) {
    if (tau <= pts[i][0]) {
      const a = pts[i - 1], b = pts[i];
      const f = (tau - a[0]) / (b[0] - a[0] || 1);
      return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
    }
  }
  const e = pts[pts.length - 1];
  return [e[1], e[2], e[3]];
}

export class FlightTracker {
  private prev: Telemetry | null = null;
  private releaseT = -1;
  private origin: [number, number, number] = [0, 0, 0];
  private sq: Record<ProfileName, number> = { altitude: 0, speed: 0 };
  private covered: Record<ProfileName, number> = { altitude: 0, speed: 0 };
  private maxG = 0;
  private done = false;

  /** Feed every telemetry frame. Returns the score inputs once, on the frame the flight ends. */
  update(t: Telemetry): ScoreInputs | null {
    const p = this.prev;
    this.prev = t;
    if (p && t.t < p.t) this.reset();
    if (this.done) return null;

    if (t.attached) return null;
    if (this.releaseT < 0) {
      this.releaseT = t.t;
      this.origin = [...t.position] as [number, number, number];
    }
    const dt = p && t.t > p.t ? Math.min(MAX_DT, t.t - p.t) : 0;
    const tau = t.t - this.releaseT;
    const o = profiles.altitude.pts[0];

    if (!t.onGround) this.maxG = Math.max(this.maxG, Math.abs(t.nz));
    for (const n of NAMES) {
      const pts = profiles[n].pts as Pt[];
      const end = pts[pts.length - 1][0];
      if (tau > end || dt === 0) continue;
      const r = profilePoint(pts, tau);
      const dx = t.position[0] - (this.origin[0] - o[1] + r[0]);
      const dy = t.position[1] - (this.origin[1] - o[2] + r[1]);
      const dz = t.position[2] - (this.origin[2] - o[3] + r[2]);
      this.sq[n] += (dx * dx + dy * dy + dz * dz) * dt;
      this.covered[n] += dt;
    }

    if (!t.landed && !t.crashed) return null;
    this.done = true;
    return this.finish(t, tau);
  }

  private reset(): void {
    this.releaseT = -1;
    this.sq = { altitude: 0, speed: 0 };
    this.covered = { altitude: 0, speed: 0 };
    this.maxG = 0;
    this.done = false;
  }

  private finish(t: Telemetry, tau: number): ScoreInputs {
    // RMS error against each guide profile; an early end counts the missing remainder as maximum error.
    let best: ProfileName = 'altitude';
    let bestErr = Infinity;
    for (const n of NAMES) {
      const pts = profiles[n].pts as Pt[];
      const end = pts[pts.length - 1][0];
      const missing = Math.max(0, end - this.covered[n]);
      const err = Math.sqrt((this.sq[n] + missing * TRACK_ZERO_M * TRACK_ZERO_M) / end);
      if (err < bestErr) { bestErr = err; best = n; }
    }
    const outcome: Outcome = t.crashed ? 'crashed' : t.damaged ? 'damaged' : 'landed';
    return {
      maxMach: t.max.mach,
      maxAltFt: t.max.altitude * FT,
      trackingErrM: bestErr,
      trackingProfile: best,
      maxG: this.maxG,
      outcome,
      flightTimeS: Math.max(30, Math.round(tau)),
      ...(outcome === 'landed' && t.touchdown
        ? { sinkFps: t.touchdown.sink * FT, touchdownKt: t.touchdown.speed * KT, lakeDist: lakeDistance(t.position[0], t.position[2]) }
        : {}),
    };
  }
}
