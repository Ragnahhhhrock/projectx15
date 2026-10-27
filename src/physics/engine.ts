// XLR99 rocket engine: ignition sequence, throttle lag, altitude-dependent thrust.
import { G0 } from './atmosphere';
import { XLR99 } from './aircraft';

export type EngineState = 'off' | 'igniting' | 'running' | 'shutdown' | 'burnout';

export class Engine {
  state: EngineState = 'off';
  /** Actual throttle, 0..1 */
  throttle = 0;
  private timer = 0;
  /** Probability an ignition attempt fails (0 for tests). */
  failChance = 0;
  private rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  ignite(): void {
    if (this.state === 'off' || this.state === 'shutdown') {
      this.state = 'igniting';
      this.timer = 0;
    }
  }

  shutdown(): void {
    if (this.state === 'running' || this.state === 'igniting') this.state = 'shutdown';
  }

  /** Advance engine state. cmd is the pilot throttle 0..1. */
  update(dt: number, cmd: number, propRemaining: number): void {
    if (propRemaining <= 0 && (this.state === 'running' || this.state === 'igniting')) this.state = 'burnout';
    if (this.state === 'igniting') {
      this.timer += dt;
      if (this.timer >= XLR99.ignitionDelay) {
        this.state = this.rng() < this.failChance ? 'off' : 'running';
      }
    }
    const target = this.state === 'running' ? Math.max(XLR99.minThrottle, Math.min(1, cmd)) : 0;
    this.throttle += (target - this.throttle) * Math.min(1, dt / XLR99.throttleTau);
    if (this.state !== 'running' && this.throttle < 1e-3) this.throttle = 0;
  }

  /** Thrust in N at ambient pressure p (Pa). */
  thrust(p: number): number {
    if (this.throttle <= 0) return 0;
    return Math.max(0, XLR99.thrustVac * this.throttle - XLR99.exitArea * p);
  }

  /** Propellant mass flow, kg/s. */
  massFlow(): number {
    return this.throttle > 0 ? (XLR99.thrustVac * this.throttle) / (XLR99.isp * G0) : 0;
  }
}
