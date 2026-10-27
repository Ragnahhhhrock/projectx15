// Geometry-clipmap terrain: 12 nested rings of 64×64 cells (8 m doubling to 16 km), centred on the camera.
// Heights come from the same function the physics uses, so what you see is what you hit.
import * as THREE from 'three';
import { BASE, LAKE, LAKE_ELEV, baseMask, lakeDistance, terrainHeight } from '../world/terrain';
import { smoothstep, vnoise } from '../world/noise';

const N = 64;
const V = N + 1;
const HALF = N / 2;
const LEVELS = 12;
const C0 = 8;
const SNAP_CELLS = 8;
const EARTH_R = 6371000;

/** Noise octaves used for a level's heights (coarser levels need less detail). */
const octavesFor = (l: number) => (l <= 3 ? 5 : l <= 6 ? 4 : 3);

/** Paint rectangles in lake-relative metres: [cx, cz, angle, halfLength, halfWidth, kind]. */
export type PaintRect = [number, number, number, number, number, number];
export const KIND = { lakeRunway: 0, runway: 1, taxiway: 2, apron: 3, road: 4, track: 5 } as const;

function lineTo(ax: number, az: number, bx: number, bz: number, halfW: number, kind: number): PaintRect {
  return [(ax + bx) / 2, (az + bz) / 2, Math.atan2(bz - az, bx - ax), Math.hypot(bx - ax, bz - az) / 2, halfW, kind];
}

/** Everything painted on the ground, relative to the lake centre. */
export const PAINT: PaintRect[] = (() => {
  const bx = BASE.x - LAKE.x;
  const bz = BASE.z - LAKE.z;
  return [
    // Lakebed runways
    [-400, 200, 0.2, 4400, 45, KIND.lakeRunway],
    [300, -300, 1.5, 3100, 40, KIND.lakeRunway],
    [0, 0, -0.55, 3500, 40, KIND.lakeRunway],
    // Paved runway 09/27, parallel taxiway, connectors and ramp
    [bx, bz, 0, 2300, 30.5, KIND.runway],
    [bx, bz + 190, 0, 2200, 11, KIND.taxiway],
    [bx - 1900, bz + 95, Math.PI / 2, 95, 11, KIND.taxiway],
    [bx - 400, bz + 95, Math.PI / 2, 95, 11, KIND.taxiway],
    [bx + 1700, bz + 95, Math.PI / 2, 95, 11, KIND.taxiway],
    [bx + 1000, bz + 420, 0, 650, 210, KIND.apron],
    [bx - 1200, bz + 330, 0, 250, 120, KIND.apron],
    // Roads and tracks
    lineTo(bx + 2400, bz, bx + 3300, bz - 1500, 5, KIND.road),
    lineTo(bx + 3300, bz - 1500, bx + 5200, bz - 2900, 5, KIND.road),
    lineTo(bx - 2400, bz, bx - 6000, bz + 900, 5, KIND.road),
    lineTo(bx + 1000, bz + 640, bx + 1000, bz + 1400, 5, KIND.road),
    lineTo(bx + 5200, bz - 2900, bx + 7000, bz - 3400, 3, KIND.track),
    lineTo(bx - 6000, bz + 900, bx - 9500, bz + 400, 3, KIND.track),
  ];
})();

/** Tileable value noise packed into RGB: fine / medium / coarse. */
function detailTexture(): THREE.DataTexture {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const hash = (x: number, y: number, s: number) => {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const tn = (u: number, v: number, per: number, s: number) => {
    const x = u * per;
    const y = v * per;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const w = (i: number) => ((i % per) + per) % per;
    const a = hash(w(ix), w(iy), s);
    const b = hash(w(ix + 1), w(iy), s);
    const c = hash(w(ix), w(iy + 1), s);
    const d = hash(w(ix + 1), w(iy + 1), s);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const fbm = (u: number, v: number, base: number, s: number) =>
    tn(u, v, base, s) * 0.5 + tn(u, v, base * 2, s + 1) * 0.3 + tn(u, v, base * 4, s + 2) * 0.2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const i = (y * S + x) * 4;
      data[i] = Math.round(255 * fbm(u, v, 8, 10));
      data[i + 1] = Math.round(255 * fbm(u, v, 6, 20));
      data[i + 2] = Math.round(255 * fbm(u, v, 4, 30));
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const GLSL_PAINT = /* glsl */ `
uniform int uRectCount;
uniform vec4 uRA[20];
uniform vec4 uRB[20];
uniform sampler2D uDetailTex;
uniform vec2 uOriginLake;
uniform vec2 uOriginDet;
varying vec2 vLake;
varying vec2 vDet;
varying float vDist;

float lineAA(float d, float w) {
  float aa = max(fwidth(d), 1e-4);
  return clamp((w - abs(d)) / aa + 0.5, 0.0, 1.0) * clamp(w * 2.0 / aa, 0.0, 1.0);
}
float boxAA(vec2 q, vec2 hs) {
  vec2 aa = max(fwidth(q), vec2(1e-4));
  vec2 c = clamp((hs - abs(q)) / aa + 0.5, 0.0, 1.0);
  return c.x * c.y;
}
float dashAA(float x, float period, float duty) {
  float f = fract(x / period);
  float aa = fwidth(x / period);
  float d = smoothstep(0.0, aa, f) * (1.0 - smoothstep(duty, duty + aa, f));
  return mix(d, duty, clamp(aa * 1.5, 0.0, 1.0));
}

vec3 paintGround(vec3 base, vec2 p, float det) {
  vec3 col = base;
  for (int i = 0; i < 20; i++) {
    if (i >= uRectCount) break;
    vec4 a = uRA[i];
    vec4 b = uRB[i];
    vec2 d = p - a.xy;
    vec2 q = vec2(dot(d, vec2(a.z, a.w)), dot(d, vec2(-a.w, a.z)));
    if (abs(q.x) > b.x + 3.0 || abs(q.y) > b.y + 3.0) continue;
    float kind = b.z;
    float inside = boxAA(q, b.xy);
    float L = b.x;
    float W = b.y;
    if (kind < 0.5) {
      // Lakebed runway: dark edge lines, dashed centreline, threshold bars
      col = mix(col, col * 0.93 + 0.02, inside);
      vec3 ink = vec3(0.13, 0.115, 0.10);
      float e = max(lineAA(q.y - (W - 2.0), 0.7), lineAA(q.y + (W - 2.0), 0.7)) * step(abs(q.x), L);
      float c = lineAA(q.y, 0.6) * dashAA(q.x, 40.0, 0.5) * step(abs(q.x), L - 120.0);
      float bars = step(L - 70.0, abs(q.x)) * step(abs(q.x), L - 10.0) * step(abs(q.y), W - 6.0) * dashAA(q.y, 5.0, 0.5);
      col = mix(col, ink, max(max(e, c), bars * 0.9));
    } else if (kind < 1.5) {
      // Paved runway
      vec3 asph = vec3(0.095, 0.095, 0.10) * (1.0 + det * 0.4);
      float rub = smoothstep(L - 560.0, L - 300.0, abs(q.x)) * (1.0 - smoothstep(L - 300.0, L - 40.0, abs(q.x))) * (1.0 - smoothstep(0.0, 9.0, abs(abs(q.y) - 4.5))) * 0.5;
      asph *= 1.0 - rub * 0.35;
      col = mix(col, asph, inside);
      vec3 paint = vec3(0.82);
      float e = max(lineAA(q.y - (W - 1.2), 0.45), lineAA(q.y + (W - 1.2), 0.45)) * step(abs(q.x), L);
      float c = lineAA(q.y, 0.45) * dashAA(q.x + 30.0, 36.0, 0.55) * step(abs(q.x), L - 340.0);
      float keys = step(L - 75.0, abs(q.x)) * step(abs(q.x), L - 30.0) * step(abs(q.y), W - 3.0) * step(0.35, abs(fract(q.y / 3.0) - 0.5) * 2.0) * step(1.2, abs(q.y));
      float aim = step(abs(abs(q.x) - (L - 300.0)), 22.0) * step(abs(q.y), 9.0) * step(3.0, abs(q.y));
      float tz = 0.0;
      for (int k = 1; k < 4; k++) tz += step(abs(abs(q.x) - (L - 150.0 - float(k) * 150.0)), 11.0) * step(abs(q.y), 9.0) * step(3.5, abs(q.y)) * step(float(k), 3.0);
      float marks = max(max(e, c), max(keys, max(aim, tz)));
      col = mix(col, paint, marks * inside);
    } else if (kind < 2.5) {
      vec3 asph = vec3(0.12, 0.12, 0.125) * (1.0 + det * 0.4);
      col = mix(col, asph, inside);
      float c = lineAA(q.y, 0.2) * step(abs(q.x), L);
      col = mix(col, vec3(0.78, 0.62, 0.1), c * inside);
    } else if (kind < 3.5) {
      vec3 conc = vec3(0.45, 0.44, 0.42) * (1.0 + det * 0.25);
      float joints = max(lineAA(fract(q.x / 7.5 + 0.5) - 0.5, 0.01), lineAA(fract(q.y / 7.5 + 0.5) - 0.5, 0.01)) * 0.12;
      col = mix(col, conc * (1.0 - joints), inside);
    } else if (kind < 4.5) {
      vec3 asph = vec3(0.16, 0.16, 0.17) * (1.0 + det * 0.5);
      col = mix(col, asph, inside);
      float c = lineAA(q.y, 0.12) * dashAA(q.x, 12.0, 0.5);
      col = mix(col, vec3(0.7, 0.58, 0.2), c * inside);
    } else {
      float soft = clamp((W - abs(q.y)) / (W * 0.8), 0.0, 1.0) * step(abs(q.x), L);
      col = mix(col, col * 0.78, soft * 0.8);
    }
  }
  return col;
}
`;

interface Level {
  l: number;
  c: number;
  mesh: THREE.Mesh;
  pos: Float32Array;
  col: Float32Array;
  nrm: Float32Array;
  index: THREE.BufferAttribute;
  geom: THREE.BufferGeometry;
  center: [number, number];
  valid: boolean;
  holeKey: string;
  originLake: THREE.Vector2;
  originDet: THREE.Vector2;
}

const srgb = (c: number) => Math.pow(Math.max(0, Math.min(1, c)), 2.2);

export class Terrain {
  readonly group = new THREE.Group();
  private levels: Level[] = [];
  private minLevel = 0;
  private heights = new Float32Array((V + 2) * (V + 2));
  private detail = detailTexture();
  private uCount = { value: PAINT.length };
  private uRA = { value: Array.from({ length: 20 }, (_, i) => (PAINT[i] ? new THREE.Vector4(PAINT[i][0], PAINT[i][1], Math.cos(PAINT[i][2]), Math.sin(PAINT[i][2])) : new THREE.Vector4())) };
  private uRB = { value: Array.from({ length: 20 }, (_, i) => (PAINT[i] ? new THREE.Vector4(PAINT[i][3], PAINT[i][4], PAINT[i][5], 0) : new THREE.Vector4())) };

  constructor() {
    for (let l = 0; l < LEVELS; l++) this.levels.push(this.makeLevel(l));
    for (const lv of this.levels) this.group.add(lv.mesh);
  }

  private makeLevel(l: number): Level {
    const c = C0 * 2 ** l;
    const pos = new Float32Array(V * V * 3);
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const k = (j * V + i) * 3;
        pos[k] = (i - HALF) * c;
        pos[k + 2] = (j - HALF) * c;
      }
    }
    const col = new Float32Array(V * V * 3);
    const nrm = new Float32Array(V * V * 3);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute('normal', new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage));
    const index = new THREE.BufferAttribute(new Uint16Array(N * N * 6), 1).setUsage(THREE.DynamicDrawUsage);
    geom.setIndex(index);

    const originLake = new THREE.Vector2();
    const originDet = new THREE.Vector2();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mat.customProgramCacheKey = () => 'terrain-v1';
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRectCount = this.uCount;
      shader.uniforms.uRA = this.uRA;
      shader.uniforms.uRB = this.uRB;
      shader.uniforms.uDetailTex = { value: this.detail };
      shader.uniforms.uOriginLake = { value: originLake };
      shader.uniforms.uOriginDet = { value: originDet };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform vec2 uOriginLake;\nuniform vec2 uOriginDet;\nvarying vec2 vLake;\nvarying vec2 vDet;\nvarying float vDist;`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 wpC = modelMatrix * vec4(transformed, 1.0);
          float dd = max(0.0, length(wpC.xz) - 15000.0);
          transformed.y -= dd * dd / (2.0 * ${EARTH_R}.0);
          vLake = transformed.xz + uOriginLake;
          vDet = transformed.xz + uOriginDet;
          vDist = length(wpC.xyz);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${GLSL_PAINT}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            float nearF = 1.0 - smoothstep(200.0, 3000.0, vDist);
            float midF = 1.0 - smoothstep(1500.0, 25000.0, vDist);
            float n1 = texture2D(uDetailTex, vDet * 0.125).r;
            float n2 = texture2D(uDetailTex, vDet * 0.015625).g;
            float n3 = texture2D(uDetailTex, vDet * 0.001953125).b;
            float det = (n1 - 0.5) * 0.45 * nearF + (n2 - 0.5) * 0.4 * midF + (n3 - 0.5) * 0.3;
            diffuseColor.rgb *= 1.0 + det;
            diffuseColor.rgb = paintGround(diffuseColor.rgb, vLake, det);
          }`,
        );
    };

    const mesh = new THREE.Mesh(geom, mat);
    mesh.frustumCulled = false;
    return { l, c, mesh, pos, col, nrm, index, geom, center: [NaN, NaN], valid: false, holeKey: '', originLake, originDet };
  }

  /** Rebuild heights, normals and colours for one level around (cx, cz). */
  private fill(lv: Level, cx: number, cz: number): void {
    const { c, pos, col, nrm } = lv;
    const oct = octavesFor(lv.l);
    const W = V + 2;
    const H = this.heights;
    for (let j = -1; j <= V; j++) {
      for (let i = -1; i <= V; i++) {
        H[(j + 1) * W + i + 1] = terrainHeight(cx + (i - HALF) * c, cz + (j - HALF) * c, oct);
      }
    }
    // Make outer-edge heights agree with the next coarser level so rings meet without cracks
    if (lv.l < LEVELS - 1) {
      const oc = octavesFor(lv.l + 1);
      const edge = (i: number, j: number) => {
        H[(j + 1) * W + i + 1] = oc === oct ? H[(j + 1) * W + i + 1] : terrainHeight(cx + (i - HALF) * c, cz + (j - HALF) * c, oc);
      };
      for (let k = 0; k < V; k++) { edge(k, 0); edge(k, N); edge(0, k); edge(N, k); }
      for (let k = 1; k < N; k += 2) {
        H[1 * W + k + 1] = (H[1 * W + k] + H[1 * W + k + 2]) / 2;
        H[(N + 1) * W + k + 1] = (H[(N + 1) * W + k] + H[(N + 1) * W + k + 2]) / 2;
        H[(k + 1) * W + 1] = (H[k * W + 1] + H[(k + 2) * W + 1]) / 2;
        H[(k + 1) * W + N + 1] = (H[k * W + N + 1] + H[(k + 2) * W + N + 1]) / 2;
      }
    }
    const sunBias = 0;
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const k = (j * V + i) * 3;
        const h = H[(j + 1) * W + i + 1];
        const dhx = (H[(j + 1) * W + i + 2] - H[(j + 1) * W + i]) / (2 * c);
        const dhz = (H[(j + 2) * W + i + 1] - H[j * W + i + 1]) / (2 * c);
        const inv = 1 / Math.hypot(dhx, 1, dhz);
        nrm[k] = -dhx * inv;
        nrm[k + 1] = inv;
        nrm[k + 2] = -dhz * inv;
        pos[k + 1] = h;
        const slope = Math.hypot(dhx, dhz);
        this.color(col, k, cx + (i - HALF) * c, cz + (j - HALF) * c, h, slope, sunBias);
      }
    }
    lv.geom.attributes.position.needsUpdate = true;
    lv.geom.attributes.normal.needsUpdate = true;
    lv.geom.attributes.color.needsUpdate = true;
    lv.center = [cx, cz];
    lv.mesh.position.set(cx, 0, cz);
    lv.originLake.set(cx - LAKE.x, cz - LAKE.z);
    lv.originDet.set(((cx % 1024) + 1024) % 1024, ((cz % 1024) + 1024) % 1024);
    lv.valid = true;
  }

  private color(col: Float32Array, k: number, x: number, z: number, h: number, slope: number, _bias: number): void {
    const patch = vnoise(x / 900 + 5.1, z / 900 - 2.3);
    const grain = vnoise(x / 130, z / 130);
    const scrub = smoothstep(0.55, 0.75, vnoise(x / 420 + 11, z / 420 + 3));
    const rel = h - LAKE_ELEV;
    // Base desert tan, warming and darkening with elevation
    let r = 0.66 - rel * 0.00006;
    let g = 0.55 - rel * 0.00007;
    let b = 0.4 - rel * 0.00005;
    const tone = 0.9 + 0.2 * patch + 0.06 * (grain - 0.5);
    r *= tone; g *= tone; b *= tone;
    // Creosote scrub tints the lower plains olive-green
    const plain = 1 - smoothstep(150, 700, rel);
    const sc = scrub * plain * 0.55;
    r += (0.45 - r) * sc; g += (0.46 - g) * sc; b += (0.3 - b) * sc;
    // Rock on steep ground and high ridges
    const rock = Math.max(smoothstep(0.18, 0.55, slope), smoothstep(900, 2000, rel));
    r += (0.42 - r) * rock * 0.75; g += (0.37 - g) * rock * 0.75; b += (0.33 - b) * rock * 0.75;
    // Lakebed: pale alkali clay with a darker rim
    const e = lakeDistance(x, z);
    const lake = 1 - smoothstep(0.96, 1.12, e);
    const crack = 0.96 + 0.06 * grain;
    r += (0.84 * crack - r) * lake; g += (0.79 * crack - g) * lake; b += (0.68 * crack - b) * lake;
    const rim = smoothstep(0.88, 1.0, e) * (1 - smoothstep(1.0, 1.1, e));
    r *= 1 - rim * 0.1; g *= 1 - rim * 0.1; b *= 1 - rim * 0.1;
    // Graded airbase pad
    const pad = baseMask(x, z);
    r += (0.62 - r) * pad * 0.8; g += (0.57 - g) * pad * 0.8; b += (0.47 - b) * pad * 0.8;
    col[k] = srgb(r);
    col[k + 1] = srgb(g);
    col[k + 2] = srgb(b);
  }

  /** Rebuild the triangle list for a level, leaving out the area covered by the finer ring. */
  private setIndex(lv: Level, hole: [number, number, number, number] | null): void {
    const arr = lv.index.array as Uint16Array;
    let n = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        if (hole && i >= hole[0] && i < hole[1] && j >= hole[2] && j < hole[3]) continue;
        const a = j * V + i;
        const b = a + 1;
        const c = a + V;
        const d = c + 1;
        // Alternate the diagonal to avoid directional artefacts
        if (((i + j) & 1) === 0) {
          arr[n++] = a; arr[n++] = c; arr[n++] = b;
          arr[n++] = b; arr[n++] = c; arr[n++] = d;
        } else {
          arr[n++] = a; arr[n++] = c; arr[n++] = d;
          arr[n++] = a; arr[n++] = d; arr[n++] = b;
        }
      }
    }
    lv.geom.setDrawRange(0, n);
    lv.index.needsUpdate = true;
  }

  /** Move the rings to follow the camera (absolute world metres). */
  update(cam: THREE.Vector3, agl: number): void {
    // Finest ring worth drawing at this height: cells smaller than ~altitude/450 are wasted
    let want = 0;
    while (want < LEVELS - 1 && C0 * 2 ** (want + 1) <= Math.max(agl, 1) / 450) want++;
    if (want > this.minLevel + 0 || want < this.minLevel) this.minLevel = want;

    for (let l = 0; l < LEVELS; l++) {
      const lv = this.levels[l];
      lv.mesh.visible = l >= this.minLevel;
      if (l < this.minLevel) continue;
      const snap = SNAP_CELLS * lv.c;
      const cx = Math.round(cam.x / snap) * snap;
      const cz = Math.round(cam.z / snap) * snap;
      if (!lv.valid || cx !== lv.center[0] || cz !== lv.center[1]) this.fill(lv, cx, cz);
    }
    for (let l = this.minLevel; l < LEVELS; l++) {
      const lv = this.levels[l];
      let hole: [number, number, number, number] | null = null;
      if (l > this.minLevel) {
        const f = this.levels[l - 1];
        const x0 = f.center[0] - HALF * f.c;
        const x1 = f.center[0] + HALF * f.c;
        const z0 = f.center[1] - HALF * f.c;
        const z1 = f.center[1] + HALF * f.c;
        const ox = lv.center[0] - HALF * lv.c;
        const oz = lv.center[1] - HALF * lv.c;
        hole = [Math.round((x0 - ox) / lv.c), Math.round((x1 - ox) / lv.c), Math.round((z0 - oz) / lv.c), Math.round((z1 - oz) / lv.c)];
      }
      const key = hole ? hole.join(',') : 'none';
      if (key !== lv.holeKey) {
        lv.holeKey = key;
        this.setIndex(lv, hole);
      }
    }
  }
}
