// G-induced vision loss: greyout (tunnel vision + colour loss) then blackout under sustained positive g.
// Blood pressure at eye level lags the load, so brief spikes are tolerated and sustained pulls are not.
// Thresholds assume a relaxed pilot in the David Clark pressure suit (no anti-g straining).

export const GREY_ONSET = 4.5; // g where peripheral vision starts to go
export const GREY_FULL = 6.0; // g for full greyout / tunnel vision
export const BLACK_FULL = 7.5; // g for total blackout
const RISE_TAU = 3.0; // s for vision to degrade toward the current load
const RECOVER_TAU = 2.0; // s for vision to return once the load comes off

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Pure model: tracks the lagged "eye-level" g and derives greyout / blackout amounts (0..1). */
export class GTolerance {
  level = 1;

  update(nz: number, dt: number): void {
    if (dt <= 0) return;
    const target = Math.max(1, nz);
    const tau = target > this.level ? RISE_TAU : RECOVER_TAU;
    this.level += (target - this.level) * (1 - Math.exp(-dt / tau));
  }

  reset(): void {
    this.level = 1;
  }

  get greyout(): number {
    return clamp01((this.level - GREY_ONSET) / (GREY_FULL - GREY_ONSET));
  }

  get blackout(): number {
    return clamp01((this.level - GREY_FULL) / (BLACK_FULL - GREY_FULL));
  }

  get label(): string | null {
    if (this.blackout >= 0.95) return 'BLACKOUT';
    if (this.greyout > 0.05) return 'GREYOUT';
    return null;
  }
}

/** Applies the model to the screen: desaturates/dims the 3D view and closes a black tunnel over everything. */
export class GVision {
  readonly model = new GTolerance();
  private overlay: HTMLElement;
  private view: HTMLElement;
  private lastT = -1;

  constructor(overlay: HTMLElement, view: HTMLElement) {
    this.overlay = overlay;
    this.view = view;
  }

  /** `t` is sim time, so pause and time scale are respected. */
  update(nz: number, t: number): void {
    if (t < this.lastT) this.model.reset(); // new flight
    const dt = this.lastT < 0 ? 0 : t - this.lastT;
    this.lastT = t;
    this.model.update(nz, Math.min(dt, 1));

    const grey = this.model.greyout;
    const black = this.model.blackout;
    // Tunnel: clear radius shrinks from beyond the corners to a small central spot, then closes.
    const radius = 85 - 60 * grey - 25 * black; // % of the farthest corner
    this.overlay.style.setProperty('--tunnel', `${radius.toFixed(1)}%`);
    this.overlay.style.setProperty('--edge', (0.85 * grey + 0.15 * black).toFixed(3));
    this.overlay.style.setProperty('--black', black.toFixed(3));
    this.overlay.hidden = grey === 0 && black === 0;
    this.view.style.filter = grey > 0 ? `grayscale(${grey.toFixed(3)}) brightness(${(1 - 0.35 * grey).toFixed(3)})` : '';
  }

  get label(): string | null {
    return this.model.label;
  }
}
