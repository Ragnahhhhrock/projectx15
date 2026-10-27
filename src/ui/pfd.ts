// Primary flight data: large speed and altitude readouts, shown in every camera mode and in replay.
import type { Telemetry } from '../physics/sim';

const FT = 3.28084;
const KT = 1.94384;
const fmt = (n: number, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export class Pfd {
  private mach: HTMLElement;
  private kt: HTMLElement;
  private alt: HTMLElement;
  private trend: HTMLElement;
  private maxSpeed: HTMLElement;
  private maxAlt: HTMLElement;
  private miles: HTMLElement;

  constructor(el: HTMLElement) {
    el.innerHTML = `
      <div class="pfd-cell">
        <span class="pfd-label">SPEED</span>
        <div class="pfd-main"><small>M</small><b class="pfd-mach">0.00</b></div>
        <div class="pfd-sub"><b class="pfd-kt">0</b> KT</div>
        <div class="pfd-max"></div>
      </div>
      <div class="pfd-cell">
        <span class="pfd-label">ALTITUDE</span>
        <div class="pfd-main"><b class="pfd-alt">0</b><small>FT</small><i class="pfd-trend"></i></div>
        <div class="pfd-sub pfd-miles"></div>
        <div class="pfd-max"></div>
      </div>`;
    const q = <T extends HTMLElement>(s: string, i = 0) => el.querySelectorAll<T>(s)[i];
    this.mach = q('.pfd-mach');
    this.kt = q('.pfd-kt');
    this.alt = q('.pfd-alt');
    this.trend = q('.pfd-trend');
    this.maxSpeed = q('.pfd-max', 0);
    this.maxAlt = q('.pfd-max', 1);
    this.miles = q('.pfd-miles');
  }

  update(t: Telemetry): void {
    const altFt = t.altitude * FT;
    this.mach.textContent = fmt(t.mach, 2);
    this.kt.textContent = fmt(t.speed * KT);
    this.alt.textContent = fmt(altFt);
    this.miles.textContent = `${fmt(altFt / 5280, 1)} MI`;
    const vs = t.verticalSpeed * FT * 60;
    this.trend.textContent = vs > 500 ? '▲' : vs < -500 ? '▼' : '';
    this.maxSpeed.textContent = `MAX M${fmt(t.max.mach, 2)}`;
    this.maxAlt.textContent = `MAX ${fmt(t.max.altitude * FT)} FT`;
  }
}
