// Flies the sim headlessly (autopilot) and samples one telemetry frame per video frame,
// with a piecewise time-warp, so the browser capture is deterministic.
// Run: npx vite-node demo/gen-telemetry.ts  ->  demo/frames.json
import { writeFileSync } from 'node:fs';
import { Sim, type Telemetry } from '../src/physics/sim';
import { qaxis } from '../src/physics/math';
import { LAKE, LAKE_ELEV } from '../src/world/terrain';
import { controls, holdAlpha, holdPitch } from '../src/physics/autopilot';

const deg = Math.PI / 180;
const DT = 1 / 120;
const FPS = 30;

type Seg = { from: number; to: number; secs: number; keys?: string[] };
const frames: { tel: Telemetry; keys: string[] }[] = [];

function sample(trace: Telemetry[], segs: Seg[], keysAt: Record<number, string[]> = {}) {
  for (const seg of segs) {
    const n = Math.round(seg.secs * FPS);
    for (let i = 0; i < n; i++) {
      const s = seg.from + ((seg.to - seg.from) * i) / n;
      let k = 0;
      while (k < trace.length - 1 && trace[k + 1].t <= s) k++;
      frames.push({ tel: trace[k], keys: i === 0 && seg.keys ? seg.keys : [] });
    }
  }
}

// ---- Flight 1: captive carry, drop, altitude profile through re-entry ----
const sim = new Sim({ ignitionFailChance: 0 } as never);
const trace: Telemetry[] = [];
let phase: 'boost' | 'coast' | 'entry' = 'boost';
let releaseT = 0;
let burnoutT = 0;
let apexT = 0;
let apexAlt = 0;
let endT = 0;
const CARRY = 6;
for (let step = 0; step < 1500 * 120; step++) {
  const t = sim.telemetry();
  if (t.attached && t.t >= CARRY) { sim.release(); releaseT = t.t; }
  if (!sim.attached) {
    if (t.t - releaseT >= 1 && sim.engine.state === 'off') sim.engine.ignite();
    if (phase === 'boost' && t.engine === 'burnout') { phase = 'coast'; burnoutT = t.t; }
    if (phase === 'coast' && t.verticalSpeed < 0 && t.altitude < 70000) phase = 'entry';
    const pitch = phase === 'boost' ? holdPitch(t, 54 * deg) : phase === 'coast' ? holdPitch(t, t.flightPathAngle + 0.3) : holdAlpha(t, 20 * deg);
    sim.controls = controls(pitch, t);
    if (t.altitude > apexAlt) { apexAlt = t.altitude; apexT = t.t; }
    if (t.t > releaseT + 60 && t.verticalSpeed < 0 && t.altitude < 25000) { endT = t.t; break; }
  } else sim.controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 };
  sim.step(DT);
  if (step % 4 === 0) trace.push(sim.telemetry()); // 30 Hz
}
console.log({ releaseT, burnoutT, apexT, apexFt: Math.round(apexAlt / 0.3048), endT, maxMach: sim.telemetry().max.mach });

// ---- Flight 2: final approach and landing on Rogers Dry Lake ----
const land = new Sim({ attached: false, gearDown: true, position: [LAKE.x - 3000, LAKE_ELEV + 4, LAKE.z], velocity: [100, -1.2, 0], attitude: qaxis([0, 0, 1], 8 * deg) });
land.jettisonVentral();
land.engine.state = 'burnout';
land.s[13] = 60; land.s[14] = 10;
const ltrace: Telemetry[] = [];
let lt = land.telemetry();
for (let i = 0; i < 120 * 120 && !land.landed && !land.crashed; i++) {
  lt = land.telemetry();
  const target = lt.touchdown ? Math.max(0, 8 * deg - 2.5 * deg * (lt.t - lt.touchdown.t)) : 8 * deg;
  land.controls = { pitch: Math.max(-1, Math.min(1, 4 * (target - lt.theta) - 1.5 * lt.q)), roll: 0, yaw: 0, throttle: 0 };
  land.step(DT);
  if (i % 4 === 0) ltrace.push(land.telemetry());
}
const lastL = ltrace[ltrace.length - 1];
console.log({ landed: land.landed, crashed: land.crashed, td: lastL.touchdown?.t, rollout: lastL.rollout, t: lastL.t });

// ---- Edit: (sim-seconds from, to, video seconds). Camera key presses on segment starts. ----
const a = releaseT;
sample(trace, [
  { from: a - 4, to: a, secs: 4 },                       // captive under the B-52 (chase)
  { from: a, to: a + 9, secs: 6, keys: ['KeyC'] },        // drop + ignition from the cockpit
  { from: a + 9, to: burnoutT, secs: 8, keys: ['KeyC', 'KeyC', 'KeyC'] }, // boost, chase cam, time-lapse
  { from: burnoutT, to: apexT + 20, secs: 6 },           // coast over the top
  { from: apexT + 20, to: endT, secs: 6, keys: ['KeyC'] }, // re-entry from the cockpit
]);
sample(ltrace, [{ from: ltrace[0].t, to: lastL.t, secs: 12, keys: ['KeyC', 'KeyC', 'KeyC'] }]);
for (let i = 0; i < 30; i++) frames.push({ tel: lastL, keys: [] }); // 1 s hold

writeFileSync(new URL('./frames.json', import.meta.url), JSON.stringify(frames));
console.log('frames', frames.length, 'secs', frames.length / FPS);
