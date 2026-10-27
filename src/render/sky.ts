// Sky dome: blue-to-black gradient by altitude, horizon haze, atmosphere limb, sun and stars.
import * as THREE from 'three';

const EARTH_R = 6371000;
const col = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

export const SUN_DIR = new THREE.Vector3(-0.5, 0.72, 0.45).normalize();

export interface Atmosphere {
  zenith: THREE.Color;
  horizon: THREE.Color;
  /** Scene fog colour */
  fog: THREE.Color;
  /** 1 at sea level, → 0 in space */
  density: number;
}

const ZENITH_GROUND = [0.17, 0.38, 0.78];
const HORIZON_GROUND = [0.74, 0.83, 0.92];

export function atmosphere(alt: number): Atmosphere {
  const f = Math.exp(-Math.max(0, alt) / 21000);
  const z = ZENITH_GROUND.map((v) => v * f) as [number, number, number];
  const h = HORIZON_GROUND.map((v) => v * f) as [number, number, number];
  const fogK = 0.28 + 0.72 * f;
  return {
    zenith: col(z[0], z[1], z[2] + 0.004 * (1 - f)),
    horizon: col(h[0], h[1], h[2]),
    fog: col(HORIZON_GROUND[0] * fogK, HORIZON_GROUND[1] * fogK, HORIZON_GROUND[2] * fogK),
    density: f,
  };
}

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w * 0.999999;
}`;

const frag = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSun;
uniform float uDip;
uniform float uStars;
uniform float uLimb;
uniform float uDensity;
varying vec3 vDir;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  vec3 d = normalize(vDir);
  float e = d.y - uDip;
  float t = pow(clamp(e * 1.7, 0.0, 1.0), 0.5);
  vec3 col = mix(uHorizon, uZenith, t);
  col = mix(col, uHorizon * 0.9, smoothstep(0.0, -0.1, e));

  float sd = dot(d, uSun);
  float disc = smoothstep(0.99985, 0.99995, sd);
  col += vec3(1.0, 0.95, 0.85) * (disc * 6.0 + pow(max(sd, 0.0), 24.0) * 0.35 * uDensity + pow(max(sd, 0.0), 6.0) * 0.12 * uDensity);

  // Stars appear as the sky thins
  vec3 p = d * 140.0;
  vec3 ip = floor(p);
  vec3 fp = fract(p) - 0.5;
  float h = hash(ip);
  float star = step(0.975, h) * smoothstep(0.32, 0.0, length(fp)) * (0.4 + 0.6 * fract(h * 91.7));
  float milky = pow(max(0.0, 1.0 - abs(dot(d, normalize(vec3(0.3, 0.8, -0.5)))) * 3.0), 2.0) * 0.06;
  col += vec3(0.9, 0.95, 1.0) * (star + milky) * uStars * smoothstep(-0.02, 0.05, e);

  // Thin blue glow along the horizon, seen from altitude
  float limb = exp(-abs(e) * 70.0) * uLimb;
  col += vec3(0.28, 0.5, 1.0) * limb * (e > 0.0 ? 1.0 : 0.5);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  readonly mesh: THREE.Mesh;
  private u = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSun: { value: SUN_DIR.clone() },
    uDip: { value: 0 },
    uStars: { value: 0 },
    uLimb: { value: 0 },
    uDensity: { value: 1 },
  };

  constructor() {
    const mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1e6, 48, 24), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
  }

  update(alt: number, camPos: THREE.Vector3): Atmosphere {
    const a = atmosphere(alt);
    this.u.uZenith.value.copy(a.zenith);
    this.u.uHorizon.value.copy(a.horizon);
    this.u.uDip.value = -Math.sqrt((2 * Math.max(0, alt)) / EARTH_R);
    this.u.uStars.value = THREE.MathUtils.clamp(1.4 - a.density * 5, 0, 1);
    this.u.uLimb.value = THREE.MathUtils.clamp(alt / 25000, 0, 1) * 0.9 * (0.4 + 0.6 * Math.min(1, a.density * 6));
    this.u.uDensity.value = a.density;
    this.mesh.position.copy(camPos);
    return a;
  }
}
