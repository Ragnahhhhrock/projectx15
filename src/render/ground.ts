// Ground detail on top of the terrain: airbase buildings, runway numbers and lights, desert vegetation.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BASE, LAKE, LAKE_ELEV, baseMask, lakeDistance, terrainHeight } from '../world/terrain';
import { smoothstep, vnoise } from '../world/noise';
import { PAINT, KIND } from './terrain';
import { textDecal } from './textures';

const PAD_Y = LAKE_ELEV + 3;
const rel = (x: number, z: number): [number, number] => [LAKE.x + x, LAKE.z + z];

function hash3(x: number, z: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1442695041);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Static scenery near the airbase and on the lakebed. */
export class Ground {
  readonly group = new THREE.Group();
  private numbers: THREE.Object3D[] = [];
  private base = new THREE.Group();

  constructor() {
    this.group.add(this.base);
    this.buildAirbase();
    this.buildRunwayNumbers();
  }

  private buildAirbase(): void {
    const bx = BASE.x;
    const bz = BASE.z;
    const wall = new THREE.MeshLambertMaterial({ color: 0xcfc9bc });
    const roof = new THREE.MeshLambertMaterial({ color: 0x8e9398 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3a3d42 });
    const glass = new THREE.MeshLambertMaterial({ color: 0x1d2a36 });
    const white = new THREE.MeshLambertMaterial({ color: 0xe9e9e6 });
    const orange = new THREE.MeshLambertMaterial({ color: 0xe0661c });

    // Arched hangars south of the ramp
    for (let i = 0; i < 4; i++) {
      const w = 70;
      const d = 60;
      const h = 20;
      const hg = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.55, d), wall);
      body.position.y = (h * 0.55) / 2;
      hg.add(body);
      const vault = new THREE.CylinderGeometry(1, 1, d, 20, 1, false, Math.PI / 2, Math.PI);
      vault.rotateX(Math.PI / 2);
      vault.scale(w / 2, h * 0.45, 1);
      const v = new THREE.Mesh(vault, roof);
      v.position.y = h * 0.55;
      hg.add(v);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.7), dark);
      door.position.set(0, h * 0.35, -d / 2 - 0.05);
      door.rotation.y = Math.PI;
      hg.add(door);
      hg.position.set(bx + 450 + i * 105, PAD_Y, bz + 690);
      this.base.add(hg);
    }
    // Low research buildings
    for (let i = 0; i < 7; i++) {
      const w = 28 + (i % 3) * 8;
      const d = 18 + (i % 2) * 10;
      const h = 7 + (i % 3) * 2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), i % 2 ? wall : white);
      b.position.set(bx - 700 + i * 70, PAD_Y + h / 2, bz + 600 + ((i * 37) % 60));
      this.base.add(b);
      const r = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.6, d + 1), roof);
      r.position.set(b.position.x, PAD_Y + h + 0.3, b.position.z);
      this.base.add(r);
    }
    // Control tower
    const tower = new THREE.Group();
    tower.add(at(new THREE.Mesh(new THREE.BoxGeometry(7, 26, 7), white), 0, 13, 0));
    tower.add(at(new THREE.Mesh(new THREE.BoxGeometry(13, 4, 13), glass), 0, 28, 0));
    tower.add(at(new THREE.Mesh(new THREE.BoxGeometry(15, 0.8, 15), roof), 0, 30.4, 0));
    tower.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 6), dark), 0, 34.5, 0));
    tower.position.set(bx + 260, PAD_Y, bz + 520);
    this.base.add(tower);
    // Fuel tanks
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 13, 20), white);
      t.position.set(bx + 1950 + (i % 2) * 24, PAD_Y + 6.5, bz + 720 + Math.floor(i / 2) * 24);
      this.base.add(t);
    }
    // Radio masts with red/white bands
    for (const [dx, dz] of [[-1500, 520], [-1450, 560], [2300, 600]] as const) {
      const m = new THREE.Group();
      for (let k = 0; k < 6; k++) {
        m.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 10, 6), k % 2 ? white : orange), 0, 5 + k * 10, 0));
      }
      m.position.set(bx + dx, PAD_Y, bz + dz);
      this.base.add(m);
    }
    // Windsock
    const sock = new THREE.Group();
    sock.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 8, 6), dark), 0, 4, 0));
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4, 10, 1, true), orange);
    cone.rotation.z = -Math.PI / 2;
    cone.position.set(2, 8, 0);
    sock.add(cone);
    sock.position.set(bx - 600, PAD_Y, bz - 70);
    this.base.add(sock);
    // Runway edge lights
    const lightGeo = new THREE.BoxGeometry(0.5, 0.35, 0.5);
    const count = Math.floor(4600 / 60) * 2;
    const lights = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), count);
    const m = new THREE.Matrix4();
    let n = 0;
    for (let x = -2290; x <= 2290; x += 60) {
      for (const s of [-1, 1]) m.setPosition(bx + x, PAD_Y + 0.2, bz + s * 32.5), lights.setMatrixAt(n++, m);
    }
    lights.count = n;
    lights.frustumCulled = false;
    this.base.add(lights);
    // Static origin for the whole group avoids float precision loss in vertex data
    this.base.traverse((o) => { o.matrixAutoUpdate = true; });
  }

  private buildRunwayNumbers(): void {
    for (const r of PAINT) {
      if (r[5] !== KIND.runway && r[5] !== KIND.lakeRunway) continue;
      const [cx, cz, ang, hl, , kind] = r;
      for (const sgn of [1, -1]) {
        // Approach from the far end toward the other: direction of travel
        const dx = Math.cos(ang) * -sgn;
        const dz = Math.sin(ang) * -sgn;
        const hdg = (((Math.atan2(dx, -dz) * 180) / Math.PI) + 360) % 360;
        let num = Math.round(hdg / 10) % 36;
        if (num === 0) num = 36;
        const label = String(num).padStart(2, '0');
        const dec = textDecal(label, kind === KIND.runway ? 16 : 20, kind === KIND.runway ? 9 : 11, { color: kind === KIND.runway ? '#e8e8e8' : '#231e1a', ppm: 22 });
        const dist = hl - (kind === KIND.runway ? 130 : 190);
        const [wx, wz] = rel(cx + Math.cos(ang) * dist * sgn, cz + Math.sin(ang) * dist * sgn);
        const y = (kind === KIND.runway ? PAD_Y : LAKE_ELEV) + 0.07;
        dec.position.set(wx, y, wz);
        dec.rotation.order = 'YXZ';
        dec.rotation.set(-Math.PI / 2, Math.atan2(-dx, -dz), 0);
        this.group.add(dec);
        this.numbers.push(dec);
      }
    }
  }

  update(cam: THREE.Vector3): void {
    for (const n of this.numbers) n.visible = Math.hypot(n.position.x - cam.x, n.position.z - cam.z) < 5000 && Math.abs(cam.y - n.position.y) < 4000;
    this.base.visible = Math.hypot(BASE.x - cam.x, BASE.z - cam.z) < 60000;
  }
}

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

/** Instanced shrubs, Joshua trees and rocks scattered around the camera. */
export class Vegetation {
  readonly group = new THREE.Group();
  private bushes: THREE.InstancedMesh;
  private trees: THREE.InstancedMesh;
  private rocks: THREE.InstancedMesh;
  private last = new THREE.Vector2(1e12, 1e12);
  private static readonly CELL = 28;
  private static readonly RADIUS = 1100;

  constructor() {
    const bushGeo = new THREE.IcosahedronGeometry(1, 0);
    bushGeo.scale(1, 0.55, 1);
    bushGeo.translate(0, 0.3, 0);
    this.bushes = new THREE.InstancedMesh(bushGeo, new THREE.MeshLambertMaterial({ color: 0x66683f, flatShading: true }), 3200);

    // Joshua tree: trunk, two arms and spiky tufts, vertex-coloured
    const parts: THREE.BufferGeometry[] = [];
    const paint = (g: THREE.BufferGeometry, c: number) => {
      const color = new THREE.Color(c);
      const arr: number[] = [];
      for (let i = 0; i < g.attributes.position.count; i++) arr.push(color.r, color.g, color.b);
      g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
      return g;
    };
    const trunk = new THREE.CylinderGeometry(0.22, 0.32, 3.2, 6);
    trunk.translate(0, 1.6, 0);
    parts.push(paint(trunk, 0x4b3b2a));
    for (const s of [-1, 1]) {
      const arm = new THREE.CylinderGeometry(0.12, 0.17, 1.8, 5);
      arm.rotateZ(s * 0.7);
      arm.translate(s * 0.7, 3.4, 0);
      parts.push(paint(arm, 0x4b3b2a));
      const tuft = new THREE.IcosahedronGeometry(0.7, 0);
      tuft.translate(s * 1.3, 4.2, 0);
      parts.push(paint(tuft, 0x5d6b3a));
    }
    const top = new THREE.IcosahedronGeometry(0.85, 0);
    top.translate(0, 3.5, 0);
    parts.push(paint(top, 0x5d6b3a));
    this.trees = new THREE.InstancedMesh(mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 400);

    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    rockGeo.scale(1, 0.6, 0.85);
    this.rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ color: 0x7a6d5e, flatShading: true }), 1000);

    for (const m of [this.bushes, this.trees, this.rocks]) {
      m.frustumCulled = false;
      m.count = 0;
      this.group.add(m);
    }
  }

  update(cam: THREE.Vector3, agl: number): void {
    const near = agl < 2200;
    this.group.visible = near;
    if (!near) return;
    if (Math.hypot(cam.x - this.last.x, cam.z - this.last.y) < 160) return;
    this.last.set(cam.x, cam.z);
    const ox = Math.round(cam.x / 100) * 100;
    const oz = Math.round(cam.z / 100) * 100;
    for (const m of [this.bushes, this.trees, this.rocks]) m.position.set(ox, 0, oz);

    const C = Vegetation.CELL;
    const R = Vegetation.RADIUS;
    const i0 = Math.floor((cam.x - R) / C);
    const i1 = Math.floor((cam.x + R) / C);
    const j0 = Math.floor((cam.z - R) / C);
    const j1 = Math.floor((cam.z + R) / C);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    let nb = 0, nt = 0, nr = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const h0 = hash3(i, j, 1);
        const x = (i + hash3(i, j, 2)) * C;
        const z = (j + hash3(i, j, 3)) * C;
        const d = Math.hypot(x - cam.x, z - cam.z);
        if (d > R) continue;
        const fade = 1 - smoothstep(R * 0.75, R, d);
        if (lakeDistance(x, z) < 1.12 || baseMask(x, z) > 0.01) continue;
        const rl = terrainHeight(x, z, 3) - LAKE_ELEV;
        if (rl > 1100) continue;
        const patch = vnoise(x / 420 + 11, z / 420 + 3);
        const dense = smoothstep(0.38, 0.62, patch) * (1 - smoothstep(500, 1100, rl));
        p.set(x - ox, terrainHeight(x, z, 3), z - oz);
        e.set(0, hash3(i, j, 4) * 6.28, 0);
        q.setFromEuler(e);
        if (h0 < dense * 0.8 && nb < 3200) {
          const sc = (0.5 + hash3(i, j, 5) * 1.0) * fade;
          s.set(sc * 1.3, sc, sc * 1.3);
          this.bushes.setMatrixAt(nb++, m4.compose(p, q, s));
        } else if (h0 > 0.985 - dense * 0.012 && rl > 20 && rl < 600 && nt < 400) {
          const sc = (0.8 + hash3(i, j, 6) * 0.7) * fade;
          s.set(sc, sc, sc);
          this.trees.setMatrixAt(nt++, m4.compose(p, q, s));
        } else if (h0 > 0.93 && nr < 1000) {
          const sc = (0.3 + hash3(i, j, 7) * 1.4 + rl * 0.001) * fade;
          s.set(sc, sc, sc);
          p.y += sc * 0.15;
          this.rocks.setMatrixAt(nr++, m4.compose(p, q, s));
        }
      }
    }
    this.bushes.count = nb;
    this.trees.count = nt;
    this.rocks.count = nr;
    for (const m of [this.bushes, this.trees, this.rocks]) m.instanceMatrix.needsUpdate = true;
  }
}
