// Headless mission runner for profile tests.
import { Sim, type Telemetry, type Controls } from '../src/physics/sim';
import { len } from '../src/physics/math';

export const DT = 1 / 120;

export interface FlightLog {
  sim: Sim;
  samples: Telemetry[];
  apex: Telemetry;
  burnout?: Telemetry;
}

/**
 * Drop from the B-52, light the engine one second later, and fly with the given
 * autopilot until the predicate says stop (or the time limit).
 */
export function fly(autopilot: (t: Telemetry) => Controls, stop: (t: Telemetry) => boolean, limit = 900): FlightLog {
  const sim = new Sim();
  sim.release();
  const samples: Telemetry[] = [];
  let apex = sim.telemetry();
  let burnout: Telemetry | undefined;
  let t = sim.telemetry();
  while (t.t < limit) {
    if (t.t >= 1 && sim.engine.state === 'off') sim.engine.ignite();
    sim.controls = autopilot(t);
    sim.step(DT);
    t = sim.telemetry();
    if (!burnout && t.engine === 'burnout') burnout = t;
    if (t.altitude > apex.altitude) apex = t;
    if (samples.length === 0 || t.t - samples[samples.length - 1].t >= 1) samples.push(t);
    if (!Number.isFinite(len(t.position)) || stop(t) || t.crashed || t.landed) break;
  }
  return { sim, samples, apex, burnout };
}

export const ft = (m: number) => m / 0.3048;
