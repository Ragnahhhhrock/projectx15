// Three.js scene with a floating origin: the X-15 sits at the origin and the world moves.
import * as THREE from 'three';
import type { Telemetry } from '../physics/sim';
import type { Controls } from '../physics/sim';
import { buildB52, buildX15, X15_ON_B52, type X15Model } from './models';
import { ViewControl } from './viewcontrol';
import { FlightGuide } from './guide';
import { Terrain } from './terrain';
import { Ground, Vegetation } from './ground';
import { Sky, SUN_DIR } from './sky';
import { Cockpit, EYE } from './cockpit';
import { Effects } from './effects';
import { terrainHeight } from '../world/terrain';

export type CameraMode = 'chase' | 'cockpit' | 'side';
export const CAMERA_MODES: CameraMode[] = ['chase', 'cockpit', 'side'];

/** B-52 offset from the X-15 in its body frame while captive (X-15 hangs under the right wing). */
const B52_OFFSET = new THREE.Vector3(-X15_ON_B52[0], -X15_ON_B52[1], -X15_ON_B52[2]);

/** Base external camera offsets in the X-15 body frame (x forward, y up, z right). */
const EXTERNAL_OFFSETS: Record<Exclude<CameraMode, 'cockpit'>, THREE.Vector3> = {
  chase: new THREE.Vector3(-30, 6, 0),
  side: new THREE.Vector3(-4, 3, 28),
};
/** Turns a camera (looking down -z) to look along body +x. */
const LOOK_FORWARD = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
/** The head starts tilted down so panel and windows are both in view. */
const COCKPIT_PITCH = 0.21;
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

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
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private terrain = new Terrain();
  private ground = new Ground();
  private vegetation = new Vegetation();
  private sky = new Sky();
  private cockpit = new Cockpit();
  readonly effects = new Effects();
  /** Latest pilot inputs, used to move the stick and throttle in the cockpit */
  controls: Controls | null = null;
  /** Approximate distance to the NB-52 for audio */
  b52Distance = 0;
  private wall = 0;
  private wreckAngle = 0;
  private _mode: CameraMode = 'chase';
  readonly look: ViewControl;
  readonly guide = new FlightGuide();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.look = new ViewControl(canvas);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 4e6);
    this.fog = new THREE.Fog(0xb8cde0, 15000, 330000);
    this.scene.fog = this.fog;

    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.7);
    this.sun.position.copy(SUN_DIR).multiplyScalar(100);
    this.hemi = new THREE.HemisphereLight(0xbcd6ff, 0x6b5a45, 0.9);
    this.scene.add(this.sun, this.hemi, this.sky.mesh);

    this.x15 = buildX15();
    this.x15.group.add(this.cockpit.group);
    this.scene.add(this.x15.group, this.world);
    this.world.add(this.terrain.group, this.ground.group, this.vegetation.group, this.effects.group, this.b52, this.guide.group);
    this.resize();
    window.addEventListener('resize', () => this.resize());
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

    this.b52Distance = this.b52.position.distanceTo(pos);

    // Cockpit versus exterior, gear and fin state
    const inside = this._mode === 'cockpit' && !t.crashed;
    this.x15.exterior.visible = !inside;
    this.cockpit.group.visible = inside;
    this.x15.gear.visible = t.gearDown;
    this.x15.ventral.visible = t.ventralAttached;
    this.x15.group.visible = !t.crashed;
    this.wall += dt;
    this.cockpit.update(t, this.controls, dt, this.wall);
    this.effects.update(dt, t, att, this.x15);

    this.guide.update(t);
    this.updateCamera(att, dt, t, pos);

    // Terrain, scenery and sky follow the camera (absolute world position)
    const camAbs = this.camera.position.clone().add(pos);
    const camAgl = Math.max(1, camAbs.y - terrainHeight(camAbs.x, camAbs.z, 3));
    this.terrain.update(camAbs, camAgl);
    this.ground.update(camAbs);
    this.vegetation.update(camAbs, camAgl);
    const atmo = this.sky.update(t.altitude, this.camera.position);
    this.fog.color.copy(atmo.fog);
    this.fog.near = 15000 + t.altitude * 0.6;
    this.fog.far = 330000 + t.altitude * 10;
    this.hemi.intensity = 0.25 + 0.65 * atmo.density;
    this.sun.intensity = 2.7;
    this.renderer.render(this.scene, this.camera);
  }

  /** Orientation (body frame) for a camera at azimuth `az`, elevation `el` (positive looks down). */
  private static orient(az: number, el: number): THREE.Quaternion {
    return new THREE.Quaternion()
      .setFromAxisAngle(AXIS_Y, az)
      .multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_Z, -el))
      .multiply(LOOK_FORWARD);
  }

  private updateCamera(att: THREE.Quaternion, dt: number, t: Telemetry, pos: THREE.Vector3): void {
    const cam = this.camera;
    const look = this.look;
    if (t.crashed && this.effects.crashSite) {
      // Wreck camera: slow orbit around the burning site
      this.wreckAngle += dt * 0.12;
      const site = this.effects.crashSite.clone().sub(pos);
      const az = this.wreckAngle + look.yaw;
      const dist = Math.max(40, 160 * look.zoom);
      cam.position.set(site.x + Math.cos(az) * dist, site.y + 35 + look.pitch * 60, site.z + Math.sin(az) * dist);
      cam.up.set(0, 1, 0);
      cam.lookAt(site.x, site.y + 8, site.z);
      cam.fov = 55;
      cam.updateProjectionMatrix();
      return;
    }
    if (this._mode === 'cockpit') {
      // Head turns freely through 360°; pan leans the head a little; zoom narrows the FOV.
      const q = SceneView.orient(-look.yaw, -look.pitch + COCKPIT_PITCH);
      const lean = new THREE.Vector3(
        THREE.MathUtils.clamp(look.panX, -0.3, 0.3),
        THREE.MathUtils.clamp(look.panY, -0.2, 0.2),
        0,
      ).applyQuaternion(q);
      cam.position.copy(EYE).add(lean).applyQuaternion(att);
      cam.quaternion.copy(att).multiply(q);
      cam.fov = THREE.MathUtils.clamp(75 * look.zoom, 12, 110);
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
