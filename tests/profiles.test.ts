// M1 gate: the sim reproduces the shape of real X-15 flight profiles.
// Ranges are deliberately loose until the aero tables are replaced with NASA data.
import { describe, expect, it } from 'vitest';
import { fly, ft } from './fly';
import { controls, holdAlpha, holdGamma, holdPitch } from '../src/physics/autopilot';

const deg = Math.PI / 180;

describe('altitude profile (cf. flight 91, 354,200 ft, Aug 1963)', () => {
  let phase: 'boost' | 'coast' | 'entry' = 'boost';
  const log = fly(
    (t) => {
      if (phase === 'boost' && t.engine === 'burnout') phase = 'coast';
      if (phase === 'coast' && t.verticalSpeed < 0 && t.altitude < 70000) phase = 'entry';
      const pitch =
        phase === 'boost' ? holdPitch(t, 54 * deg) : phase === 'coast' ? holdPitch(t, t.flightPathAngle + 0.3) : holdAlpha(t, 20 * deg);
      return controls(pitch, t);
    },
    (t) => t.t > 60 && t.verticalSpeed < 0 && t.altitude < 20000,
  );

  it('burns out after 80–95 s', () => {
    expect(log.burnout).toBeDefined();
    expect(log.burnout!.t).toBeGreaterThan(80);
    expect(log.burnout!.t).toBeLessThan(95);
  });

  it('peaks between 320,000 and 385,000 ft', () => {
    expect(ft(log.apex.altitude)).toBeGreaterThan(320000);
    expect(ft(log.apex.altitude)).toBeLessThan(385000);
  });

  it('survives re-entry to 20 km with stable numbers', () => {
    const end = log.sim.telemetry();
    expect(end.crashed).toBe(false);
    expect(end.altitude).toBeLessThan(20500);
    expect(Number.isFinite(end.speed)).toBe(true);
    expect(end.max.nz).toBeLessThan(10);
  });
});

describe('speed profile (cf. Mach 5.9–6.0 flights of the standard X-15)', () => {
  let level = false;
  const log = fly(
    (t) => {
      if (t.altitude > 30000) level = true;
      return controls(level ? holdGamma(t, 0) : holdPitch(t, 25 * deg), t);
    },
    (t) => t.engine === 'burnout' && t.t > 90,
  );
  const max = log.sim.telemetry().max;

  it('reaches Mach 5.2–6.5', () => {
    expect(max.mach).toBeGreaterThan(5.2);
    expect(max.mach).toBeLessThan(6.5);
  });

  it('burns out between 80,000 and 130,000 ft', () => {
    const alt = ft(log.burnout!.altitude);
    expect(alt).toBeGreaterThan(80000);
    expect(alt).toBeLessThan(130000);
  });
});
