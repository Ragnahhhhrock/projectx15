// GA4 events (G-36Q83P4LEH). Fired from telemetry state changes so each fires once per flight.
import type { Telemetry } from './physics/sim';

type Params = Record<string, string | number | boolean>;
type Gtag = (cmd: 'event', name: string, params?: Params) => void;

const FT = 3.28084;
const MACH_MARKS = [1, 2, 3, 4, 5, 6];
const ALT_MARKS_FT = [100_000, 200_000, 264_000, 300_000, 350_000]; // 264k ft = 50 mi astronaut wings

const r1 = (x: number) => Math.round(x * 10) / 10;
const ft = (m: number) => Math.round(m * FT);

export function track(name: string, params: Params = {}): void {
  const gtag = (globalThis as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag === 'function') gtag('event', name, params);
}

export class FlightAnalytics {
  private prev: Telemetry | null = null;
  private flight = 0;
  private ended = false;
  private mach = new Set<number>();
  private alt = new Set<number>();
  private scenario: string;

  constructor(scenario: string | null) {
    this.scenario = scenario ?? 'standard';
  }

  update(t: Telemetry): void {
    const p = this.prev;
    this.prev = t;
    // New flight: first frame, or sim time went backwards (reset / new scenario)
    if (!p || t.t < p.t) return this.start(t);

    const at = { flight_time_s: Math.round(t.t), altitude_ft: ft(t.altitude), mach: r1(t.mach) };

    if (p.attached && !t.attached) track('b52_release', at);
    if (p.engine !== t.engine) {
      if (t.engine === 'running' && p.engine !== 'running') track('engine_ignition', at);
      if (t.engine === 'shutdown') track('engine_shutdown', { ...at, propellant_kg: Math.round(t.mainProp) });
      if (t.engine === 'burnout') track('engine_burnout', at);
    }
    if (!p.gearDown && t.gearDown) track('gear_down', at);
    if (p.ventralAttached && !t.ventralAttached) track('ventral_jettison', at);

    for (const m of MACH_MARKS) {
      if (!this.mach.has(m) && t.mach >= m) { this.mach.add(m); track('mach_milestone', { ...at, milestone: m }); }
    }
    for (const a of ALT_MARKS_FT) {
      if (!this.alt.has(a) && t.altitude * FT >= a) { this.alt.add(a); track('altitude_milestone', { ...at, milestone_ft: a }); }
    }

    if (!this.ended && (t.landed || t.crashed)) {
      this.ended = true;
      const outcome = t.crashed ? (t.brokeUp ? 'broke_up' : 'crashed') : t.damaged ? 'belly_landing' : 'landed';
      track('flight_end', {
        outcome,
        flight_number: this.flight,
        scenario: this.scenario,
        flight_time_s: Math.round(t.t),
        max_mach: r1(t.max.mach),
        max_altitude_ft: ft(t.max.altitude),
        max_g: r1(t.max.nz),
        ...(t.crashReason ? { crash_reason: t.crashReason.slice(0, 100) } : {}),
        ...(t.touchdown ? { touchdown_kt: Math.round(t.touchdown.speed * 1.94384), sink_fps: r1(t.touchdown.sink * FT) } : {}),
      });
    }
  }

  private start(t: Telemetry): void {
    this.flight++;
    this.ended = false;
    this.mach.clear();
    this.alt.clear();
    track('flight_start', { flight_number: this.flight, scenario: this.scenario, captive: t.attached });
  }
}
