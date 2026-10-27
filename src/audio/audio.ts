// Procedural sound: everything is synthesised with WebAudio from telemetry, no sample files.
import type { Telemetry } from '../physics/sim';
import { warnings } from '../ui/warnings';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private tone!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private layers: Record<string, { gain: GainNode; filter?: BiquadFilterNode }> = {};
  private warn!: { osc: OscillatorNode; gain: GainNode };
  private buffetLfo!: OscillatorNode;
  private muted = false;
  private prev: Telemetry | null = null;
  private prevRates = [0, 0, 0];
  private rcs = 0;

  constructor() {
    const start = () => this.init();
    window.addEventListener('keydown', start, { once: true });
    window.addEventListener('pointerdown', start, { once: true });
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  private init(): void {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    void ctx.resume();

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 12000;
    this.tone.connect(this.master);
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // One shared noise buffer
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    const noiseLayer = (name: string, type: BiquadFilterType, freq: number, q = 0.7) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.tone);
      src.start(0, Math.random() * 2);
      this.layers[name] = { gain: g, filter: f };
    };
    noiseLayer('wind', 'bandpass', 700, 0.6);
    noiseLayer('rocket', 'lowpass', 900, 0.5);
    noiseLayer('crackle', 'bandpass', 3200, 0.9);
    noiseLayer('rcs', 'highpass', 2800, 0.7);
    noiseLayer('buffet', 'lowpass', 140, 0.8);
    noiseLayer('skid', 'bandpass', 900, 1.2);
    noiseLayer('engines', 'lowpass', 520, 0.6);

    const osc = (name: string, type: OscillatorType, freq: number, cutoff: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(f).connect(g).connect(this.tone);
      o.start();
      this.layers[name] = { gain: g, filter: f };
      return o;
    };
    osc('rumble', 'sawtooth', 58, 220);
    osc('carry1', 'sawtooth', 86, 420);
    osc('carry2', 'sawtooth', 92, 420);
    osc('carry3', 'sawtooth', 127, 520);
    osc('carry4', 'sawtooth', 133, 520);
    // Buffet flutter modulates its own layer
    this.buffetLfo = ctx.createOscillator();
    this.buffetLfo.frequency.value = 13;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    this.buffetLfo.connect(depth).connect(this.layers.buffet.gain.gain);
    this.buffetLfo.start();

    // Warning tone
    const wo = ctx.createOscillator();
    wo.type = 'square';
    wo.frequency.value = 880;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 2400;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    wo.connect(wf).connect(wg).connect(this.master);
    wo.start();
    this.warn = { osc: wo, gain: wg };
  }

  private set(name: string, v: number, tc = 0.06): void {
    const l = this.layers[name];
    if (l && this.ctx) l.gain.gain.setTargetAtTime(v, this.ctx.currentTime, tc);
  }

  private burst(dur: number, f0: number, f1: number, gain: number, type: BiquadFilterType = 'lowpass'): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f).connect(g).connect(this.tone);
    src.start(0, Math.random() * 2, dur + 0.1);
  }

  private thump(f0: number, f1: number, dur: number, gain: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(f1, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(this.tone);
    o.start();
    o.stop(ctx.currentTime + dur + 0.05);
  }

  update(t: Telemetry, dt: number, inCockpit: boolean, b52Distance: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const p = this.prev;
    this.prev = t;
    const now = ctx.currentTime;

    this.tone.frequency.setTargetAtTime(inCockpit ? 3800 : 9000, now, 0.1);

    // Events
    if (p && t.t >= p.t) {
      if (p.attached && !t.attached) { this.thump(120, 38, 0.35, 0.8); this.burst(0.15, 3000, 800, 0.5, 'bandpass'); }
      if (p.engine === 'off' && t.engine === 'igniting') { this.burst(0.7, 400, 2500, 0.6, 'bandpass'); this.thump(60, 40, 0.8, 0.5); }
      if (p.engine !== 'off' && t.engine === 'off') { this.burst(1.2, 1800, 120, 0.6); }
      if (!p.gearDown && t.gearDown) { this.burst(0.9, 1200, 400, 0.18, 'bandpass'); setTimeout(() => this.ctx && this.thump(90, 45, 0.25, 0.6), 850); }
      if (p.ventralAttached && !t.ventralAttached) { this.thump(160, 50, 0.3, 0.7); this.burst(0.25, 2500, 500, 0.4, 'bandpass'); }
      if (!p.touchdown && t.touchdown && !t.crashed) { this.thump(80, 35, 0.4, 0.9); this.burst(0.3, 1200, 200, 0.5); }
      if (!p.crashed && t.crashed) {
        this.burst(3.5, 900, 50, 1.2);
        this.thump(75, 22, 1.8, 1.2);
        this.burst(0.2, 4000, 600, 0.8, 'bandpass');
      }
    }
    if (p && t.t < p.t - 0.5) {
      this.rcs = 0;
    }

    const dead = t.crashed;
    const thrustFrac = clamp01(t.thrust / 253500);
    const qn = clamp01(t.qbar / 40000);

    // Wind
    this.set('wind', dead ? 0 : Math.pow(qn, 0.8) * (inCockpit ? 0.28 : 0.4), 0.15);
    this.layers.wind?.filter?.frequency.setTargetAtTime(250 + 2800 * clamp01(t.qbar / 70000), now, 0.2);

    // Rocket
    this.set('rocket', dead ? 0 : thrustFrac * 0.55, 0.12);
    this.set('rumble', dead ? 0 : thrustFrac * 0.5, 0.12);
    this.set('crackle', dead ? 0 : thrustFrac * 0.09, 0.12);
    this.layers.rocket?.filter?.frequency.setTargetAtTime(500 + 1600 * thrustFrac, now, 0.15);

    // B-52 engines while carried, fading with distance after release
    const carry = dead ? 0 : t.attached ? 0.34 : 0.34 * Math.exp(-Math.max(0, b52Distance) / 2500);
    this.set('engines', carry * 1.6, 0.4);
    for (const k of ['carry1', 'carry2', 'carry3', 'carry4']) this.set(k, carry * 0.1, 0.4);

    // Reaction control jets: hiss with body-rate changes when the air is thin
    const rates = [t.p, t.q, t.r];
    const dRate = dt > 0 ? Math.hypot(rates[0] - this.prevRates[0], rates[1] - this.prevRates[1], rates[2] - this.prevRates[2]) / dt : 0;
    this.prevRates = rates;
    const thin = t.qbar < 2500 && t.rcsOn && !t.attached;
    this.rcs += ((thin ? clamp01(dRate / 0.6) : 0) - this.rcs) * Math.min(1, dt * 12);
    this.set('rcs', dead ? 0 : this.rcs * 0.3, 0.03);

    // Transonic buffet
    const buf = Math.exp(-Math.pow((t.mach - 1.0) / 0.12, 2)) * clamp01(t.qbar / 9000);
    this.set('buffet', dead || t.attached ? 0 : buf * 0.8, 0.1);

    // Skids and wheel on the ground
    const rolling = t.onGround && !dead && !t.landed ? clamp01(t.speed / 50) : 0;
    this.set('skid', rolling * (t.gearDown ? 0.18 : 0.5) * (t.damaged ? 1.4 : 1), 0.1);
    this.layers.skid?.filter?.frequency.setTargetAtTime(500 + 900 * clamp01(t.speed / 100), now, 0.1);

    // Warning tones
    const w = warnings(t);
    let tone = 0;
    let f = 880;
    const phase = Math.floor(now * 4) % 2;
    if (w.terrain) { tone = phase ? 1 : 0.0; f = Math.floor(now * 2) % 2 ? 620 : 880; tone = 1; }
    else if (w.gearUnsafe) { tone = Math.floor(now * 3) % 2; f = 440; }
    else if (w.qHigh || w.gHigh) { tone = phase; f = 1040; }
    this.warn.osc.frequency.setTargetAtTime(f, now, 0.01);
    this.warn.gain.gain.setTargetAtTime(dead ? 0 : tone * 0.06, now, 0.01);
  }
}
