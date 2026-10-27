// Records the reference flight profiles (the autopilot flights used by the profile tests)
// into src/data/profiles.json for the in-game guide boxes. Run: npx vite-node scripts/gen-profiles.ts
import { writeFileSync } from 'node:fs';
import { fly } from '../tests/fly';
import { controls, holdAlpha, holdGamma, holdPitch } from '../src/physics/autopilot';

const deg = Math.PI / 180;
const STEP_S = 4; // one guide sample every 4 s of flight
/** Speed profile: ease over into a 3° climb above this altitude, m (82,000 ft) */
const SPEED_LEVEL_M = 25000;

function altitude() {
  let phase: 'boost' | 'coast' | 'entry' = 'boost';
  return fly(
    (t) => {
      if (phase === 'boost' && t.engine === 'burnout') phase = 'coast';
      if (phase === 'coast' && t.verticalSpeed < 0 && t.altitude < 70000) phase = 'entry';
      const pitch = phase === 'boost' ? holdPitch(t, 54 * deg) : phase === 'coast' ? holdPitch(t, t.flightPathAngle + 0.3) : holdAlpha(t, 20 * deg);
      return controls(pitch, t);
    },
    (t) => t.t > 60 && t.verticalSpeed < 0 && t.altitude < 20000,
  );
}

function speed() {
  let level = false;
  return fly(
    (t) => {
      if (t.altitude > SPEED_LEVEL_M) level = true;
      return controls(level ? holdGamma(t, 3 * deg) : holdPitch(t, 25 * deg), t);
    },
    (t) => t.engine === 'burnout' && t.t > 90,
  );
}

const pack = (log: ReturnType<typeof fly>) => {
  const pts: number[][] = [];
  let next = 0;
  for (const s of log.samples) {
    if (s.t < next) continue;
    next = s.t + STEP_S;
    pts.push([+s.t.toFixed(1), Math.round(s.position[0]), Math.round(s.position[1]), Math.round(s.position[2]), +s.mach.toFixed(2)]);
  }
  return { burnout: log.burnout ? +log.burnout.t.toFixed(1) : null, pts };
};

writeFileSync(new URL('../src/data/profiles.json', import.meta.url), JSON.stringify({ altitude: pack(altitude()), speed: pack(speed()) }) + '\n');
console.log('wrote src/data/profiles.json');
