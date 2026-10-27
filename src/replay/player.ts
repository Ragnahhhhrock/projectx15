// Highlight replay: plays the recorded clips back in sequence with a progress strip and title cards.
import type { Telemetry } from '../physics/sim';
import type { Clip, FlightRecorder, Highlight } from './recorder';

export const REPLAY_SPEEDS = [1, 2, 0.5];
const CARD_LEAD = 1.5; // s before a highlight its title card appears
const CARD_HOLD = 4; // s after

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export class ReplayPlayer {
  active = false;
  paused = false;
  speed = 1;
  private clips: Clip[] = [];
  private index = 0;
  private time = 0;
  private el: HTMLElement;
  private bar: HTMLElement;
  private track: HTMLElement;
  private head: HTMLElement;
  private card: HTMLElement;
  private cardKey = '';

  constructor(private recorder: FlightRecorder, el: HTMLElement) {
    this.el = el;
    el.innerHTML = `
      <div class="rp-bar"></div>
      <div class="rp-track"><div class="rp-head"></div></div>
      <div class="rp-card" hidden></div>`;
    this.bar = el.querySelector('.rp-bar')!;
    this.track = el.querySelector('.rp-track')!;
    this.head = el.querySelector('.rp-head')!;
    this.card = el.querySelector('.rp-card')!;
    el.hidden = true;
  }

  /** Number of highlights in the current recording. */
  get available(): number {
    return this.recorder.highlights().length;
  }

  start(): boolean {
    this.clips = this.recorder.clips();
    if (!this.clips.length) return false;
    this.active = true;
    this.paused = false;
    this.index = 0;
    this.time = this.clips[0].start;
    this.cardKey = '';
    this.buildTrack();
    this.el.hidden = false;
    return true;
  }

  stop(): void {
    this.active = false;
    this.el.hidden = true;
    this.card.hidden = true;
  }

  togglePause(): void {
    this.paused = !this.paused;
  }

  cycleSpeed(): void {
    this.speed = REPLAY_SPEEDS[(REPLAY_SPEEDS.indexOf(this.speed) + 1) % REPLAY_SPEEDS.length];
  }

  next(): void {
    if (this.index < this.clips.length - 1) this.jump(this.index + 1);
    else this.stop();
  }

  prev(): void {
    const c = this.clips[this.index];
    // Restart this clip if we are more than 2 s in, otherwise go back one
    this.jump(c && this.time - c.start > 2 ? this.index : Math.max(0, this.index - 1));
  }

  private jump(i: number): void {
    this.index = i;
    this.time = this.clips[i].start;
  }

  /** Advance by a wall-clock step and return the frame to show, or null when the reel has ended. */
  update(dt: number): Telemetry | null {
    if (!this.active) return null;
    if (!this.paused) {
      this.time += dt * this.speed;
      if (this.time > this.clips[this.index].end) {
        if (this.index === this.clips.length - 1) {
          this.stop();
          return null;
        }
        this.jump(this.index + 1);
      }
    }
    const frame = this.recorder.sample(this.time);
    this.render();
    return frame;
  }

  private buildTrack(): void {
    const total = this.clips.reduce((s, c) => s + (c.end - c.start), 0);
    let x = 0;
    const segs: string[] = [];
    this.clips.forEach((c, i) => {
      const w = ((c.end - c.start) / total) * 100;
      const marks = c.highlights
        .map((h) => `<i style="left:${(((h.t - c.start) / (c.end - c.start)) * 100).toFixed(2)}%" title="${esc(h.title)}"></i>`)
        .join('');
      segs.push(`<div class="rp-seg" data-i="${i}" style="left:${x.toFixed(2)}%;width:calc(${w.toFixed(2)}% - 3px)">${marks}</div>`);
      x += w;
    });
    this.track.querySelectorAll('.rp-seg').forEach((n) => n.remove());
    this.track.insertAdjacentHTML('afterbegin', segs.join(''));
    this.track.querySelectorAll<HTMLElement>('.rp-seg').forEach((n) => {
      n.addEventListener('click', () => this.jump(Number(n.dataset.i)));
    });
  }

  private render(): void {
    const c = this.clips[this.index];
    const total = this.clips.reduce((s, k) => s + (k.end - k.start), 0);
    const before = this.clips.slice(0, this.index).reduce((s, k) => s + (k.end - k.start), 0);
    const pos = (before + Math.min(c.end, Math.max(c.start, this.time)) - c.start) / total;
    this.head.style.left = `${(pos * 100).toFixed(2)}%`;

    const current = this.nearest(c);
    const label = (current ?? c.highlights[0]).title.toUpperCase();
    this.bar.innerHTML =
      `<b>${this.paused ? '❚❚' : '▶'} REPLAY</b><span>HIGHLIGHT ${this.index + 1}/${this.clips.length} · ${esc(label)}</span>` +
      `<span>${this.speed}× · T+${this.time.toFixed(1)} s</span><em>Y EXIT · [ ] SKIP · P PAUSE · T SPEED · C CAMERA</em>`;

    const show = current && this.time >= current.t - CARD_LEAD && this.time <= current.t + CARD_HOLD;
    if (show && current) {
      const key = `${current.kind}@${current.t}`;
      if (key !== this.cardKey) {
        this.cardKey = key;
        this.card.innerHTML = `<div class="rp-title">${esc(current.title)}</div><div class="rp-detail">${esc(current.detail)}</div>`;
        // Restart the entry animation
        this.card.classList.remove('rp-in');
        void this.card.offsetWidth;
        this.card.classList.add('rp-in');
      }
    }
    this.card.hidden = !show;
  }

  /** The highlight in this clip closest to the playhead. */
  private nearest(c: Clip): Highlight | null {
    let best: Highlight | null = null;
    for (const h of c.highlights) if (!best || Math.abs(h.t - this.time) < Math.abs(best.t - this.time)) best = h;
    return best;
  }
}
