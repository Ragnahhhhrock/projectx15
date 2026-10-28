// Homepage overlay (title + top-10 leaderboard + name entry) and the end-of-flight score screen.
import type { ScoreInputs, ScoreResult } from '../scoring/score';
import { computeScore } from '../scoring/score';
import { cleanName, fetchBoard, renderBoard, saveName, savedName, submitScore, type Board } from '../scoring/leaderboard';
import { track } from '../analytics';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Shown on page load until the pilot starts. */
export class HomeScreen {
  private el: HTMLElement;
  onStart: () => void = () => {};

  constructor(el: HTMLElement) {
    this.el = el;
    el.innerHTML = `
      <div class="home-card x-panel">
        <p class="x-label">Browser flight simulator</p>
        <h1 class="x-display">Project X-15</h1>
        <p class="home-sub">Drop from the B-52, light the XLR99, ride it to the edge of space and land on Rogers Dry Lake. Every flight is graded out of 1,000. The step-by-step flight guide coaches you all the way down; press <b>B</b> to show or hide it.</p>
        <p class="home-more">New: read <a href="/history/">the history of the X-15 program</a> and its <a href="/history/timeline/">timeline</a>.</p>
        <h2 class="x-label">Top 10 pilots</h2>
        <div id="homeBoard" aria-live="polite"><p class="lb-empty">Loading…</p></div>
        <form id="homeForm" class="home-form">
          <label class="x-label" for="homeName">Pilot name</label>
          <input id="homeName" maxlength="16" autocomplete="nickname" spellcheck="false" placeholder="PILOT" value="${esc(savedName())}" />
          <button class="x-btn x-btn--primary" type="submit">Fly <span class="k">ENTER</span></button>
        </form>
        <p class="home-credit">Another <a href="https://malgordon.com" target="_blank" rel="noopener">Mal Gordon</a> creation</p>
      </div>`;
    this.q('homeForm').addEventListener('submit', (e) => { e.preventDefault(); this.start(); });
    void fetchBoard().then((b) => { this.q('homeBoard').innerHTML = renderBoard(b); });
    this.sync();
  }

  get visible(): boolean { return !this.el.hidden; }

  private q(id: string): HTMLElement { return this.el.querySelector('#' + id) as HTMLElement; }

  private start(): void {
    saveName((this.q('homeName') as HTMLInputElement).value);
    this.el.hidden = true;
    this.sync();
    track('home_start');
    this.onStart();
  }

  show(): void { this.el.hidden = false; this.sync(); (this.q('homeName') as HTMLInputElement).focus(); }
  hide(): void { this.el.hidden = true; this.sync(); }

  /** body.on-home shows the history menu (#sitenav) only while this overlay is up. */
  private sync(): void { document.body.classList.toggle('on-home', !this.el.hidden); }
}

/** Slides in when the flight ends; submits the score and shows the pilot's rank. */
export class ScoreScreen {
  private el: HTMLElement;
  onNewFlight: () => void = () => {};
  /** Set false for practice scenarios: graded and shown, but not posted to the leaderboard. */
  ranked = true;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  get visible(): boolean { return !this.el.hidden; }

  hide(): void { this.el.hidden = true; document.body.classList.remove('scored'); }

  async show(stats: ScoreInputs): Promise<void> {
    const r = computeScore(stats);
    this.render(r, stats, null, null);
    track('flight_score', { score: r.total, grade: r.grade, outcome: stats.outcome, ranked: this.ranked });
    if (!this.ranked) return;
    const name = savedName() || 'PILOT';
    const { rank, board } = await submitScore(name, stats, r);
    if (!this.visible) return; // a new flight already started
    this.render(r, stats, rank, board);
  }

  private render(r: ScoreResult, s: ScoreInputs, rank: number | null, board: Board | null): void {
    const headline = { landed: 'Landed', damaged: 'Landed — aircraft damaged', crashed: 'Aircraft lost' }[s.outcome];
    const parts = r.parts.map((p) =>
      `<tr><td>${p.label}<small>${esc(p.detail)}</small></td><td><b>${p.points}</b><span> / ${p.max}</span></td></tr>`).join('');
    const penalty = r.multiplier < 1 ? `<tr class="pen"><td>Crash penalty<small>score halved</small></td><td><b>×${r.multiplier}</b></td></tr>` : '';
    const rankLine = !this.ranked ? 'Practice scenario — not ranked'
      : board === null ? 'Posting score…'
      : rank ? `Rank #${rank} on the ${board.source === 'global' ? 'global' : 'local'} top 10` : 'Just outside the top 10';
    this.el.innerHTML = `
      <div class="sc-card x-panel" role="dialog" aria-label="Flight score">
        <p class="x-label">${headline}</p>
        <div class="sc-head"><span class="sc-grade g-${r.grade}">${r.grade}</span><span class="sc-total x-readout">${r.total}<small> / 1000</small></span></div>
        <p class="sc-rank" role="status">${rankLine}</p>
        <table class="sc-parts">${parts}${penalty}</table>
        ${board ? `<h2 class="x-label">Top 10 pilots</h2>${renderBoard(board, rank ? board.entries[rank - 1]?.at : undefined)}` : ''}
        <div class="sc-actions"><button class="x-btn x-btn--primary" type="button" id="scNew">New flight <span class="k">N</span></button></div>
      </div>`;
    this.el.hidden = false;
    document.body.classList.add('scored');
    (this.el.querySelector('#scNew') as HTMLElement).onclick = () => this.onNewFlight();
  }
}

export { cleanName };
