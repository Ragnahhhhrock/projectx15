// Runs the simulation at a fixed 120 Hz, independent of the render frame rate.
import { Sim } from '../physics/sim';
import { qaxis } from '../physics/math';
import { LAKE, LAKE_ELEV } from '../world/terrain';
import type { FromWorker, ToWorker } from './protocol';

const DT = 1 / 120;
const MAX_STEPS_PER_TICK = 240;
const POST_INTERVAL_MS = 16;

/** Alternative starting points, selected with ?scenario=name (landing, landing-gear-up, highalt, dive). */
function scenario(name: string): Sim {
  const deg = Math.PI / 180;
  const coast = (pos: [number, number, number], vel: [number, number, number], pitch: number, gear: boolean): Sim => {
    const s = new Sim({ attached: false, gearDown: gear, position: pos, velocity: vel, attitude: qaxis([0, 0, 1], pitch * deg) });
    s.engine.state = 'burnout';
    s.s[13] = 60;
    s.s[14] = 10;
    return s;
  };
  switch (name) {
    case 'landing': return coast([LAKE.x - 3000, LAKE_ELEV + 8, LAKE.z], [100, -1.2, 0], 8, true);
    case 'landing-gear-up': return coast([LAKE.x - 3000, LAKE_ELEV + 8, LAKE.z], [100, -1.2, 0], 8, false);
    case 'highalt': return coast([LAKE.x - 220000, 90000, LAKE.z + 4000], [1400, 0, 0], 2, false);
    case 'dive': return coast([LAKE.x - 4000, LAKE_ELEV + 1500, LAKE.z], [250, -150, 0], -31, false);
    default: return new Sim();
  }
}

let sim = new Sim();
let paused = false;
let timescale = 1;
let acc = 0;
let last = performance.now();
let lastPost = 0;

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'controls') sim.controls = msg.controls;
  else if (msg.type === 'scenario') {
    sim = scenario(msg.name);
    acc = 0;
  } else if (msg.type === 'timescale') timescale = Math.max(0.25, Math.min(16, msg.value));
  else {
    switch (msg.command) {
      case 'release':
        sim.release();
        break;
      case 'ignite':
        if (!sim.attached) sim.engine.ignite();
        break;
      case 'shutdown':
        sim.engine.shutdown();
        break;
      case 'toggleRcs':
        sim.rcsOn = !sim.rcsOn;
        break;
      case 'toggleSas':
        sim.sasOn = !sim.sasOn;
        break;
      case 'gear':
        sim.deployGear();
        break;
      case 'jettison':
        sim.jettisonVentral();
        break;
      case 'reset':
        sim = new Sim();
        acc = 0;
        break;
      case 'pause':
        paused = true;
        break;
      case 'resume':
        paused = false;
        last = performance.now();
        break;
    }
  }
};

function tick(): void {
  const now = performance.now();
  const elapsed = (now - last) / 1000;
  last = now;
  if (!paused) {
    acc += elapsed * timescale;
    let steps = 0;
    while (acc >= DT && steps < MAX_STEPS_PER_TICK) {
      sim.step(DT);
      acc -= DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_TICK) acc = 0; // fell behind: drop time rather than spiral
  }
  if (now - lastPost >= POST_INTERVAL_MS) {
    lastPost = now;
    const msg: FromWorker = { type: 'telemetry', telemetry: sim.telemetry(), paused, timescale };
    self.postMessage(msg);
  }
}

setInterval(tick, 4);
