// Guide boxes along the ideal flight profile: rectangular frames standing across the reference
// flight path, like the approach hoops in Fly Kai Tak. The reference paths are recorded from the
// autopilot flights used by the profile tests (scripts/gen-profiles.ts -> src/data/profiles.json).
import * as THREE from 'three';
import profiles from '../data/profiles.json';

export type ProfileName = 'altitude' | 'speed';
export const PROFILE_NAMES: ProfileName[] = ['altitude', 'speed'];
export const PROFILE_LABEL: Record<ProfileName, string> = { altitude: 'ALTITUDE (~350,000 ft)', speed: 'SPEED (~M5.5–6)' };

const WIDTH = 1400; // m, across the path
const HEIGHT = 800; // m, vertical
const BORDER = 70; // m, frame thickness
const PASSED_GRACE = 6; // s: gates this far behind the current flight time are hidden

const AHEAD = new THREE.Color(0xff5ad9);
const NEXT = new THREE.Color(0xfff27a);

interface Gate {
  t: number;
  mesh: THREE.Mesh;
}

export class FlightGuide {
  readonly group = new THREE.Group();
  private sets = new Map<ProfileName, Gate[]>();
  private current: ProfileName = 'altitude';
  private enabled = true;

  constructor() {
    for (const name of PROFILE_NAMES) {
      const gates = this.build(profiles[name].pts);
      this.sets.set(name, gates);
      for (const g of gates) this.group.add(g.mesh);
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
    this.apply();
    return this.current;
  }

  /** Show only the active profile's gates still ahead of the aircraft; the next one lights up. */
  update(flightTime: number): void {
    const gates = this.sets.get(this.current)!;
    const next = gates.findIndex((g) => g.t >= flightTime);
    gates.forEach((g, i) => {
      g.mesh.visible = this.enabled && g.t >= flightTime - PASSED_GRACE;
      (g.mesh.material as THREE.MeshBasicMaterial).color.copy(i === next ? NEXT : AHEAD);
      (g.mesh.material as THREE.MeshBasicMaterial).opacity = i === next ? 0.8 : 0.5;
    });
  }

  private apply(): void {
    for (const [name, gates] of this.sets) for (const g of gates) g.mesh.visible = this.enabled && name === this.current;
  }

  private build(pts: number[][]): Gate[] {
    const hw = WIDTH / 2, hh = HEIGHT / 2;
    const outer = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    const inner = [[-hw + BORDER, -hh + BORDER], [hw - BORDER, -hh + BORDER], [hw - BORDER, hh - BORDER], [-hw + BORDER, hh - BORDER]];
    const pos: number[] = [];
    for (let k = 0; k < 4; k++) {
      const a = outer[k], b = outer[(k + 1) % 4], c = inner[k], d = inner[(k + 1) % 4];
      for (const v of [a, b, c, b, d, c]) pos.push(v[0], v[1], 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));

    const gates: Gate[] = [];
    for (let i = 1; i < pts.length; i++) {
      const [t, x, y, z] = pts[i];
      const prev = pts[i - 1], nxt = pts[Math.min(i + 1, pts.length - 1)];
      const dir = new THREE.Vector3(nxt[1] - prev[1], nxt[2] - prev[2], nxt[3] - prev[3]).normalize();
      const mat = new THREE.MeshBasicMaterial({ color: AHEAD, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, fog: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      // The frame's normal (local +Z) lies along the flight path; its "up" stays vertical.
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0)));
      mesh.frustumCulled = false;
      mesh.visible = false;
      gates.push({ t, mesh });
    }
    return gates;
  }
}
