// Cockpit interior: cabin shell with window openings, instrument panel, side consoles, stick and throttle.
import * as THREE from 'three';
import type { Controls, Telemetry } from '../physics/sim';
import { Gauges } from '../ui/gauges';

/** Pilot eye point in the body frame (m). */
export const EYE = new THREE.Vector3(3.95, 0.72, 0);

const X0 = 3.05;
const X1 = 4.85;
const Y0 = -0.55;
const Y1 = 0.95;
const ZW = 0.6;

export class Cockpit {
  readonly group = new THREE.Group();
  private gauges = new Gauges();
  private tex: THREE.CanvasTexture;
  private stick = new THREE.Group();
  private throttle: THREE.Mesh;
  private acc = 1;

  constructor() {
    const wall = new THREE.MeshBasicMaterial({ color: 0x2b2d32, side: THREE.DoubleSide });
    const trim = new THREE.MeshBasicMaterial({ color: 0x15161a, side: THREE.DoubleSide });
    const lighter = new THREE.MeshBasicMaterial({ color: 0x3a3d43, side: THREE.DoubleSide });

    // Front wall with two windscreen openings
    const front = new THREE.Shape();
    front.moveTo(-ZW, Y0).lineTo(ZW, Y0).lineTo(ZW, Y1).lineTo(-ZW, Y1).closePath();
    for (const s of [-1, 1]) {
      const hole = new THREE.Path();
      const z0 = s > 0 ? 0.07 : -0.4;
      const z1 = s > 0 ? 0.4 : -0.07;
      hole.moveTo(z0, 0.56).lineTo(z1, 0.56).lineTo(z1 - s * 0.03, 0.9).lineTo(z0 + s * 0.03, 0.9).closePath();
      front.holes.push(hole);
    }
    const frontGeo = new THREE.ShapeGeometry(front);
    frontGeo.rotateY(-Math.PI / 2);
    const frontMesh = new THREE.Mesh(frontGeo, wall);
    frontMesh.position.x = X1;
    this.group.add(frontMesh);

    // Side walls with one small window each
    for (const s of [-1, 1]) {
      const side = new THREE.Shape();
      side.moveTo(X0, Y0).lineTo(X1, Y0).lineTo(X1, Y1).lineTo(X0, Y1).closePath();
      const hole = new THREE.Path();
      hole.moveTo(3.85, 0.56).lineTo(4.45, 0.56).lineTo(4.4, 0.86).lineTo(3.9, 0.86).closePath();
      side.holes.push(hole);
      const sm = new THREE.Mesh(new THREE.ShapeGeometry(side), wall);
      sm.position.z = s * ZW;
      this.group.add(sm);
    }
    // Roof, floor, back wall
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, ZW * 2), wall);
    roof.rotation.x = Math.PI / 2;
    roof.position.set((X0 + X1) / 2, Y1, 0);
    const floor = roof.clone();
    floor.material = trim;
    floor.position.y = Y0;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(ZW * 2, Y1 - Y0), wall);
    back.rotation.y = Math.PI / 2;
    back.position.set(X0, (Y0 + Y1) / 2, 0);
    this.group.add(roof, floor, back);

    // Window frame trim around the openings
    for (const s of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.035), trim);
      bar.position.set(X1 - 0.02, 0.73, s * 0.435);
      this.group.add(bar);
    }
    const centre = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.14), trim);
    centre.position.set(X1 - 0.02, 0.73, 0);
    this.group.add(centre);

    // Instrument panel, tilted to face the pilot
    this.tex = new THREE.CanvasTexture(this.gauges.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    const panelPos = new THREE.Vector3(4.62, 0.3, 0);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4922), new THREE.MeshBasicMaterial({ map: this.tex }));
    panel.position.copy(panelPos);
    panel.lookAt(EYE);
    const bezel = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.53), trim);
    bezel.position.copy(panelPos).addScaledVector(new THREE.Vector3(1, 0, 0), 0.004);
    bezel.lookAt(EYE);
    // Glare shield above the panel
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 1.0), trim);
    shield.position.set(4.7, 0.57, 0);
    shield.rotation.z = -0.35;
    this.group.add(bezel, panel, shield);

    // Side consoles
    for (const s of [-1, 1]) {
      const con = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.24, 0.2), lighter);
      con.position.set(3.95, -0.3, s * 0.48);
      this.group.add(con);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.16), new THREE.MeshBasicMaterial({ color: 0x393c42 }));
      top.rotation.x = -Math.PI / 2;
      top.position.set(3.95, -0.178, s * 0.48);
      this.group.add(top);
    }
    // Throttle on the left console
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.01, 0.02), trim);
    rail.position.set(3.95, -0.17, -0.48);
    this.group.add(rail);
    this.throttle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.12, 8), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    this.throttle.position.set(3.95, -0.1, -0.48);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    knob.position.y = 0.07;
    this.throttle.add(knob);
    this.group.add(this.throttle);

    // Centre stick between the pilot's knees
    this.stick.position.set(4.12, Y0, 0);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.52, 8), trim);
    shaft.position.y = 0.26;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.11, 10), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    grip.position.y = 0.58;
    this.stick.add(shaft, grip);
    this.group.add(this.stick);

    this.group.visible = false;
  }

  /** Redraw the panel at ~30 Hz and move the controls. */
  update(t: Telemetry, controls: Controls | null, dt: number, wall: number): void {
    if (!this.group.visible) return;
    this.acc += dt;
    if (this.acc >= 1 / 30) {
      this.acc = 0;
      this.gauges.update(t, wall);
      this.tex.needsUpdate = true;
    }
    if (controls) {
      this.stick.rotation.z = controls.pitch * 0.3;
      this.stick.rotation.x = controls.roll * 0.3;
      this.throttle.position.x = 3.7 + controls.throttle * 0.5;
    }
  }
}
