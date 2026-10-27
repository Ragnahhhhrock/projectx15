import { Input } from './input/input';
import { CAMERA_LABEL, CAMERA_MODES, SceneView, isEyeView } from './render/scene';
import { Hud } from './ui/hud';
import { GVision } from './ui/gvision';
import { Coach } from './ui/coach';
import { Pfd } from './ui/pfd';
import { FlightRecorder } from './replay/recorder';
import { ReplayPlayer } from './replay/player';
import { Records } from './ui/records';
import { FlightStats } from './ui/stats';
import { HomeScreen, ScoreScreen } from './ui/scoreboard';
import { FlightTracker } from './scoring/tracker';
import { AudioEngine } from './audio/audio';
import type { FromWorker, ToWorker } from './worker/protocol';
import type { Telemetry } from './physics/sim';
import { FlightAnalytics, track } from './analytics';
import './styles/fonts';
import './style.css';

const coffee = document.getElementById('coffee');
coffee?.addEventListener('click', () => {
  track('buy_coffee_click', { amount: 5 });
  coffee.blur(); // keep flight keys going to the sim, not the link
});

const TIMESCALES = [1, 2, 4, 8];

const canvas = document.getElementById('view') as HTMLCanvasElement;
const view = new SceneView(canvas);
const hud = new Hud(document.getElementById('hud')!, document.getElementById('status')!);
const help = document.getElementById('help')!;
const gvision = new GVision(document.getElementById('gvision')!, canvas);
const input = new Input();
const coach = new Coach(document.getElementById('coach')!);
const audio = new AudioEngine();
const hudEl = document.getElementById('hud')!;
let hudForced = false;
const pfd = new Pfd(document.getElementById('pfd')!);
const recorder = new FlightRecorder();
const replay = new ReplayPlayer(recorder, document.getElementById('replay')!);
/** Whether the sim was running when the replay started, so it resumes afterwards */
let resumeAfterReplay = false;

const worker = new Worker(new URL('./worker/physics.worker.ts', import.meta.url), { type: 'module' });
const send = (msg: ToWorker) => worker.postMessage(msg);
coach.onNewFlight = () => send({ type: 'command', command: 'reset' });

const params = new URLSearchParams(location.search);
if (params.has('scenario')) send({ type: 'scenario', name: params.get('scenario')! });
const analytics = new FlightAnalytics(params.get('scenario'));
const stats = new FlightStats(document.getElementById('stats')!);
const records = new Records(document.getElementById('records')!, !params.has('scenario'));
const tracker = new FlightTracker();
const scoreScreen = new ScoreScreen(document.getElementById('score')!);
scoreScreen.ranked = !params.has('scenario');
scoreScreen.onNewFlight = () => send({ type: 'command', command: 'reset' });
const home = new HomeScreen(document.getElementById('home')!);
if (params.has('scenario')) home.hide();
else {
  send({ type: 'command', command: 'pause' });
  home.onStart = () => send({ type: 'command', command: 'resume' });
  document.getElementById('homeName')?.focus();
}
if (params.has('debug')) (window as unknown as { __x15: unknown }).__x15 = { view, send };

let latest: Telemetry | null = null;
let paused = false;
let timescale = 1;

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  latest = e.data.telemetry;
  analytics.update(latest);
  stats.update(latest);
  const finished = tracker.update(latest);
  if (finished) void scoreScreen.show(finished);
  else if (scoreScreen.visible && !latest.landed && !latest.crashed) scoreScreen.hide();
  if (!e.data.paused) recorder.push(latest);
  paused = e.data.paused;
  timescale = e.data.timescale;
};

function startReplay(): void {
  if (!replay.start()) return;
  resumeAfterReplay = !paused;
  if (!paused) send({ type: 'command', command: 'pause' });
  track('replay_start', { highlights: replay.available });
}

function endReplay(): void {
  replay.stop();
  if (resumeAfterReplay) send({ type: 'command', command: 'resume' });
  resumeAfterReplay = false;
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  const controls = input.poll(dt);
  const drained = input.drainActions();
  const commands = home.visible ? [] : drained.commands;
  const ui = home.visible ? [] : drained.ui;

  if (replay.active) {
    // Flight inputs are ignored during replay; N still starts a new flight.
    view.controls = null;
    if (commands.includes('reset')) {
      endReplay();
      send({ type: 'command', command: 'reset' });
    }
  } else {
    view.controls = home.visible ? null : controls;
    send({ type: 'controls', controls: home.visible ? { pitch: 0, roll: 0, yaw: 0, throttle: controls.throttle } : controls });
    for (const command of commands) send({ type: 'command', command });
  }

  for (const action of ui) {
    if (action === 'camera') {
      view.mode = CAMERA_MODES[(CAMERA_MODES.indexOf(view.mode) + 1) % CAMERA_MODES.length];
      track('camera_change', { camera: view.mode });
    }
    if (action === 'resetView') view.look.reset();
    if (action === 'guide') view.guide.toggle();
    if (action === 'guideProfile') { view.guide.cycleProfile(); view.guide.on || view.guide.toggle(); }
    if (action === 'help') help.hidden = !help.hidden;
    if (action === 'mute') audio.toggleMute();
    if (action === 'hud') hudForced = !hudForced;
    if (action === 'coach') coach.toggle();
    if (action === 'replay') (replay.active ? endReplay() : startReplay());
    if (replay.active) {
      if (action === 'replayNext') replay.next();
      if (action === 'replayPrev') replay.prev();
      if (action === 'pause') replay.togglePause();
      if (action === 'timescale') replay.cycleSpeed();
      continue;
    }
    if (action === 'pause') send({ type: 'command', command: paused ? 'resume' : 'pause' });
    if (action === 'timescale') send({ type: 'timescale', value: TIMESCALES[(TIMESCALES.indexOf(timescale) + 1) % TIMESCALES.length] });
  }

  let shown = latest;
  if (replay.active) {
    shown = replay.update(dt);
    if (!replay.active) endReplay(); // reel finished
    shown ??= latest;
  }

  if (shown) {
    view.update(shown, dt);
    coach.setProfile(view.guide.profile);
    if (!replay.active) coach.update(shown, now);
    if (!replay.active && latest) records.update(latest, now);
    gvision.update(shown.nz, shown.t);
    audio.update(shown, dt, isEyeView(view.mode), view.b52Distance);
    hudEl.style.display = view.mode === 'cockpit' && !hudForced ? 'none' : '';
    pfd.update(shown);
    document.body.classList.toggle('replaying', replay.active);
    const camera = `${CAMERA_LABEL[view.mode]}${view.look.active ? ' free look' : ''}`;
    hud.update(shown, { paused: paused && !replay.active, timescale: replay.active ? 1 : timescale, muted: audio.isMuted, camera, guide: view.guide.on ? view.guide.profile : null, gwarn: gvision.label, replay: replay.active, highlights: replay.active ? 0 : replay.available });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
