import { describe, expect, it } from 'vitest';
import { Sim, type Telemetry } from '../src/physics/sim';
import { qaxis } from '../src/physics/math';
import { LAKE, LAKE_ELEV, terrainHeight, lakeDistance } from '../src/world/terrain';
import { DT } from './fly';

const deg = Math.PI / 180;

interface Opts {
  gear?: boolean;
  ventral?: boolean;
  pitch?: number; // deg
  speed?: number; // m/s along x
  sink?: number; // m/s, positive down
  height?: number; // m above the lakebed for the aircraft CG
  roll?: number; // deg
  yawRate?: number;
}

function approach(o: Opts = {}): Sim {
  const sim = new Sim({
    attached: false,
    gearDown: o.gear ?? true,
    position: [LAKE.x - 3000, LAKE_ELEV + (o.height ?? 4), LAKE.z],
    velocity: [o.speed ?? 100, -(o.sink ?? 1.2), 0],
    attitude: qaxis([0, 0, 1], (o.pitch ?? 8) * deg),
  });
  if (o.ventral === false) sim.jettisonVentral();
  sim.engine.state = 'burnout';
  sim.s[13] = 60; // propellant is long gone by landing
  sim.s[14] = 10;
  sim.controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 };
  return sim;
}

/** Pilot technique: hold the flare attitude, then lower the nose gently after touchdown. */
function pilot(sim: Sim): void {
  const t = sim.telemetry();
  const target = t.touchdown ? Math.max(0, 8 * deg - 2.5 * deg * (t.t - t.touchdown.t)) : 8 * deg;
  sim.controls.pitch = Math.max(-1, Math.min(1, 4 * (target - t.theta) - 1.5 * t.q));
}

function run(sim: Sim, seconds = 120, each?: (t: Telemetry) => void, fly = true): Telemetry {
  let t = sim.telemetry();
  for (let i = 0; i < seconds / DT && !sim.landed && !sim.crashed; i++) {
    if (fly) pilot(sim);
    sim.step(DT);
    t = sim.telemetry();
    each?.(t);
  }
  return sim.telemetry();
}

describe('terrain', () => {
  it('is dead flat across the lakebed', () => {
    for (const [dx, dz] of [[0, 0], [3000, 1000], [-4000, -800], [4500, 2000]]) {
      expect(terrainHeight(LAKE.x + dx, LAKE.z + dz)).toBeCloseTo(LAKE_ELEV, 6);
    }
    expect(lakeDistance(LAKE.x, LAKE.z)).toBe(0);
  });

  it('is deterministic and rises into mountains away from the lake', () => {
    expect(terrainHeight(12345, 6789)).toBe(terrainHeight(12345, 6789));
    let max = 0;
    for (let i = 0; i < 400; i++) max = Math.max(max, terrainHeight(i * 2500 - 200000, ((i * 7919) % 400) * 2500 - 500000));
    expect(max).toBeGreaterThan(1500);
    expect(max).toBeLessThan(3300);
  });
});

describe('landing', () => {
  it('rolls out and stops after a good touchdown on the skids', () => {
    const sim = approach({ ventral: false });
    const t = run(sim);
    expect(t.crashReason).toBeNull();
    expect(t.landed).toBe(true);
    expect(t.damaged).toBe(false);
    expect(t.touchdown).not.toBeNull();
    expect(t.rollout).toBeGreaterThan(600);
    expect(t.rollout).toBeLessThan(3500);
    expect(Math.abs(t.altitude - LAKE_ELEV)).toBeLessThan(2.5);
  });

  it('crashes on a hard landing', () => {
    const t = run(approach({ ventral: false, sink: 9, height: 6 }));
    expect(t.crashed).toBe(true);
    expect(t.crashReason).toMatch(/collapsed|hard landing/);
    expect(t.brokeUp).toBe(false);
  });

  it('survives a gear-up belly landing, damaged', () => {
    const t = run(approach({ gear: false, ventral: false, pitch: 3.5, speed: 120, sink: 0.5, height: 1.3 }), 120, undefined, false);
    expect(t.crashReason).toBeNull();
    expect(t.landed).toBe(true);
    expect(t.damaged).toBe(true);
  });

  it('crashes if the ventral fin is still attached', () => {
    const t = run(approach({ ventral: true }));
    expect(t.crashed).toBe(true);
    expect(t.crashReason).toMatch(/ventral/);
  });

  it('crashes when it touches down sideways', () => {
    const sim = approach({ ventral: false });
    sim.s[5] = 20; // sliding 20 m/s sideways
    sim.s[1] = LAKE_ELEV + 1.9;
    const t = run(sim, 30, undefined, false);
    expect(t.crashed).toBe(true);
  });

  it('crashes into rising terrain', () => {
    const x = 80000;
    const sim = new Sim({
      attached: false,
      position: [x, terrainHeight(x, 0) + 30, 0],
      velocity: [150, 0, 0],
      attitude: qaxis([0, 0, 1], -0.1),
    });
    sim.engine.state = 'burnout';
    const t = run(sim, 60);
    expect(t.crashed).toBe(true);
  });
});

describe('structural limits', () => {
  it('breaks up above the dynamic pressure limit', () => {
    const sim = new Sim({ attached: false, position: [0, 6000, 0], velocity: [760, 0, 0] });
    sim.engine.state = 'burnout';
    sim.controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 };
    const t = run(sim, 5);
    expect(t.crashed).toBe(true);
    expect(t.brokeUp).toBe(true);
    expect(t.crashReason).toMatch(/dynamic pressure/);
    expect(t.crashVelocity[0]).toBeGreaterThan(600);
  });

  it('breaks up when overloaded', () => {
    // Fly at q just under the limit with the stick back hard
    const sim = new Sim({ attached: false, position: [0, 4500, 0], velocity: [640, 0, 0] });
    sim.engine.state = 'burnout';
    sim.sasOn = false;
    sim.controls = { pitch: 1, roll: 0, yaw: 0, throttle: 0 };
    const t = run(sim, 20);
    expect(t.crashed).toBe(true);
    expect(t.brokeUp).toBe(true);
  });
});
