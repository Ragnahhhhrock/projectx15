// Drop timing, the release call-out and the guide-box path from the B-52 to the lakebed.
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/physics/sim';
import { GAME_START, PRE_DROP_S, timeToDrop } from '../src/physics/mission';
import { Recovery } from '../src/physics/recovery';
import { controls, holdGamma, holdPitch } from '../src/physics/autopilot';
import { dropCue } from '../src/ui/dropcue';
import { profilePath } from '../src/render/guide';
import { DROP, LAKE, LAKE_ELEV, lakeDistance } from '../src/world/terrain';
import { DT, fly } from './fly';

const deg = Math.PI / 180;

describe('drop timing', () => {
  it('starts the flight 90 s before the release point and counts down to it', () => {
    const sim = new Sim({ position: [...GAME_START] });
    expect(timeToDrop(sim.telemetry())).toBeCloseTo(PRE_DROP_S, 6);
    expect(dropCue(sim.telemetry(), null, 0)).toEqual({ state: 'countdown', text: 'RELEASE IN 1:30' });
    for (let i = 0; i < (PRE_DROP_S - 5) / DT; i++) sim.step(DT);
    expect(dropCue(sim.telemetry(), null, 0)).toEqual({ state: 'final', text: 'RELEASE IN 5' });
    for (let i = 0; i < 5.5 / DT; i++) sim.step(DT);
    expect(dropCue(sim.telemetry(), null, 0).state).toBe('now');
    expect(Math.abs(sim.telemetry().position[0] - DROP.x)).toBeLessThan(DROP.speed);
    for (let i = 0; i < 5 / DT; i++) sim.step(DT);
    const late = dropCue(sim.telemetry(), null, 0);
    expect(late.state).toBe('late');
    expect(late.text).toMatch(/^RELEASE NOW — [56] S LATE$/);
  });

  it('grades the release against the mark', () => {
    const t = { ...new Sim({ attached: false }).telemetry(), t: 100 };
    expect(dropCue(t, 0.5, 99).text).toBe('RELEASED ON THE MARK');
    expect(dropCue(t, -6, 99).text).toMatch(/6 S LATE/);
    expect(dropCue(t, 12, 99).text).toMatch(/12 S EARLY/);
    expect(dropCue(t, 0, 90).state).toBe('none');
  });
});

describe('guide-box path', () => {
  for (const name of ['altitude', 'speed'] as const) {
    it(`${name}: leads from the B-52 track through the drop box to the lakebed`, () => {
      const path = profilePath(name);
      expect(path[0].kind).toBe('carry');
      expect(path[0].p[0]).toBeGreaterThan(GAME_START[0]);
      const drop = path.findIndex((g) => g.kind === 'drop');
      expect(path[drop].p).toEqual([DROP.x, DROP.altitude, DROP.z]);
      expect(path.slice(0, drop).every((g) => g.kind === 'carry' && g.p[1] === DROP.altitude)).toBe(true);
      const kinds = [...new Set(path.map((g) => g.kind))];
      expect(kinds).toEqual(['carry', 'drop', 'climb', 'recovery']);
      const end = path[path.length - 1].p;
      expect(lakeDistance(end[0], end[2])).toBeLessThan(1);
      expect(end[1]).toBeCloseTo(LAKE_ELEV, -1);
    });
  }
});

describe('re-entry and landing leg', () => {
  // The guide boxes are recorded from these flights, so they must end safely on the lakebed.
  const flights = {
    altitude: { climb: (t: Parameters<typeof holdPitch>[0], s: { boost: boolean }) => (s.boost ? holdPitch(t, 54 * deg) : holdPitch(t, t.flightPathAngle + 0.3)), recover: (t: Parameters<typeof holdPitch>[0]) => t.engine === 'burnout' && t.verticalSpeed < 0 && t.altitude < 70000 },
    speed: { climb: (t: Parameters<typeof holdPitch>[0]) => (t.altitude > 25000 || t.engine === 'burnout' ? holdGamma(t, 3 * deg) : holdPitch(t, 25 * deg)), recover: (t: Parameters<typeof holdPitch>[0]) => t.engine === 'burnout' },
  };
  for (const [name, f] of Object.entries(flights)) {
    it(`${name}: pulls out within limits and lands on Rogers Dry Lake`, () => {
      const rec = new Recovery();
      const st = { boost: true, recovering: false };
      const log = fly(
        (t, sim) => {
          if (t.engine === 'burnout') st.boost = false;
          if (f.recover(t)) st.recovering = true;
          if (!st.recovering) return controls(f.climb(t, st), t);
          const c = rec.update(t);
          if (c.gear) sim.deployGear();
          if (c.jettison) sim.jettisonVentral();
          return c.controls;
        },
        () => false,
        1500,
      );
      const end = log.sim.telemetry();
      expect(end.crashReason).toBeNull();
      expect(end.landed).toBe(true);
      expect(end.damaged).toBe(false);
      expect(end.max.nz).toBeLessThan(7.3);
      expect(end.max.qbar / 47.88).toBeLessThan(2600);
      expect(lakeDistance(end.position[0], end.position[2])).toBeLessThan(1);
      expect(Math.abs(end.touchdown!.position[0] - (LAKE.x - 3000))).toBeLessThan(2500);
    }, 60000);
  }
});
