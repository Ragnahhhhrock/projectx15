// Flight guide: steps advance in order on real autopilot flights, and scenarios start at the right step.
import { describe, expect, it } from 'vitest';
import { Sim, type Telemetry } from '../src/physics/sim';
import { qaxis } from '../src/physics/math';
import { LAKE, LAKE_ELEV } from '../src/world/terrain';
import { controls, holdAlpha, holdGamma, holdPitch } from '../src/physics/autopilot';
import { CRASH, STEPS, crashTip, lakeBearing, pickStep, type Ctx } from '../src/ui/coach';
import { DT } from './fly';

const deg = Math.PI / 180;
const id = (i: number) => STEPS[i].id;

/** Fly like a pilot following the guide; returns the steps the guide moved through. */
function followGuide(ctx: Ctx, auto: (t: Telemetry, step: string) => ReturnType<typeof controls>, limit = 600): string[] {
  const sim = new Sim();
  let t = sim.telemetry();
  let i = pickStep(t, ctx, true);
  const seen = [id(i)];
  i++; // pressed "Start the guide"
  seen.push(id(i));
  while (t.t < limit && !t.crashed && !STEPS[i].final) {
    const step = id(i);
    if (step === 'drop') sim.release();
    if (step === 'ignite') sim.engine.ignite();
    sim.controls = auto(t, step);
    sim.step(DT);
    t = sim.telemetry();
    const s = STEPS[i];
    if (s.done?.(t, ctx)) {
      i++;
      seen.push(id(i));
    }
  }
  return seen;
}

describe('flight guide', () => {
  it('walks the altitude profile from the drop through re-entry to the glide', () => {
    let phase: 'boost' | 'coast' | 'entry' = 'boost';
    const seen = followGuide({ profile: 'altitude' }, (t) => {
      if (phase === 'boost' && t.engine === 'burnout') phase = 'coast';
      if (phase === 'coast' && t.verticalSpeed < 0 && t.altitude < 70000) phase = 'entry';
      const pitch = t.attached ? 0 : phase === 'boost' ? holdPitch(t, 54 * deg) : phase === 'coast' ? holdPitch(t, t.flightPathAngle + 0.3) : holdAlpha(t, 20 * deg);
      return controls(pitch, t);
    });
    expect(seen.slice(0, 9)).toEqual(['welcome', 'drop', 'ignite', 'throttle', 'pullup', 'boost', 'coast', 'entry', 'glide']);
  });

  it('walks the speed profile to the glide', () => {
    let level = false;
    const seen = followGuide({ profile: 'speed' }, (t) => {
      if (t.altitude > 30000) level = true;
      const pitch = t.attached ? 0 : level ? (t.engine === 'running' ? holdGamma(t, 0) : holdAlpha(t, 10 * deg)) : holdPitch(t, 25 * deg);
      return controls(pitch, t);
    });
    expect(seen).toContain('boost');
    expect(seen).toContain('entry');
    expect(seen).toContain('glide');
  });

  it('starts practice scenarios at the matching step', () => {
    const ctx: Ctx = { profile: 'altitude' };
    const at = (o: { gear: boolean; h: number; v: [number, number, number]; x?: number }) => {
      const s = new Sim({ attached: false, gearDown: o.gear, position: [o.x ?? LAKE.x - 3000, LAKE_ELEV + o.h, LAKE.z], velocity: o.v, attitude: qaxis([0, 0, 1], 8 * deg) });
      s.engine.state = 'burnout';
      return s.telemetry();
    };
    expect(id(pickStep(new Sim().telemetry(), ctx, true))).toBe('welcome');
    expect(id(pickStep(new Sim().telemetry(), ctx, false))).toBe('drop');
    // ?scenario=landing still has the ventral fin on: jettison it first
    expect(id(pickStep(at({ gear: true, h: 8, v: [100, -1.2, 0] }), ctx))).toBe('ventral');
    expect(id(pickStep(at({ gear: false, h: 8, v: [100, -1.2, 0] }), ctx))).toBe('ventral');
    expect(id(pickStep(at({ gear: false, h: 90000 - LAKE_ELEV, v: [1400, 0, 0], x: LAKE.x - 220000 }), ctx))).toBe('coast');
    expect(id(pickStep(at({ gear: false, h: 12000, v: [600, -100, 0], x: LAKE.x - 80000 }), ctx))).toBe('glide');
  });

  it('points at the lake from either side', () => {
    const t = new Sim({ attached: false, position: [LAKE.x - 50000, 10000, LAKE.z - 10000] }).telemetry();
    // Flying east with the lake to the south-east: z is south, so it is to the right.
    expect(lakeBearing(t)).toBeGreaterThan(5);
    const u = new Sim({ attached: false, position: [LAKE.x - 50000, 10000, LAKE.z + 10000] }).telemetry();
    expect(lakeBearing(u)).toBeLessThan(-5);
  });

  it('gives a crash tip for a gear-up landing', () => {
    const t = { ...new Sim().telemetry(), crashed: true, crashReason: 'aft belly impact with the gear up' };
    expect(crashTip(t)).toContain('gear up');
    expect(CRASH.final).toBe(true);
  });
});
