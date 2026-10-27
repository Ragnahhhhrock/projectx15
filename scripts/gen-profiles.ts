// Records the reference flight profiles into src/data/profiles.json for the in-game guide boxes:
// the autopilot flights used by the profile tests, from the drop through re-entry to a stop on
// Rogers Dry Lake (src/physics/recovery.ts flies everything after the climb).
// Run: npm run gen-profiles
import { writeFileSync } from 'node:fs';
import { fly } from '../tests/fly';
import { controls, holdGamma, holdPitch } from '../src/physics/autopilot';
import { Recovery } from '../src/physics/recovery';
import type { Sim, Telemetry } from '../src/physics/sim';

const deg = Math.PI / 180;
/** One guide sample every this many seconds of flight; tighter once low and slow for the approach. */
const STEP_S = 4;
const STEP_APPROACH_S = 2;
/** Speed profile: ease over into a 3° climb above this altitude, m (82,000 ft) */
const SPEED_LEVEL_M = 25000;

/** Guide phase per sample: 0 = boost and coast, 1 = re-entry, glide and landing */
export type GuidePhase = 0 | 1;

function recorded(climb: (t: Telemetry) => number, recoverWhen: (t: Telemetry) => boolean) {
  const rec = new Recovery();
  let recovering = false;
  const phases: { t: number; phase: GuidePhase }[] = [];
  const log = fly(
    (t, sim: Sim) => {
      if (!recovering && recoverWhen(t)) recovering = true;
      phases.push({ t: t.t, phase: recovering ? 1 : 0 });
      if (!recovering) return controls(climb(t), t);
      const c = rec.update(t);
      if (c.gear) sim.deployGear();
      if (c.jettison) sim.jettisonVentral();
      return c.controls;
    },
    (t) => t.touchdown !== null,
    1500,
  );
  const end = log.sim.telemetry();
  if (end.crashed || !end.touchdown) throw new Error(`reference flight did not land: ${end.crashReason ?? 'no touchdown'}`);
  return { log, phaseAt: (time: number) => phases.find((p) => p.t >= time)?.phase ?? 1 };
}

function altitude() {
  let phase: 'boost' | 'coast' = 'boost';
  return recorded(
    (t) => {
      if (phase === 'boost' && t.engine === 'burnout') phase = 'coast';
      return phase === 'boost' ? holdPitch(t, 54 * deg) : holdPitch(t, t.flightPathAngle + 0.3);
    },
    (t) => t.engine === 'burnout' && t.verticalSpeed < 0 && t.altitude < 70000,
  );
}

function speed() {
  let level = false;
  return recorded(
    (t) => {
      if (t.altitude > SPEED_LEVEL_M) level = true;
      return level ? holdGamma(t, 3 * deg) : holdPitch(t, 25 * deg);
    },
    (t) => t.engine === 'burnout',
  );
}

const pack = ({ log, phaseAt }: ReturnType<typeof recorded>) => {
  const pts: number[][] = [];
  let next = 0;
  for (const s of log.samples) {
    if (s.t < next) continue;
    next = s.t + (s.speed < 250 && s.agl < 6000 ? STEP_APPROACH_S : STEP_S);
    pts.push([+s.t.toFixed(1), Math.round(s.position[0]), Math.round(s.position[1]), Math.round(s.position[2]), +s.mach.toFixed(2), phaseAt(s.t)]);
  }
  const td = log.sim.telemetry().touchdown!;
  pts.push([+td.t.toFixed(1), Math.round(td.position[0]), Math.round(td.position[1]), Math.round(td.position[2]), 0, 1]);
  return { burnout: log.burnout ? +log.burnout.t.toFixed(1) : null, pts };
};

writeFileSync(new URL('../src/data/profiles.json', import.meta.url), JSON.stringify({ altitude: pack(altitude()), speed: pack(speed()) }) + '\n');
console.log('wrote src/data/profiles.json');
