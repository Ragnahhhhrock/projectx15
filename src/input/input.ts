// Keyboard + Gamepad API input. Keyboard axes ramp so taps give small inputs.
import type { Controls } from '../physics/sim';
import type { Command } from '../worker/protocol';

export type UiAction = 'camera' | 'help' | 'pause' | 'timescale' | 'resetView' | 'guide' | 'guideProfile';

const RAMP = 2.5; // per second towards full deflection
const RETURN = 5; // per second back to centre
const THROTTLE_RATE = 0.5; // per second
const DEADZONE = 0.08;

const COMMAND_KEYS: Record<string, Command> = {
  Space: 'release',
  KeyI: 'ignite',
  KeyO: 'shutdown',
  KeyR: 'toggleRcs',
  KeyF: 'toggleSas',
  KeyG: 'gear',
  KeyJ: 'jettison',
  KeyN: 'reset',
};

const UI_KEYS: Record<string, UiAction> = {
  KeyC: 'camera',
  KeyH: 'help',
  KeyP: 'pause',
  KeyT: 'timescale',
  KeyV: 'resetView',
  KeyG: 'guide',
  KeyJ: 'guideProfile',
};

// Standard-mapping gamepad buttons
const PAD_COMMANDS: Record<number, Command> = { 0: 'ignite', 3: 'release', 2: 'toggleRcs', 4: 'jettison', 5: 'gear', 8: 'reset' };
const PAD_UI: Record<number, UiAction> = { 1: 'camera', 9: 'pause' };

export class Input {
  private keys = new Set<string>();
  private axes = { pitch: 0, roll: 0, yaw: 0 };
  private throttle = 1;
  private padPrev: boolean[] = [];
  private queue: (Command | UiAction)[] = [];

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const action = COMMAND_KEYS[e.code] ?? UI_KEYS[e.code];
      if (action) {
        this.queue.push(action);
        e.preventDefault();
      }
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => this.keys.clear());
  }

  /** Discrete actions since the last call. */
  drainActions(): { commands: Command[]; ui: UiAction[] } {
    const commands: Command[] = [];
    const ui: UiAction[] = [];
    for (const a of this.queue) {
      if (Object.values(UI_KEYS).includes(a as UiAction) || Object.values(PAD_UI).includes(a as UiAction)) ui.push(a as UiAction);
      else commands.push(a as Command);
    }
    this.queue = [];
    return { commands, ui };
  }

  /** Sample controls for this frame. */
  poll(dt: number): Controls {
    const k = (...codes: string[]) => codes.some((c) => this.keys.has(c));
    const target = {
      pitch: (k('KeyS', 'ArrowDown') ? 1 : 0) - (k('KeyW', 'ArrowUp') ? 1 : 0),
      roll: (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0),
      yaw: (k('KeyE') ? 1 : 0) - (k('KeyQ') ? 1 : 0),
    };
    for (const axis of ['pitch', 'roll', 'yaw'] as const) {
      const cur = this.axes[axis];
      const goal = target[axis];
      const rate = goal === 0 ? RETURN : RAMP;
      const step = rate * dt;
      this.axes[axis] = Math.abs(goal - cur) <= step ? goal : cur + Math.sign(goal - cur) * step;
    }
    if (k('KeyX', 'PageUp')) this.throttle = Math.min(1, this.throttle + THROTTLE_RATE * dt);
    if (k('KeyZ', 'PageDown')) this.throttle = Math.max(0, this.throttle - THROTTLE_RATE * dt);

    const out: Controls = { ...this.axes, throttle: this.throttle };
    const pad = this.gamepad();
    if (pad) {
      const dz = (v: number) => (Math.abs(v) < DEADZONE ? 0 : v);
      const stick = { pitch: dz(pad.axes[1] ?? 0), roll: dz(pad.axes[0] ?? 0), yaw: dz(pad.axes[2] ?? 0) };
      // The stick overrides the keyboard on any axis it is deflecting.
      if (stick.pitch) out.pitch = stick.pitch; // pulling back gives +1 = nose up
      if (stick.roll) out.roll = stick.roll;
      if (stick.yaw) out.yaw = stick.yaw;
      const up = pad.buttons[7]?.value ?? 0;
      const down = pad.buttons[6]?.value ?? 0;
      this.throttle = Math.max(0, Math.min(1, this.throttle + (up - down) * THROTTLE_RATE * dt));
      out.throttle = this.throttle;
      pad.buttons.forEach((b, i) => {
        if (b.pressed && !this.padPrev[i]) {
          const action = PAD_COMMANDS[i] ?? PAD_UI[i];
          if (action) this.queue.push(action);
        }
        this.padPrev[i] = b.pressed;
      });
    }
    return out;
  }

  private gamepad(): Gamepad | null {
    if (!navigator.getGamepads) return null;
    for (const p of navigator.getGamepads()) if (p && p.connected) return p;
    return null;
  }
}
