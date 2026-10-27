// Collective logbook: flights, landings and crashes (by type) across all players.
// Each flight reports its events to /api/stats; the panel shows the shared totals
// and refreshes periodically so it stays current.
import type { Telemetry } from '../physics/sim';
import { CRASH_LABEL, type Counter, type CrashType, type Totals } from '../stats-shared';

export type Outcome = { kind: 'landed' } | { kind: 'belly' } | { kind: 'crash'; type: CrashType };

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

export const counterFor = (o: Outcome): Counter =>
  o.kind === 'landed' ? 'landings' : o.kind === 'belly' ? 'belly_landings' : `crash:${o.type}`;

const URL_STATS = '/api/stats';
const REFRESH_MS = 60_000;

export class FlightStats {
  private el: HTMLElement;
  private totals: Totals | null = null;
  private prevT = Infinity;
  /** The current flight has left the B-52 (or started free) and been counted */
  private counted = false;
  private ended = false;

  constructor(el: HTMLElement) {
    this.el = el;
    this.render();
    void this.refresh();
    setInterval(() => void this.refresh(), REFRESH_MS);
  }

  update(t: Telemetry): void {
    if (t.t < this.prevT) { this.counted = false; this.ended = false; } // new flight
    this.prevT = t.t;

    if (!this.counted && !t.attached) {
      this.counted = true;
      void this.send('flights');
    }
    if (!this.ended) {
      const o = outcomeOf(t);
      if (o) { this.ended = true; void this.send(counterFor(o)); }
    }
  }

  private async refresh(): Promise<void> {
    try {
      const r = await fetch(URL_STATS, { cache: 'no-store' });
      if (r.ok) { this.totals = (await r.json()) as Totals; this.render(); }
    } catch { /* offline: keep what is shown */ }
  }

  private async send(event: Counter): Promise<void> {
    try {
      const r = await fetch(URL_STATS, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event }),
        keepalive: true,
      });
      if (r.ok) { this.totals = (await r.json()) as Totals; this.render(); }
    } catch { /* offline: the flight is simply not counted */ }
  }

  private render(): void {
    const s = this.totals;
    if (!s) { this.el.innerHTML = `<h4>All pilots</h4><small>Loading flight totals…</small>`; return; }
    const rate = s.flights ? Math.round((s.landings / s.flights) * 100) : 0;
    const types = (Object.entries(s.crashTypes) as [CrashType, number][])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `<li><span>${CRASH_LABEL[k]}</span><b>${n.toLocaleString('en-US')}</b></li>`)
      .join('');
    const tile = (label: string, v: number | string, cls = '') =>
      `<div class="st${cls}"><b>${typeof v === 'number' ? v.toLocaleString('en-US') : v}</b><span>${label}</span></div>`;
    this.el.innerHTML =
      `<h4>All pilots</h4>` +
      `<div class="st-grid">${tile('Flights', s.flights)}${tile('Landings', s.landings, ' ok')}${tile('Crashes', s.crashes, ' bad')}${tile('Landed', `${rate}%`)}</div>` +
      (s.bellyLandings ? `<small>${s.bellyLandings.toLocaleString('en-US')} belly landing${s.bellyLandings === 1 ? '' : 's'} (damaged)</small>` : '') +
      (types ? `<ul class="st-types">${types}</ul>` : '');
  }
}
