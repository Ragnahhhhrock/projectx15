import { describe, expect, it } from 'vitest';
import { Sim } from '../src/physics/sim';
import { Engine } from '../src/physics/engine';
import { atmosphere, gravity, G0, R_EARTH } from '../src/physics/atmosphere';
import { MASS } from '../src/physics/aircraft';
import { qaxis, qnormalize } from '../src/physics/math';
import { DT } from './fly';
import { DROP } from '../src/world/terrain';

describe('XLR99 engine', () => {
  it('lights after the ignition delay and gains thrust with altitude', () => {
    const e = new Engine();
    e.ignite();
    e.update(0.5, 1, 1000);
    expect(e.state).toBe('igniting');
    for (let i = 0; i < 300; i++) e.update(DT, 1, 1000);
    expect(e.state).toBe('running');
    const sl = e.thrust(atmosphere(0).p) * 0.2248; // lbf
    const vac = e.thrust(0) * 0.2248;
    expect(sl).toBeGreaterThan(49000);
    expect(sl).toBeLessThan(51000);
    expect(vac).toBeGreaterThan(56000);
    expect(vac).toBeLessThan(58000);
  });

  it('burns the propellant load in about 85 seconds at full throttle', () => {
    const e = new Engine();
    e.ignite();
    let prop = MASS.mainProp;
    let t = 0;
    while (e.state !== 'burnout' && t < 200) {
      e.update(DT, 1, prop);
      prop -= e.massFlow() * DT;
      t += DT;
    }
    expect(t).toBeGreaterThan(80);
    expect(t).toBeLessThan(95);
  });

  it('can fail to light when a failure chance is set', () => {
    const e = new Engine(() => 0);
    e.failChance = 0.5;
    e.ignite();
    for (let i = 0; i < 200; i++) e.update(DT, 1, 1000);
    expect(e.state).toBe('off');
  });
});

describe('6-DOF integrator', () => {
  it('conserves energy in a vacuum ballistic arc', () => {
    // Start above the atmosphere's useful range; no thrust, no controls.
    const sim = new Sim({ attached: false, position: [0, 200000, 0], velocity: [1500, 800, 0] });
    sim.rcsOn = false;
    sim.sasOn = false;
    sim.controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 };
    const energy = () => {
      const t = sim.telemetry();
      const potential = (-G0 * R_EARTH * R_EARTH) / (R_EARTH + t.altitude);
      return 0.5 * t.speed * t.speed + potential;
    };
    const e0 = energy();
    for (let i = 0; i < 120 * 120; i++) sim.step(DT);
    expect(sim.telemetry().altitude).toBeGreaterThan(150000);
    // Residual drag at ~200 km is negligible; drift must stay tiny.
    expect(Math.abs(energy() - e0) / Math.abs(e0)).toBeLessThan(1e-6);
  });

  it('keeps a torque-free spin steady and the quaternion normalised', () => {
    const sim = new Sim({ attached: false, position: [0, 250000, 0], velocity: [0, 0, 0] });
    sim.rcsOn = false;
    sim.sasOn = false;
    sim.controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 };
    sim.s[10] = 1.0; // roll rate about the principal axis
    for (let i = 0; i < 120 * 60; i++) sim.step(DT);
    const t = sim.telemetry();
    expect(t.p).toBeCloseTo(1.0, 6);
    expect(Math.hypot(...t.attitude)).toBeCloseTo(1, 12);
  });

  it('falls at g when released at rest in a vacuum', () => {
    const z0 = 300000;
    const sim = new Sim({ attached: false, position: [0, z0, 0], velocity: [0, 0, 0] });
    for (let i = 0; i < 120 * 10; i++) sim.step(DT);
    const g = gravity(z0);
    expect(sim.telemetry().altitude).toBeCloseTo(z0 - 0.5 * g * 100, 0);
  });

  it('rides the B-52 until release', () => {
    const sim = new Sim();
    for (let i = 0; i < 120 * 5; i++) sim.step(DT);
    const t = sim.telemetry();
    expect(t.attached).toBe(true);
    expect(t.altitude).toBeCloseTo(13716, 6);
    expect(t.position[0] - DROP.x).toBeCloseTo(236 * 5, 3);
    sim.release();
    for (let i = 0; i < 120 * 3; i++) sim.step(DT);
    expect(sim.telemetry().altitude).toBeLessThan(13716);
  });

  it('weathervanes into the wind (directional stability)', () => {
    const yawed = qnormalize(qaxis([0, 1, 0], 0.05)); // nose 3° left of the flight path
    const sim = new Sim({ attached: false, attitude: yawed, velocity: [236, 0, 0] });
    sim.sasOn = false;
    sim.controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 };
    const beta0 = Math.abs(sim.telemetry().beta || 0.05);
    let maxBeta = 0;
    for (let i = 0; i < 120 * 4; i++) {
      sim.step(DT);
      if (i > 120 * 2) maxBeta = Math.max(maxBeta, Math.abs(sim.telemetry().beta));
    }
    expect(maxBeta).toBeLessThan(beta0);
  });
});
