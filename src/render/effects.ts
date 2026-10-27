// Particle and debris effects: dust, sparks, crash fireball, smoke, tumbling wreckage and scorch marks.
import * as THREE from 'three';
import type { Telemetry } from '../physics/sim';
import { terrainHeight } from '../world/terrain';
import type { X15Model } from './models';

type PuffKind = 'fire' | 'smoke' | 'dust' | 'spark';

interface Puff {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  age: number;
  life: number;
  s0: number;
  s1: number;
  kind: PuffKind;
  alpha: number;
  drag: number;
  rise: number;
}

interface Debris {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  rest: boolean;
  smoke: number;
  age: number;
}

function puffTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function scorchTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(8,6,4,0.95)');
  g.addColorStop(0.5, 'rgba(14,10,6,0.75)');
  g.addColorStop(1, 'rgba(20,14,8,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);

export class Effects {
  readonly group = new THREE.Group();
  /** Where the aircraft came to grief, or null */
  crashSite: THREE.Vector3 | null = null;
  private puffs: Puff[] = [];
  private debris: Debris[] = [];
  private tex = puffTexture();
  private scorch = new THREE.MeshBasicMaterial({ map: scorchTexture(), transparent: true, depthWrite: false });
  private prevCrashed = false;
  private prevTouchdown = false;
  private prevT = 0;
  private smokeTimer = 0;
  private dustTimer = 0;
  private flash = 0;
  private flashSprite: THREE.Sprite;

  constructor() {
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color: 0xfff0c0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    this.flashSprite.visible = false;
    this.group.add(this.flashSprite);
  }

  private spawn(kind: PuffKind, pos: THREE.Vector3, vel: THREE.Vector3, life: number, s0: number, s1: number, alpha: number, drag = 0.5, rise = 0): void {
    if (this.puffs.length > 420) return;
    const color = kind === 'fire' ? 0xff8a30 : kind === 'smoke' ? 0x2a2724 : kind === 'dust' ? 0xb9a584 : 0xffc060;
    const mat = new THREE.SpriteMaterial({
      map: this.tex,
      color,
      transparent: true,
      depthWrite: false,
      opacity: alpha,
      blending: kind === 'fire' || kind === 'spark' ? THREE.AdditiveBlending : THREE.NormalBlending,
      rotation: rnd(0, 6.28),
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    sprite.scale.setScalar(s0);
    this.group.add(sprite);
    this.puffs.push({ sprite, vel, age: 0, life, s0, s1, kind, alpha, drag, rise });
  }

  clear(): void {
    for (const p of this.puffs) { this.group.remove(p.sprite); p.sprite.material.dispose(); }
    this.puffs.length = 0;
    for (const d of this.debris) this.group.remove(d.obj);
    this.debris.length = 0;
    for (const o of [...this.group.children]) if (o.userData.scorch) { this.group.remove(o); (o as THREE.Mesh).geometry.dispose(); }
    this.crashSite = null;
    this.prevCrashed = false;
    this.flash = 0;
    this.flashSprite.visible = false;
  }

  private explode(t: Telemetry, model: X15Model, att: THREE.Quaternion): void {
    const pos = new THREE.Vector3(...t.position);
    this.crashSite = pos.clone();
    const cv = new THREE.Vector3(...t.crashVelocity);
    const speed = cv.length();
    const energy = Math.min(1, speed / 200);

    // Wreckage
    for (const [name, part] of Object.entries(model.parts)) {
      if (name === 'gear' && !t.gearDown) continue;
      if (name === 'ventral' && !t.ventralAttached) continue;
      const obj = part.clone(true);
      obj.visible = true;
      obj.position.copy(pos);
      obj.quaternion.copy(att);
      const big = name === 'fuselage';
      const v = cv.clone().multiplyScalar(big ? rnd(0.15, 0.4) : rnd(0.3, 0.8));
      v.add(new THREE.Vector3(rnd(-1, 1), rnd(0.3, 1.2), rnd(-1, 1)).multiplyScalar(big ? 8 : 10 + 30 * energy));
      this.group.add(obj);
      this.debris.push({ obj, vel: v, spin: new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(big ? 1.5 : 5), rest: false, smoke: 0, age: 0 });
    }
    // Fireball and smoke
    const n = Math.round(14 + 26 * energy);
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3(rnd(-1, 1), rnd(0.1, 1.2), rnd(-1, 1));
      this.spawn('fire', pos.clone().add(dir.clone().multiplyScalar(3)), dir.clone().multiplyScalar(rnd(6, 22) * (0.5 + energy)), rnd(1.2, 3.2), rnd(6, 12), rnd(30, 60) * (0.6 + energy), 0.9, 0.8, 4);
    }
    for (let i = 0; i < 26; i++) {
      const dir = new THREE.Vector3(rnd(-1, 1), rnd(0.2, 1), rnd(-1, 1));
      this.spawn('smoke', pos.clone().add(dir.clone().multiplyScalar(5)), dir.clone().multiplyScalar(rnd(2, 10)), rnd(10, 28), rnd(8, 14), rnd(40, 90), 0.75, 0.3, 4);
    }
    for (let i = 0; i < 18; i++) {
      const a = rnd(0, 6.28);
      this.spawn('dust', pos.clone(), new THREE.Vector3(Math.cos(a), rnd(0.05, 0.3), Math.sin(a)).multiplyScalar(rnd(10, 40) * (0.4 + energy)), rnd(3, 8), 6, rnd(30, 70), 0.55, 1.2, 0.5);
    }
    this.flash = 1;

    // Scorch mark under the impact
    const r = 14 + 22 * energy;
    const sc = new THREE.Mesh(new THREE.CircleGeometry(r, 24), this.scorch);
    sc.rotation.x = -Math.PI / 2;
    sc.position.set(pos.x, terrainHeight(pos.x, pos.z) + 0.12, pos.z);
    sc.userData.scorch = true;
    this.group.add(sc);
  }

  update(dt: number, t: Telemetry, att: THREE.Quaternion, model: X15Model): void {
    // A reset (time goes backwards) clears everything
    if (t.t < this.prevT - 0.5) this.clear();
    this.prevT = t.t;

    if (t.crashed && !this.prevCrashed) this.explode(t, model, att);
    this.prevCrashed = t.crashed;

    // Dust, sparks and a touchdown burst while rolling on the ground
    const touch = !!t.touchdown;
    const wheelPositions = [new THREE.Vector3(-1.6, -1.3, 1.35), new THREE.Vector3(-1.6, -1.3, -1.35)];
    if (touch && !this.prevTouchdown && !t.crashed) {
      for (const w of wheelPositions) {
        const p = w.clone().applyQuaternion(att).add(new THREE.Vector3(...t.position));
        for (let i = 0; i < 6; i++) this.spawn('dust', p.clone(), new THREE.Vector3(rnd(-5, 5), rnd(1, 6), rnd(-5, 5)), rnd(2, 4), 3, rnd(14, 26), 0.55, 1, 0.5);
      }
    }
    this.prevTouchdown = touch;
    if (t.onGround && !t.crashed && t.speed > 6) {
      this.dustTimer -= dt;
      const rate = 0.08 / Math.min(2, t.speed / 40);
      while (this.dustTimer < 0) {
        this.dustTimer += rate;
        for (const w of wheelPositions) {
          const p = w.clone().applyQuaternion(att).add(new THREE.Vector3(...t.position));
          const back = new THREE.Vector3(...t.velocity).multiplyScalar(-0.04);
          this.spawn('dust', p, back.add(new THREE.Vector3(rnd(-1.5, 1.5), rnd(0.5, 3), rnd(-1.5, 1.5))), rnd(1.5, 3), 1.6, rnd(7, 14), 0.4 * Math.min(1, t.speed / 40), 1, 0.6);
        }
        if (t.damaged || !t.gearDown) {
          const p = new THREE.Vector3(rnd(-3, 1), -0.75, rnd(-0.4, 0.4)).applyQuaternion(att).add(new THREE.Vector3(...t.position));
          for (let k = 0; k < 2; k++) this.spawn('spark', p.clone(), new THREE.Vector3(rnd(-8, 4), rnd(2, 10), rnd(-6, 6)), rnd(0.2, 0.5), 0.6, 0.2, 1, 0.2, 0);
        }
      }
    }

    // Burning wreck keeps smoking for a minute
    if (this.crashSite && this.smokeTimer >= 0) {
      this.smokeTimer += dt;
      if (this.smokeTimer < 60) {
        const k = Math.floor(this.smokeTimer * 5);
        if (k !== Math.floor((this.smokeTimer - dt) * 5)) {
          const base = this.crashSite;
          this.spawn('smoke', base.clone().add(new THREE.Vector3(rnd(-6, 6), 1, rnd(-6, 6))), new THREE.Vector3(rnd(-1, 1), rnd(3, 6), rnd(-1, 1)), rnd(12, 24), 6, rnd(30, 60), 0.6 * (1 - this.smokeTimer / 70), 0.2, 2);
          if (this.smokeTimer < 20) this.spawn('fire', base.clone().add(new THREE.Vector3(rnd(-4, 4), 0.5, rnd(-4, 4))), new THREE.Vector3(0, rnd(3, 8), 0), rnd(0.6, 1.4), 4, 12, 0.8, 0.3, 3);
        }
      }
    } else if (!this.crashSite) {
      this.smokeTimer = 0;
    }

    // Flash
    if (this.flash > 0 && this.crashSite) {
      this.flash = Math.max(0, this.flash - dt * 2.2);
      this.flashSprite.visible = this.flash > 0;
      this.flashSprite.position.copy(this.crashSite).add(new THREE.Vector3(0, 5, 0));
      this.flashSprite.scale.setScalar(160 * (1.3 - this.flash));
      this.flashSprite.material.opacity = this.flash;
    } else {
      this.flashSprite.visible = false;
    }

    // Puffs
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.group.remove(p.sprite);
        p.sprite.material.dispose();
        this.puffs.splice(i, 1);
        continue;
      }
      const f = p.age / p.life;
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.vel.y += p.rise * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      const ease = 1 - (1 - f) * (1 - f);
      p.sprite.scale.setScalar(p.s0 + (p.s1 - p.s0) * ease);
      p.sprite.material.opacity = p.alpha * (p.kind === 'fire' ? 1 - f : (1 - f) * Math.min(1, f * 12));
    }

    // Wreckage
    for (const d of this.debris) {
      d.age += dt;
      if (d.rest) continue;
      d.vel.y -= 9.81 * dt;
      d.vel.multiplyScalar(1 - 0.05 * dt);
      d.obj.position.addScaledVector(d.vel, dt);
      const w = d.spin.length();
      if (w > 1e-4) {
        d.obj.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(d.spin.clone().normalize(), w * dt));
      }
      const ground = terrainHeight(d.obj.position.x, d.obj.position.z, 3) + 0.3;
      if (d.obj.position.y < ground) {
        d.obj.position.y = ground;
        if (d.vel.y < 0) d.vel.y *= -0.25;
        d.vel.x *= 0.7;
        d.vel.z *= 0.7;
        d.spin.multiplyScalar(0.6);
        if (d.vel.length() < 1.2 && d.age > 0.5) {
          d.rest = true;
        }
      }
      if (d.age < 9 && Math.random() < dt * 8) {
        this.spawn('smoke', d.obj.position.clone(), new THREE.Vector3(rnd(-1, 1), rnd(1, 3), rnd(-1, 1)), rnd(3, 7), 2, rnd(8, 16), 0.55, 0.3, 1);
      }
      if (d.age < 3 && Math.random() < dt * 10) {
        this.spawn('fire', d.obj.position.clone(), new THREE.Vector3(rnd(-1, 1), rnd(0, 2), rnd(-1, 1)), rnd(0.4, 0.9), 2, 7, 0.8, 0.5, 2);
      }
    }
  }
}
