// Canvas-drawn instrument panel: ADI, altimeter, Mach, VSI, accelerometer, q, alpha/beta,
// compass with lake bearing, thrust, propellant and warning lights.
import type { Telemetry } from '../physics/sim';
import { LAKE } from '../world/terrain';
import { warnings } from './warnings';

const FT = 3.28084;
const RAD = Math.PI / 180;
const W = 1024;
const H = 720;

const FACE = '#0c0d0f';
const BEZEL = '#2a2c30';
const INK = '#e9e6dc';
const DIM = '#8a8d92';
const AMBER = '#f0a020';
const RED = '#e5372b';
const GREEN = '#37c26b';

interface DialOpts {
  min: number;
  max: number;
  major: number;
  minor?: number;
  label?: (v: number) => string;
  title: string;
  readout?: string;
  red?: [number, number];
  a0?: number;
  a1?: number;
}

export class Gauges {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private nzMax = 1;
  private nzMin = 1;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
  }

  private dial(cx: number, cy: number, r: number, o: DialOpts, value: number): void {
    const c = this.ctx;
    const a0 = (o.a0 ?? 135) * RAD;
    const a1 = (o.a1 ?? 405) * RAD;
    this.bezel(cx, cy, r);
    const ang = (v: number) => a0 + ((Math.min(o.max, Math.max(o.min, v)) - o.min) / (o.max - o.min)) * (a1 - a0);
    if (o.red) {
      c.strokeStyle = RED;
      c.lineWidth = r * 0.07;
      c.beginPath();
      c.arc(cx, cy, r * 0.86, ang(o.red[0]), ang(o.red[1]));
      c.stroke();
    }
    c.strokeStyle = INK;
    c.fillStyle = INK;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `600 ${Math.round(r * 0.15)}px "IBM Plex Mono", monospace`;
    const minor = o.minor ?? o.major / 2;
    for (let v = o.min; v <= o.max + 1e-9; v += minor) {
      const isMajor = Math.abs(v / o.major - Math.round(v / o.major)) < 1e-6;
      const a = ang(v);
      const r1 = r * (isMajor ? 0.78 : 0.84);
      c.lineWidth = isMajor ? 2.4 : 1.2;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      c.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
      c.stroke();
      if (isMajor && o.label) c.fillText(o.label(v), cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62);
    }
    this.titleAndReadout(cx, cy, r, o.title, o.readout);
    this.needle(cx, cy, r * 0.82, ang(value));
  }

  private bezel(cx: number, cy: number, r: number): void {
    const c = this.ctx;
    c.fillStyle = BEZEL;
    c.beginPath();
    c.arc(cx, cy, r + 6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = FACE;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
  }

  private titleAndReadout(cx: number, cy: number, r: number, title: string, readout?: string): void {
    const c = this.ctx;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = DIM;
    c.font = `500 ${Math.round(r * 0.13)}px "IBM Plex Sans Condensed", sans-serif`;
    c.fillText(title, cx, cy + r * 0.34);
    if (readout) {
      c.fillStyle = AMBER;
      c.font = `600 ${Math.round(r * 0.17)}px "IBM Plex Mono", monospace`;
      c.fillText(readout, cx, cy + r * 0.52);
    }
  }

  private needle(cx: number, cy: number, len: number, a: number, color = INK, width = 3): void {
    const c = this.ctx;
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = width;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(cx - Math.cos(a) * len * 0.18, cy - Math.sin(a) * len * 0.18);
    c.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    c.stroke();
    c.lineCap = 'butt';
    c.beginPath();
    c.arc(cx, cy, width * 1.8, 0, Math.PI * 2);
    c.fill();
  }

  private altimeter(cx: number, cy: number, r: number, altFt: number): void {
    const c = this.ctx;
    this.bezel(cx, cy, r);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = INK;
    c.strokeStyle = INK;
    c.font = `600 ${Math.round(r * 0.17)}px "IBM Plex Mono", monospace`;
    for (let i = 0; i < 50; i++) {
      const a = (i / 50) * Math.PI * 2 - Math.PI / 2;
      const major = i % 5 === 0;
      c.lineWidth = major ? 2.4 : 1.1;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r * (major ? 0.8 : 0.86), cy + Math.sin(a) * r * (major ? 0.8 : 0.86));
      c.lineTo(cx + Math.cos(a) * r * 0.93, cy + Math.sin(a) * r * 0.93);
      c.stroke();
      if (major) c.fillText(String(i / 5), cx + Math.cos(a) * r * 0.64, cy + Math.sin(a) * r * 0.64);
    }
    this.titleAndReadout(cx, cy, r, 'ALT  FT', Math.round(altFt).toLocaleString('en-US'));
    const a = (frac: number) => frac * Math.PI * 2 - Math.PI / 2;
    this.needle(cx, cy, r * 0.5, a((altFt / 100000) % 1), AMBER, 5);
    this.needle(cx, cy, r * 0.66, a((altFt / 10000) % 1), INK, 5);
    this.needle(cx, cy, r * 0.84, a((altFt / 1000) % 1), INK, 2.5);
  }

  private vsi(cx: number, cy: number, r: number, fpm: number): void {
    const c = this.ctx;
    this.bezel(cx, cy, r);
    // Square-root scale: zero at 9 o'clock, climbs sweep clockwise over the top, dives below
    const angOf = (v: number) => {
      const s = Math.sqrt(Math.min(1, Math.abs(v) / 100000)) * 150 * RAD;
      return v >= 0 ? Math.PI + s : Math.PI - s;
    };
    c.fillStyle = INK;
    c.strokeStyle = INK;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `600 ${Math.round(r * 0.14)}px "IBM Plex Mono", monospace`;
    for (const m of [0, 1000, 2000, 4000, 10000, 20000, 40000, 100000]) {
      for (const sgn of m === 0 ? [1] : [1, -1]) {
        const a = angOf(m * sgn);
        c.lineWidth = 2.2;
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78);
        c.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
        c.stroke();
        c.fillText(m === 0 ? '0' : String(m / 1000), cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62);
      }
    }
    this.titleAndReadout(cx, cy, r, 'VERT SPEED x1000', Math.round(fpm).toLocaleString('en-US'));
    this.needle(cx, cy, r * 0.82, angOf(fpm));
  }

  private adi(cx: number, cy: number, r: number, theta: number, phi: number): void {
    const c = this.ctx;
    this.bezel(cx, cy, r);
    c.save();
    c.beginPath();
    c.arc(cx, cy, r - 2, 0, Math.PI * 2);
    c.clip();
    c.translate(cx, cy);
    c.rotate(-phi);
    const k = r / 42; // px per degree
    const dy = theta * (180 / Math.PI) * k;
    c.translate(0, dy);
    c.fillStyle = '#3d78c6';
    c.fillRect(-2 * r, -4 * r, 4 * r, 4 * r);
    c.fillStyle = '#7a4f28';
    c.fillRect(-2 * r, 0, 4 * r, 4 * r);
    c.strokeStyle = '#fff';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-2 * r, 0);
    c.lineTo(2 * r, 0);
    c.stroke();
    c.fillStyle = '#fff';
    c.font = `600 ${Math.round(r * 0.1)}px "IBM Plex Mono", monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 2;
    for (let p = -90; p <= 90; p += 5) {
      if (p === 0) continue;
      const y = -p * k;
      const len = p % 10 === 0 ? r * 0.34 : r * 0.17;
      c.beginPath();
      c.moveTo(-len, y);
      c.lineTo(len, y);
      c.stroke();
      if (p % 10 === 0 && Math.abs(p) <= 80) {
        c.fillText(String(Math.abs(p)), -len - r * 0.1, y);
        c.fillText(String(Math.abs(p)), len + r * 0.1, y);
      }
    }
    c.restore();
    // Bank scale (fixed) and pointer (rotates with the sky)
    c.save();
    c.translate(cx, cy);
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    for (const d of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const a = (d - 90) * RAD;
      const l = d === 0 || Math.abs(d) === 30 || Math.abs(d) === 60 ? 0.12 : 0.07;
      c.beginPath();
      c.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
      c.lineTo(Math.cos(a) * r * (0.9 - l), Math.sin(a) * r * (0.9 - l));
      c.stroke();
    }
    c.rotate(-phi);
    c.fillStyle = AMBER;
    c.beginPath();
    c.moveTo(0, -r * 0.9);
    c.lineTo(-r * 0.05, -r * 0.8);
    c.lineTo(r * 0.05, -r * 0.8);
    c.fill();
    c.restore();
    // Aircraft symbol
    c.strokeStyle = AMBER;
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(cx - r * 0.55, cy);
    c.lineTo(cx - r * 0.2, cy);
    c.lineTo(cx - r * 0.1, cy + r * 0.1);
    c.moveTo(cx + r * 0.55, cy);
    c.lineTo(cx + r * 0.2, cy);
    c.lineTo(cx + r * 0.1, cy + r * 0.1);
    c.stroke();
    c.fillStyle = AMBER;
    c.fillRect(cx - 3, cy - 3, 6, 6);
    c.fillStyle = DIM;
    c.font = `500 ${Math.round(r * 0.09)}px "IBM Plex Sans Condensed", sans-serif`;
    c.textAlign = 'center';
    c.fillText('ATTITUDE', cx, cy + r * 0.78);
  }

  private compass(cx: number, cy: number, r: number, hdg: number, lakeBearing: number, range: number): void {
    const c = this.ctx;
    this.bezel(cx, cy, r);
    c.save();
    c.translate(cx, cy);
    c.rotate(-hdg);
    c.fillStyle = INK;
    c.strokeStyle = INK;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `600 ${Math.round(r * 0.15)}px "IBM Plex Mono", monospace`;
    for (let d = 0; d < 360; d += 10) {
      const a = (d - 90) * RAD;
      const major = d % 30 === 0;
      c.lineWidth = major ? 2.4 : 1.2;
      c.beginPath();
      c.moveTo(Math.cos(a) * r * (major ? 0.78 : 0.85), Math.sin(a) * r * (major ? 0.78 : 0.85));
      c.lineTo(Math.cos(a) * r * 0.93, Math.sin(a) * r * 0.93);
      c.stroke();
      if (major) {
        const t = d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : String(d / 10);
        c.save();
        c.translate(Math.cos(a) * r * 0.64, Math.sin(a) * r * 0.64);
        c.rotate(d * RAD);
        c.fillText(t, 0, 0);
        c.restore();
      }
    }
    // Lake bearing marker on the card
    const lb = (lakeBearing - 90) * RAD;
    c.fillStyle = GREEN;
    c.beginPath();
    c.moveTo(Math.cos(lb) * r * 0.9, Math.sin(lb) * r * 0.9);
    c.lineTo(Math.cos(lb + 0.12) * r * 0.66, Math.sin(lb + 0.12) * r * 0.66);
    c.lineTo(Math.cos(lb - 0.12) * r * 0.66, Math.sin(lb - 0.12) * r * 0.66);
    c.fill();
    c.restore();
    // Lubber line
    c.fillStyle = AMBER;
    c.beginPath();
    c.moveTo(cx, cy - r * 0.97);
    c.lineTo(cx - 7, cy - r * 1.1);
    c.lineTo(cx + 7, cy - r * 1.1);
    c.fill();
    c.fillStyle = INK;
    c.font = `600 ${Math.round(r * 0.2)}px "IBM Plex Mono", monospace`;
    c.textAlign = 'center';
    c.fillText(String(Math.round(hdg / RAD + 360) % 360).padStart(3, '0') + '°', cx, cy - r * 0.18);
    c.fillStyle = GREEN;
    c.font = `500 ${Math.round(r * 0.13)}px "IBM Plex Mono", monospace`;
    c.fillText(`LAKE ${Math.round(range / 1000)} KM`, cx, cy + r * 0.12);
    c.fillStyle = DIM;
    c.font = `500 ${Math.round(r * 0.12)}px "IBM Plex Sans Condensed", sans-serif`;
    c.fillText('HEADING', cx, cy + r * 0.34);
  }

  private bars(x: number, y: number, h: number, items: { label: string; frac: number; color: string }[]): void {
    const c = this.ctx;
    const w = 54;
    items.forEach((it, i) => {
      const bx = x + i * (w + 18);
      c.fillStyle = FACE;
      c.strokeStyle = BEZEL;
      c.lineWidth = 5;
      c.fillRect(bx, y, w, h);
      c.strokeRect(bx, y, w, h);
      c.fillStyle = it.frac < 0.12 ? RED : it.color;
      const fh = Math.max(0, Math.min(1, it.frac)) * (h - 6);
      c.fillRect(bx + 3, y + h - 3 - fh, w - 6, fh);
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.lineWidth = 1;
      for (let k = 1; k < 10; k++) {
        c.beginPath();
        c.moveTo(bx, y + (h * k) / 10);
        c.lineTo(bx + w, y + (h * k) / 10);
        c.stroke();
      }
      c.fillStyle = DIM;
      c.font = '500 15px "IBM Plex Sans Condensed", sans-serif';
      c.textAlign = 'center';
      c.fillText(it.label, bx + w / 2, y - 12);
      c.fillStyle = INK;
      c.font = '600 15px "IBM Plex Mono", monospace';
      c.fillText(`${Math.round(it.frac * 100)}%`, bx + w / 2, y + h + 18);
    });
  }

  private lamp(x: number, y: number, w: number, text: string, color: string | null, blink = false, t = 0): void {
    const c = this.ctx;
    const lit = color && (!blink || Math.floor(t * 3) % 2 === 0);
    c.fillStyle = lit ? color! : '#17181b';
    c.strokeStyle = BEZEL;
    c.lineWidth = 4;
    c.beginPath();
    c.roundRect(x, y, w, 40, 6);
    c.fill();
    c.stroke();
    c.fillStyle = lit ? '#0a0a0a' : '#4a4d52';
    c.font = '700 17px "IBM Plex Sans Condensed", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, x + w / 2, y + 21);
  }

  update(t: Telemetry, wall: number): void {
    const c = this.ctx;
    c.fillStyle = '#1a1b1e';
    c.fillRect(0, 0, W, H);
    // Subtle panel grain
    c.fillStyle = 'rgba(255,255,255,0.025)';
    for (let i = 0; i < 80; i++) c.fillRect((i * 97) % W, (i * 53) % H, 140, 1);

    const altFt = t.altitude * FT;
    const keas = Math.sqrt((2 * t.qbar) / 1.225) * 1.94384;
    this.altimeter(105, 190, 92, altFt);
    this.dial(278, 190, 92, { min: 0, max: 7, major: 1, minor: 0.25, label: (v) => String(v), title: 'MACH', readout: t.mach.toFixed(2) }, t.mach);
    this.adi(512, 190, 150, t.theta, t.phi);
    this.vsi(746, 190, 92, t.verticalSpeed * FT * 60);
    // Accelerometer with max marker
    this.nzMax = Math.max(this.nzMax, t.nz);
    this.nzMin = Math.min(this.nzMin, t.nz);
    if (t.t < 1) { this.nzMax = 1; this.nzMin = 1; }
    this.dial(919, 190, 92, { min: -4, max: 10, major: 2, minor: 1, label: (v) => String(v), title: 'G', readout: t.nz.toFixed(1), red: [7.33, 10] }, t.nz);

    this.dial(105, 470, 92, { min: 0, max: 3500, major: 500, minor: 250, label: (v) => String(v / 100), title: 'Q  PSF x100', readout: Math.round(t.qbar / 47.8803).toLocaleString('en-US'), red: [2500, 3500] }, t.qbar / 47.8803);
    this.dial(278, 470, 92, { min: -10, max: 30, major: 10, minor: 5, label: (v) => String(v), title: 'ALPHA', readout: `${(t.alpha / RAD).toFixed(1)}°`, red: [20, 30] }, t.alpha / RAD);
    // Sideslip slider under the alpha dial
    const bx = 278 + Math.max(-1, Math.min(1, t.beta / (10 * RAD))) * 60;
    c.fillStyle = FACE;
    c.fillRect(218, 576, 120, 14);
    c.fillStyle = AMBER;
    c.fillRect(bx - 4, 573, 8, 20);
    c.fillStyle = DIM;
    c.font = '500 13px "IBM Plex Sans Condensed", sans-serif';
    c.textAlign = 'center';
    c.fillText('BETA', 278, 606);

    const dx = LAKE.x - t.position[0];
    const dz = LAKE.z - t.position[2];
    const lakeBearing = (Math.atan2(dz, dx) / RAD + 90 + 360) % 360;
    const hdg = t.psi + Math.PI / 2;
    this.compass(512, 500, 116, hdg, lakeBearing, Math.hypot(dx, dz));

    this.dial(746, 470, 92, { min: 0, max: 100, major: 20, minor: 10, label: (v) => String(v), title: 'THRUST %', readout: Math.round((t.thrust / 253500) * 100) + '' }, (t.thrust / 253500) * 100);
    this.bars(870, 395, 160, [
      { label: 'MAIN', frac: t.mainProp / 8750, color: '#3aa0ff' },
      { label: 'RCS', frac: t.rcsProp / 50, color: '#a8e05a' },
    ]);
    c.fillStyle = DIM;
    c.font = '500 14px "IBM Plex Sans Condensed", sans-serif';
    c.textAlign = 'left';
    c.fillText('PROPELLANT', 872, 592);
    // Digital clock and EAS
    c.fillStyle = FACE;
    c.fillRect(870, 604, 126, 34);
    c.fillStyle = AMBER;
    c.font = '600 20px "IBM Plex Mono", monospace';
    c.textAlign = 'center';
    const mm = Math.floor(Math.max(0, t.t) / 60);
    const ss = Math.floor(Math.max(0, t.t) % 60);
    c.fillText(`T+ ${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, 933, 622);
    c.fillStyle = DIM;
    c.font = '500 14px "IBM Plex Mono", monospace';
    c.fillText(`KEAS ${Math.round(keas)}`, 933, 654);

    // Warning lights
    const w = warnings(t);
    const y = 676;
    const lw = 118;
    const gap = 8;
    const lamps: [string, string | null, boolean][] = [
      ['GEAR', t.gearDown ? GREEN : w.gearUnsafe ? RED : null, w.gearUnsafe],
      ['FIN ON', t.ventralAttached ? GREEN : AMBER, false],
      ['ENGINE', t.engine === 'running' ? GREEN : t.engine === 'igniting' ? AMBER : null, false],
      ['RCS', t.rcsOn ? GREEN : null, false],
      ['SAS', t.sasOn ? GREEN : null, false],
      ['Q LIMIT', w.qHigh ? RED : w.qCaution ? AMBER : null, w.qHigh],
      ['G LIMIT', w.gHigh ? RED : w.gCaution ? AMBER : null, w.gHigh],
      ['TERRAIN', w.terrain ? RED : null, true],
    ];
    lamps.forEach(([text, color, blink], i) => this.lamp(10 + i * (lw + gap), y, lw, text, color, blink, wall));
  }
}
