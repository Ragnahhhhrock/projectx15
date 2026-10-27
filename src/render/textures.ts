// Procedural canvas textures: panel lines for the aircraft skins and text decals.
import * as THREE from 'three';

let seed = 1234567;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** Dark Inconel-style skin with panel seams and rivets. u runs around, v runs along. */
export function skinTexture(): THREE.CanvasTexture {
  const w = 1024, h = 1024;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1b1d21';
  ctx.fillRect(0, 0, w, h);
  // Mottling
  for (let i = 0; i < 900; i++) {
    const v = 20 + rnd() * 18;
    ctx.fillStyle = `rgba(${v},${v + 1},${v + 4},${0.18 + rnd() * 0.25})`;
    ctx.fillRect(rnd() * w, rnd() * h, 6 + rnd() * 60, 4 + rnd() * 40);
  }
  // Panel seams
  ctx.strokeStyle = 'rgba(70,74,82,0.85)';
  ctx.lineWidth = 2;
  const xs = [0, 140, 330, 470, 650, 790, 950];
  const ys = [0, 210, 400, 590, 800];
  for (const x of xs) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (const y of ys) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // Rivets
  ctx.fillStyle = 'rgba(95,100,110,0.9)';
  for (const x of xs) for (let y = 6; y < h; y += 22) ctx.fillRect(x + 6, y, 2, 2);
  for (const y of ys) for (let x = 6; x < w; x += 22) ctx.fillRect(x, y + 6, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** White airliner-style skin for the B-52 with fine panel lines. */
export function whiteSkinTexture(): THREE.CanvasTexture {
  const w = 1024, h = 1024;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e8eaec';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) {
    const v = 205 + rnd() * 30;
    ctx.fillStyle = `rgba(${v},${v},${v + 3},${0.12 + rnd() * 0.18})`;
    ctx.fillRect(rnd() * w, rnd() * h, 10 + rnd() * 90, 6 + rnd() * 60);
  }
  ctx.strokeStyle = 'rgba(120,126,134,0.55)';
  ctx.lineWidth = 1.5;
  for (let x = 0; x < w; x += 128) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 170) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Wing top surface texture for the B-52: flaps, ailerons and spoiler lines. u = x, v = span. */
export function wingTexture(): THREE.CanvasTexture {
  const w = 512, h = 1024;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e6e8ea';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(90,96,106,0.8)';
  ctx.lineWidth = 2;
  // Spanwise seams (flap hinge lines, spar lines) at fractions of the chord
  for (const f of [0.18, 0.55, 0.78]) {
    ctx.beginPath();
    ctx.moveTo(f * w, 0);
    ctx.lineTo(f * w, h);
    ctx.stroke();
  }
  // Chordwise rib seams
  for (let y = 40; y < h; y += 96) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(210,214,218,0.6)';
  for (let i = 0; i < 300; i++) ctx.fillRect(rnd() * w, rnd() * h, 8 + rnd() * 40, 4 + rnd() * 20);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface DecalOpts {
  font?: string;
  color?: string;
  bg?: string;
  /** Pixels per metre of the decal */
  ppm?: number;
}

/** A flat plane showing `text`, w × h metres. */
export function textDecal(text: string, w: number, h: number, o: DecalOpts = {}): THREE.Mesh {
  const ppm = o.ppm ?? 256;
  const c = document.createElement('canvas');
  c.width = Math.max(8, Math.round(w * ppm));
  c.height = Math.max(8, Math.round(h * ppm));
  const ctx = c.getContext('2d')!;
  if (o.bg) {
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.fillStyle = o.color ?? '#f2f2f2';
  ctx.font = o.font ?? `700 ${Math.round(c.height * 0.8)}px "IBM Plex Sans Condensed", "Arial Narrow", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + c.height * 0.04, c.width * 0.96);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
}
