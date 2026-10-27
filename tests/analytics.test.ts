import { afterEach, describe, expect, it } from 'vitest';
import { FlightAnalytics } from '../src/analytics';
import type { Telemetry } from '../src/physics/sim';

const events: [string, Record<string, unknown>][] = [];
(globalThis as unknown as { gtag: unknown }).gtag = (_: string, name: string, params: Record<string, unknown>) => events.push([name, params]);
afterEach(() => { events.length = 0; });

const base = {
  t: 0, altitude: 13700, mach: 0.8, engine: 'off', attached: true, gearDown: false, ventralAttached: true,
  landed: false, crashed: false, brokeUp: false, damaged: false, crashReason: null, touchdown: null, mainProp: 8000,
  max: { mach: 0.8, altitude: 13700, nz: 1, qbar: 0 },
} as unknown as Telemetry;
const at = (o: Partial<Telemetry>) => ({ ...base, ...o }) as Telemetry;
const names = () => events.map(([n]) => n);

describe('FlightAnalytics', () => {
  it('fires each milestone once and a single flight_end', () => {
    const a = new FlightAnalytics(null);
    a.update(at({}));
    a.update(at({ t: 1, attached: false }));
    a.update(at({ t: 2, attached: false, engine: 'igniting' }));
    a.update(at({ t: 3, attached: false, engine: 'running', mach: 2.1, altitude: 31000 }));
    a.update(at({ t: 4, attached: false, engine: 'running', mach: 2.2, altitude: 32000 }));
    a.update(at({ t: 90, attached: false, engine: 'burnout', mach: 5.5, altitude: 100000 }));
    a.update(at({ t: 600, attached: false, engine: 'burnout', gearDown: true, ventralAttached: false, landed: true,
      max: { mach: 5.5, altitude: 107000, nz: 4.2, qbar: 0 }, touchdown: { t: 599, speed: 90, sink: 1, position: [0, 0, 0] } }));
    a.update(at({ t: 601, attached: false, landed: true }));

    expect(names()).toEqual([
      'flight_start', 'b52_release', 'engine_ignition',
      'mach_milestone', 'mach_milestone', 'altitude_milestone',
      'engine_burnout', 'mach_milestone', 'mach_milestone', 'mach_milestone', 'altitude_milestone', 'altitude_milestone', 'altitude_milestone',
      'gear_down', 'ventral_jettison', 'flight_end',
    ]);
    const end = events.at(-1)![1];
    expect(end).toMatchObject({ outcome: 'landed', max_mach: 5.5, max_altitude_ft: 351050, max_g: 4.2, touchdown_kt: 175 });
  });

  it('starts a new flight when sim time resets', () => {
    const a = new FlightAnalytics('speed');
    a.update(at({ t: 50, attached: false, crashed: true, brokeUp: true, crashReason: 'Structural failure' }));
    a.update(at({ t: 0 }));
    expect(names()).toEqual(['flight_start', 'flight_start']);
    expect(events[1][1]).toMatchObject({ flight_number: 2, scenario: 'speed' });
  });
});
