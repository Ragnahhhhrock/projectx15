import { Input } from './input/input';
import { CAMERA_MODES, SceneView } from './render/scene';
import { Hud } from './ui/hud';
import type { FromWorker, ToWorker } from './worker/protocol';
import type { Telemetry } from './physics/sim';
import './style.css';

const TIMESCALES = [1, 2, 4, 8];

const canvas = document.getElementById('view') as HTMLCanvasElement;
const view = new SceneView(canvas);
const hud = new Hud(document.getElementById('hud')!, document.getElementById('status')!);
const help = document.getElementById('help')!;
const input = new Input();

const worker = new Worker(new URL('./worker/physics.worker.ts', import.meta.url), { type: 'module' });
const send = (msg: ToWorker) => worker.postMessage(msg);

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

  send({ type: 'controls', controls: input.poll(dt) });
  const { commands, ui } = input.drainActions();
  for (const command of commands) send({ type: 'command', command });
  for (const action of ui) {
    if (action === 'camera') view.mode = CAMERA_MODES[(CAMERA_MODES.indexOf(view.mode) + 1) % CAMERA_MODES.length];
    if (action === 'help') help.hidden = !help.hidden;
    if (action === 'pause') send({ type: 'command', command: paused ? 'resume' : 'pause' });
    if (action === 'timescale') send({ type: 'timescale', value: TIMESCALES[(TIMESCALES.indexOf(timescale) + 1) % TIMESCALES.length] });
  }

  if (latest) {
    view.update(latest, dt);
    hud.update(latest, { paused, timescale, camera: view.mode });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
