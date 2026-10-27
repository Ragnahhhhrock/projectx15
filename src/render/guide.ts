// Guide boxes along the ideal flight profile: rectangular frames standing across the reference
// flight path, like the approach hoops in Fly Kai Tak. The reference paths are recorded from the
// autopilot flights used by the profile tests (scripts/gen-profiles.ts -> src/data/profiles.json),
// from the drop through re-entry to touchdown on Rogers Dry Lake. They sit at fixed world positions,
// so they are on screen from the start of the flight: a row of boxes along the B-52's track leads to
// the orange drop box, then the climb (magenta) and the re-entry and landing (blue).
import * as THREE from 'three';
import type { Telemetry } from '../physics/sim';
import { GAME_START } from '../physics/mission';
import { DROP, LAKE_ELEV } from '../world/terrain';
import profiles from '../data/profiles.json';

export type ProfileName = 'altitude' | 'speed';
export const PROFILE_NAMES: ProfileName[] = ['altitude', 'speed'];
export const PROFILE_LABEL: Record<ProfileName, string> = { altitude: 'ALTITUDE (~350,000 ft)', speed: 'SPEED (~M5.5–6)' };

const WIDTH = 1400; // m, across the path
const HEIGHT = 800; // m, vertical
const BORDER = 90; // m, frame thickness
/** Box spacing along the B-52 track before the drop, m */
const CARRY_SPACING = 2500;
/** Boxes shrink near the ground so the approach reads as a corridor; full size above this height, m */
const FULL_SIZE_AGL = 3000;
const MIN_SCALE = 0.18;
/** How many boxes ahead may count as "passed" in one frame (keeps the spiral from being skipped) */
const LOOKAHEAD = 4;

export type GateKind = 'carry' | 'drop' | 'climb' | 'recovery';

const COLORS: Record<GateKind, THREE.Color> = {
  carry: new THREE.Color(0xd8e6f2),
  drop: new THREE.Color(0xff6a1a),
  climb: new THREE.Color(0xff5ad9),
  recovery: new THREE.Color(0x4fb3ff),
};
const NEXT = new THREE.Color(0xfff27a);

export interface Gate {
  t: number;
  kind: GateKind;
  pos: THREE.Vector3;
  /** Unit vector along the path */
  dir: THREE.Vector3;
  mesh: THREE.Mesh;
}

interface GateSet {
  gates: Gate[];
  line: THREE.Line;
}

/** The path points for a profile, with the B-52 track before the drop prepended. */
export function profilePath(name: ProfileName): { t: number; p: [number, number, number]; kind: GateKind }[] {
  const out: { t: number; p: [number, number, number]; kind: GateKind }[] = [];
  for (let x = GAME_START[0] + CARRY_SPACING; x < DROP.x - 1; x += CARRY_SPACING) {
    out.push({ t: (x - DROP.x) / DROP.speed, p: [x, DROP.altitude, DROP.z], kind: 'carry' });
  }
  out.push({ t: 0, p: [DROP.x, DROP.altitude, DROP.z], kind: 'drop' });
  for (const [t, x, y, z, , phase] of profiles[name].pts.slice(1)) out.push({ t, p: [x, y, z], kind: phase ? 'recovery' : 'climb' });
  return out;
}

export class FlightGuide {
  readonly group = new THREE.Group();
  private sets = new Map<ProfileName, GateSet>();
  private current: ProfileName = 'altitude';
  private enabled = true;
  /** Index of the next box to fly through */
  private next = -1;
  private lastT = Infinity;

  constructor() {
    for (const name of PROFILE_NAMES) {
      const set = this.build(profilePath(name));
      this.sets.set(name, set);
      for (const g of set.gates) this.group.add(g.mesh);
      this.group.add(set.line);
    }
    this.apply();
  }

  get profile(): ProfileName { return this.current; }
  get on(): boolean { return this.enabled; }

  toggle(): boolean {
    this.enabled = !this.enabled;
    this.apply();
    return this.enabled;
  }

  cycleProfile(): ProfileName {
    this.current = PROFILE_NAMES[(PROFILE_NAMES.indexOf(this.current) + 1) % PROFILE_NAMES.length];
    this.next = -1;
    this.apply();
    return this.current;
  }

  /** Light the next box and hide the ones already flown through. */
  update(t: Telemetry): void {
    const { gates } = this.sets.get(this.current)!;
    const pos = new THREE.Vector3(...t.position);
    const passed = (g: Gate) => pos.clone().sub(g.pos).dot(g.dir) > 0;
    // New flight, replay or profile switch: find the box nearest the aircraft, then move past it if flown.
    if (this.next < 0 || t.t < this.lastT - 1) {
      let best = 0;
      gates.forEach((g, i) => { if (g.pos.distanceToSquared(pos) < gates[best].pos.distanceToSquared(pos)) best = i; });
      this.next = best;
    }
    this.lastT = t.t;
    for (let k = 0; k < LOOKAHEAD && this.next < gates.length && passed(gates[this.next]); k++) this.next++;

    gates.forEach((g, i) => {
      const mat = g.mesh.material as THREE.MeshBasicMaterial;
      g.mesh.visible = this.enabled && i >= this.next - 1;
      mat.color.copy(i === this.next ? NEXT : COLORS[g.kind]);
      mat.opacity = i === this.next ? 0.9 : i < this.next ? 0.25 : g.kind === 'drop' ? 0.85 : 0.6;
    });
  }

  private apply(): void {
    for (const [name, set] of this.sets) {
      const on = this.enabled && name === this.current;
      for (const g of set.gates) g.mesh.visible = on;
      set.line.visible = on;
    }
  }

  private build(path: ReturnType<typeof profilePath>): GateSet {
    const hw = WIDTH / 2, hh = HEIGHT / 2;
    const frame = (border: number) => {
      const outer = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
      const inner = [[-hw + border, -hh + border], [hw - border, -hh + border], [hw - border, hh - border], [-hw + border, hh - border]];
      const pos: number[] = [];
      for (let k = 0; k < 4; k++) {
        const a = outer[k], b = outer[(k + 1) % 4], c = inner[k], d = inner[(k + 1) % 4];
        for (const v of [a, b, c, b, d, c]) pos.push(v[0], v[1], 0);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      return geo;
    };
    const geo = frame(BORDER);
    const dropGeo = frame(BORDER * 2);

    const gates: Gate[] = [];
    for (let i = 0; i < path.length; i++) {
      const { t, p, kind } = path[i];
      const prev = path[Math.max(i - 1, 0)].p, nxt = path[Math.min(i + 1, path.length - 1)].p;
      const dir = new THREE.Vector3(nxt[0] - prev[0], nxt[1] - prev[1], nxt[2] - prev[2]).normalize();
      const mat = new THREE.MeshBasicMaterial({ color: COLORS[kind], transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, fog: false });
      const mesh = new THREE.Mesh(kind === 'drop' ? dropGeo : geo, mat);
      mesh.position.set(...p);
      // The frame's normal (local +Z) lies along the flight path; its "up" stays vertical.
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0)));
      if (kind === 'recovery') mesh.scale.setScalar(Math.max(MIN_SCALE, Math.min(1, (p[1] - LAKE_ELEV) / FULL_SIZE_AGL)));
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 2;
      gates.push({ t, kind, pos: new THREE.Vector3(...p), dir, mesh });
    }

    // A thin line through the box centres shows the route well beyond the boxes you can make out.
    const lineGeo = new THREE.BufferGeometry().setFromPoints(gates.map((g) => g.pos));
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
    line.frustumCulled = false;
    line.visible = false;
    return { gates, line };
  }
}
