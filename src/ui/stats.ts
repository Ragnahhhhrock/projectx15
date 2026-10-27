// Pilot logbook: flights, landings and crashes (by type), kept in localStorage
// and shown on the homepage. Updates live as each flight ends.
import type { Telemetry } from '../physics/sim';

export type CrashType =
  | 'structural'
  | 'hard_landing'
  | 'sideways'
  | 'off_lakebed'
  | 'gear_up'
  | 'ventral'
  | 'ground_impact';

export const CRASH_LABEL: Record<CrashType, string> = {
  structural: 'Airframe overload',
  hard_landing: 'Hard landing',
  sideways: 'Sideways touchdown',
  off_lakebed: 'Off the lakebed',
  gear_up: 'Gear-up impact',
  ventral: 'Ventral fin strike',
  ground_impact: 'Flown into the ground',
};

export interface Stats {
  flights: number;
  landings: number;
  bellyLandings: number;
  crashes: number;
  crashTypes: Partial<Record<CrashType, number>>;
}

export type Outcome = { kind: 'landed' } | { kind: 'belly' } | { kind: 'crash'; type: CrashType };

export const emptyStats = (): Stats => ({ flights: 0, landings: 0, bellyLandings: 0, crashes: 0, crashTypes: {} });

/** Sort a crash into a type from the sim's crash reason. */
export function crashType(t: Pick<Telemetry, 'brokeUp' | 'crashReason'>): CrashType {
  const r = (t.crashReason ?? '').toLowerCase();
  if (t.brokeUp) return 'structural';
  if (r.includes('collapsed')) return 'hard_landing';
  if (r.includes('sideways')) return 'sideways';
  if (r.includes('sloping terrain')) return 'off_lakebed';
  if (r.includes('ventral')) return 'ventral';
  if (r.includes('gear up')) return 'gear_up';
  return 'ground_impact';
}

/** How a flight ended, or null while it is still going. */
export function outcomeOf(t: Telemetry): Outcome | null {
  if (t.crashed) return { kind: 'crash', type: crashType(t) };
  if (t.landed) return t.damaged ? { kind: 'belly' } : { kind: 'landed' };
  return null;
}

export function record(s: Stats, o: Outcome): Stats {
  const n = { ...s, crashTypes: { ...s.crashTypes } };
  if (o.kind === 'landed') n.landings++;
  else if (o.kind === 'belly') n.bellyLandings++;
  else {
    n.crashes++;
    n.crashTypes[o.type] = (n.crashTypes[o.type] ?? 0) + 1;
  }
  return n;
}

const KEY = 'x15.stats';

function load(): Stats {
  try {
    return { ...emptyStats(), ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Stats>) };
  } catch {
    return emptyStats();
  }
}
function save(s: Stats): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export class FlightStats {
  private el: HTMLElement;
  private stats = load();
  private prevT = Infinity;
  /** The current flight has left the B-52 (or started free) and been counted */
  private counted = false;
  private ended = false;

  constructor(el: HTMLElement) {
    this.el = el;
    // Keep in step with other open tabs.
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === KEY) { this.stats = load(); this.render(); }
    });
    this.render();
  }

  update(t: Telemetry): void {
    if (t.t < this.prevT) { this.counted = false; this.ended = false; } // new flight
    this.prevT = t.t;

    let dirty = false;
    if (!this.counted && !t.attached) {
      this.counted = true;
      this.stats = { ...this.stats, flights: this.stats.flights + 1 };
      dirty = true;
    }
    const o = this.ended ? null : outcomeOf(t);
    if (o) {
      this.ended = true;
      this.stats = record(this.stats, o);
      dirty = true;
    }
    if (dirty) { save(this.stats); this.render(); }
  }

  private render(): void {
    const s = this.stats;
    const rate = s.flights ? Math.round((s.landings / s.flights) * 100) : 0;
    const types = (Object.entries(s.crashTypes) as [CrashType, number][])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `<li><span>${CRASH_LABEL[k]}</span><b>${n}</b></li>`)
      .join('');
    const tile = (label: string, v: number | string, cls = '') =>
      `<div class="st${cls}"><b>${v}</b><span>${label}</span></div>`;
    this.el.innerHTML =
      `<h4>Your logbook</h4>` +
      `<div class="st-grid">${tile('Flights', s.flights)}${tile('Landings', s.landings, ' ok')}${tile('Crashes', s.crashes, ' bad')}${tile('Landed', `${rate}%`)}</div>` +
      (s.bellyLandings ? `<small>${s.bellyLandings} belly landing${s.bellyLandings === 1 ? '' : 's'} (damaged)</small>` : '') +
      (types ? `<ul class="st-types">${types}</ul>` : '');
  }
}
