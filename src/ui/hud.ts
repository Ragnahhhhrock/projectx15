// Text HUD (placeholder until the 1960s cockpit gauges in M4).
import type { Telemetry } from '../physics/sim';

const FT = 3.28084;
const KT = 1.94384;
const PSF = 1 / 47.8803;
const deg = (r: number) => (r * 180) / Math.PI;
const fmt = (n: number, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

function phaseLabel(t: Telemetry): string {
  if (t.crashed) return `${t.brokeUp ? 'AIRFRAME FAILURE' : 'CRASHED'}${t.crashReason ? ` — ${t.crashReason.toUpperCase()}` : ''} — N TO RESET`;
  if (t.landed) return t.damaged ? 'LANDED — AIRCRAFT DAMAGED — N TO RESET' : 'LANDED — N TO RESET';
  if (t.attached) return 'CAPTIVE CARRY — SPACE TO RELEASE';
  if (t.engine === 'igniting') return 'IGNITION';
  if (t.engine === 'running') return 'POWERED';
  if (t.engine === 'off' && t.t < 60) return 'RELEASED — I TO IGNITE';
  return t.verticalSpeed >= 0 ? 'COAST' : 'DESCENT';
}

export class Hud {
  private el: HTMLElement;
  private status: HTMLElement;

  constructor(el: HTMLElement, status: HTMLElement) {
    this.el = el;
    this.status = status;
  }

  update(t: Telemetry, extra: { paused: boolean; timescale: number; muted: boolean; camera: string; guide: string | null; gwarn?: string | null }): void {
    const rows: [string, string][] = [
      ['MACH', fmt(t.mach, 2)],
      ['ALT', `${fmt(t.altitude * FT)} ft`],
      ['AGL', `${fmt(t.agl * FT)} ft`],
      ['TAS', `${fmt(t.speed * KT)} kt`],
      ['V/S', `${fmt(t.verticalSpeed * FT * 60)} fpm`],
      ['α / β', `${fmt(deg(t.alpha), 1)}° / ${fmt(deg(t.beta), 1)}°`],
      ['PITCH', `${fmt(deg(t.theta), 1)}°`],
      ['BANK', `${fmt(deg(t.phi), 1)}°`],
      ['Nz', `${fmt(t.nz, 1)} g`],
      ['q', `${fmt(t.qbar * PSF)} psf`],
      ['ENGINE', `${t.engine.toUpperCase()} ${fmt(t.throttle * 100)}%`],
      ['THRUST', `${fmt(t.thrust * 0.224809)} lbf`],
      ['PROP', `${fmt((t.mainProp / 8750) * 100)}%`],
      ['RCS', `${t.rcsOn ? 'ON' : 'OFF'} ${fmt((t.rcsProp / 50) * 100)}%`],
      ['SAS', t.sasOn ? 'ON' : 'OFF'],
      ['GEAR / FIN', `${t.gearDown ? 'DOWN' : 'UP'} / ${t.ventralAttached ? 'ON' : 'GONE'}`],
      ['T+', `${fmt(t.t, 1)} s`],
      ['MAX', `M${fmt(t.max.mach, 2)} · ${fmt(t.max.altitude * FT)} ft · ${fmt(t.max.nz, 1)} g`],
    ];
    this.el.innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    const flags = [extra.gwarn ?? '', extra.paused ? 'PAUSED' : '', extra.muted ? 'MUTED' : '', extra.timescale !== 1 ? `${extra.timescale}×` : '', extra.camera.toUpperCase(), extra.guide ? `GUIDE ${extra.guide.toUpperCase()}` : ''].filter(Boolean);
    this.status.textContent = `${phaseLabel(t)}   ${flags.join(' · ')}`;
  }
}
