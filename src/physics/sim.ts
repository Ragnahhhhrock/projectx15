// 6-DOF X-15 simulation: fixed-step RK4 over a flat Earth with altitude-dependent gravity.
//
// World frame: x downrange, y up, z = x × y. Body frame: x nose, y top, z right wing.
// Body rates: wx = roll (right wing down +), wy = yaw (nose left +), wz = pitch (nose up +).

import { GEOMETRY, MASS, RCS, LIMITS, SAS_GAINS, aeroAt, inertia } from './aircraft';
import { atmosphere, gravity, G0 } from './atmosphere';
import { Engine, type EngineState } from './engine';
import { add, clamp, cross, dot, len, norm, qmul, qnormalize, rotate, rotateInv, scale, sub, type Quat, type V3 } from './math';

/** Pilot (or autopilot) inputs. Axes are -1..1. */
export interface Controls {
  /** +1 = stick back, nose up */
  pitch: number;
  /** +1 = roll right */
  roll: number;
  /** +1 = nose right */
  yaw: number;
  /** 0..1 */
  throttle: number;
}

export interface SimConfig {
  /** Start position, m (y = altitude MSL) */
  position: V3;
  /** Start velocity, m/s */
  velocity: V3;
  /** Start attitude */
  attitude: Quat;
  /** Hanging under the B-52 at start */
  attached: boolean;
  /** Ground elevation, m MSL (Rogers Dry Lake ≈ 700 m) */
  groundElevation: number;
  /** Ignition failure probability */
  ignitionFailChance: number;
  rng: () => number;
}

export interface Telemetry {
  t: number;
  position: V3;
  velocity: V3;
  attitude: Quat;
  altitude: number;
  speed: number;
  mach: number;
  /** Dynamic pressure, Pa */
  qbar: number;
  alpha: number;
  beta: number;
  /** Pitch, roll, heading, rad */
  theta: number;
  phi: number;
  psi: number;
  /** Body rates: roll right, pitch up, yaw right, rad/s */
  p: number;
  q: number;
  r: number;
  /** Normal load factor, g */
  nz: number;
  flightPathAngle: number;
  verticalSpeed: number;
  mass: number;
  mainProp: number;
  rcsProp: number;
  thrust: number;
  throttle: number;
  engine: EngineState;
  attached: boolean;
  rcsOn: boolean;
  sasOn: boolean;
  landed: boolean;
  crashed: boolean;
  max: { mach: number; altitude: number; nz: number; qbar: number };
}

// State vector layout
const PX = 0, VX = 3, QW = 6, WX = 10, MP = 13, RP = 14;
export const STATE_SIZE = 15;

interface StepInputs {
  de: number;
  da: number;
  dr: number;
  thrust: number;
  mdotMain: number;
  rcsTorque: V3;
  mdotRcs: number;
}

interface Aux {
  alpha: number;
  beta: number;
  mach: number;
  qbar: number;
  /** Non-gravitational specific force, world frame, m/s² */
  specificForce: V3;
}

const ZERO_INPUTS: StepInputs = { de: 0, da: 0, dr: 0, thrust: 0, mdotMain: 0, rcsTorque: [0, 0, 0], mdotRcs: 0 };

/** Time derivative of the state. Writes into out, returns auxiliary flight data. */
export function derivative(s: Float64Array, u: StepInputs, out: Float64Array): Aux {
  const v: V3 = [s[VX], s[VX + 1], s[VX + 2]];
  const q: Quat = qnormalize([s[QW], s[QW + 1], s[QW + 2], s[QW + 3]]);
  const w: V3 = [s[WX], s[WX + 1], s[WX + 2]];
  const altitude = s[PX + 1];
  const mainProp = Math.max(0, s[MP]);
  const mass = MASS.dry + mainProp + Math.max(0, s[RP]);

  const atm = atmosphere(altitude);
  const V = len(v);
  const xb = rotate(q, [1, 0, 0]);
  const yb = rotate(q, [0, 1, 0]);
  const zb = rotate(q, [0, 0, 1]);

  let force: V3 = scale(xb, u.thrust); // non-gravitational
  let moment: V3 = [...u.rcsTorque];
  let alpha = 0, beta = 0, mach = 0, qbar = 0;

  if (V > 1) {
    const { S, b, c } = GEOMETRY;
    const vb = rotateInv(q, v);
    alpha = Math.atan2(-vb[1], vb[0]);
    beta = Math.asin(clamp(vb[2] / V, -1, 1));
    mach = V / atm.a;
    qbar = 0.5 * atm.rho * V * V;
    const k = aeroAt(mach);
    const a = clamp(alpha, -LIMITS.alpha, LIMITS.alpha);
    const pr = w[0], yr = -w[1], qr = w[2]; // roll right, yaw right, pitch up

    const CL = k.CLa * a + k.CLde * u.de;
    const CD = k.CD0 + k.K * CL * CL + 0.5 * beta * beta;
    const CY = k.CYb * beta + k.CYdr * u.dr;
    const Cl = k.Clb * beta + k.Clda * u.da + (k.Clp * pr * b) / (2 * V);
    const Cm = k.Cma * a + k.Cmde * u.de + (k.Cmq * qr * c) / (2 * V);
    const Cn = k.Cnb * beta + k.Cndr * u.dr + (k.Cnr * yr * b) / (2 * V);

    const vhat = scale(v, 1 / V);
    const liftDir = norm(sub(yb, scale(vhat, dot(yb, vhat))));
    const qS = qbar * S;
    force = add(force, scale(vhat, -qS * CD));
    force = add(force, scale(liftDir, qS * CL));
    force = add(force, scale(zb, qS * CY));
    moment = add(moment, [qS * b * Cl, -qS * b * Cn, qS * c * Cm]);
  }

  const I = inertia(mainProp / MASS.mainProp);
  const Iw: V3 = [I[0] * w[0], I[1] * w[1], I[2] * w[2]];
  const gyro = cross(w, Iw);
  const g = gravity(altitude);
  const qdot = qmul(q, [0, w[0], w[1], w[2]]);

  out[PX] = v[0];
  out[PX + 1] = v[1];
  out[PX + 2] = v[2];
  out[VX] = force[0] / mass;
  out[VX + 1] = force[1] / mass - g;
  out[VX + 2] = force[2] / mass;
  out[QW] = 0.5 * qdot[0];
  out[QW + 1] = 0.5 * qdot[1];
  out[QW + 2] = 0.5 * qdot[2];
  out[QW + 3] = 0.5 * qdot[3];
  out[WX] = (moment[0] - gyro[0]) / I[0];
  out[WX + 1] = (moment[1] - gyro[1]) / I[1];
  out[WX + 2] = (moment[2] - gyro[2]) / I[2];
  out[MP] = mainProp > 0 ? -u.mdotMain : 0;
  out[RP] = s[RP] > 0 ? -u.mdotRcs : 0;

  return { alpha, beta, mach, qbar, specificForce: scale(force, 1 / mass) };
}

export const DEFAULT_CONFIG: SimConfig = {
  position: [0, 13716, 0], // 45,000 ft
  velocity: [236, 0, 0], // ~Mach 0.8
  attitude: [1, 0, 0, 0],
  attached: true,
  groundElevation: 700,
  ignitionFailChance: 0,
  rng: Math.random,
};

export class Sim {
  s = new Float64Array(STATE_SIZE);
  t = 0;
  engine: Engine;
  attached: boolean;
  rcsOn = true;
  sasOn = true;
  landed = false;
  crashed = false;
  controls: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 1 };
  readonly groundElevation: number;
  private last: Aux = { alpha: 0, beta: 0, mach: 0, qbar: 0, specificForce: [0, 0, 0] };
  private max = { mach: 0, altitude: 0, nz: 0, qbar: 0 };
  private k = [1, 2, 3, 4].map(() => new Float64Array(STATE_SIZE));
  private tmp = new Float64Array(STATE_SIZE);

  constructor(config: Partial<SimConfig> = {}) {
    const c = { ...DEFAULT_CONFIG, ...config };
    this.s.set([...c.position, ...c.velocity, ...c.attitude, 0, 0, 0, MASS.mainProp, MASS.rcsProp]);
    this.attached = c.attached;
    this.groundElevation = c.groundElevation;
    this.engine = new Engine(c.rng);
    this.engine.failChance = c.ignitionFailChance;
    this.last = derivative(this.s, ZERO_INPUTS, this.tmp);
  }

  release(): void {
    this.attached = false;
  }

  /** Advance the simulation by dt seconds. */
  step(dt: number): void {
    if (this.landed || this.crashed) return;
    const s = this.s;

    if (this.attached) {
      // Captive carry: ride the B-52 in straight and level flight.
      for (let i = 0; i < 3; i++) s[PX + i] += s[VX + i] * dt;
      this.t += dt;
      this.last = derivative(s, ZERO_INPUTS, this.tmp);
      return;
    }

    this.engine.update(dt, this.controls.throttle, s[MP]);
    const u = this.inputs();

    // RK4
    const [k1, k2, k3, k4] = this.k;
    const tmp = this.tmp;
    const aux = derivative(s, u, k1);
    for (let i = 0; i < STATE_SIZE; i++) tmp[i] = s[i] + 0.5 * dt * k1[i];
    derivative(tmp, u, k2);
    for (let i = 0; i < STATE_SIZE; i++) tmp[i] = s[i] + 0.5 * dt * k2[i];
    derivative(tmp, u, k3);
    for (let i = 0; i < STATE_SIZE; i++) tmp[i] = s[i] + dt * k3[i];
    derivative(tmp, u, k4);
    for (let i = 0; i < STATE_SIZE; i++) s[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);

    const q = qnormalize([s[QW], s[QW + 1], s[QW + 2], s[QW + 3]]);
    s.set(q, QW);
    s[MP] = Math.max(0, s[MP]);
    s[RP] = Math.max(0, s[RP]);
    this.t += dt;
    this.last = aux;

    const nz = this.nz();
    this.max.mach = Math.max(this.max.mach, aux.mach);
    this.max.altitude = Math.max(this.max.altitude, s[PX + 1]);
    this.max.nz = Math.max(this.max.nz, Math.abs(nz));
    this.max.qbar = Math.max(this.max.qbar, aux.qbar);

    this.checkGround();
  }

  /** Control surface deflections (with stability augmentation), thrust and RCS. */
  private inputs(): StepInputs {
    const c = this.controls;
    const s = this.s;
    const w: V3 = [s[WX], s[WX + 1], s[WX + 2]];
    let de = -c.pitch * LIMITS.de;
    let da = c.roll * LIMITS.da;
    let dr = c.yaw * LIMITS.dr;
    if (this.sasOn) {
      de += SAS_GAINS.pitch * w[2];
      da -= SAS_GAINS.roll * w[0];
      dr -= SAS_GAINS.yaw * -w[1];
    }
    de = clamp(de, -LIMITS.de, LIMITS.de);
    da = clamp(da, -LIMITS.da, LIMITS.da);
    dr = clamp(dr, -LIMITS.dr, LIMITS.dr);

    let rcsTorque: V3 = [0, 0, 0];
    let mdotRcs = 0;
    if (this.rcsOn && s[RP] > 0) {
      const nose = RCS.noseJet * RCS.noseArm;
      const roll = 2 * RCS.rollJet * RCS.rollArm;
      rcsTorque = [c.roll * roll, -c.yaw * nose, c.pitch * nose];
      mdotRcs = ((Math.abs(c.pitch) + Math.abs(c.yaw)) * RCS.noseJet + Math.abs(c.roll) * 2 * RCS.rollJet) / (RCS.isp * G0);
    }

    const p = atmosphere(s[PX + 1]).p;
    return { de, da, dr, thrust: this.engine.thrust(p), mdotMain: this.engine.massFlow(), rcsTorque, mdotRcs };
  }

  private nz(): number {
    const q = this.attitude();
    return dot(this.last.specificForce, rotate(q, [0, 1, 0])) / G0;
  }

  private attitude(): Quat {
    const s = this.s;
    return [s[QW], s[QW + 1], s[QW + 2], s[QW + 3]];
  }

  private checkGround(): void {
    const s = this.s;
    if (s[PX + 1] > this.groundElevation) return;
    const tel = this.telemetry();
    const gentle = tel.verticalSpeed > -4 && tel.speed < 140 && Math.abs(tel.phi) < 0.2 && tel.theta > -0.05;
    if (gentle) this.landed = true;
    else this.crashed = true;
    s[PX + 1] = this.groundElevation;
    for (let i = 0; i < 3; i++) {
      s[VX + i] = 0;
      s[WX + i] = 0;
    }
  }

  telemetry(): Telemetry {
    const s = this.s;
    const q = this.attitude();
    const v: V3 = [s[VX], s[VX + 1], s[VX + 2]];
    const xb = rotate(q, [1, 0, 0]);
    const yb = rotate(q, [0, 1, 0]);
    const zb = rotate(q, [0, 0, 1]);
    const speed = len(v);
    const hspeed = Math.hypot(v[0], v[2]);
    return {
      t: this.t,
      position: [s[PX], s[PX + 1], s[PX + 2]],
      velocity: v,
      attitude: q,
      altitude: s[PX + 1],
      speed,
      mach: this.last.mach,
      qbar: this.last.qbar,
      alpha: this.last.alpha,
      beta: this.last.beta,
      theta: Math.asin(clamp(xb[1], -1, 1)),
      phi: Math.atan2(-zb[1], yb[1]),
      psi: Math.atan2(xb[2], xb[0]),
      p: s[WX],
      q: s[WX + 2],
      r: -s[WX + 1],
      nz: this.attached ? 1 : this.nz(),
      flightPathAngle: Math.atan2(v[1], hspeed),
      verticalSpeed: v[1],
      mass: MASS.dry + s[MP] + s[RP],
      mainProp: s[MP],
      rcsProp: s[RP],
      thrust: this.engine.thrust(atmosphere(s[PX + 1]).p),
      throttle: this.engine.throttle,
      engine: this.engine.state,
      attached: this.attached,
      rcsOn: this.rcsOn,
      sasOn: this.sasOn,
      landed: this.landed,
      crashed: this.crashed,
      max: { ...this.max },
    };
  }
}
