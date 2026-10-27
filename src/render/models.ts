// Detailed aircraft models built from lofted sections. Body frame: +x nose, +y top, +z right wing.
// Dimensions follow the real aircraft: X-15 15.45 m long, 6.7 m span; NB-52B 48 m long, 56.4 m span.
import * as THREE from 'three';
import { skinTexture, textDecal, whiteSkinTexture, wingTexture } from './textures';

type V = [number, number, number];
const D2R = Math.PI / 180;

interface LoftOpts {
  capStart?: boolean;
  capEnd?: boolean;
  vScale?: number;
  uOf?: (j: number, n: number) => number;
}

/** Joins cross-section rings (equal point counts, closed) into one smooth surface. */
function loft(rings: V[][], o: LoftOpts = {}): THREE.BufferGeometry {
  const R = rings.length;
  const n = rings[0].length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const w = n + 1;
  for (let i = 0; i < R; i++) {
    for (let j = 0; j <= n; j++) {
      pos.push(...rings[i][j % n]);
      uv.push(o.uOf ? o.uOf(j, n) : j / n, (i / (R - 1)) * (o.vScale ?? 1));
    }
  }
  for (let i = 0; i < R - 1; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * w + j;
      const b = a + 1;
      const c = a + w;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const cap = (ring: V[], flip: boolean) => {
    const c: V = [0, 0, 0];
    for (const p of ring) { c[0] += p[0] / n; c[1] += p[1] / n; c[2] += p[2] / n; }
    const base = pos.length / 3;
    pos.push(...c);
    uv.push(0.5, 0.5);
    for (const p of ring) { pos.push(...p); uv.push(0.5, 0.5); }
    for (let j = 0; j < n; j++) {
      const a = base + 1 + j;
      const b = base + 1 + ((j + 1) % n);
      if (flip) idx.push(base, b, a); else idx.push(base, a, b);
    }
  };
  if (o.capStart) cap(rings[0], false);
  if (o.capEnd) cap(rings[R - 1], true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

type Kind = 'lens' | 'wedge';

/** Half-thickness at chord fraction s (0 = leading edge). */
function half(kind: Kind, t: number, s: number): number {
  return kind === 'lens' ? (t / 2) * 2.6 * Math.sqrt(s) * (1 - s) : (t / 2) * Math.min(1, Math.pow(s / 0.3, 0.7));
}

const FOIL_M = 8;
const foilU = (j: number, n: number): number => {
  if (j >= n) return 0;
  return j <= FOIL_M ? j / FOIL_M : (2 * FOIL_M + 1 - j) / FOIL_M;
};

interface Sec { le: number; te: number; yc: number; z: number; t: number }

/** Horizontal section: chord in x, thickness in y, at spanwise station z. */
function foilH(kind: Kind, s: Sec): V[] {
  const top: V[] = [];
  const bot: V[] = [];
  for (let i = 0; i <= FOIL_M; i++) {
    const f = i / FOIL_M;
    const x = s.le + (s.te - s.le) * f;
    const h = half(kind, s.t, f);
    top.push([x, s.yc + h, s.z]);
    bot.unshift([x, s.yc - h, s.z]);
  }
  return [...top, ...bot];
}

interface SecV { le: number; te: number; y: number; t: number; z?: number }

/** Vertical section: chord in x, thickness in z, at height y. */
function foilV(kind: Kind, s: SecV): V[] {
  const top: V[] = [];
  const bot: V[] = [];
  for (let i = 0; i <= FOIL_M; i++) {
    const f = i / FOIL_M;
    const x = s.le + (s.te - s.le) * f;
    const h = half(kind, s.t, f);
    top.push([x, s.y, (s.z ?? 0) + h]);
    bot.unshift([x, s.y, (s.z ?? 0) - h]);
  }
  return [...top, ...bot];
}

const surfaceH = (kind: Kind, secs: Sec[]) => loft(secs.map((s) => foilH(kind, s)), { uOf: foilU, capEnd: true, vScale: 3 });
const surfaceV = (kind: Kind, secs: SecV[]) => loft(secs.map((s) => foilV(kind, s)), { uOf: foilU, capEnd: true, vScale: 2 });

/** Round fuselage from stations [x, radius, (centre y), (height scale)]. */
function fuselage(stations: number[][], seg = 28, vScale = 6): THREE.BufferGeometry {
  const rings = stations.map(([x, r, y0 = 0, ky = 1]) => {
    const ring: V[] = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      ring.push([x, y0 + Math.sin(a) * r * ky, Math.cos(a) * r]);
    }
    return ring;
  });
  return loft(rings, { capStart: true, capEnd: true, vScale });
}

function strut(a: V, b: V, r: number, mat: THREE.Material): THREE.Mesh {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, va.distanceTo(vb), 8), mat);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return m;
}

/** Cylinder along the x axis (nacelles, tanks). */
function tube(r0: number, r1: number, len: number, mat: THREE.Material, open = false): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r1, r0, len, 20, 1, open); // top = +x end radius r1
  g.rotateZ(-Math.PI / 2);
  return new THREE.Mesh(g, mat);
}

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

export interface X15Model {
  group: THREE.Group;
  /** Exhaust plume group; scale it with thrust */
  flame: THREE.Object3D;
  /** Fuselage shell and canopy, hidden when the camera is inside the cockpit */
  exterior: THREE.Object3D;
  ventral: THREE.Object3D;
  gear: THREE.Object3D;
  /** Named pieces used to break the aircraft apart in a crash */
  parts: Record<string, THREE.Object3D>;
}

export function buildX15(): X15Model {
  const group = new THREE.Group();
  const skinMap = skinTexture();
  const skin = new THREE.MeshStandardMaterial({ map: skinMap, color: 0xffffff, metalness: 0.35, roughness: 0.55, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.5, roughness: 0.6, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: 0x6d7076, metalness: 0.7, roughness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0d1319, metalness: 0.2, roughness: 0.08 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const parts: Record<string, THREE.Object3D> = {};

  // ---- Fuselage ------------------------------------------------------------
  const exterior = new THREE.Group();
  const fus = new THREE.Mesh(
    fuselage([
      [8.1, 0.28], [7.6, 0.38], [6.8, 0.5], [5.8, 0.6], [4.8, 0.66], [3.5, 0.69], [1.5, 0.7],
      [-1.5, 0.7], [-3.5, 0.66], [-5.0, 0.58], [-6.2, 0.52], [-6.5, 0.5],
    ]),
    skin,
  );
  exterior.add(fus);
  // Ball nose and pitot boom
  exterior.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), new THREE.MeshStandardMaterial({ color: 0x24262a, metalness: 0.6, roughness: 0.35 })), 8.1, 0, 0));
  exterior.add(at(tube(0.012, 0.012, 1.2, metal), 9.0, 0, 0));
  // Canopy hump with two small windscreen panes
  const hump = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  hump.scale(1.25, 0.42, 0.46);
  exterior.add(at(new THREE.Mesh(hump, skin), 4.05, 0.6, 0));
  for (const s of [-1, 1]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.2), glass);
    pane.position.set(5.05, 0.78, s * 0.16);
    pane.rotation.set(0, Math.PI / 2 + s * 0.35, 0);
    pane.rotateX(-0.55 * s * 0);
    exterior.add(pane);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.17), glass);
    side.position.set(4.25, 0.68, s * 0.47);
    side.rotation.y = s > 0 ? 0 : Math.PI;
    exterior.add(side);
  }
  // Propellant side fairings ("tunnels")
  for (const s of [-1, 1]) {
    const t = new THREE.SphereGeometry(1, 20, 10);
    t.scale(4.3, 0.2, 0.2);
    exterior.add(at(new THREE.Mesh(t, skin), -0.6, -0.02, s * 0.76));
  }
  // Dorsal and ventral antennas, RCS nozzles on nose and wingtips
  exterior.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.02), metal), -2.4, 0.74, 0));
  exterior.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.02), metal), 1.2, -0.76, 0));
  for (const [y, z] of [[0.46, 0], [-0.46, 0], [0, 0.46], [0, -0.46]] as const) {
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.1, 8), dark);
    n.position.set(6.6, y, z);
    n.rotation.x = z === 0 ? 0 : Math.PI / 2;
    n.rotation.z = z === 0 ? 0 : 0;
    exterior.add(n);
  }
  parts.fuselage = exterior;
  group.add(exterior);

  // ---- XLR99 nozzle ---------------------------------------------------------
  const engine = new THREE.Group();
  engine.add(at(tube(0.5, 0.36, 0.9, dark, true), -6.7, 0, 0));
  engine.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), new THREE.MeshStandardMaterial({ color: 0x1a0d08, roughness: 1 })), -6.4, 0, 0));
  parts.engine = engine;
  group.add(engine);

  // ---- Wings: thin wedge section --------------------------------------------
  for (const s of [1, -1]) {
    const wing = new THREE.Mesh(
      surfaceH('wedge', [
        { le: 1.7, te: -2.8, yc: -0.2, z: 0.55, t: 0.34 },
        { le: -0.7, te: -2.6, yc: -0.2, z: 3.35, t: 0.13 },
      ]),
      skin,
    );
    wing.scale.z = s;
    parts[s > 0 ? 'wingR' : 'wingL'] = wing;
    group.add(wing);
    // Flap hinge line and wingtip RCS jet
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.1, 8), dark);
    jet.position.set(-1.6, -0.2, s * 3.35);
    jet.rotation.x = Math.PI / 2;
    group.add(jet);

    // All-moving stabilisers with 15° anhedral
    const stab = new THREE.Mesh(
      surfaceH('wedge', [
        { le: -3.4, te: -6.3, yc: -0.1, z: 0.55, t: 0.26 },
        { le: -5.3, te: -6.3, yc: -0.1 - 2.3 * Math.tan(15 * D2R), z: 2.85, t: 0.1 },
      ]),
      skin,
    );
    stab.scale.z = s;
    parts[s > 0 ? 'stabR' : 'stabL'] = stab;
    group.add(stab);
  }

  // ---- Vertical wedge fins ---------------------------------------------------
  const finSecs: SecV[] = [
    { le: -2.5, te: -6.3, y: 0.4, t: 0.62 },
    { le: -4.9, te: -6.3, y: 2.2, t: 0.34 },
  ];
  const upper = new THREE.Mesh(surfaceV('wedge', finSecs), skin);
  parts.finUpper = upper;
  group.add(upper);
  const ventral = new THREE.Group();
  ventral.add(new THREE.Mesh(surfaceV('wedge', [
    { le: -3.6, te: -6.3, y: -0.5, t: 0.56 },
    { le: -5.2, te: -6.3, y: -1.9, t: 0.3 },
  ]), skin));
  parts.ventral = ventral;
  group.add(ventral);

  // Markings: NASA and serial number on the fin, USAF on the aft fuselage
  const finHalf = (frac: number) => (0.62 - 0.28 * frac) / 2 + 0.012;
  for (const s of [1, -1]) {
    const nasa = textDecal('NASA', 1.5, 0.52, { color: '#e8e8e8' });
    nasa.position.set(-4.7, 1.4, s * finHalf(0.55));
    nasa.rotation.y = s > 0 ? 0 : Math.PI;
    upper.add(nasa);
    const tail = textDecal('66670', 1.35, 0.3, { color: '#e8e8e8' });
    tail.position.set(-4.9, 0.85, s * finHalf(0.25));
    tail.rotation.y = s > 0 ? 0 : Math.PI;
    upper.add(tail);
    const usaf = textDecal('USAF', 1.5, 0.3, { color: '#e8e8e8' });
    usaf.position.set(-2.0, 0.12, s * 0.715);
    usaf.rotation.y = s > 0 ? 0 : Math.PI;
    exterior.add(usaf);
  }

  // ---- Landing gear: nose wheel and two rear skids -----------------------------
  const gear = new THREE.Group();
  gear.add(strut([4.4, -0.55, 0], [4.4, -1.15, 0], 0.045, metal));
  const wheel = new THREE.CylinderGeometry(0.2, 0.2, 0.14, 20);
  wheel.rotateX(Math.PI / 2);
  gear.add(at(new THREE.Mesh(wheel, tyre), 4.4, -1.15, 0));
  gear.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.2), metal), 4.4, -0.55, 0));
  for (const s of [-1, 1]) {
    gear.add(at(new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.07, 0.15), metal), -1.6, -1.31, s * 1.35));
    const toe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.15), metal);
    toe.position.set(-0.2, -1.26, s * 1.35);
    toe.rotation.z = 0.28;
    gear.add(toe);
    gear.add(strut([-1.0, -0.55, s * 0.62], [-1.3, -1.28, s * 1.35], 0.04, metal));
    gear.add(strut([-2.0, -0.55, s * 0.62], [-1.9, -1.28, s * 1.35], 0.04, metal));
  }
  parts.gear = gear;
  group.add(gear);

  // ---- Exhaust plume: bright core inside a translucent bell ------------------
  const flame = new THREE.Group();
  const bell = new THREE.ConeGeometry(0.5, 9, 20, 1, true);
  bell.rotateZ(Math.PI / 2);
  bell.translate(-4.5, 0, 0);
  flame.add(new THREE.Mesh(bell, new THREE.MeshBasicMaterial({ color: 0xff9a45, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
  const core = new THREE.ConeGeometry(0.28, 5, 16, 1, true);
  core.rotateZ(Math.PI / 2);
  core.translate(-2.5, 0, 0);
  flame.add(new THREE.Mesh(core, new THREE.MeshBasicMaterial({ color: 0xcfe4ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
  flame.position.x = -7.0;
  flame.visible = false;
  group.add(flame);

  return { group, flame, exterior, ventral, gear, parts };
}

// ---------------------------------------------------------------------------------------------

/** Interpolate B-52 wing planform at span station z. */
const B52_WING: Sec[] = [
  { le: 4.5, te: -6.5, yc: 0.9, z: 1.5, t: 1.7 },
  { le: -0.9, te: -9.0, yc: 1.05, z: 9.0, t: 1.2 },
  { le: -15.3, te: -17.3, yc: 1.9, z: 28.2, t: 0.35 },
];

function wingAt(z: number): Sec {
  const a = B52_WING;
  const k = z < a[1].z ? 0 : 1;
  const f = (z - a[k].z) / (a[k + 1].z - a[k].z);
  const m = (p: keyof Sec) => (a[k][p] as number) + ((a[k + 1][p] as number) - (a[k][p] as number)) * f;
  return { le: m('le'), te: m('te'), yc: m('yc'), z, t: m('t') };
}

/** Where the X-15 hangs, in the B-52 frame (the X-15 centre of gravity). */
export const X15_ON_B52: V = [-4.0, -2.6, 5.6];

export function buildB52(): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ map: whiteSkinTexture(), color: 0xffffff, metalness: 0.15, roughness: 0.6, side: THREE.DoubleSide });
  const wingMat = new THREE.MeshStandardMaterial({ map: wingTexture(), color: 0xffffff, metalness: 0.15, roughness: 0.6, side: THREE.DoubleSide });
  const grey = new THREE.MeshStandardMaterial({ color: 0x8c9096, metalness: 0.5, roughness: 0.45, side: THREE.DoubleSide });
  const black = new THREE.MeshStandardMaterial({ color: 0x090a0c, metalness: 0.4, roughness: 0.7, side: THREE.DoubleSide });
  const red = new THREE.MeshStandardMaterial({ color: 0xc02a1d, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b1118, metalness: 0.2, roughness: 0.08 });

  // Fuselage
  g.add(new THREE.Mesh(
    fuselage([
      [23.85, 0], [23.5, 0.5], [22.6, 0.95], [21.2, 1.3], [19.0, 1.6, 0.1, 1.06], [17.0, 1.75, 0.12, 1.08], [12.0, 1.85, 0.05],
      [4.0, 1.9], [-4.0, 1.9], [-9.0, 1.75], [-14.0, 1.4], [-18.0, 1.05], [-21.5, 0.7], [-23.5, 0.4], [-24.2, 0.3],
    ], 32, 12),
    white,
  ));
  // Cockpit windows: two forward panes, two side panes per side
  for (const s of [-1, 1]) {
    for (const x of [18.0, 17.0]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.36), glass);
      w.position.set(x, 0.85, s * 1.62);
      w.rotation.y = s > 0 ? 0 : Math.PI;
      g.add(w);
    }
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.34), glass);
    f.position.set(19.15, 0.9, s * 0.55);
    f.rotation.y = Math.PI / 2 - s * 0.45;
    g.add(f);
  }
  // Chin radome (the NASA NB-52B had no tail guns, so the tail ends in a plain cone)
  const chin = new THREE.SphereGeometry(0.75, 16, 10);
  chin.scale(1.6, 0.8, 0.9);
  g.add(at(new THREE.Mesh(chin, grey), 20.2, -1.45, 0));
  // Markings
  for (const s of [1, -1]) {
    const nasa = textDecal('NASA', 5.4, 1.35, { color: '#c8321f' });
    nasa.position.set(9.0, 0.3, s * 1.935);
    nasa.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(nasa);
    const usaf = textDecal('NB-52B', 3.8, 0.62, { color: '#5b5f66' });
    usaf.position.set(-9.5, 0.2, s * 1.77);
    usaf.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(usaf);
  }

  // Wings with engine pods and nav lights (NB-52 carried no external tanks)
  for (const s of [1, -1]) {
    if (s > 0) {
      // Right wing: notch cut in the inboard trailing edge to clear the X-15's upper fin
      const n0 = wingAt(X15_ON_B52[2] - 0.6);
      const n1 = wingAt(X15_ON_B52[2] + 0.6);
      const notchTe = -6.3;
      for (const secs of [
        [B52_WING[0], n0], // inboard of the notch (end cap forms the inboard wall)
        [{ ...n0, te: notchTe }, { ...n1, te: notchTe }], // shortened chord across the notch
        [n1, { ...n1, z: n1.z - 0.001 }], // outboard wall of the notch
        [n1, ...B52_WING.slice(1)], // outboard of the notch
      ]) g.add(new THREE.Mesh(surfaceH('lens', secs), wingMat));
    } else {
      const wing = new THREE.Mesh(surfaceH('lens', B52_WING), wingMat);
      wing.scale.z = s;
      g.add(wing);
    }

    for (const zc of [9.2, 15.6]) {
      const w = wingAt(zc);
      const under = w.yc - w.t / 2;
      const pod = new THREE.Group();
      pod.position.set(w.le - 0.2, under - 0.9, s * zc);
      for (const dz of [-0.95, 0.95]) {
        const nac = new THREE.Group();
        nac.position.z = dz;
        nac.add(tube(0.72, 0.8, 5.0, white));
        nac.add(at(tube(0.8, 0.74, 0.5, grey), 2.7, 0, 0));
        const intake = new THREE.Mesh(new THREE.CircleGeometry(0.66, 20), black);
        intake.position.x = 2.96;
        intake.rotation.y = Math.PI / 2;
        nac.add(intake);
        nac.add(at(tube(0.6, 0.42, 1.2, grey, true), -3.0, 0, 0));
        nac.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.38, 16), black), -2.4, 0, 0));
        pod.add(nac);
      }
      // Pod pylon
      const py = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9 + 0.2, 0.28), white);
      py.position.set(0.2, 0.75, 0);
      pod.add(py);
      g.add(pod);
    }

    // Navigation light at the wingtip: red left, green right
    const tip = wingAt(28.2);
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: s > 0 ? 0x30ff60 : 0xff3030 })), tip.te + 0.3, tip.yc, s * 28.1));

    // Horizontal stabiliser
    const stab = new THREE.Mesh(
      surfaceH('lens', [
        { le: -17.5, te: -22.0, yc: 0.35, z: 0.8, t: 0.7 },
        { le: -24.0, te: -26.3, yc: 0.9, z: 8.3, t: 0.2 },
      ]),
      white,
    );
    stab.scale.z = s;
    g.add(stab);
  }

  // Tail fin with red tip band and tail number
  const finBase: SecV = { le: -12.5, te: -23.5, y: 1.0, t: 0.7 };
  const finTip: SecV = { le: -19.5, te: -24.0, y: 9.0, t: 0.35 };
  const lerpSec = (f: number): SecV => ({
    le: finBase.le + (finTip.le - finBase.le) * f,
    te: finBase.te + (finTip.te - finBase.te) * f,
    y: finBase.y + (finTip.y - finBase.y) * f,
    t: finBase.t + (finTip.t - finBase.t) * f,
  });
  g.add(new THREE.Mesh(surfaceV('wedge', [lerpSec(0), lerpSec(0.82)]), white));
  g.add(new THREE.Mesh(surfaceV('wedge', [lerpSec(0.82), lerpSec(1)]), red));
  const fs = lerpSec(0.45);
  for (const s of [1, -1]) {
    const num = textDecal('008', 3.6, 1.5, { color: '#c8321f' });
    num.position.set((fs.le + fs.te) / 2 - 0.3, fs.y, s * (fs.t / 2 + 0.015));
    num.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(num);
  }
  // Anti-collision beacon on top of the fin
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 })), -22.5, 9.2, 0));

  // Pylon that carries the X-15 under the right wing (X-15 centre of gravity is at X15_ON_B52)
  const [px, py, pz] = X15_ON_B52;
  const wp = wingAt(pz);
  const top = wp.yc - wp.t / 2 + 0.25;
  const bottom = py + 0.66;
  const pylon = new THREE.Mesh(surfaceV('wedge', [
    { le: px + 1.9, te: px - 2.4, y: bottom, t: 0.34, z: pz },
    { le: px + 1.9, te: px - 2.4, y: top, t: 0.34, z: pz },
  ]), grey);
  g.add(pylon);
  // Attachment shackle on the X-15
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.3), black), px - 0.2, bottom, pz));
  return g;
}
