// 6-DOF X-15 simulation: fixed-step RK4 over a flat Earth with altitude-dependent gravity.
//
// World frame: x east (downrange), y up, z south (= x × y). Body frame: x nose, y top, z right wing.
// Body rates: wx = roll (right wing down +), wy = yaw (nose left +), wz = pitch (nose up +).

import { GEOMETRY, MASS, RCS, LIMITS, SAS_GAINS, aeroAt, inertia } from './aircraft';
import { atmosphere, gravity, G0 } from './atmosphere';
import { CONTACT_POINTS, FRICTION, LANDING, SPRINGS, STRUCTURE, type ContactPoint } from './contact';
import { Engine, type EngineState } from './engine';
import { add, clamp, cross, dot, len, norm, qmul, qnormalize, rotate, rotateInv, scale, sub, type Quat, type V3 } from './math';
import { TERRAIN_MAX, terrainHeight, terrainSlope } from '../world/terrain';

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

export type TerrainFn = (x: number, z: number) => number;

export interface SimConfig {
  /** Start position, m (y = altitude MSL) */
  position: V3;
  /** Start velocity, m/s */
  velocity: V3;
  /** Start attitude */
  attitude: Quat;
  /** Hanging under the B-52 at start */
  attached: boolean;
  /** Ground height function, m MSL */
  terrain: TerrainFn;
  /** Start with the landing gear already deployed */
  gearDown: boolean;
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
  /** Height above the terrain under the aircraft, m */
  agl: number;
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
  gearDown: boolean;
  ventralAttached: boolean;
  /** Any gear or airframe point currently touching the ground */
  onGround: boolean;
  landed: boolean;
  crashed: boolean;
  /** Why the aircraft crashed or broke up */
  crashReason: string | null;
  /** True if the airframe failed structurally rather than hitting the ground intact */
  brokeUp: boolean;
  /** Velocity at the moment of the crash, m/s */
  crashVelocity: V3;
  /** Belly landing with the gear up: survived but damaged */
  damaged: boolean;
  /** Set at first gear touchdown */
  touchdown: { t: number; speed: number; sink: number; position: V3 } | null;
  /** Distance rolled since touchdown, m */
  rollout: number;
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
  gear: boolean;
  ventral: boolean;
  terrain: TerrainFn;
}

interface Aux {
  alpha: number;
  beta: number;
  mach: number;
  qbar: number;
  /** Non-gravitational specific force from aero + thrust, world frame, m/s² */
  specificForce: V3;
  /** Same including ground contact forces */
  specificForceTotal: V3;
  contact: boolean;
}

const FLAT: TerrainFn = () => -1e6;
const ZERO_INPUTS: StepInputs = {
  de: 0, da: 0, dr: 0, thrust: 0, mdotMain: 0, rcsTorque: [0, 0, 0], mdotRcs: 0, gear: false, ventral: true, terrain: FLAT,
};

export const pointActive = (cp: ContactPoint, gear: boolean, ventral: boolean): boolean =>
  cp.needs === 'always' || (cp.needs === 'gear' && gear) || (cp.needs === 'noGear' && !gear) || (cp.needs === 'ventral' && ventral);

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

    const finFactor = u.ventral ? 1 : 0.8; // losing the ventral costs directional stability
    const CL = k.CLa * a + k.CLde * u.de;
    const CD = k.CD0 + (u.gear ? 0.02 : 0) + k.K * CL * CL + 0.5 * beta * beta;
    const CY = k.CYb * beta * finFactor + k.CYdr * u.dr;
    const Cl = k.Clb * beta + k.Clda * u.da + (k.Clp * pr * b) / (2 * V);
    const Cm = k.Cma * a + k.Cmde * u.de + (k.Cmq * qr * c) / (2 * V);
    const Cn = k.Cnb * beta * finFactor + k.Cndr * u.dr + (k.Cnr * yr * b) / (2 * V);

    const vhat = scale(v, 1 / V);
    const liftDir = norm(sub(yb, scale(vhat, dot(yb, vhat))));
    const qS = qbar * S;
    force = add(force, scale(vhat, -qS * CD));
    force = add(force, scale(liftDir, qS * CL));
    force = add(force, scale(zb, qS * CY));
    moment = add(moment, [qS * b * Cl, -qS * b * Cn, qS * c * Cm]);
  }

  const aeroForce = force;

  // Ground contact: spring-damper normal force plus Coulomb friction at each active point
  let touching = false;
  if (altitude < TERRAIN_MAX + 25) {
    const hx = Math.hypot(xb[0], xb[2]);
    const heading: V3 = hx > 1e-6 ? [xb[0] / hx, 0, xb[2] / hx] : [1, 0, 0];
    const lat: V3 = [-heading[2], 0, heading[0]];
    for (const cp of CONTACT_POINTS) {
      if (!pointActive(cp, u.gear, u.ventral)) continue;
      const r = rotate(q, cp.p);
      const d = u.terrain(s[PX] + r[0], s[PX + 2] + r[2]) - (s[PX + 1] + r[1]);
      if (d <= 0) continue;
      touching = true;
      const vp = add(v, rotate(q, cross(w, cp.p)));
      const spring = SPRINGS[cp.kind];
      const fn = Math.max(0, spring.k * d - spring.c * vp[1]);
      if (fn <= 0) continue;
      const fr = FRICTION[cp.kind];
      let ft: V3;
      if (cp.kind === 'nose') {
        const vl = vp[0] * heading[0] + vp[2] * heading[2];
        const vs = vp[0] * lat[0] + vp[2] * lat[2];
        const fl = (-fr.long * fn * vl) / (Math.abs(vl) + 0.3);
        const fs = (-fr.lat * fn * vs) / (Math.abs(vs) + 0.3);
        ft = [heading[0] * fl + lat[0] * fs, 0, heading[2] * fl + lat[2] * fs];
      } else {
        const vt = Math.hypot(vp[0], vp[2]);
        const f = (-fr.long * fn) / (vt + 0.3);
        ft = [vp[0] * f, 0, vp[2] * f];
      }
      const fw: V3 = [ft[0], fn, ft[2]];
      force = add(force, fw);
      moment = add(moment, cross(cp.p, rotateInv(q, fw)));
    }
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

  return {
    alpha,
    beta,
    mach,
    qbar,
    specificForce: scale(aeroForce, 1 / mass),
    specificForceTotal: scale(force, 1 / mass),
    contact: touching,
  };
}

export const DEFAULT_CONFIG: SimConfig = {
  position: [0, 13716, 0], // 45,000 ft
  velocity: [236, 0, 0], // ~Mach 0.8
  attitude: [1, 0, 0, 0],
  attached: true,
  terrain: (x, z) => terrainHeight(x, z),
  gearDown: false,
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
  gearDown: boolean;
  ventralAttached = true;
  landed = false;
  crashed = false;
  brokeUp = false;
  damaged = false;
  crashReason: string | null = null;
  crashVelocity: V3 = [0, 0, 0];
  touchdown: Telemetry['touchdown'] = null;
  controls: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 1 };
  readonly terrain: TerrainFn;
  private last: Aux = { alpha: 0, beta: 0, mach: 0, qbar: 0, specificForce: [0, 0, 0], specificForceTotal: [0, 0, 0], contact: false };
  private max = { mach: 0, altitude: 0, nz: 0, qbar: 0 };
  private touched = new Set<string>();
  private k = [1, 2, 3, 4].map(() => new Float64Array(STATE_SIZE));
  private tmp = new Float64Array(STATE_SIZE);

  constructor(config: Partial<SimConfig> = {}) {
    const c = { ...DEFAULT_CONFIG, ...config };
    this.s.set([...c.position, ...c.velocity, ...c.attitude, 0, 0, 0, MASS.mainProp, MASS.rcsProp]);
    this.attached = c.attached;
    this.terrain = c.terrain;
    this.gearDown = c.gearDown;
    this.engine = new Engine(c.rng);
    this.engine.failChance = c.ignitionFailChance;
    this.last = derivative(this.s, this.inputsZero(), this.tmp);
  }

  private inputsZero(): StepInputs {
    return { ...ZERO_INPUTS, gear: this.gearDown, ventral: this.ventralAttached, terrain: this.terrain };
  }

  release(): void {
    this.attached = false;
  }

  /** The landing gear (nose wheel and skids) is deployed once and stays down, as on the real aircraft. */
  deployGear(): void {
    if (!this.attached) this.gearDown = true;
  }

  /** Jettison the lower ventral fin. One-way. */
  jettisonVentral(): void {
    if (!this.attached) this.ventralAttached = false;
  }

  /** Advance the simulation by dt seconds. */
  step(dt: number): void {
    if (this.landed || this.crashed) return;
    const s = this.s;

    if (this.attached) {
      // Captive carry: ride the B-52 in straight and level flight.
      for (let i = 0; i < 3; i++) s[PX + i] += s[VX + i] * dt;
      this.t += dt;
      this.last = derivative(s, this.inputsZero(), this.tmp);
      return;
    }

    this.engine.update(dt, this.controls.throttle, s[MP]);
    const u = this.inputs();

    if (s[PX + 1] < TERRAIN_MAX + 60) {
      this.probeTouchdown(dt);
      if (this.crashed) return;
    }

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

    const nz = this.nz(false);
    this.max.mach = Math.max(this.max.mach, aux.mach);
    this.max.altitude = Math.max(this.max.altitude, s[PX + 1]);
    this.max.nz = Math.max(this.max.nz, Math.abs(nz));
    this.max.qbar = Math.max(this.max.qbar, aux.qbar);

    if (!Number.isFinite(s[PX]) || !Number.isFinite(s[PX + 1])) {
      this.fail('simulation fault', true);
      return;
    }

    // Structural limits
    if (nz > STRUCTURE.nzMax) this.fail(`structural failure: ${nz.toFixed(1)} g`, true);
    else if (nz < STRUCTURE.nzMin) this.fail(`structural failure: ${nz.toFixed(1)} g (negative)`, true);
    else if (aux.qbar > STRUCTURE.qMax) this.fail(`structural failure: dynamic pressure ${(aux.qbar / 47.88).toFixed(0)} psf`, true);
    if (this.crashed) return;

    this.settle();
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
    return {
      de, da, dr,
      thrust: this.engine.thrust(p),
      mdotMain: this.engine.massFlow(),
      rcsTorque,
      mdotRcs,
      gear: this.gearDown,
      ventral: this.ventralAttached,
      terrain: this.terrain,
    };
  }

  /** Load factor along the body y axis, g. With `contacts` the ground forces are included. */
  private nz(contacts: boolean): number {
    const f = contacts ? this.last.specificForceTotal : this.last.specificForce;
    return dot(f, rotate(this.attitude(), [0, 1, 0])) / G0;
  }

  private attitude(): Quat {
    const s = this.s;
    return [s[QW], s[QW + 1], s[QW + 2], s[QW + 3]];
  }

  /** World position and velocity of a body-frame point. */
  private pointState(p: V3): { pos: V3; vel: V3 } {
    const s = this.s;
    const q = this.attitude();
    const r = rotate(q, p);
    const pos: V3 = [s[PX] + r[0], s[PX + 1] + r[1], s[PX + 2] + r[2]];
    const vel = add([s[VX], s[VX + 1], s[VX + 2]], rotate(q, cross([s[WX], s[WX + 1], s[WX + 2]], p)));
    return { pos, vel };
  }

  /** Look one step ahead for the first touch of each ground-contact point and judge it. */
  private probeTouchdown(dt: number): void {
    const q = this.attitude();
    const xb = rotate(q, [1, 0, 0]);
    const hx = Math.hypot(xb[0], xb[2]) || 1;
    const lat: V3 = [-xb[2] / hx, 0, xb[0] / hx];
    for (const cp of CONTACT_POINTS) {
      if (!pointActive(cp, this.gearDown, this.ventralAttached)) continue;
      const { pos, vel } = this.pointState(cp.p);
      const h = pos[1] - this.terrain(pos[0], pos[2]);
      if (h > 2) {
        this.touched.delete(cp.id);
        continue;
      }
      if (this.touched.has(cp.id) || h + vel[1] * dt * 1.5 > 0) continue;
      this.touched.add(cp.id);

      const sink = -vel[1];
      const side = Math.abs(vel[0] * lat[0] + vel[2] * lat[2]);
      const speed = len([this.s[VX], this.s[VX + 1], this.s[VX + 2]]);
      const theta = Math.asin(clamp(xb[1], -1, 1));
      const yb = rotate(q, [0, 1, 0]);
      const zb = rotate(q, [0, 0, 1]);
      const phi = Math.atan2(-zb[1], yb[1]);

      if (cp.kind === 'nose' || cp.kind === 'skid') {
        if (!this.touchdown) this.touchdown = { t: this.t, speed, sink: Math.max(0, sink), position: [this.s[PX], this.s[PX + 1], this.s[PX + 2]] };
        if (terrainSlope(pos[0], pos[2]) > LANDING.maxSlope) return this.fail(`${cp.label} hit sloping terrain`, false);
        const limit = cp.kind === 'nose' ? LANDING.noseSink : LANDING.skidSink;
        if (sink > limit) return this.fail(`${cp.label} collapsed: hard landing at ${sink.toFixed(1)} m/s sink`, false);
        if (side > LANDING.sideSpeed) return this.fail(`${cp.label} sheared off: touched down sideways`, false);
      } else if (cp.kind === 'belly') {
        const gentle =
          sink < LANDING.bellySink &&
          Math.abs(theta) < LANDING.bellyAttitude &&
          Math.abs(phi) < LANDING.bellyAttitude &&
          side < LANDING.sideSpeed &&
          terrainSlope(pos[0], pos[2]) < LANDING.maxSlope;
        if (gentle) {
          this.damaged = true;
          if (!this.touchdown) this.touchdown = { t: this.t, speed, sink: Math.max(0, sink), position: [this.s[PX], this.s[PX + 1], this.s[PX + 2]] };
        } else this.fail(`${cp.label} impact${this.gearDown ? '' : ' with the gear up'}`, false);
      } else if (speed > 6) {
        this.fail(cp.id === 'ventral' ? 'ventral fin strike: jettison it before landing' : `${cp.label} struck the ground`, false);
      }
      if (this.crashed) return;
    }
  }

  /** Mark the aircraft as destroyed. */
  private fail(reason: string, brokeUp: boolean): void {
    if (this.crashed) return;
    const s = this.s;
    this.crashed = true;
    this.brokeUp = brokeUp;
    this.crashReason = reason;
    this.crashVelocity = [s[VX], s[VX + 1], s[VX + 2]];
    if (!brokeUp) {
      for (let i = 0; i < 3; i++) s[VX + i] = 0;
    }
    for (let i = 0; i < 3; i++) s[WX + i] = 0;
  }

  /** Declare the landing complete once the aircraft has stopped on the ground. */
  private settle(): void {
    if (!this.last.contact) return;
    const s = this.s;
    const speed = len([s[VX], s[VX + 1], s[VX + 2]]);
    if (speed < 0.4 && len([s[WX], s[WX + 1], s[WX + 2]]) < 0.05) {
      for (let i = 0; i < 3; i++) {
        s[VX + i] = 0;
        s[WX + i] = 0;
      }
      this.landed = true;
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
    const ground = s[PX + 1] < TERRAIN_MAX + 60 ? this.terrain(s[PX], s[PX + 2]) : -1e6;
    const td = this.touchdown;
    return {
      t: this.t,
      position: [s[PX], s[PX + 1], s[PX + 2]],
      velocity: v,
      attitude: q,
      altitude: s[PX + 1],
      agl: ground > -1e5 ? s[PX + 1] - ground : s[PX + 1] - TERRAIN_MAX,
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
      nz: this.attached ? 1 : this.nz(this.last.contact),
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
      gearDown: this.gearDown,
      ventralAttached: this.ventralAttached,
      onGround: this.last.contact,
      landed: this.landed,
      crashed: this.crashed,
      crashReason: this.crashReason,
      brokeUp: this.brokeUp,
      crashVelocity: this.crashVelocity,
      damaged: this.damaged,
      touchdown: td,
      rollout: td ? Math.hypot(s[PX] - td.position[0], s[PX + 2] - td.position[2]) : 0,
      max: { ...this.max },
    };
  }
}
