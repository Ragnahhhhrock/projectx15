// Flight recorder and highlight reel. Telemetry is sampled at ~20 Hz of sim time; highlights are
// found from state changes (release, ignition, Mach 1, burnout, apex, top speed, touchdown, crash)
// and stitched into short clips that play back with interpolation.
import type { Telemetry } from '../physics/sim';

const SAMPLE_DT = 0.05; // s of sim time between recorded frames
const MAX_FRAMES = 40 * 60 * 20; // 40 minutes of flight
const FT = 3.28084;
const KT = 1.94384;
const WINGS_FT = 264_000; // 50 statute miles: USAF astronaut wings

export type HighlightKind = 'release' | 'ignition' | 'mach1' | 'burnout' | 'wings' | 'topspeed' | 'apex' | 'touchdown' | 'crash';

export interface Highlight {
  kind: HighlightKind;
  /** Sim time of the moment */
  t: number;
  title: string;
  /** Headline numbers at that moment */
  detail: string;
}

export interface Clip {
  start: number;
  end: number;
  highlights: Highlight[];
}

/** Seconds of lead-in / follow-through around each highlight. */
const WINDOW: Record<HighlightKind, [number, number]> = {
  release: [2, 6],
  ignition: [1, 6],
  mach1: [3, 4],
  burnout: [3, 4],
  wings: [3, 3],
  topspeed: [4, 3],
  apex: [5, 5],
  touchdown: [4, 6],
  crash: [5, 6],
};

const fmt = (n: number, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const speedAlt = (t: Telemetry) => `MACH ${fmt(t.mach, 2)} · ${fmt(t.speed * KT)} KT · ${fmt(t.altitude * FT)} FT`;

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

/** Blend two telemetry frames. Continuous values interpolate; discrete state comes from the earlier frame. */
export function blend(a: Telemetry, b: Telemetry, f: number): Telemetry {
  if (f <= 0) return a;
  if (f >= 1) return b;
  const out: Telemetry = { ...a };
  for (const k of ['t', 'altitude', 'agl', 'speed', 'mach', 'qbar', 'alpha', 'beta', 'theta', 'phi', 'p', 'q', 'r', 'nz', 'flightPathAngle', 'verticalSpeed', 'mass', 'mainProp', 'rcsProp', 'thrust', 'throttle', 'rollout'] as const) {
    (out[k] as number) = lerp(a[k] as number, b[k] as number, f);
  }
  out.position = [lerp(a.position[0], b.position[0], f), lerp(a.position[1], b.position[1], f), lerp(a.position[2], b.position[2], f)];
  out.velocity = [lerp(a.velocity[0], b.velocity[0], f), lerp(a.velocity[1], b.velocity[1], f), lerp(a.velocity[2], b.velocity[2], f)];
  // Quaternion nlerp along the short arc
  const qa = a.attitude, qb = b.attitude;
  const s = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3] < 0 ? -1 : 1;
  const q = [0, 1, 2, 3].map((i) => lerp(qa[i], s * qb[i], f));
  const n = Math.hypot(...q) || 1;
  out.attitude = [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  let dpsi = b.psi - a.psi;
  if (dpsi > Math.PI) dpsi -= 2 * Math.PI;
  if (dpsi < -Math.PI) dpsi += 2 * Math.PI;
  out.psi = a.psi + dpsi * f;
  return out;
}

export class FlightRecorder {
  readonly frames: Telemetry[] = [];

  /** Record a live frame. A sim time going backwards means a new flight. */
  push(t: Telemetry): void {
    const last = this.frames[this.frames.length - 1];
    if (last && t.t < last.t - 1e-6) this.frames.length = 0;
    else if (last && t.t - last.t < SAMPLE_DT && !this.changed(last, t)) return;
    if (this.frames.length >= MAX_FRAMES) this.frames.splice(0, this.frames.length - MAX_FRAMES + 1);
    this.frames.push(t);
  }

  clear(): void {
    this.frames.length = 0;
  }

  get duration(): number {
    return this.frames.length ? this.frames[this.frames.length - 1].t : 0;
  }

  /** Always keep the frame where discrete state flips, so highlights land exactly. */
  private changed(a: Telemetry, b: Telemetry): boolean {
    return a.attached !== b.attached || a.engine !== b.engine || a.crashed !== b.crashed || a.landed !== b.landed || (!a.touchdown && !!b.touchdown) || a.mach < 1 !== b.mach < 1;
  }

  /** Interpolated frame at sim time `time`. */
  sample(time: number): Telemetry | null {
    const fr = this.frames;
    if (!fr.length) return null;
    if (time <= fr[0].t) return fr[0];
    if (time >= fr[fr.length - 1].t) return fr[fr.length - 1];
    let lo = 0, hi = fr.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (fr[mid].t <= time) lo = mid;
      else hi = mid;
    }
    const a = fr[lo], b = fr[hi];
    return blend(a, b, (time - a.t) / Math.max(1e-6, b.t - a.t));
  }

  private cache: { key: string; list: Highlight[] } | null = null;

  highlights(): Highlight[] {
    const fr = this.frames;
    const key = `${fr.length}:${fr[fr.length - 1]?.t}`;
    if (this.cache?.key === key) return this.cache.list;
    const list = this.findHighlights();
    this.cache = { key, list };
    return list;
  }

  private findHighlights(): Highlight[] {
    const fr = this.frames;
    const out: Highlight[] = [];
    if (fr.length < 2) return out;
    const add = (kind: HighlightKind, t: Telemetry, title: string) => out.push({ kind, t: t.t, title, detail: speedAlt(t) });
    let apex: Telemetry | null = null;
    let top: Telemetry | null = null;
    let wings = false;
    for (let i = 1; i < fr.length; i++) {
      const p = fr[i - 1], t = fr[i];
      if (p.attached && !t.attached) add('release', t, 'Release');
      if (p.engine !== 'running' && t.engine === 'running') add('ignition', t, 'XLR99 ignition');
      if (p.mach < 1 && t.mach >= 1 && !t.attached) add('mach1', t, 'Mach 1');
      if (p.engine === 'running' && (t.engine === 'burnout' || t.engine === 'shutdown')) add('burnout', t, t.engine === 'burnout' ? 'Burnout' : 'Shutdown');
      if (!wings && p.altitude * FT < WINGS_FT && t.altitude * FT >= WINGS_FT) {
        wings = true;
        add('wings', t, 'Astronaut wings — 50 miles');
      }
      if (!t.attached && !t.crashed) {
        if (!apex || t.altitude > apex.altitude) apex = t;
        if (!top || t.speed > top.speed) top = t;
      }
      if (!p.touchdown && t.touchdown && !t.crashed) add('touchdown', t, t.damaged ? 'Belly landing' : 'Touchdown');
      if (!p.crashed && t.crashed) add('crash', t, t.brokeUp ? 'Airframe failure' : 'Crash');
    }
    // Apex and top speed only count once the aircraft has actually climbed / accelerated.
    const start = fr.find((f) => !f.attached) ?? fr[0];
    if (top && top.mach > 1.2 && top.t > start.t + 5) add('topspeed', top, 'Top speed');
    if (apex && apex.altitude > start.altitude + 1500 && apex.t > start.t + 5) add('apex', apex, 'Apex');
    return out.sort((a, b) => a.t - b.t);
  }

  /** Highlights merged into non-overlapping clips. */
  clips(): Clip[] {
    const end = this.duration;
    const t0 = this.frames.length ? this.frames[0].t : 0;
    const clips: Clip[] = [];
    for (const h of this.highlights()) {
      const [pre, post] = WINDOW[h.kind];
      const start = Math.max(t0, h.t - pre);
      const stop = Math.min(end, h.t + post);
      const prev = clips[clips.length - 1];
      if (prev && start <= prev.end + 1) {
        prev.end = Math.max(prev.end, stop);
        prev.highlights.push(h);
      } else clips.push({ start, end: stop, highlights: [h] });
    }
    return clips;
  }
}
