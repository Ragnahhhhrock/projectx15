// Simple attitude-hold autopilot. Used by the headless profile tests, and later
// as the basis for "alpha hold" / assist modes.
import type { Controls, Telemetry } from './sim';
import { clamp } from './math';

export interface Gains {
  kp: number;
  kd: number;
}

const PITCH: Gains = { kp: 6, kd: 2 };
const ROLL: Gains = { kp: 2, kd: 0.8 };
const YAW: Gains = { kp: 4, kd: 1.5 };

/** Pitch stick to hold a pitch attitude (rad). */
export const holdPitch = (t: Telemetry, theta: number): number => clamp(PITCH.kp * (theta - t.theta) - PITCH.kd * t.q, -1, 1);

/** Pitch stick to hold an angle of attack (rad). */
export const holdAlpha = (t: Telemetry, alpha: number): number => clamp(PITCH.kp * (alpha - t.alpha) - PITCH.kd * t.q, -1, 1);

/** Pitch stick to hold a flight-path angle (rad). */
export const holdGamma = (t: Telemetry, gamma: number): number => holdPitch(t, gamma + t.alpha);

/** Roll stick to hold wings level. */
export const wingsLevel = (t: Telemetry): number => clamp(-ROLL.kp * t.phi - ROLL.kd * t.p, -1, 1);

/** Rudder to null sideslip (only meaningful in the atmosphere). */
export const nullSideslip = (t: Telemetry): number => clamp(YAW.kp * t.beta - YAW.kd * t.r, -1, 1);

export function controls(pitch: number, t: Telemetry, throttle = 1): Controls {
  return { pitch, roll: wingsLevel(t), yaw: nullSideslip(t), throttle };
}
