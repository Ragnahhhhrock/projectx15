// Three.js scene with a floating origin: the X-15 sits at the origin and the world moves.
import * as THREE from 'three';
import type { Telemetry } from '../physics/sim';
import { buildB52, buildX15, type X15Model } from './models';
import { ViewControl } from './viewcontrol';

export type CameraMode = 'chase' | 'cockpit' | 'side';
export const CAMERA_MODES: CameraMode[] = ['chase', 'cockpit', 'side'];

/** Rogers Dry Lake, placed downrange of the launch point for now (m). */
const LAKE_POSITION = new THREE.Vector3(360000, 0, 0);
/** B-52 offset from the X-15 in its body frame while captive (X-15 is under the right wing). */
const B52_OFFSET = new THREE.Vector3(1.5, 4.6, -8.5);

/** Base external camera offsets in the X-15 body frame (x forward, y up, z right). */
const EXTERNAL_OFFSETS: Record<Exclude<CameraMode, 'cockpit'>, THREE.Vector3> = {
  chase: new THREE.Vector3(-30, 6, 0),
  side: new THREE.Vector3(-4, 3, 28),
};
/** Pilot eye point in the body frame (m). */
const EYE = new THREE.Vector3(5.2, 0.75, 0);
/** Turns a camera (looking down -z) to look along body +x. */
const LOOK_FORWARD = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

const SKY_LOW = new THREE.Color(0x8db8de);
const SKY_HIGH = new THREE.Color(0x0b1a3a);
const SPACE = new THREE.Color(0x000002);

export class SceneView {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world = new THREE.Group();
  private x15: X15Model;
  private b52 = buildB52();
  private b52Release: { pos: THREE.Vector3; t: number; vel: THREE.Vector3 } | null = null;
  private camQuat = new THREE.Quaternion();
  private fog: THREE.Fog;
  private _mode: CameraMode = 'chase';
  readonly look: ViewControl;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.look = new ViewControl(canvas);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 4e6);
    this.fog = new THREE.Fog(SKY_LOW, 80000, 900000);
    this.scene.fog = this.fog;

    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(-0.4, 1, 0.3);
    this.scene.add(sun, new THREE.HemisphereLight(0xbcd6ff, 0x6b5a45, 0.9));

    this.x15 = buildX15();
    this.scene.add(this.x15.group, this.world);
    this.world.add(this.buildGround(), this.b52);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private buildGround(): THREE.Group {
    const g = new THREE.Group();

    // Desert floor with a procedural texture
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#b39a74';
    ctx.fillRect(0, 0, 256, 256);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 1800; i++) {
      const v = 140 + rnd() * 60;
      ctx.fillStyle = `rgb(${v + 20},${v},${v - 30})`;
      ctx.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 6, 2 + rnd() * 6);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1500, 1500);
    tex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6e6, 6e6), new THREE.MeshLambertMaterial({ map: tex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 700;
    g.add(floor);

    // Rogers Dry Lake (~11 km × 7 km) with runway lines
    const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshLambertMaterial({ color: 0xe8dcc4 }));
    lake.scale.set(5500, 3500, 1);
    lake.rotation.x = -Math.PI / 2;
    lake.position.copy(LAKE_POSITION).setY(701);
    g.add(lake);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x2b2b2b });
    for (const angle of [0, 0.4, -0.6]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(9000, 45), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.rotation.z = angle;
      line.position.copy(LAKE_POSITION).setY(702);
      g.add(line);
    }

    // Scattered mountains for parallax and a sense of speed
    const count = 900;
    const cone = new THREE.ConeGeometry(1, 1, 6);
    cone.translate(0, 0.5, 0);
    const mountains = new THREE.InstancedMesh(cone, new THREE.MeshLambertMaterial({ color: 0x7d6a55, flatShading: true }), count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const x = (rnd() - 0.3) * 1.2e6;
      const z = (rnd() - 0.5) * 1.2e6;
      if (Math.hypot(x - LAKE_POSITION.x, z) < 20000) continue;
      const h = 600 + rnd() * 2400;
      const r = h * (1.5 + rnd() * 2.5);
      m.compose(new THREE.Vector3(x, 700, z), new THREE.Quaternion(), new THREE.Vector3(r, h, r));
      mountains.setMatrixAt(i, m);
    }
    g.add(mountains);
    return g;
  }

  get mode(): CameraMode {
    return this._mode;
  }

  /** Switching camera recentres the free-look view. */
  set mode(m: CameraMode) {
    this._mode = m;
    this.look.reset();
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(t: Telemetry, dt: number): void {
    const pos = new THREE.Vector3(...t.position);
    const att = new THREE.Quaternion(t.attitude[1], t.attitude[2], t.attitude[3], t.attitude[0]);

    // Floating origin
    this.world.position.copy(pos).negate();
    this.x15.group.quaternion.copy(att);

    // Exhaust
    const thrustFrac = t.thrust / 253500;
    this.x15.flame.visible = thrustFrac > 0.01;
    const plume = 1 + Math.min(3, t.altitude / 25000); // the plume balloons as ambient pressure falls
    this.x15.flame.scale.set(0.4 + thrustFrac, plume * (0.5 + thrustFrac * 0.5), plume * (0.5 + thrustFrac * 0.5));

    // B-52: rides with the X-15 until release, then flies straight and level
    if (t.attached) {
      this.b52Release = null;
      this.b52.position.copy(B52_OFFSET).applyQuaternion(att).add(pos);
      this.b52.quaternion.copy(att);
    } else {
      if (!this.b52Release) this.b52Release = { pos: this.b52.position.clone(), t: t.t, vel: new THREE.Vector3(236, 0, 0) };
      const r = this.b52Release;
      this.b52.position.copy(r.vel).multiplyScalar(t.t - r.t).add(r.pos);
    }
    this.b52.visible = this.b52.position.distanceTo(pos) < 60000;

    // Sky darkens with altitude
    const alt = t.altitude;
    const sky = alt < 30000 ? SKY_LOW.clone().lerp(SKY_HIGH, alt / 30000) : SKY_HIGH.clone().lerp(SPACE, Math.min(1, (alt - 30000) / 40000));
    this.scene.background = sky;
    this.fog.color.copy(sky);
    this.fog.near = 80000 + alt * 4;
    this.fog.far = 900000 + alt * 12;

    this.updateCamera(att, dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Orientation (body frame) for a camera at azimuth `az`, elevation `el` (positive looks down). */
  private static orient(az: number, el: number): THREE.Quaternion {
    return new THREE.Quaternion()
      .setFromAxisAngle(AXIS_Y, az)
      .multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_Z, -el))
      .multiply(LOOK_FORWARD);
  }

  private updateCamera(att: THREE.Quaternion, dt: number): void {
    const cam = this.camera;
    const look = this.look;
    if (this._mode === 'cockpit') {
      // Head turns freely through 360°; pan leans the head a little; zoom narrows the FOV.
      const q = SceneView.orient(-look.yaw, -look.pitch);
      const lean = new THREE.Vector3(
        THREE.MathUtils.clamp(look.panX, -0.3, 0.3),
        THREE.MathUtils.clamp(look.panY, -0.2, 0.2),
        0,
      ).applyQuaternion(q);
      cam.position.copy(EYE).add(lean).applyQuaternion(att);
      cam.quaternion.copy(att).multiply(q);
      cam.fov = THREE.MathUtils.clamp(70 * look.zoom, 12, 110);
    } else {
      this.camQuat.slerp(att, Math.min(1, dt * 3));
      const base = EXTERNAL_OFFSETS[this._mode];
      const az = Math.atan2(base.z, -base.x) + look.yaw;
      const el = Math.atan2(base.y, Math.hypot(base.x, base.z)) + look.pitch;
      const q = SceneView.orient(az, el);
      const dist = Math.max(6, base.length() * look.zoom);
      // Orbit around a target point that panning slides across the view plane.
      const target = new THREE.Vector3(look.panX * dist, look.panY * dist, 0).applyQuaternion(q);
      const back = new THREE.Vector3(0, 0, dist).applyQuaternion(q);
      cam.position.copy(target).add(back).applyQuaternion(this.camQuat);
      cam.quaternion.copy(this.camQuat).multiply(q);
      cam.fov = 55;
    }
    cam.updateProjectionMatrix();
  }
}
