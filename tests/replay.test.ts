import { describe, expect, it } from 'vitest';
import { Sim, type Telemetry } from '../src/physics/sim';
import { DT } from './fly';
import { controls, holdPitch } from '../src/physics/autopilot';
import { FlightRecorder, blend } from '../src/replay/recorder';

const deg = Math.PI / 180;

/** Captive carry, release, ignite, climb at 54°, coast to apex, recording every step like the main thread does. */
function recordFlight(): FlightRecorder {
  const rec = new FlightRecorder();
  const sim = new Sim();
  let t = sim.telemetry();
  while (t.t < 260) {
    if (t.t >= 2 && sim.attached) sim.release();
    if (t.t >= 3 && sim.engine.state === 'off') sim.engine.ignite();
    if (!sim.attached) sim.controls = controls(holdPitch(t, t.engine === 'burnout' ? t.flightPathAngle : 54 * deg), t);
    sim.step(DT);
    t = sim.telemetry();
    rec.push(t);
    if (t.crashed || (t.engine === 'burnout' && t.verticalSpeed < -200)) break;
  }
  return rec;
}

describe("flight recorder", () => {
  const rec = recordFlight();
  const kinds = rec.highlights().map((h) => h.kind);

  it('downsamples to ~20 Hz', () => {
    expect(rec.frames.length).toBeLessThan((rec.duration / 0.05) * 1.1 + 20);
  });

  it('finds the key moments in order', () => {
    for (const k of ['release', 'ignition', 'mach1', 'burnout', 'topspeed', 'apex'] as const) expect(kinds).toContain(k);
    const times = rec.highlights().map((h) => h.t);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('apex highlight is the maximum altitude', () => {
    const apex = rec.highlights().find((h) => h.kind === 'apex')!;
    const max = Math.max(...rec.frames.map((f) => f.altitude));
    expect(rec.sample(apex.t)!.altitude).toBeCloseTo(max, 3);
    expect(apex.detail).toMatch(/MACH .* KT .* FT/);
  });

  it('builds non-overlapping clips covering every highlight', () => {
    const clips = rec.clips();
    for (let i = 1; i < clips.length; i++) expect(clips[i].start).toBeGreaterThan(clips[i - 1].end);
    expect(clips.flatMap((c) => c.highlights).length).toBe(kinds.length);
    for (const c of clips) for (const h of c.highlights) expect(h.t >= c.start && h.t <= c.end).toBe(true);
  });

  it('interpolates between frames', () => {
    const [a, b] = [rec.frames[100], rec.frames[101]];
    const m = rec.sample((a.t + b.t) / 2)!;
    expect(m.altitude).toBeCloseTo((a.altitude + b.altitude) / 2, 3);
    expect(Math.hypot(...m.attitude)).toBeCloseTo(1, 6);
  });

  it('a new flight clears the recording', () => {
    const r = new FlightRecorder();
    const f = rec.frames[50];
    r.push(f);
    r.push({ ...f, t: f.t + 1 } as Telemetry);
    r.push({ ...f, t: 0 } as Telemetry);
    expect(r.frames.length).toBe(1);
  });

  it('blend keeps discrete state from the earlier frame', () => {
    const a = rec.frames[0], b = rec.frames[rec.frames.length - 1];
    expect(blend(a, b, 0.5).attached).toBe(a.attached);
  });
});
