import type { Controls, Telemetry } from '../physics/sim';

export type Command = 'release' | 'ignite' | 'shutdown' | 'toggleRcs' | 'toggleSas' | 'reset' | 'pause' | 'resume';

export type ToWorker =
  | { type: 'controls'; controls: Controls }
  | { type: 'command'; command: Command }
  | { type: 'timescale'; value: number };

export type FromWorker = { type: 'telemetry'; telemetry: Telemetry; paused: boolean; timescale: number };
