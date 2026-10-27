// The record challenge: targets are the real X-15 marks, and both are reachable in the sim.
import { describe, expect, it } from 'vitest';
import { fly, ft } from './fly';
import { controls, holdGamma, holdPitch } from '../src/physics/autopilot';
import { RECORDS, fmtGoal, scoreFor } from '../src/ui/records';

const deg = Math.PI / 180;
const goal = (id: string) => RECORDS.find((g) => g.id === id)!;

describe('record targets', () => {
  it('use the real X-15 marks', () => {
    expect(goal('altitude').target).toBe(354_200);
    expect(goal('speed').target).toBe(6.04);
    expect(goal('speedA2').locked).toBeTruthy();
    expect(fmtGoal(goal('speed'), 6.04)).toBe('Mach 6.04');
  });

  it('speed record is reachable: 25° pull-up, 3° climb above 82,000 ft', () => {
    let level = false;
    const log = fly(
      (t) => {
        if (t.altitude > 25000) level = true;
        return controls(level ? holdGamma(t, 3 * deg) : holdPitch(t, 25 * deg), t);
      },
      (t) => t.engine === 'burnout' && t.t > 90,
    );
    const t = log.sim.telemetry();
    expect(scoreFor(goal('speed'), t)).toBeGreaterThanOrEqual(6.04);
    expect(scoreFor(goal('speed'), t)).toBeLessThan(6.3); // a near-perfect flight only just makes it
  });

  it('altitude record is reachable on the altitude profile', () => {
    let boost = true;
    const log = fly(
      (t) => {
        if (t.engine === 'burnout') boost = false;
        return controls(boost ? holdPitch(t, 54 * deg) : holdPitch(t, t.flightPathAngle + 0.3), t);
      },
      (t) => t.t > 60 && t.verticalSpeed < 0 && t.altitude < 70000,
    );
    expect(ft(log.apex.altitude)).toBeGreaterThanOrEqual(354_200);
  });
});
