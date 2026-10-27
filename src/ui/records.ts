// Record challenge: match the speed and altitude the real X-15 reached.
// Progress counts only on full flights from the B-52 (not practice scenarios).
// Best-ever marks are kept in localStorage.
import type { Telemetry } from '../physics/sim';
import { track } from '../analytics';

const FT = 3.28084;

export interface RecordGoal {
  id: 'altitude' | 'speed' | 'speedA2';
  label: string;
  /** Target in display units: ft for altitude, Mach for speed */
  target: number;
  holder: string;
  /** Needs an aircraft variant that is not in the sim yet */
  locked?: string;
}

export const RECORDS: RecordGoal[] = [
  { id: 'altitude', label: 'Altitude', target: 354_200, holder: 'Joe Walker · flight 91 · 22 Aug 1963' },
  { id: 'speed', label: 'Speed', target: 6.04, holder: 'Bob White · 9 Nov 1961 · standard X-15' },
  { id: 'speedA2', label: 'Absolute speed', target: 6.7, holder: 'Pete Knight · flight 188 · 3 Oct 1967', locked: 'X-15A-2 with drop tanks' },
];

/** The value a flight scored against a goal, in the goal's units. */
export function scoreFor(goal: RecordGoal, t: Telemetry): number {
  return goal.id === 'altitude' ? t.max.altitude * FT : t.max.mach;
}

export const fmtGoal = (goal: RecordGoal, v: number): string =>
  goal.id === 'altitude' ? `${Math.round(v).toLocaleString('en-US')} ft` : `Mach ${v.toFixed(2)}`;

type Bests = Partial<Record<RecordGoal['id'], number>>;
const KEY = 'x15.records';

function load(): Bests {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Bests; } catch { return {}; }
}
function save(b: Bests): void {
  try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* storage unavailable */ }
}

export class Records {
  private el: HTMLElement;
  private eligible: boolean;
  private best: Bests = load();
  /** Goals matched on the current flight */
  private matched = new Set<string>();
  private prevT = Infinity;
  private flashUntil = 0;
  private flashText = '';

  constructor(el: HTMLElement, eligible: boolean) {
    this.el = el;
    this.eligible = eligible;
  }

  update(t: Telemetry, now: number): void {
    if (t.t < this.prevT) this.matched.clear(); // new flight
    this.prevT = t.t;

    if (this.eligible) {
      let dirty = false;
      for (const g of RECORDS) {
        if (g.locked) continue;
        const v = scoreFor(g, t);
        if (v > (this.best[g.id] ?? 0)) { this.best[g.id] = v; dirty = true; }
        if (v >= g.target && !this.matched.has(g.id)) {
          this.matched.add(g.id);
          this.flashText = `${g.label.toUpperCase()} RECORD MATCHED — ${fmtGoal(g, g.target)}`;
          this.flashUntil = now + 6000;
          track('record_matched', { record: g.id, value: +v.toFixed(2), flight_time_s: Math.round(t.t) });
        }
      }
      if (dirty && (t.landed || t.crashed || Math.floor(t.t) % 5 === 0)) save(this.best);
    }
    this.render(t, now);
  }

  private render(t: Telemetry, now: number): void {
    const rows = RECORDS.map((g) => {
      if (g.locked) {
        return `<div class="rec locked"><div class="rec-top"><span>${g.label}</span><b>${fmtGoal(g, g.target)}</b></div><small>${g.holder} · needs ${g.locked}</small></div>`;
      }
      const v = this.eligible ? scoreFor(g, t) : 0;
      const pct = Math.min(100, (v / g.target) * 100);
      const done = this.matched.has(g.id);
      const best = this.best[g.id];
      return `<div class="rec${done ? ' done' : ''}"><div class="rec-top"><span>${g.label}</span><b>${fmtGoal(g, g.target)}</b></div>` +
        `<div class="rec-bar"><i style="width:${pct.toFixed(1)}%"></i></div>` +
        `<small>${this.eligible ? `This flight ${fmtGoal(g, v)}` : 'Fly from the B-52 to count'}${best ? ` · best ${fmtGoal(g, best)}` : ''}</small></div>`;
    }).join('');
    const flash = now < this.flashUntil ? `<p class="rec-flash" role="status">${this.flashText}</p>` : '';
    this.el.innerHTML = `<h4>Match the X-15</h4>${rows}${flash}`;
  }
}
