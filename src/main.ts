import { Input } from './input/input';
import { CAMERA_MODES, SceneView } from './render/scene';
import { Hud } from './ui/hud';
import { GVision } from './ui/gvision';
import { AudioEngine } from './audio/audio';
import type { FromWorker, ToWorker } from './worker/protocol';
import type { Telemetry } from './physics/sim';
import './styles/fonts';
import './style.css';

const TIMESCALES = [1, 2, 4, 8];

const canvas = document.getElementById('view') as HTMLCanvasElement;
const view = new SceneView(canvas);
const hud = new Hud(document.getElementById('hud')!, document.getElementById('status')!);
const help = document.getElementById('help')!;
const gvision = new GVision(document.getElementById('gvision')!, canvas);
const input = new Input();
const audio = new AudioEngine();
const hudEl = document.getElementById('hud')!;
let hudForced = false;

const worker = new Worker(new URL('./worker/physics.worker.ts', import.meta.url), { type: 'module' });
const send = (msg: ToWorker) => worker.postMessage(msg);

const params = new URLSearchParams(location.search);
if (params.has('scenario')) send({ type: 'scenario', name: params.get('scenario')! });
if (params.has('debug')) (window as unknown as { __x15: unknown }).__x15 = { view, send };

let latest: Telemetry | null = null;
let paused = false;
let timescale = 1;

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  latest = e.data.telemetry;
  paused = e.data.paused;
  timescale = e.data.timescale;
};

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  const controls = input.poll(dt);
  view.controls = controls;
  send({ type: 'controls', controls });
  const { commands, ui } = input.drainActions();
  for (const command of commands) send({ type: 'command', command });
  for (const action of ui) {
    if (action === 'camera') view.mode = CAMERA_MODES[(CAMERA_MODES.indexOf(view.mode) + 1) % CAMERA_MODES.length];
    if (action === 'resetView') view.look.reset();
    if (action === 'guide') view.guide.toggle();
    if (action === 'guideProfile') { view.guide.cycleProfile(); view.guide.on || view.guide.toggle(); }
    if (action === 'help') help.hidden = !help.hidden;
    if (action === 'mute') audio.toggleMute();
    if (action === 'hud') hudForced = !hudForced;
    if (action === 'pause') send({ type: 'command', command: paused ? 'resume' : 'pause' });
    if (action === 'timescale') send({ type: 'timescale', value: TIMESCALES[(TIMESCALES.indexOf(timescale) + 1) % TIMESCALES.length] });
  }

  if (latest) {
    view.update(latest, dt);
    gvision.update(latest.nz, latest.t);
    audio.update(latest, dt, view.mode === 'cockpit', view.b52Distance);
    hudEl.style.display = view.mode === 'cockpit' && !hudForced ? 'none' : '';
    hud.update(latest, { paused, timescale, muted: audio.isMuted, camera: view.look.active ? `${view.mode} free look` : view.mode, guide: view.guide.on ? view.guide.profile : null, gwarn: gvision.label });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
