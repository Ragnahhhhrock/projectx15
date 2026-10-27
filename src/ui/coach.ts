// Flight guide: a step-by-step coach for first-time pilots, like the lessons in Fly Kai Tak.
// Each step names one control, shows a live meter with a target zone, warns in plain words when
// something is off, and moves on by itself once the aircraft does what the step asked.
import type { Telemetry } from '../physics/sim';
import type { ProfileName } from '../render/guide';
import { LAKE } from '../world/terrain';
import { warnings } from './warnings';
import { track } from '../analytics';

const FT = 3.28084;
const KT = 1.94384;
const PSF = 1 / 47.8803;
const PROP_FULL = 8750; // kg, main propellant at drop
const deg = (r: number) => (r * 180) / Math.PI;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** Pitch targets for the climb, deg, matching the autopilot flights the guide boxes were recorded from. */
export const CLIMB_PITCH: Record<ProfileName, number> = { altitude: 54, speed: 25 };
/** Re-entry angle of attack, deg */
export const ENTRY_ALPHA = 20;
/** Re-entry is over below this altitude, ft */
export const ENTRY_END_FT = 70_000;
/** The glide step ends this close to the middle of the lake, m */
export const LAKE_NEAR = 12_000;
/** Lower the gear below this height above the lakebed, ft */
export const GEAR_AGL_FT = 1_500;
/** Target sink rate at touchdown, ft/s (structural limit is about 18) */
export const SINK_TARGET = 10;

export const lakeDistance = (t: Telemetry) => Math.hypot(LAKE.x - t.position[0], LAKE.z - t.position[2]);

/** Degrees the lake lies to the right (+) or left (−) of the nose. */
export function lakeBearing(t: Telemetry): number {
  const bearing = Math.atan2(LAKE.z - t.position[2], LAKE.x - t.position[0]);
  let d = bearing - t.psi;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return deg(d);
}

export interface Meter {
  label: string;
  get: (t: Telemetry) => number;
  min: number;
  max: number;
  /** Target zone, inclusive */
  zone?: [number, number];
  fmt: (v: number) => string;
  /** Out-of-limits values turn the bar red */
  bad?: (v: number) => boolean;
}

export interface Ctx {
  profile: ProfileName;
}

export interface Step {
  id: string;
  title: string | ((c: Ctx) => string);
  body: (t: Telemetry | null, c: Ctx) => string;
  meter?: (c: Ctx) => Meter;
  done?: (t: Telemetry, c: Ctx) => boolean;
  warn?: (t: Telemetry, c: Ctx) => string;
  /** Wait for a button (or Enter) instead of a condition */
  manual?: string;
  final?: boolean;
}

const k = (key: string) => `<kbd>${key}</kbd>`;
const engineOut = (t: Telemetry) => t.engine === 'burnout' || t.engine === 'shutdown';

/** Warnings that matter in any phase of flight. */
function common(t: Telemetry): string {
  const w = warnings(t);
  if (w.terrain) return 'Sink rate! Pull the nose up now.';
  if (w.gearUnsafe) return `Gear is still up! Press ${k('L')} now.`;
  if (w.gHigh) return `Over ${t.nz > 0 ? '7' : '−3.5'} g: ease off the stick before the airframe breaks.`;
  if (w.qHigh) return `Dynamic pressure ${fmt(t.qbar * PSF)} psf, over the 2,500 limit. Raise the nose to slow down.`;
  return '';
}

function wingsWarn(t: Telemetry, limit = 25): string {
  const bank = deg(t.phi);
  return Math.abs(bank) > limit ? `Level the wings: roll ${bank > 0 ? 'left' : 'right'} with ${bank > 0 ? `${k('A')} or ${k('←')}` : `${k('D')} or ${k('→')}`}.` : '';
}

export const STEPS: Step[] = [
  {
    id: 'welcome',
    title: 'Welcome to the X-15',
    manual: 'Start the guide',
    body: (_t, c) =>
      `You are hanging under the right wing of the NB-52 at <b>45,000 ft</b>, Mach 0.8. An X-15 flight is: <b>drop</b>, <b>light the rocket</b>, <b>pull up</b>, <b>coast over the top</b>, <b>re-enter</b>, <b>glide to Rogers Dry Lake</b>, <b>land</b>. ` +
      `Fly through the magenta boxes; the next one is yellow. This guide flies the <b>${c.profile}</b> profile (${k('J')} to switch).`,
  },
  {
    id: 'drop',
    title: 'Drop from the B-52',
    body: () => `Press ${k('Space')} to release. The X-15 falls away nose-down for a moment. That is normal.`,
    done: (t) => !t.attached,
  },
  {
    id: 'ignite',
    title: 'Light the XLR99',
    body: () => `Press ${k('I')} to light the rocket engine. Ignition takes about a second, then 57,000 lbf pushes you back in the seat.`,
    done: (t) => t.engine === 'running',
    warn: (t) => (t.engine === 'off' && t.verticalSpeed * FT < -150 ? `You are sinking. Press ${k('I')} to light the engine.` : common(t)),
  },
  {
    id: 'throttle',
    title: 'Full throttle',
    body: () => `Keep the throttle at <b>100%</b>: hold ${k('X')} to open it, ${k('Z')} to close it. The XLR99 will not run below 50%.`,
    meter: () => ({ label: 'Throttle', get: (t) => t.throttle * 100, min: 0, max: 100, zone: [97, 100], fmt: (v) => `${Math.round(v)}%` }),
    done: (t) => t.throttle >= 0.97,
  },
  {
    id: 'pullup',
    title: (c) => `Pull up to ${CLIMB_PITCH[c.profile]}°`,
    body: (_t, c) =>
      `Hold ${k('S')} (or ${k('↓')}) to raise the nose until the pitch reads <b>${CLIMB_PITCH[c.profile]}°</b>, then let go. ` +
      (c.profile === 'altitude' ? 'This steep climb takes you out of the atmosphere.' : 'A shallow climb keeps the rocket pushing you faster, not higher.'),
    meter: (c) => {
      const p = CLIMB_PITCH[c.profile];
      return { label: 'Pitch', get: (t) => deg(t.theta), min: -10, max: 70, zone: [p - 4, p + 4], fmt: (v) => `${v.toFixed(0)}°`, bad: (v) => v > p + 10 };
    },
    done: (t, c) => deg(t.theta) >= CLIMB_PITCH[c.profile] - 4,
    warn: (t) => common(t) || wingsWarn(t) || (t.nz > 4 ? 'Pulling hard: ease off the stick, a smooth pull is enough.' : ''),
  },
  {
    id: 'boost',
    title: (c) => (c.profile === 'altitude' ? 'Hold the climb until burnout' : 'Level off and build speed'),
    body: (_t, c) =>
      c.profile === 'altitude'
        ? `Hold the nose at <b>54°</b> with small taps of ${k('W')} and ${k('S')}, wings level. The rocket burns for about <b>85 seconds</b> and takes you past Mach 5.`
        : `As you pass <b>82,000 ft</b>, ease the nose down with ${k('W')} into a shallow climb of about <b>3°</b> and hold it. Every bit of thrust now goes into speed. Bob White's record is <b>Mach 6.04</b>.`,
    meter: (c) =>
      c.profile === 'altitude'
        ? { label: 'Propellant', get: (t) => (t.mainProp / PROP_FULL) * 100, min: 0, max: 100, fmt: (v) => `${Math.round(v)}%` }
        : { label: 'Mach', get: (t) => t.mach, min: 0, max: 7, zone: [6.04, 7], fmt: (v) => v.toFixed(2) },
    done: (t) => engineOut(t),
    warn: (t, c) => {
      const w = common(t) || wingsWarn(t, 20);
      if (w) return w;
      const pitch = deg(t.theta);
      const alt = t.altitude * FT;
      if (c.profile === 'altitude') {
        if (pitch < 46) return `Nose too low: ${pitch.toFixed(0)}°. Tap ${k('S')} to bring it back to 54°.`;
        if (pitch > 62) return `Nose too high: ${pitch.toFixed(0)}°. Tap ${k('W')} to bring it back to 54°.`;
      } else {
        if (alt > 85_000 && t.verticalSpeed * FT * 60 > 25_000) return `Still climbing fast. Ease the nose down with ${k('W')}.`;
        if (alt < 75_000 && t.verticalSpeed < -20) return `Descending into thick air. Raise the nose a little with ${k('S')}.`;
      }
      return '';
    },
  },
  {
    id: 'coast',
    title: 'Coast over the top',
    body: (t) =>
      `The engine is out and you are flying a ballistic arc. The air is too thin for the tail, so the <b>reaction control jets</b> steer the X-15 (now <b>${t?.rcsOn ? 'on' : 'off'}</b>, ${k('R')} toggles). ` +
      'Keep the wings level and the nose near your direction of travel. Above <b>264,000 ft</b> you earn astronaut wings.',
    meter: () => ({ label: 'Altitude', get: (t) => t.altitude * FT, min: 0, max: 380_000, zone: [264_000, 380_000], fmt: (v) => `${fmt(v)} ft` }),
    done: (t) => engineOut(t) && t.verticalSpeed < 0,
    warn: (t) => {
      if (!t.rcsOn && t.altitude * FT > 100_000) return `Reaction controls are off. Press ${k('R')} to steer in near-space.`;
      if (t.rcsProp <= 0.5) return 'Reaction control fuel is gone. Let the aircraft ride it out.';
      return common(t) || wingsWarn(t, 30);
    },
  },
  {
    id: 'entry',
    title: `Re-entry: hold ${ENTRY_ALPHA}° alpha`,
    body: () =>
      `You are falling back into the atmosphere. Pull the nose up to about <b>${ENTRY_ALPHA}° angle of attack</b> (α on the HUD) so the air slows you down. ` +
      `If the g climbs past <b>5</b>, ease off. This step ends below ${fmt(ENTRY_END_FT)} ft.`,
    meter: () => ({ label: 'Angle of attack', get: (t) => deg(t.alpha), min: -5, max: 35, zone: [ENTRY_ALPHA - 3, ENTRY_ALPHA + 3], fmt: (v) => `${v.toFixed(1)}°`, bad: (v) => v > 30 }),
    done: (t) => engineOut(t) && t.verticalSpeed < 0 && t.altitude * FT < ENTRY_END_FT,
    warn: (t) => {
      const w = common(t) || wingsWarn(t, 20);
      if (w) return w;
      if (t.nz > 5) return `${t.nz.toFixed(1)} g: ease the nose down a little with ${k('W')}.`;
      const a = deg(t.alpha);
      if (t.altitude * FT < 200_000 && a < ENTRY_ALPHA - 6) return `Alpha only ${a.toFixed(0)}°. Hold ${k('S')} to raise the nose.`;
      return '';
    },
  },
  {
    id: 'glide',
    title: 'Glide to Rogers Dry Lake',
    body: (t) => {
      const b = t ? lakeBearing(t) : 0;
      const dir = Math.abs(b) < 10 ? 'dead ahead' : `${Math.abs(b).toFixed(0)}° to your ${b > 0 ? 'right' : 'left'}`;
      return `Lower the nose and glide; the X-15 has no engine left, so height is your fuel. The lake is <b>${dir}</b>. Bank gently toward it and keep the speed above <b>250 kt</b>.`;
    },
    meter: () => ({ label: 'Lake', get: (t) => lakeDistance(t) / 1000, min: 0, max: 150, zone: [0, LAKE_NEAR / 1000], fmt: (v) => `${v.toFixed(0)} km` }),
    done: (t) => engineOut(t) && lakeDistance(t) < LAKE_NEAR,
    warn: (t) => {
      const w = common(t);
      if (w) return w;
      const b = lakeBearing(t);
      if (Math.abs(b) > 20) return `The lake is ${Math.abs(b).toFixed(0)}° to your ${b > 0 ? 'right' : 'left'}. Bank ${b > 0 ? 'right' : 'left'}, then level out once it is ahead.`;
      if (Math.abs(deg(t.phi)) > 60) return 'Bank too steep: roll back toward level.';
      if (t.mach < 0.9 && t.speed * KT < 230) return `Too slow: ${fmt(t.speed * KT)} kt. Lower the nose with ${k('W')}.`;
      return '';
    },
  },
  {
    id: 'ventral',
    title: 'Jettison the ventral fin',
    body: () => `Press ${k('K')} to drop the lower ventral fin. It hangs below the landing skids and would strike the lakebed.`,
    done: (t) => !t.ventralAttached,
    warn: (t) => common(t),
  },
  {
    id: 'gear',
    title: 'Landing gear down',
    body: () => `Line up with the lakebed and descend. Below about <b>${fmt(GEAR_AGL_FT)} ft</b> above the lakebed, press ${k('L')} to lower the nose wheel and skids. They add drag and cannot come back up.`,
    meter: () => ({ label: 'Height above ground', get: (t) => t.agl * FT, min: 0, max: 10_000, zone: [0, GEAR_AGL_FT], fmt: (v) => `${fmt(v)} ft` }),
    done: (t) => t.gearDown,
    warn: (t) => common(t) || wingsWarn(t, 30),
  },
  {
    id: 'flare',
    title: 'Flare and touch down',
    body: () => `Just above the lakebed, raise the nose to about <b>8°</b> with ${k('S')} and let the X-15 settle onto the skids. Keep the sink rate under <b>${SINK_TARGET} ft/s</b>.`,
    meter: () => ({ label: 'Sink rate', get: (t) => Math.max(0, -t.verticalSpeed * FT), min: 0, max: 40, zone: [0, SINK_TARGET], fmt: (v) => `${v.toFixed(1)} ft/s`, bad: (v) => v > 16 }),
    done: (t) => t.touchdown !== null,
    warn: (t) => {
      const w = common(t) || wingsWarn(t, 10);
      if (w) return w;
      if (t.agl * FT < 100 && deg(t.theta) < 3) return `Nose too low for touchdown. Raise it to about 8° with ${k('S')}.`;
      return '';
    },
  },
  {
    id: 'rollout',
    title: 'Slide to a stop',
    body: () => 'You are down on the skids. Keep the nose up for a moment, then let it down gently onto the nose wheel. Wings level until you stop.',
    meter: () => ({ label: 'Ground speed', get: (t) => t.speed * KT, min: 0, max: 220, fmt: (v) => `${fmt(v)} kt` }),
    done: (t) => t.landed,
    warn: (t) => wingsWarn(t, 5),
  },
  {
    id: 'complete',
    title: 'Flight complete',
    final: true,
    body: (t) =>
      `You flew the X-15 from the B-52 drop to Rogers Dry Lake` +
      (t ? `: <b>Mach ${t.max.mach.toFixed(2)}</b>, <b>${fmt(t.max.altitude * FT)} ft</b>, ${t.max.nz.toFixed(1)} g peak.` : '.') +
      ` Now try the other profile (${k('J')}), or fly without the boxes (${k('G')}).`,
  },
];

/** Shown instead of a step when the flight ends in a crash. */
export const CRASH: Step = {
  id: 'crash',
  title: 'Flight lost',
  final: true,
  body: (t) => crashTip(t),
};

export function crashTip(t: Telemetry | null): string {
  const r = (t?.crashReason ?? '').toLowerCase();
  if (r.includes('gear up')) return `You touched down with the gear up. Press ${k('L')} below ${fmt(GEAR_AGL_FT)} ft, before the flare.`;
  if (r.includes('ventral')) return `The ventral fin hit the ground. Press ${k('K')} to jettison it before landing.`;
  if (t?.brokeUp) return 'The airframe was overloaded. Keep the g under 7 and the dynamic pressure under 2,500 psf: raise the nose to slow down in thick air.';
  if (r.includes('nose') || r.includes('skid') || r.includes('belly')) return `Touchdown too hard. Flare to about 8° and keep the sink rate under ${SINK_TARGET} ft/s.`;
  return 'Watch the amber warnings on the guide, and stay inside the magenta boxes.';
}

/** The step that matches the aircraft's state, e.g. for a practice scenario or a resumed guide. */
export function pickStep(t: Telemetry, c: Ctx, fresh = false): number {
  const i = (id: string) => STEPS.findIndex((s) => s.id === id);
  if (t.landed) return i('complete');
  if (t.touchdown) return i('rollout');
  if (t.attached) return fresh ? i('welcome') : i('drop');
  if (t.gearDown) return t.ventralAttached ? i('ventral') : i('flare');
  if (!t.ventralAttached) return i('gear');
  if (t.engine === 'off' || t.engine === 'igniting') return i('ignite');
  if (t.engine === 'running') return deg(t.theta) < CLIMB_PITCH[c.profile] - 4 && t.altitude * FT < 60_000 ? i('pullup') : i('boost');
  if (t.verticalSpeed >= 0) return i('coast');
  if (t.altitude * FT >= ENTRY_END_FT) return i('entry');
  if (lakeDistance(t) >= LAKE_NEAR) return i('glide');
  return i('ventral');
}

const STEP_COUNT = STEPS.filter((s) => !s.final).length;
const OK_DELAY = 700; // ms the tick shows before moving on

/** The coach panel. */
export class Coach {
  private el: HTMLElement;
  private i = 0;
  private okAt = 0;
  private sig = '';
  private crashed = false;
  private onState = true;
  private latest: Telemetry | null = null;
  private profile: ProfileName = 'altitude';
  private q = <T extends HTMLElement>(id: string) => this.el.querySelector<T>(`#${id}`)!;
  /** Called when the pilot asks for a new flight from the panel */
  onNewFlight: () => void = () => {};

  constructor(el: HTMLElement) {
    this.el = el;
    try {
      this.onState = localStorage.getItem('x15.coach') !== 'off';
    } catch {
      /* storage blocked: default on */
    }
    const p = new URLSearchParams(location.search).get('guide');
    if (p === '0' || p === 'off') this.onState = false;
    if (p === '1' || p === 'on') this.onState = true;
    this.q('coachSkip').addEventListener('click', () => {
      track('guide_skip', { step: STEPS[this.i].id, index: this.i + 1 });
      this.setOn(false);
    });
    window.addEventListener('keydown', (e) => {
      if (!this.visible || e.code !== 'Enter' || (e.target as HTMLElement)?.tagName === 'BUTTON') return;
      const s = this.step;
      if (s.manual) this.go(this.i + 1);
      else if (s.final) this.onNewFlight();
      else return;
      e.preventDefault();
    });
  }

  get on(): boolean { return this.onState; }
  private get visible(): boolean { return !this.el.hidden; }
  private get step(): Step { return this.crashed ? CRASH : STEPS[this.i]; }
  private get ctx(): Ctx { return { profile: this.profile }; }

  /** B key: turn the guide on or off (remembered between visits). */
  toggle(): void { this.setOn(!this.onState); }

  setOn(on: boolean): void {
    this.onState = on;
    try {
      localStorage.setItem('x15.coach', on ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    if (on) this.start(false);
    else this.el.hidden = true;
  }

  setProfile(p: ProfileName): void {
    if (p === this.profile) return;
    this.profile = p;
    if (this.visible) this.render();
  }

  /** New flight (page load, N, scenario): start from the step that fits. */
  start(fresh: boolean): void {
    this.crashed = false;
    if (!this.onState) {
      this.el.hidden = true;
      return;
    }
    this.i = this.latest ? pickStep(this.latest, this.ctx, fresh) : 0;
    this.okAt = 0;
    this.el.hidden = false;
    this.render();
    track('guide_start', { step: STEPS[this.i].id });
  }

  private go(n: number): void {
    this.i = Math.min(STEPS.length - 1, n);
    this.okAt = 0;
    this.render();
    const s = STEPS[this.i];
    if (s.final) track('guide_complete', { flight_time_s: Math.round(this.latest?.t ?? 0) });
    else track('guide_step', { step: s.id, index: this.i + 1 });
  }

  private render(): void {
    const s = this.step;
    const c = this.ctx;
    this.sig = '';
    const eyebrow = this.q('coachStep');
    eyebrow.classList.remove('ok');
    eyebrow.textContent = s.final ? `Flight guide · ${this.crashed ? 'flight lost' : 'complete'}` : `Flight guide · step ${this.i + 1} of ${STEP_COUNT}`;
    this.q('coachTitle').textContent = typeof s.title === 'function' ? s.title(c) : s.title;
    this.q('coachBody').innerHTML = s.body(this.latest, c);
    this.el.classList.toggle('lost', this.crashed);

    const meterEl = this.q('coachMeter');
    meterEl.hidden = !s.meter;
    if (s.meter) {
      const m = s.meter(c);
      this.q('cmLabel').textContent = m.label;
      const z = this.q('cmZone');
      z.hidden = !m.zone;
      if (m.zone) {
        z.style.left = `${((m.zone[0] - m.min) / (m.max - m.min)) * 100}%`;
        z.style.width = `${Math.max(1.5, ((m.zone[1] - m.zone[0]) / (m.max - m.min)) * 100)}%`;
      }
    }

    const act = this.q('coachActions');
    act.innerHTML = '';
    act.hidden = !(s.manual || s.final);
    const button = (label: string, cls: string, key: string | null, fn: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.innerHTML = `<span>${label}</span>${key ? `<span class="k">${key}</span>` : ''}`;
      b.addEventListener('click', fn);
      act.appendChild(b);
    };
    if (s.manual) button(s.manual, 'x-btn x-btn--primary', 'ENTER', () => this.go(this.i + 1));
    if (s.final) {
      button(this.crashed ? 'Try again' : 'New flight', 'x-btn x-btn--primary', 'ENTER', () => this.onNewFlight());
      button('Close guide', 'x-btn', null, () => { this.el.hidden = true; });
    }
    this.q('coachSkip').hidden = !!s.final;
    this.q('coachDots').innerHTML = STEPS.filter((x) => !x.final)
      .map((_, j) => `<i class="${j < this.i || (s.final && !this.crashed) ? 'd' : j === this.i && !s.final ? 'c' : ''}"></i>`)
      .join('');
    this.q('coachWarn').hidden = true;
  }

  /** Every frame, with the latest telemetry. */
  update(t: Telemetry, now = performance.now()): void {
    const prev = this.latest;
    this.latest = t;
    if (!prev || t.t < prev.t) {
      this.start(!prev || t.attached);
      return;
    }
    if (!this.onState || !this.visible) return;
    if (t.crashed && !this.crashed) {
      this.crashed = true;
      track('guide_crash', { step: STEPS[this.i].id, reason: (t.crashReason ?? '').slice(0, 100) });
      this.render();
      return;
    }
    const s = this.step;
    if (s.final) return;

    if (s.done && !this.okAt && s.done(t, this.ctx)) {
      this.okAt = now;
      const e = this.q('coachStep');
      e.classList.add('ok');
      e.textContent = `✓ ${e.textContent}`;
    }
    if (this.okAt && now - this.okAt > OK_DELAY) {
      this.go(this.i + 1);
      return;
    }

    if (s.meter) {
      const m = s.meter(this.ctx);
      const v = m.get(t);
      const f = Math.min(1, Math.max(0, (v - m.min) / (m.max - m.min)));
      const inZone = !!m.zone && v >= m.zone[0] && v <= m.zone[1];
      const bar = this.q('cmBar');
      bar.classList.toggle('in', inZone || !!this.okAt);
      bar.classList.toggle('bad', !!m.bad?.(v));
      this.q('cmFill').style.width = `${f * 100}%`;
      this.q('cmVal').textContent = m.fmt(v);
    }
    // Live wording (bearing to the lake, RCS state) refreshes about twice a second.
    if ((s.id === 'glide' || s.id === 'coast') && Math.floor(now / 500) !== Math.floor((now - 17) / 500)) {
      this.q('coachBody').innerHTML = s.body(t, this.ctx);
    }

    const w = s.manual ? '' : (s.warn ?? common)(t, this.ctx);
    if (w !== this.sig) {
      this.sig = w;
      const el = this.q('coachWarn');
      el.hidden = !w;
      el.innerHTML = w;
    }
  }
}
