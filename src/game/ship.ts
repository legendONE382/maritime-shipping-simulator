import * as THREE from 'three';
import { share } from './shared';
import {
  HULL_D,
  HULL_TOP,
  makeContainerTexture,
  makeFacadeTextures,
  makeHullTexture,
  makePuffTexture,
  makeSteelTexture,
} from './textures';

/** Overall length / beam of the hero hull in metres (traffic ships scale this). */
export const SHIP_L = 160;
export const SHIP_B = 24;
const D = HULL_D; // draught
const F = 13.5; // freeboard amidships

const clamp = THREE.MathUtils.clamp;
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------- hull lines -- */

/** Half-beam fraction on the waterplane: transom stern, parallel body, pointed entry. */
function waterHalf(s: number) {
  if (s >= 0.965) return 0;
  if (s < 0.22) return 0.62 + 0.38 * sstep(0, 0.22, s);
  if (s <= 0.6) return 1;
  const t = (s - 0.6) / 0.365;
  return 1 - Math.pow(t, 1.9);
}
/** Half-beam fraction at deck level: adds bow flare and a little stern flare. */
function deckHalf(s: number) {
  const w = waterHalf(s);
  const u = clamp((s - 0.62) / 0.38, 0, 1);
  const flare = 0.28 * Math.pow(Math.sin(Math.PI * u), 0.7);
  const stern = 0.08 * (1 - sstep(0, 0.25, s));
  return Math.min(1.04, w + flare + stern);
}
/** Deck height above the waterline, with sheer rising to the forecastle. */
function deckY(s: number) {
  return F + 2.4 * Math.pow(sstep(0.72, 1, s), 1.4) + 0.9 * (1 - sstep(0, 0.3, s));
}
function keelY(s: number) {
  const bow = sstep(0.62, 1, s) * 0.6;
  const stern = (1 - sstep(0, 0.28, s)) * 0.22;
  return -D * (1 - bow - stern);
}
const xAt = (s: number) => -SHIP_L / 2 + s * SHIP_L;
const sAt = (x: number) => (x + SHIP_L / 2) / SHIP_L;

function hullZ(s: number, y: number) {
  const hb = waterHalf(s) * (SHIP_B / 2);
  const hd = deckHalf(s) * (SHIP_B / 2);
  if (y <= 0) return hb;
  return hb + (hd - hb) * Math.pow(clamp(y / deckY(s), 0, 1), 1.35);
}

const NP = 20;
/** Half cross-section from the keel centreline up to the deck edge. */
function sectionPoints(s: number): [number, number][] {
  const hb = waterHalf(s) * (SHIP_B / 2);
  const hd = deckHalf(s) * (SHIP_B / 2);
  const yb = keelY(s);
  const yd = deckY(s);
  const rb = Math.min(hb * 0.34, -yb * 0.34, 4.2);
  const pts: [number, number][] = [];
  for (let k = 0; k <= 4; k++) pts.push([(hb - rb) * (k / 4), yb]);
  for (let k = 1; k <= 6; k++) {
    const a = -Math.PI / 2 + (k / 6) * (Math.PI / 2);
    pts.push([hb - rb + rb * Math.cos(a), yb + rb + rb * Math.sin(a)]);
  }
  const yLo = yb + rb;
  for (let k = 1; k <= 3; k++) pts.push([hb, yLo + (0 - yLo) * (k / 3)]);
  for (let k = 1; k <= 6; k++) {
    const y = yd * (k / 6);
    pts.push([hb + (hd - hb) * Math.pow(y / yd, 1.35), y]);
  }
  return pts;
}

function buildHullHalf(side: 1 | -1): THREE.BufferGeometry {
  const NS = 72;
  const pos = new Float32Array((NS + 1) * NP * 3);
  const uv = new Float32Array((NS + 1) * NP * 2);
  for (let i = 0; i <= NS; i++) {
    const s = (1 - Math.cos((i / NS) * Math.PI)) / 2;
    const x = xAt(s);
    const sec = sectionPoints(s);
    for (let j = 0; j < NP; j++) {
      const k = i * NP + j;
      pos[k * 3] = x;
      pos[k * 3 + 1] = sec[j][1];
      pos[k * 3 + 2] = sec[j][0] * side;
      uv[k * 2] = side > 0 ? s : 1 - s;
      uv[k * 2 + 1] = (sec[j][1] + D) / (D + HULL_TOP);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < NP - 1; j++) {
      const a = i * NP + j;
      const b = (i + 1) * NP + j;
      const c = a + 1;
      const d = b + 1;
      if (side > 0) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildTransom(): THREE.BufferGeometry {
  const sec = sectionPoints(0);
  const loop: [number, number][] = [];
  for (let j = 0; j < sec.length; j++) loop.push([sec[j][0], sec[j][1]]);
  for (let j = sec.length - 1; j >= 0; j--) loop.push([-sec[j][0], sec[j][1]]);
  const x = xAt(0);
  const cy = (keelY(0) + deckY(0)) / 2;
  const verts: number[] = [x, cy, 0];
  for (const [z, y] of loop) verts.push(x, y, z);
  const idx: number[] = [];
  const n = loop.length;
  for (let i = 0; i < n; i++) idx.push(0, 1 + i, 1 + ((i + 1) % n));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildDeckGeometry(): THREE.BufferGeometry {
  const NS = 64;
  const NM = 8;
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i <= NS; i++) {
    const s = i / NS;
    const x = xAt(s);
    const hd = deckHalf(s) * (SHIP_B / 2);
    const y = deckY(s);
    for (let m = 0; m <= NM; m++) {
      const z = -hd + (2 * hd * m) / NM;
      pos.push(x, y, z);
      uv.push(x / 10, z / 10);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < NS; i++) {
    for (let m = 0; m < NM; m++) {
      const a = i * (NM + 1) + m;
      const b = (i + 1) * (NM + 1) + m;
      const c = a + 1;
      const d = b + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildBulwark(sFrom: number, sTo: number, height: number): THREE.BufferGeometry {
  const N = 20;
  const pos: number[] = [];
  const idx: number[] = [];
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const s = sFrom + ((sTo - sFrom) * i) / N;
      const x = xAt(s);
      const z = deckHalf(s) * (SHIP_B / 2) * side;
      const y = deckY(s);
      pos.push(x, y, z, x, y + height, z);
    }
    for (let i = 0; i < N; i++) {
      const a = base + i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* --------------------------------------------------------------- shared -- */

interface Mats {
  white: THREE.MeshStandardMaterial;
  lightGrey: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  black: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  darkMetal: THREE.MeshStandardMaterial;
  rail: THREE.MeshStandardMaterial;
  deck: THREE.MeshStandardMaterial;
  hatch: THREE.MeshStandardMaterial;
  orange: THREE.MeshStandardMaterial;
  navy: THREE.MeshStandardMaterial;
  funnelWhite: THREE.MeshStandardMaterial;
  red: THREE.MeshStandardMaterial;
  rust: THREE.MeshStandardMaterial;
  container: THREE.MeshStandardMaterial;
  pipe: THREE.MeshStandardMaterial;
}
let _m: Mats | null = null;
function mats(): Mats {
  if (_m) return _m;
  const std = (color: number, rough: number, metal: number) =>
    share(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  _m = {
    white: std(0xe9edef, 0.62, 0.05),
    lightGrey: std(0xbfc5ca, 0.6, 0.15),
    glass: share(new THREE.MeshStandardMaterial({ color: 0x0c1824, roughness: 0.08, metalness: 0.85 })),
    black: std(0x131517, 0.7, 0.2),
    dark: std(0x2a2f35, 0.55, 0.6),
    darkMetal: std(0x15171a, 0.25, 0.85),
    rail: std(0xdadfe3, 0.5, 0.4),
    deck: share(new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeSteelTexture('#7a4034', 0.09), roughness: 0.85, metalness: 0.1 })),
    hatch: share(new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeSteelTexture('#7d848a', 0.07), roughness: 0.78, metalness: 0.2 })),
    orange: std(0xe8610f, 0.55, 0.1),
    navy: std(0x14284a, 0.5, 0.25),
    funnelWhite: std(0xf3f4f2, 0.55, 0.1),
    red: std(0xc01d24, 0.55, 0.15),
    rust: std(0x6e4a32, 0.9, 0.3),
    container: share(
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeContainerTexture(), roughness: 0.6, metalness: 0.4, envMapIntensity: 0.9 })
    ),
    pipe: std(0xb9bec2, 0.55, 0.5),
  };
  return _m;
}

let _contGeo: THREE.BoxGeometry | null = null;
/** 40 ft box with UVs tiled so the corrugation ribs keep a constant pitch. */
export function containerGeometry(): THREE.BoxGeometry {
  if (_contGeo) return _contGeo;
  const g = new THREE.BoxGeometry(12.1, 2.7, 2.44);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4);
    if (face >= 2) uv.setX(i, uv.getX(i) * 5);
  }
  _contGeo = g;
  return g;
}
export function containerMaterial() {
  return mats().container;
}

const PALETTE = [
  0x2f5f9e, 0x2f5f9e, 0xb3382f, 0xc9741d, 0x8a9096, 0xdadad4, 0x3a7a4f, 0x6b4a2e, 0x1f6f78, 0xd1ad2b, 0x22385e, 0xa8adb2,
  0x9a2f3a, 0xe3e3dd,
];

let glowTex: THREE.Texture | null = null;
const glowMats = new Map<number, THREE.SpriteMaterial>();
function glowSprite(color: number, size: number, opacity = 0.9) {
  if (!glowTex) glowTex = makePuffTexture(64, 0.1);
  const key = color * 100 + Math.round(opacity * 10);
  let m = glowMats.get(key);
  if (!m) {
    m = share(
      new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity })
    );
    glowMats.set(key, m);
  }
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  return s;
}

const facadeMats = new Map<string, THREE.MeshStandardMaterial>();
function facadeMat(kind: 'wall' | 'bridge', widthM: number): THREE.MeshStandardMaterial {
  const key = `${kind}${widthM.toFixed(1)}`;
  let m = facadeMats.get(key);
  if (!m) {
    const f = makeFacadeTextures();
    const map = (kind === 'wall' ? f.wall : f.bridge).clone();
    const glow = (kind === 'wall' ? f.wallGlow : f.bridgeGlow).clone();
    map.repeat.set(widthM / 16, 1);
    glow.repeat.set(widthM / 16, 1);
    map.needsUpdate = true;
    glow.needsUpdate = true;
    m = share(
      new THREE.MeshStandardMaterial({
        map,
        emissive: 0xffffff,
        emissiveMap: glow,
        emissiveIntensity: 0.08,
        roughness: 0.5,
        metalness: 0.1,
      })
    );
    facadeMats.set(key, m);
  }
  return m;
}
/** Window materials; the game ramps their glow as the light fades. */
export function allWindowMaterials() {
  return [...facadeMats.values()];
}

/* ----------------------------------------------------------------- build -- */

export interface ShipOptions {
  name: string;
  company?: string;
  hullColor?: string;
  variant?: 'container' | 'tanker';
  funnel?: 'navy' | 'red';
  seed?: number;
  /** Hull paint texture width; ambient traffic uses a smaller one. */
  texWidth?: number;
}

export interface ShipModel {
  group: THREE.Group;
  radarBar: THREE.Object3D;
  funnelTop: THREE.Object3D;
  nightLights: THREE.Sprite[];
  gunMounts: THREE.Object3D[];
  ciwsTurret: THREE.Object3D | null;
}

export function buildShip(opts: ShipOptions): ShipModel {
  const M = mats();
  const group = new THREE.Group();
  const R = rng(opts.seed ?? 3);
  const hullColor = opts.hullColor ?? '#10243b';
  const company = opts.company ?? 'BLUEWATER LINE';
  const nightLights: THREE.Sprite[] = [];

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  const box = (w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number) =>
    add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);

  /* hull, transom, deck */
  const hullMat = (side: 1 | -1) =>
    new THREE.MeshStandardMaterial({
      map: makeHullTexture(opts.name, side, hullColor, company, opts.texWidth ?? 2048),
      roughness: 0.48,
      metalness: 0.2,
      envMapIntensity: 1.0,
    });
  add(buildHullHalf(1), hullMat(1));
  add(buildHullHalf(-1), hullMat(-1));
  add(buildTransom(), new THREE.MeshStandardMaterial({ color: new THREE.Color(hullColor), roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide }));
  add(buildDeckGeometry(), M.deck);
  const bulwarkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(hullColor), roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide });
  add(buildBulwark(0.8, 0.995, 1.5), bulwarkMat);
  add(buildBulwark(0.0, 0.1, 1.2), bulwarkMat);

  /* accommodation tower */
  const tx = -45;
  const y0 = deckY(sAt(tx));
  const wallFor = (widthM: number) => facadeMat('wall', widthM);
  for (let l = 0; l < 6; l++) {
    const wx = 20 - Math.max(0, l - 3) * 1.2;
    const wz = 22 - l * 0.7;
    const y = y0 + 1.5 + l * 3;
    box(wx, 3, wz, [wallFor(wz), wallFor(wz), M.white, M.white, wallFor(wx), wallFor(wx)], tx, y, 0);
    box(wx + 0.5, 0.2, wz + 0.5, M.lightGrey, tx, y + 1.55, 0);
  }
  const yb = y0 + 18;
  box(13, 3.8, 30, [facadeMat('bridge', 30), facadeMat('bridge', 30), M.white, M.white, M.white, M.white], tx + 1, yb + 1.9, 0);
  box(14.6, 0.35, 31.6, M.lightGrey, tx + 1, yb + 3.95, 0);
  const roof = yb + 4.15;
  box(8, 1.1, 10, M.white, tx - 1.5, roof + 0.55, 0);
  const mast = add(new THREE.CylinderGeometry(0.34, 0.5, 13, 8), M.dark, tx - 2, roof + 7.2, 0);
  void mast;
  box(0.3, 0.3, 11, M.dark, tx - 2, roof + 10, 0);
  box(0.3, 0.3, 6, M.dark, tx - 2, roof + 6.5, 0);
  const radarBar = box(7.2, 0.3, 0.8, M.white, tx - 2, roof + 13.9, 0);
  box(0.5, 0.5, 0.5, M.dark, tx - 2, roof + 13.5, 0);
  for (const z of [-6.5, 6.5]) {
    add(new THREE.SphereGeometry(1.6, 16, 12), M.white, tx - 4, roof + 2.2, z);
    add(new THREE.CylinderGeometry(0.08, 0.1, 6, 6), M.dark, tx + 1, roof + 3.6, z * 1.5);
  }
  add(new THREE.CylinderGeometry(0.1, 0.12, 8, 6), M.dark, tx + 3, roof + 4.2, 0);
  // searchlights
  for (const z of [-4, 4]) box(1, 0.8, 1, M.black, tx + 5, roof + 0.4, z);

  // lifeboats on davits
  const lifeboatGeo = new THREE.CapsuleGeometry(1.15, 5.6, 4, 10);
  for (const z of [-12.7, 12.7]) {
    const lb = add(lifeboatGeo, M.orange, tx + 2, y0 + 8.6, z);
    lb.rotation.z = Math.PI / 2;
    lb.scale.set(1, 1, 0.85);
    box(0.3, 3.4, 0.3, M.dark, tx + 5.2, y0 + 7.4, z);
    box(0.3, 3.4, 0.3, M.dark, tx - 1.2, y0 + 7.4, z);
  }

  /* funnel */
  const fx = -62;
  const funnel = new THREE.Group();
  funnel.position.set(fx, y0, 0);
  funnel.scale.set(1.45, 1, 1);
  const bodyMat = opts.funnel === 'red' ? M.red : M.navy;
  const seg = (rt: number, rb: number, h: number, y: number, m: THREE.Material) => {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 18), m);
    s.position.y = y + h / 2;
    funnel.add(s);
    return s;
  };
  seg(3.6, 3.95, 15, 0, bodyMat);
  seg(3.55, 3.6, 3.4, 15, M.funnelWhite);
  seg(3.5, 3.55, 0.5, 18.4, M.red);
  seg(3.45, 3.5, 4.2, 18.9, bodyMat);
  const funnelTop = seg(3.55, 3.5, 1.5, 23.1, M.black);
  funnelTop.position.y += 0.1;
  group.add(funnel);
  // engine room casing
  box(7, 9, 16, M.white, -57.5, y0 + 4.5, 0);

  /* aft mooring deck */
  for (const z of [-5, 5]) {
    add(new THREE.CylinderGeometry(1, 1, 3, 12), M.dark, -74, y0 + 1.6, z).rotation.x = Math.PI / 2;
    box(2.6, 1.6, 2.6, M.dark, -74, y0 + 0.8, z);
  }

  /* cargo */
  const variant = opts.variant ?? 'container';
  if (variant === 'container') {
    const bays = 7;
    const bayLen = 12.55;
    const x0 = -26;
    const caps = [5, 5, 5, 4, 4, 3, 2];
    const geo = containerGeometry();
    const items: { x: number; y: number; z: number; c: number }[] = [];
    let maxHalf = 0;
    for (let b = 0; b < bays; b++) {
      const xc = x0 + b * bayLen;
      const hdw = deckHalf(sAt(xc + 6.2)) * (SHIP_B / 2);
      const rows = Math.min(9, Math.floor((hdw * 2 - 1.8) / 2.5));
      if (rows < 1) continue;
      const yDeck = deckY(sAt(xc));
      const hw = rows * 2.5 + 0.5;
      maxHalf = Math.max(maxHalf, hw / 2);
      box(12.35, 1.5, hw, M.hatch, xc, yDeck + 0.15, 0);
      // lashing bridge on the forward face of the bay
      box(0.7, 0.28, hw + 0.8, M.lightGrey, xc + 6.35, yDeck + 0.9 + 2.74 * 2, 0);
      box(0.25, 2.74 * caps[b], 0.25, M.dark, xc + 6.35, yDeck + 0.9 + (2.74 * caps[b]) / 2, hw / 2 + 0.2);
      box(0.25, 2.74 * caps[b], 0.25, M.dark, xc + 6.35, yDeck + 0.9 + (2.74 * caps[b]) / 2, -hw / 2 - 0.2);
      for (let r = 0; r < rows; r++) {
        let tiers = caps[b];
        if (R() < 0.35) tiers -= 1;
        if (R() < 0.12) tiers -= 2;
        if (R() < 0.04) tiers = 0;
        // each stack keeps one colour family so it reads as a real stowage plan
        const stackColor = PALETTE[Math.floor(R() * PALETTE.length)];
        for (let t = 0; t < tiers; t++) {
          const c = R() < 0.78 ? stackColor : PALETTE[Math.floor(R() * PALETTE.length)];
          items.push({ x: xc, y: yDeck + 0.9 + (t + 0.5) * 2.74, z: (r - (rows - 1) / 2) * 2.5, c });
        }
      }
    }
    const inst = new THREE.InstancedMesh(geo, M.container, items.length);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    items.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      col.setHex(it.c);
      col.offsetHSL((R() - 0.5) * 0.02, (R() - 0.5) * 0.08, (R() - 0.5) * 0.07);
      inst.setColorAt(i, col);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    group.add(inst);
    void maxHalf;
  } else {
    // product tanker: pipe runs, manifold, catwalk and tank hatches
    const yDeck = deckY(sAt(0));
    for (const z of [-3.4, 3.4]) {
      const p = add(new THREE.CylinderGeometry(0.55, 0.55, 90, 12), M.pipe, 8, yDeck + 1.6, z);
      p.rotation.z = Math.PI / 2;
    }
    for (let i = 0; i < 12; i++) {
      for (const z of [-3.4, 3.4]) box(0.5, 1.4, 1.2, M.dark, -34 + i * 8, yDeck + 0.8, z);
    }
    const man = add(new THREE.CylinderGeometry(0.5, 0.5, 21, 12), M.pipe, 10, yDeck + 1.8, 0);
    man.rotation.x = Math.PI / 2;
    box(88, 0.14, 1.3, M.lightGrey, 6, yDeck + 3.2, 0);
    for (let i = 0; i < 5; i++) {
      for (const z of [-7.5, 7.5]) add(new THREE.CylinderGeometry(2.1, 2.3, 0.9, 16), M.hatch, -20 + i * 16, yDeck + 0.5, z);
    }
    for (const x of [-12, 30]) {
      box(0.5, 9, 0.5, M.dark, x, yDeck + 4.5, 0);
      box(0.4, 0.4, 9, M.dark, x, yDeck + 8.5, 0);
    }
  }

  /* forecastle fittings */
  const sF = sAt(64);
  const yF = deckY(sF);
  for (const z of [-3.2, 3.2]) {
    add(new THREE.CylinderGeometry(1.1, 1.1, 3.2, 14), M.dark, 64, yF + 1.4, z).rotation.x = Math.PI / 2;
    box(2.4, 1.6, 2.4, M.dark, 64, yF + 0.8, z);
  }
  box(2.2, 1.4, 6.4, M.dark, 64, yF + 0.7, 0);
  const bollard = new THREE.CylinderGeometry(0.4, 0.55, 1.2, 8);
  for (const x of [56, 60, 70]) {
    for (const side of [-1, 1]) add(bollard, M.dark, x, deckY(sAt(x)) + 0.6, side * (deckHalf(sAt(x)) * (SHIP_B / 2) - 1.4));
  }
  // anchors resting in the hawse pipes
  for (const side of [-1, 1]) {
    const ax = 67;
    const az = hullZ(sAt(ax), 9) * side + side * 0.5;
    box(0.5, 3.6, 0.5, M.dark, ax, 9, az);
    box(0.5, 0.5, 2.6, M.dark, ax, 7.2, az);
    box(1.6, 0.4, 0.4, M.dark, ax, 10.6, az);
    add(new THREE.ConeGeometry(0.5, 1.2, 6), M.dark, ax, 6.6, az + side * 0).rotation.x = Math.PI;
  }
  add(new THREE.CylinderGeometry(0.22, 0.3, 8, 8), M.dark, 69.5, yF + 4.4, 0);
  const jackY = deckY(sAt(77));
  add(new THREE.CylinderGeometry(0.1, 0.12, 6, 6), M.dark, 77, jackY + 3, 0);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.5),
    share(new THREE.MeshStandardMaterial({ color: 0x1d4fa8, roughness: 0.9, side: THREE.DoubleSide }))
  );
  flag.position.set(77, jackY + 5.2, 0);
  flag.rotation.y = Math.PI / 2;
  group.add(flag);

  /* railings along both rails */
  const posts: THREE.Matrix4[] = [];
  const rails: THREE.Matrix4[] = [];
  const o = new THREE.Object3D();
  const RN = 70;
  for (const side of [-1, 1]) {
    for (let i = 0; i <= RN; i++) {
      const s = 0.012 + (0.84 * i) / RN;
      const s2 = 0.012 + (0.84 * (i + 1)) / RN;
      const x1 = xAt(s);
      const x2 = xAt(s2);
      const z1 = (deckHalf(s) * (SHIP_B / 2) - 0.25) * side;
      const z2 = (deckHalf(s2) * (SHIP_B / 2) - 0.25) * side;
      const y1 = deckY(s);
      const y2 = deckY(s2);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 1, 1);
      o.position.set(x1, y1 + 0.55, z1);
      o.updateMatrix();
      posts.push(o.matrix.clone());
      if (i < RN) {
        const len = Math.hypot(x2 - x1, z2 - z1);
        const yaw = -Math.atan2(z2 - z1, x2 - x1);
        for (const h of [0.5, 1.05]) {
          o.position.set((x1 + x2) / 2, (y1 + y2) / 2 + h, (z1 + z2) / 2);
          o.rotation.set(0, yaw, 0);
          o.scale.set(len, 1, 1);
          o.updateMatrix();
          rails.push(o.matrix.clone());
        }
      }
    }
  }
  const postInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 1.1, 5), M.rail, posts.length);
  posts.forEach((m, i) => postInst.setMatrixAt(i, m));
  group.add(postInst);
  const railInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.05, 0.05), M.rail, rails.length);
  rails.forEach((m, i) => railInst.setMatrixAt(i, m));
  group.add(railInst);

  /* navigation lights (red = port / -z, green = starboard / +z) */
  const nav = (x: number, y: number, z: number, color: number, size: number, op = 0.95) => {
    const s = glowSprite(color, size, op);
    s.position.set(x, y, z);
    group.add(s);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 8, 8),
      new THREE.MeshBasicMaterial({ color })
    );
    bulb.position.set(x, y, z);
    group.add(bulb);
  };
  nav(tx + 1, yb + 2.4, -15.3, 0xff2a1f, 7);
  nav(tx + 1, yb + 2.4, 15.3, 0x2bff66, 7);
  nav(tx - 2, roof + 14.4, 0, 0xfff1d0, 9);
  nav(69.5, yF + 8.3, 0, 0xfff1d0, 8);
  nav(-79.3, y0 + 2.2, 0, 0xffffff, 6);
  // deck flood lights, only bright when the light fades
  for (const [x, z] of [
    [tx + 9, -11.4],
    [tx + 9, 11.4],
    [-24, -11],
    [-24, 11],
    [50, -8],
    [50, 8],
  ] as [number, number][]) {
    const s = glowSprite(0xffd9a0, 16, 0.0);
    s.position.set(x, deckY(sAt(x)) + 6, z);
    s.material = s.material.clone();
    group.add(s);
    nightLights.push(s);
  }

  /* dual-purpose deck gun mounts (forward, amidships port/starboard) */
  const gunMounts: THREE.Object3D[] = [];
  for (const z of [-11.5, 11.5]) {
    const mount = new THREE.Group();
    const baseY = deckY(sAt(60)) + 3;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 4.2, 12), M.darkMetal);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(0, 0.6, 0);
    tube.castShadow = true;
    mount.add(tube);
    const shield = new THREE.Mesh(new THREE.RingGeometry(0.9, 2.2, 16), M.lightGrey);
    shield.rotation.y = Math.PI / 2;
    shield.position.set(0.9, 0.55, 0);
    shield.castShadow = true;
    mount.add(shield);
    mount.position.set(60, baseY, z);
    mount.userData = { side: Math.sign(z) };
    group.add(mount);
    gunMounts.push(mount);
  }

  /* CIWS (Phalanx-style) turret above the bridge for missile/skp defense */
  let ciws: THREE.Object3D | null = null;
  const ciwsBase = new THREE.Group();
  const cy = roof + 5;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.4, 1.6, 16), M.darkMetal);
  base.position.y = cy;
  base.castShadow = true;
  ciwsBase.add(base);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 4.2, 12), M.darkMetal);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.y = cy + 1.4;
  barrel.castShadow = true;
  ciwsBase.add(barrel);
  ciwsBase.position.set(tx + 2, 0, 0);
  group.add(ciwsBase);
  ciws = ciwsBase;

  /* VLS missile cells forward — Sea Lance anti-ship missiles */
  {
    const vlsY = deckY(sAt(44)) + 0.4;
    box(7.5, 1.5, 4.8, M.darkMetal, 44, vlsY, 0);
    for (let i = 0; i < 8; i++) {
      box(1.4, 1.8, 0.9, i % 2 ? M.lightGrey : M.deck, 41.3 + (i % 4) * 1.8, vlsY + 0.35, i < 4 ? -1.25 : 1.25);
    }
  }

  /* shadows */
  group.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  return { group, radarBar, funnelTop, nightLights, gunMounts, ciwsTurret: ciws };
}
