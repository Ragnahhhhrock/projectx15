// Release call-out: counts down to the ideal drop point while the X-15 rides the B-52, calls
// "RELEASE NOW" at the mark, and afterwards says how close to the mark the drop was.
import type { Telemetry } from '../physics/sim';
import { RELEASE_WINDOW_S, fmtCountdown, timeToDrop } from '../physics/mission';

/** Show the after-drop verdict for this long, s of flight time */
const VERDICT_S = 5;

export type CueState = 'countdown' | 'final' | 'now' | 'late' | 'verdict' | 'none';

/** What the call-out shows for this telemetry; `releasedAt` is the countdown value at release. */
export function dropCue(t: Telemetry, releasedAt: number | null, releaseT: number): { state: CueState; text: string } {
  if (t.crashed || t.landed) return { state: 'none', text: '' };
  if (t.attached) {
    const s = timeToDrop(t);
    if (s > 10) return { state: 'countdown', text: `RELEASE IN ${fmtCountdown(s)}` };
    if (s > 0) return { state: 'final', text: `RELEASE IN ${fmtCountdown(s)}` };
    if (s > -RELEASE_WINDOW_S) return { state: 'now', text: 'RELEASE NOW — SPACE' };
    return { state: 'late', text: `RELEASE NOW — ${Math.round(-s)} S LATE` };
  }
  if (releasedAt !== null && t.t - releaseT < VERDICT_S) {
    const off = -releasedAt; // + = late
    if (Math.abs(off) <= RELEASE_WINDOW_S) return { state: 'verdict', text: 'RELEASED ON THE MARK' };
    return { state: 'verdict', text: `RELEASED ${Math.round(Math.abs(off))} S ${off > 0 ? 'LATE' : 'EARLY'} — FOLLOW THE BOXES` };
  }
  return { state: 'none', text: '' };
}

export class DropCue {
  private el: HTMLElement;
  private prev: Telemetry | null = null;
  private releasedAt: number | null = null;
  private releaseT = 0;
  private shown = '';

  constructor(el: HTMLElement) {
    this.el = el;
  }

  update(t: Telemetry): void {
    const p = this.prev;
    if (p && t.t < p.t - 0.5) this.releasedAt = null; // new flight
    if (p?.attached && !t.attached) {
      this.releasedAt = timeToDrop(p);
      this.releaseT = t.t;
    }
    this.prev = t;
    const { state, text } = dropCue(t, this.releasedAt, this.releaseT);
    const sig = `${state}|${text}`;
    if (sig === this.shown) return;
    this.shown = sig;
    this.el.hidden = state === 'none';
    this.el.dataset.state = state;
    this.el.textContent = text;
  }
}
