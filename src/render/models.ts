// Greybox models. Body frame: +x nose, +y top, +z right wing.
import * as THREE from 'three';

/** Thin trapezoid surface in the x-z plane: root at z=0, tip at z=span. */
function panel(rootChord: number, tipChord: number, span: number, sweep: number, thickness: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(-rootChord, 0);
  s.lineTo(-sweep - tipChord, span);
  s.lineTo(-sweep, span);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false });
  g.rotateX(Math.PI / 2); // shape y → world z
  g.translate(0, thickness / 2, 0);
  return g;
}

function fin(chord: number, height: number, sweep: number, thickness: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(-chord, 0);
  s.lineTo(-chord, height);
  s.lineTo(-chord + (chord - sweep) * 0.4, height);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false });
  g.translate(0, 0, -thickness / 2);
  return g;
}

export interface X15Model {
  group: THREE.Group;
  flame: THREE.Mesh;
}

export function buildX15(): X15Model {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, metalness: 0.55, roughness: 0.45 });

  const body = new THREE.CylinderGeometry(0.62, 0.66, 12.5, 20);
  body.rotateZ(Math.PI / 2);
  group.add(new THREE.Mesh(body, skin));

  const nose = new THREE.ConeGeometry(0.62, 3.2, 20);
  nose.rotateZ(-Math.PI / 2);
  nose.translate(7.85, 0, 0);
  group.add(new THREE.Mesh(nose, skin));

  // Side tunnels (propellant fairings)
  for (const z of [-0.62, 0.62]) {
    const t = new THREE.BoxGeometry(9, 0.32, 0.3);
    t.translate(-0.5, -0.05, z);
    group.add(new THREE.Mesh(t, skin));
  }

  // Canopy
  const canopy = new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  canopy.scale(2.2, 0.9, 1);
  canopy.translate(4.6, 0.5, 0);
  group.add(new THREE.Mesh(canopy, new THREE.MeshStandardMaterial({ color: 0x2a3440, metalness: 0.2, roughness: 0.1 })));

  // Wings
  for (const side of [1, -1]) {
    const w = panel(3.4, 0.9, 2.8, 1.6, 0.08);
    if (side < 0) w.scale(1, 1, -1);
    w.translate(1.2, -0.2, side * 0.6);
    group.add(new THREE.Mesh(w, skin));

    // All-moving horizontal stabilisers with anhedral
    const h = panel(2.2, 0.8, 2.2, 1.1, 0.06);
    if (side < 0) h.scale(1, 1, -1);
    const hm = new THREE.Mesh(h, skin);
    hm.position.set(-4.4, -0.1, side * 0.6);
    hm.rotation.x = side * (15 * Math.PI) / 180;
    group.add(hm);
  }

  // Wedge tails
  const upper = fin(2.6, 1.9, 1.4, 0.12);
  upper.translate(-3.6, 0.55, 0);
  group.add(new THREE.Mesh(upper, skin));
  const lower = fin(2.4, 1.5, 1.4, 0.12);
  lower.scale(1, -1, 1);
  lower.translate(-3.7, -0.55, 0);
  group.add(new THREE.Mesh(lower, skin));

  // Exhaust plume, scaled by thrust
  const flameGeo = new THREE.ConeGeometry(0.55, 6, 16, 1, true);
  flameGeo.rotateZ(Math.PI / 2);
  flameGeo.translate(-3, 0, 0);
  const flame = new THREE.Mesh(
    flameGeo,
    new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  flame.position.x = -6.3;
  flame.visible = false;
  group.add(flame);

  return { group, flame };
}

export function buildB52(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8b9096, metalness: 0.4, roughness: 0.6 });
  const body = new THREE.CylinderGeometry(1.5, 1.4, 44, 20);
  body.rotateZ(Math.PI / 2);
  g.add(new THREE.Mesh(body, mat));
  const nose = new THREE.SphereGeometry(1.5, 16, 12);
  nose.scale(2.4, 1, 1);
  nose.translate(22, 0, 0);
  g.add(new THREE.Mesh(nose, mat));
  for (const side of [1, -1]) {
    const w = panel(9, 3, 26, 9, 0.5);
    if (side < 0) w.scale(1, 1, -1);
    w.translate(4, 1.1, side * 1.4);
    g.add(new THREE.Mesh(w, mat));
    // Engine pods
    for (const z of [8, 17]) {
      const pod = new THREE.CylinderGeometry(0.6, 0.6, 4.5, 12);
      pod.rotateZ(Math.PI / 2);
      pod.translate(4 - z * 0.35, 0, side * z);
      g.add(new THREE.Mesh(pod, mat));
    }
    const h = panel(4, 1.5, 7.5, 3, 0.25);
    if (side < 0) h.scale(1, 1, -1);
    h.translate(-17.5, 0.8, side * 0.8);
    g.add(new THREE.Mesh(h, mat));
  }
  const tail = fin(7, 9, 4, 0.4);
  tail.translate(-15, 1.2, 0);
  g.add(new THREE.Mesh(tail, mat));
  return g;
}
