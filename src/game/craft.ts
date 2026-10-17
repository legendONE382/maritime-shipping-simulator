import * as THREE from 'three';
import { SURFACE_LAYER, type Ocean } from './ocean';
import { share } from './shared';
import { containerGeometry, containerMaterial } from './ship';
import { makePuffTexture } from './textures';

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
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

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, rough = 0.7, metal = 0.1, glow = 0): THREE.MeshStandardMaterial {
  const key = `${color}|${rough}|${metal}|${glow}`;
  let m = matCache.get(key);
  if (!m) {
    m = share(
      new THREE.MeshStandardMaterial({
        color,
        roughness: rough,
        metalness: metal,
        emissive: glow ? color : 0x000000,
        emissiveIntensity: glow,
      })
    );
    matCache.set(key, m);
  }
  return m;
}

let hullMatCache: THREE.MeshStandardMaterial | null = null;
function hullMat() {
  if (!hullMatCache)
    hullMatCache = share(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.08, side: THREE.DoubleSide }));
  return hullMatCache;
}

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
function cyl(rt: number, rb: number, h: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, seg = 10) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

let glowTex: THREE.Texture | null = null;
function glow(color: number, size: number): THREE.Sprite {
  if (!glowTex) glowTex = makePuffTexture(64, 0.1);
  const m = new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  return s;
}

function shadows(g: THREE.Object3D) {
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
}

/* --------------------------------------------------------- small hulls -- */

interface LoftOpts {
  len: number;
  beam: number;
  depth: number;
  sheer: number;
  bowRise: number;
  transom: number;
  top: number;
  bottom: number;
  boot?: number;
  waterline?: number;
  deckDrop?: number;
}

/** Lofted hull for small craft: transom stern, flared sheer, raked V bow, vertex-painted. */
function loft(o: LoftOpts): { hull: THREE.BufferGeometry; deck: THREE.BufferGeometry | null } {
  const NS = 24;
  const P = 9;
  const wl = o.waterline ?? 0;
  const top = new THREE.Color(o.top);
  const bottom = new THREE.Color(o.bottom);
  const boot = o.boot !== undefined ? new THREE.Color(o.boot) : null;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const stations: { x: number; hb: number; yt: number; pts: [number, number][] }[] = [];
  for (let i = 0; i <= NS; i++) {
    const s = i / NS;
    const x = -o.len / 2 + s * o.len;
    const hb = (o.beam / 2) * (s < 0.62 ? o.transom + (1 - o.transom) * sm(0, 0.32, s) : Math.max(0, 1 - Math.pow((s - 0.62) / 0.38, 1.7)));
    const yt = o.sheer + o.bowRise * s * s;
    const yk = -o.depth * (1 - 0.8 * sm(0.7, 1, s));
    const pts: [number, number][] = [
      [-hb, yt],
      [-hb * 0.98, yt * 0.3],
      [-hb * 0.84, yk * 0.22],
      [-hb * 0.45, yk * 0.82],
      [0, yk],
      [hb * 0.45, yk * 0.82],
      [hb * 0.84, yk * 0.22],
      [hb * 0.98, yt * 0.3],
      [hb, yt],
    ];
    stations.push({ x, hb, yt, pts });
    for (const [z, y] of pts) {
      pos.push(x, y, z);
      const c = y < wl ? bottom : boot && y < wl + o.depth * 0.2 ? boot : top;
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < NS; i++)
    for (let j = 0; j < P - 1; j++) {
      const a = i * P + j;
      const b = (i + 1) * P + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  // transom
  const base = pos.length / 3;
  const s0 = stations[0];
  pos.push(s0.x, (s0.pts[4][1] + s0.yt) / 2, 0);
  col.push(top.r, top.g, top.b);
  for (let j = 0; j < P; j++) {
    pos.push(s0.x, s0.pts[j][1], s0.pts[j][0]);
    const c = s0.pts[j][1] < wl ? bottom : top;
    col.push(c.r, c.g, c.b);
  }
  for (let j = 0; j < P - 1; j++) idx.push(base, base + 1 + j, base + 2 + j);
  idx.push(base, base + P, base + 1);

  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hull.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  hull.setIndex(idx);
  hull.computeVertexNormals();

  let deck: THREE.BufferGeometry | null = null;
  if (o.deckDrop !== undefined) {
    const dp: number[] = [];
    const di: number[] = [];
    stations.forEach((st, i) => {
      dp.push(st.x, st.yt - o.deckDrop!, -st.hb * 0.97, st.x, st.yt - o.deckDrop!, st.hb * 0.97);
      if (i < NS) {
        const a = i * 2;
        di.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    });
    deck = new THREE.BufferGeometry();
    deck.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
    deck.setIndex(di);
    deck.computeVertexNormals();
  }
  return { hull, deck };
}

/* ----------------------------------------------------------- figures --- */

const SKIN = [0x6b4423, 0x4a2f1b, 0x8d5a3b, 0x5a3a24];
const CLOTH = [0x2f4f6f, 0x7a2e2e, 0x4b5a2f, 0xb8a27a, 0x333333, 0x5d3a6b, 0xc9c1b0, 0x8a6a2a];

function person(R: () => number, armed: boolean): THREE.Group {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.75, 0.32), mat(0x2a2a2a, 0.9, 0));
  legs.position.y = 0.38;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 3, 8), mat(CLOTH[Math.floor(R() * CLOTH.length)], 0.9, 0));
  torso.position.y = 1.02;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(SKIN[Math.floor(R() * SKIN.length)], 0.7, 0));
  head.position.y = 1.5;
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.12, 10), mat(CLOTH[Math.floor(R() * CLOTH.length)], 0.9, 0));
  wrap.position.y = 1.58;
  g.add(legs, torso, head, wrap);
  if (armed) {
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.07, 0.07), mat(0x1a1a1a, 0.5, 0.6));
    gun.position.set(0.25, 1.12, 0.18);
    gun.rotation.z = 0.5;
    g.add(gun);
  }
  return g;
}

/* ------------------------------------------------------------- skiff --- */

export interface SkiffModel {
  group: THREE.Group;
  ladder: THREE.Group;
}

/** Fibreglass attack skiff: twin outboards, fuel drums, armed crew and a hooked boarding ladder. */
export function buildSkiff(seed: number): SkiffModel {
  const R = rng(seed * 7 + 11);
  const looks: [number, number][] = [
    [0xd8dcde, 0x5b7a91],
    [0x6f8fa8, 0x2c3e50],
    [0x3f6b5a, 0x22332b],
    [0xb8a27a, 0x5a4a35],
    [0xe0e0d8, 0x8a2a2a],
  ];
  const [top, bottom] = looks[Math.floor(R() * looks.length)];
  const { hull } = loft({ len: 9.5, beam: 2.4, depth: 0.7, sheer: 0.6, bowRise: 0.45, transom: 0.86, top, bottom, waterline: 0.05 });
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  g.add(new THREE.Mesh(hull, hullMat()));
  box(8, 0.08, 1.9, mat(0x3a3a36, 0.95, 0), -0.5, 0.12, 0, g);
  for (const x of [-2.2, 0.4, 2.4]) box(0.3, 0.08, 2.1, mat(0x6b5a40, 0.9, 0), x, 0.45, 0, g);
  for (const z of [-0.45, 0.45]) {
    box(0.55, 0.75, 0.45, mat(0x15171a, 0.4, 0.3), -4.95, 0.85, z, g);
    box(0.12, 1.0, 0.16, mat(0x2a2d31, 0.5, 0.5), -5.05, 0.1, z, g);
  }
  for (const z of [-0.5, 0.5]) cyl(0.28, 0.28, 0.85, mat(0x1f4fa8, 0.6, 0.2), -3.5, 0.55, z, g);
  const n = 4 + Math.floor(R() * 2);
  const xs = [-4.2, -1.8, 0.2, 1.8, 3.2];
  for (let i = 0; i < n; i++) {
    const p = person(R, i > 0 && R() < 0.75);
    p.position.set(xs[i], 0.12, (R() - 0.5) * 0.9);
    p.rotation.y = (R() - 0.5) * 0.9;
    if (i % 2 === 1) p.scale.y = 0.8;
    g.add(p);
  }
  const ladder = new THREE.Group();
  const al = mat(0x9aa3ab, 0.45, 0.7);
  for (const z of [-0.22, 0.22]) box(7, 0.07, 0.07, al, 3.5, 0, z, ladder);
  for (let k = 0; k < 13; k++) box(0.05, 0.05, 0.44, al, 0.3 + k * 0.52, 0, 0, ladder);
  for (const z of [-0.22, 0.22]) box(0.06, 0.35, 0.06, mat(0x2a2d31, 0.5, 0.6), 7, -0.15, z, ladder);
  ladder.position.set(-2.5, 0.75, 0.75);
  ladder.rotation.z = 0.04;
  g.add(ladder);
  shadows(g);
  /* game-feel scale: an honest 9.5 m skiff is invisible at engagement range; 1.6× reads right */
  g.scale.setScalar(1.6);
  return { group: g, ladder };
}

/* ------------------------------------------------------------- dhow ---- */

/** Wooden dhow used as a pirate mothership. */
export function buildDhow(): THREE.Group {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const { hull, deck } = loft({ len: 30, beam: 7.5, depth: 2.4, sheer: 2.4, bowRise: 2.6, transom: 0.72, top: 0x6e4a2a, bottom: 0x2f2418, boot: 0xe8e2d0, waterline: 0.1, deckDrop: 0.35 });
  g.add(new THREE.Mesh(hull, hullMat()));
  if (deck) g.add(new THREE.Mesh(deck, mat(0x8a6a44, 0.9, 0)));
  const wood = mat(0x7a5634, 0.85, 0);
  box(7, 2.6, 6.4, mat(0xd8cfb8, 0.8, 0), -10, 3.6, 0, g);
  box(7.05, 0.5, 6.45, mat(0x1d2228, 0.3, 0.4), -10, 4.0, 0, g);
  box(7.6, 0.3, 7, wood, -10, 5.05, 0, g);
  cyl(0.25, 0.35, 17, wood, 3, 10.5, 0, g, 8);
  const yard = cyl(0.14, 0.18, 24, wood, 3, 15.5, 0, g, 6);
  yard.rotation.z = 0.5;
  const sail = cyl(0.45, 0.3, 20, mat(0xd9cfae, 0.95, 0), 3.2, 15, 0, g, 8);
  sail.rotation.z = 0.5;
  const tarps = [0x2f4f6f, 0x6b6f74, 0x8a2e2e, 0x4b5a2f];
  for (let i = 0; i < 4; i++) box(2.2, 1.4, 2, mat(tarps[i], 0.95, 0), -3 + i * 2.6, 3.4, (i % 2 ? 1 : -1) * 0.9, g);
  const tyre = new THREE.TorusGeometry(0.5, 0.18, 6, 12);
  for (const side of [-1, 1])
    for (let k = 0; k < 5; k++) {
      const t = new THREE.Mesh(tyre, mat(0x111111, 0.9, 0));
      t.position.set(-8 + k * 4, 1.6, side * 3.9);
      g.add(t);
    }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff5533 }));
  lamp.position.set(-10, 5.6, 0);
  g.add(lamp);
  shadows(g);
  /* mothership presence: 30 m of dhow reads as a speck next to a loaded box ship */
  g.scale.setScalar(1.55);
  return g;
}

/* ----------------------------------------------------------- trawler --- */

/** Stern trawler with wheelhouse, outriggers, A-frame gantry and net drum. */
export function buildTrawler(seed: number): THREE.Group {
  const R = rng(seed * 13 + 5);
  const colors = [0x8b1e1e, 0x1e4f8b, 0x2e6b3a, 0x2d3a4a];
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const { hull, deck } = loft({ len: 26, beam: 7, depth: 2.6, sheer: 2.2, bowRise: 1.6, transom: 0.85, top: colors[Math.floor(R() * colors.length)], bottom: 0x5a1414, boot: 0xeeeeee, waterline: 0.1, deckDrop: 0.4 });
  g.add(new THREE.Mesh(hull, hullMat()));
  if (deck) g.add(new THREE.Mesh(deck, mat(0x6b6f74, 0.9, 0.1)));
  const white = mat(0xeef0f0, 0.6, 0.05);
  box(5, 3, 5.2, white, 4.5, 4.0, 0, g);
  box(5.05, 0.8, 5.25, mat(0x14202b, 0.15, 0.7), 4.5, 4.7, 0, g);
  box(5.4, 0.25, 5.6, white, 4.5, 5.6, 0, g);
  cyl(0.15, 0.2, 7, mat(0x2a2d31, 0.5, 0.5), 5.5, 9, 0, g, 6);
  for (const side of [-1, 1]) {
    const boom = cyl(0.1, 0.12, 11, mat(0x9a9a8a, 0.6, 0.4), 3, 6.2, side * 3.2, g, 6);
    boom.rotation.x = side * 0.8;
  }
  const orange = mat(0xe8610f, 0.6, 0.2);
  for (const z of [-2.8, 2.8]) box(0.3, 5, 0.3, orange, -11.5, 5, z, g);
  box(0.35, 0.35, 6, orange, -11.5, 7.4, 0, g);
  const drum = cyl(0.9, 0.9, 4.5, mat(0x2f6b3a, 0.9, 0), -7, 3.4, 0, g, 14);
  drum.rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) box(1, 0.5, 0.7, mat(0x2f6fb0, 0.7, 0), -3 + i * 1.1, 2.9, -2, g);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff1d0 }));
  lamp.position.set(5.5, 12.6, 0);
  g.add(lamp);
  shadows(g);
  g.scale.setScalar(1.35);
  return g;
}

/* -------------------------------------------------------- helicopter --- */

export interface HeliModel {
  group: THREE.Group;
  rotor: THREE.Group;
  tail: THREE.Group;
}

/** Naval utility helicopter. */
export function buildHelicopter(): HeliModel {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const grey = mat(0x59626b, 0.55, 0.45);
  const dark = mat(0x22262b, 0.5, 0.5);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.35, 5.5, 6, 14), grey);
  body.rotation.z = Math.PI / 2;
  body.scale.set(1, 1, 0.85);
  g.add(body);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1.25, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x0d1a24, 0.1, 0.8));
  glass.rotation.z = -Math.PI / 2;
  glass.position.set(3.1, 0.15, 0);
  glass.scale.set(1, 1, 0.85);
  g.add(glass);
  const boom = cyl(0.32, 0.75, 7.5, grey, -6.4, 0.5, 0, g, 10);
  boom.rotation.z = Math.PI / 2;
  box(1.6, 2.2, 0.18, grey, -10, 1.4, 0, g);
  box(1.2, 0.12, 3, grey, -9.4, 0.5, 0, g);
  const tail = new THREE.Group();
  tail.position.set(-10.2, 1.8, 0.35);
  box(0.12, 2.6, 0.22, dark, 0, 0, 0, tail);
  box(2.6, 0.12, 0.22, dark, 0, 0, 0, tail);
  g.add(tail);
  cyl(0.25, 0.3, 0.9, dark, 0, 1.6, 0, g, 8);
  const rotor = new THREE.Group();
  rotor.position.y = 2.1;
  cyl(0.35, 0.35, 0.3, dark, 0, 0, 0, rotor, 10);
  const bladeGeo = new THREE.BoxGeometry(7, 0.07, 0.45);
  bladeGeo.translate(3.5, 0, 0);
  for (let k = 0; k < 4; k++) {
    const b = new THREE.Mesh(bladeGeo, dark);
    b.rotation.y = (k * Math.PI) / 2;
    rotor.add(b);
  }
  g.add(rotor);
  for (const z of [-1.2, 1.2]) {
    box(5.5, 0.12, 0.12, dark, 0, -1.75, z, g);
    for (const x of [-1.4, 1.4]) box(0.1, 0.8, 0.1, dark, x, -1.35, z * 0.9, g);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1f }));
  beacon.position.set(-10, 2.6, 0);
  g.add(beacon);
  const light = glow(0xffffff, 10);
  light.position.set(2.5, -1.6, 0);
  g.add(light);
  shadows(g);
  /* a real helo at 300 m is a dot — cheat the scale up so the rescue reads */
  g.scale.setScalar(1.75);
  return { group: g, rotor, tail };
}

/* ------------------------------------------------------------- whale --- */

export interface WhaleModel {
  group: THREE.Group;
  tail: THREE.Group;
}

let whaleMat: THREE.MeshStandardMaterial | null = null;

/** Humpback: lathe body with a pale belly, long white flippers and articulated flukes. */
export function buildWhale(): WhaleModel {
  if (!whaleMat) whaleMat = share(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.05, side: THREE.DoubleSide }));
  const prof: [number, number][] = [
    [0, -7],
    [0.3, -6.2],
    [0.55, -5],
    [1.0, -3],
    [1.55, -1],
    [1.85, 1],
    [1.8, 3],
    [1.5, 4.8],
    [0.95, 6.2],
    [0.4, 6.9],
    [0, 7.1],
  ];
  const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 20);
  geo.rotateZ(-Math.PI / 2);
  geo.scale(1, 0.82, 1.05);
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const colors = new Float32Array(nrm.count * 3);
  const dark = new THREE.Color(0.06, 0.07, 0.09);
  const light = new THREE.Color(0.6, 0.62, 0.64);
  const c = new THREE.Color();
  for (let i = 0; i < nrm.count; i++) {
    c.copy(dark).lerp(light, sm(-0.1, -0.6, nrm.getY(i)));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  g.add(new THREE.Mesh(geo, whaleMat));
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1, 5), mat(0x101215, 0.4, 0.05));
  fin.position.set(-2.8, 1.45, 0);
  fin.scale.set(1, 1, 0.35);
  fin.rotation.z = -0.5;
  g.add(fin);
  for (const side of [-1, 1]) {
    const flip = box(4.4, 0.14, 0.75, mat(0x9aa0a6, 0.45, 0.05), 3.0, -0.9, side * 3.2, g);
    flip.rotation.y = side * 0.5;
    flip.rotation.x = side * 0.35;
  }
  const tail = new THREE.Group();
  tail.position.set(-6.6, 0, 0);
  const s = new THREE.Shape();
  s.moveTo(0.3, 0);
  s.lineTo(-0.4, 0.6);
  s.lineTo(-1.3, 2.4);
  s.lineTo(-1.8, 2.3);
  s.lineTo(-1.2, 1.0);
  s.lineTo(-0.9, 0);
  s.lineTo(-1.2, -1.0);
  s.lineTo(-1.8, -2.3);
  s.lineTo(-1.3, -2.4);
  s.lineTo(-0.4, -0.6);
  s.closePath();
  const fg = new THREE.ShapeGeometry(s);
  fg.rotateX(-Math.PI / 2);
  const flukes = new THREE.Mesh(fg, mat(0x14161a, 0.4, 0.05));
  flukes.material.side = THREE.DoubleSide;
  tail.add(flukes);
  g.add(tail);
  shadows(g);
  g.scale.setScalar(1.45);
  return { group: g, tail };
}

/* ------------------------------------------------------------- buoys --- */

export type BuoyKind = 'safe' | 'port' | 'starboard' | 'cardinal';
export interface BuoyModel {
  group: THREE.Group;
  lamp: THREE.Sprite;
}

/** IALA navigation buoys with flashing lights. */
export function buildBuoy(kind: BuoyKind, scale = 1): BuoyModel {
  const g = new THREE.Group();
  cyl(1.3, 1.5, 1.0, mat(0x2b2b2b, 0.8, 0.2), 0, -0.2, 0, g, 16);
  const red = mat(0xc0202a, 0.55, 0.1);
  const white = mat(0xeeeeee, 0.55, 0.05);
  const green = mat(0x1d8a3a, 0.55, 0.1);
  const yellow = mat(0xf2c12e, 0.55, 0.1);
  const black = mat(0x111111, 0.6, 0.2);
  let top = 4;
  let lampColor = 0xffffff;
  if (kind === 'safe') {
    for (let k = 0; k < 4; k++) cyl(0.75 - k * 0.07, 0.8 - k * 0.07, 0.8, k % 2 ? white : red, 0, 0.7 + k * 0.8, 0, g, 14);
    cyl(0.06, 0.06, 1.2, black, 0, 4.0, 0, g, 6);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), red);
    ball.position.y = 4.8;
    g.add(ball);
    top = 5.3;
  } else if (kind === 'port') {
    cyl(0.85, 0.95, 2.6, red, 0, 1.6, 0, g, 14);
    cyl(0.3, 0.3, 0.6, red, 0, 3.6, 0, g, 10);
    lampColor = 0xff3322;
    top = 4.1;
  } else if (kind === 'starboard') {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.0, 3.0, 14), green);
    cone.position.y = 1.8;
    g.add(cone);
    const tm = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 10), green);
    tm.position.y = 3.8;
    g.add(tm);
    lampColor = 0x33ff66;
    top = 4.3;
  } else {
    cyl(0.8, 0.95, 1.4, yellow, 0, 1.0, 0, g, 14);
    cyl(0.7, 0.8, 1.3, black, 0, 2.35, 0, g, 14);
    for (const y of [3.5, 4.15]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5, 10), black);
      cone.position.y = y;
      g.add(cone);
    }
    top = 4.6;
  }
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: lampColor }));
  bulb.position.y = top;
  g.add(bulb);
  const lamp = glow(lampColor, 6);
  lamp.position.y = top;
  g.add(lamp);
  g.scale.setScalar(scale);
  return { group: g, lamp };
}

/* ------------------------------------------------------------- hazards -- */

/** Moored contact mine broken from its sinker: Hertz horns, chain and growth. */
export function buildMooredMine(): THREE.Group {
  const g = new THREE.Group();
  const rust = mat(0x5b3a22, 0.95, 0.35);
  const dark = mat(0x22201d, 0.8, 0.4);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1.35, 18, 14), rust));
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.36, 0.12, 6, 24), dark);
  band.rotation.x = Math.PI / 2;
  g.add(band);
  const up = new THREE.Vector3(0, 1, 0);
  const hornGeo = new THREE.CylinderGeometry(0.1, 0.15, 0.6, 8);
  const dirs = [
    [0, 1, 0],
    [0.7, 0.6, 0],
    [-0.7, 0.6, 0],
    [0, 0.6, 0.7],
    [0, 0.6, -0.7],
    [0.5, 0.25, 0.5],
    [-0.5, 0.25, -0.5],
  ];
  for (const [x, y, z] of dirs) {
    const d = new THREE.Vector3(x, y, z).normalize();
    const h = new THREE.Mesh(hornGeo, dark);
    h.quaternion.setFromUnitVectors(up, d);
    h.position.copy(d.multiplyScalar(1.45));
    g.add(h);
  }
  const link = new THREE.TorusGeometry(0.16, 0.05, 4, 8);
  for (let i = 0; i < 6; i++) {
    const l = new THREE.Mesh(link, dark);
    l.position.y = -1.5 - i * 0.26;
    l.rotation.y = i % 2 ? Math.PI / 2 : 0;
    g.add(l);
  }
  const growth = mat(0x8f8a7a, 1, 0);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.1 + (i % 3) * 0.04, 6, 5), growth);
    b.position.set(Math.cos(a) * 1.25, -0.4 - (i % 4) * 0.15, Math.sin(a) * 1.25);
    g.add(b);
  }
  g.scale.setScalar(1.4);
  return g;
}

/* ----------------------------------------------------- island & fort --- */

function islandRock() {
  return share(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0.01, flatShading: true }));
}

/** Approximate ground height of the island dome — used to stand the forts on the sand rim. */
function islandHeight(seed: number, radius: number, x: number, z: number): number {
  const n = 1 + 0.22 * Math.sin(x * 0.021 + seed) * Math.cos(z * 0.017 + seed * 2.3) + 0.1 * Math.sin(z * 0.04 + seed * 0.7);
  const d = Math.hypot(x * n, z * n) / radius;
  const dome = Math.max(0, 1 - d * d);
  return Math.max(0.8, dome * radius * 0.34 * (0.7 + 0.6 * Math.sin(seed + x * n * 0.011)));
}

/** A low fortified island: displaced dome with a sand rim, scrub and palms. */
export function buildIsland(seed: number, radius: number): { group: THREE.Group; slots: THREE.Vector3[]; radius: number } {
  const R = rng(seed * 167 + 13);
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(radius, 3);
  const posA = geo.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(posA.count * 3);
  const sand = new THREE.Color(0xc8b086);
  const scrub = new THREE.Color(0x51663c);
  const rock = new THREE.Color(0x77705f);
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  for (let i = 0; i < posA.count; i++) {
    v.fromBufferAttribute(posA, i);
    const d = Math.hypot(v.x, v.z) / radius;
    const n = 1 + 0.22 * Math.sin(v.x * 0.021 + seed) * Math.cos(v.z * 0.017 + seed * 2.3) + 0.1 * Math.sin(v.z * 0.04 + seed * 0.7);
    v.x *= n;
    v.z *= n;
    const dome = Math.max(0, 1 - d * d);
    v.y = Math.max(-4, v.y * 0.16 + dome * radius * 0.34 * (0.7 + 0.6 * Math.sin(seed + v.x * 0.011)));
    posA.setXYZ(i, v.x, v.y, v.z);
    if (v.y < 3.5) c.copy(sand).multiplyScalar(0.9 + 0.2 * R());
    else if (v.y < radius * 0.16) c.copy(scrub).multiplyScalar(0.85 + 0.3 * R());
    else c.copy(rock).multiplyScalar(0.85 + 0.25 * R());
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const land = new THREE.Mesh(geo, islandRock());
  land.receiveShadow = true;
  g.add(land);

  /* shallow shelf of water around the islet so it sits in the sea */
  const shelf = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 1.3, 40),
    new THREE.MeshBasicMaterial({ color: 0x2e7d74, transparent: true, opacity: 0.5, depthWrite: false })
  );
  shelf.rotation.x = -Math.PI / 2;
  shelf.position.y = -1.1;
  shelf.renderOrder = 1;
  g.add(shelf);

  /* fort slots along the seaward rim (local −z faces the route) — on the beach, low */
  const slots: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (-0.62 + (i / 3) * 1.24) + (R() - 0.5) * 0.12;
    const fx = Math.cos(a) * radius * 0.93;
    const fz = Math.sin(a) * radius * 0.93;
    slots.push(new THREE.Vector3(fx, Math.max(1.2, islandHeight(seed, radius, fx, fz) * 0.35), fz));
  }
  /* palms on the scrub band — cheap bent trunks and cone fronds */
  const trunkM = mat(0x6e5230, 0.9, 0);
  const leafM = mat(0x3e5e2c, 0.85, 0);
  for (let i = 0; i < 7; i++) {
    const a = R() * Math.PI * 2;
    const rr = radius * (0.2 + R() * 0.42);
    const px = Math.cos(a) * rr;
    const pz = Math.sin(a) * rr;
    const palm = new THREE.Group();
    const h = 9 + R() * 5;
    const trunk = cyl(0.22, 0.34, h, trunkM, 0, h / 2, 0, palm, 7);
    trunk.rotation.z = (R() - 0.5) * 0.3;
    for (let f = 0; f < 6; f++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.6, 4), leafM);
      leaf.scale.set(0.3, 1, 0.08);
      leaf.position.set(Math.cos((f / 6) * Math.PI * 2) * 2, h + 0.4, Math.sin((f / 6) * Math.PI * 2) * 2);
      leaf.rotation.set(Math.sin((f / 6) * Math.PI * 2) * 1.2, 0, -Math.cos((f / 6) * Math.PI * 2) * 1.2);
      palm.add(leaf);
    }
    palm.position.set(px, Math.max(2, radius * 0.3 * (1 - (rr / radius) ** 2)) - 0.5, pz);
    g.add(palm);
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { group: g, slots, radius };
}

/** Concrete coastal gun emplacement. The `turret` group is trained by the combat system. */
export function buildFort(): { group: THREE.Group; turret: THREE.Group } {
  const g = new THREE.Group();
  const concrete = mat(0x8a8a84, 0.95, 0.05);
  const dark = mat(0x2c2f33, 0.6, 0.4);
  box(11, 4.2, 8, concrete, 0, 2.1, 0, g);
  box(11.6, 1, 8.6, concrete, 0, 4.6, 0, g);
  box(3.4, 1.2, 8.1, mat(0x1a1c1e, 0.9, 0), 4.1, 2.6, 0, g);
  /* sandbag ring */
  const bagM = mat(0x9c8d6a, 0.95, 0);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const b = box(2.4, 1, 1.2, bagM, Math.cos(a) * 9.5, 0.6, Math.sin(a) * 8.1, g);
    b.rotation.y = -a;
  }
  /* the gun */
  const turret = new THREE.Group();
  turret.name = 'turret';
  cyl(2.6, 3.2, 1.6, dark, 0, 0.8, 0, turret, 14);
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.55, 11, 10);
  barrelGeo.translate(0, 5.5, 0);
  const barrel = new THREE.Mesh(barrelGeo, dark);
  barrel.rotation.z = -Math.PI / 2;
  barrel.position.y = 2.2;
  barrel.rotation.z = -Math.PI / 2 + 0.06;
  turret.add(barrel);
  const mantlet = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.4, 2.6), dark);
  mantlet.position.set(1.4, 2.2, 0);
  turret.add(mantlet);
  turret.position.set(0, 4.9, 0);
  g.add(turret);
  /* radio mast with a pennant */
  cyl(0.06, 0.09, 9, dark, -4.4, 8.5, -2.4, g, 5);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshBasicMaterial({ color: 0x14100e, side: THREE.DoubleSide }));
  flag.position.set(-3.2, 11.9, -2.4);
  g.add(flag);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { group: g, turret };
}

const debrisMats = new Map<number, THREE.MeshStandardMaterial>();
/** A lost container riding low and tilted, with pallets and a drum around it. */
export function buildDriftDebris(seed: number): THREE.Group {
  const R = rng(seed * 31 + 3);
  const colors = [0x8f4a2c, 0x2f5f9e, 0xb3382f, 0x3a7a4f, 0x8a9096];
  const c = colors[Math.floor(R() * colors.length)];
  let m = debrisMats.get(c);
  if (!m) {
    m = share(new THREE.MeshStandardMaterial({ color: c, map: containerMaterial().map, roughness: 0.8, metalness: 0.3 }));
    debrisMats.set(c, m);
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(containerGeometry(), m));
  const wood = mat(0x8a6a3a, 0.9, 0);
  for (let i = 0; i < 3; i++) {
    const p = box(1.2, 0.2, 1.0, wood, (R() - 0.5) * 18, 0.9, (R() - 0.5) * 12, g);
    p.rotation.y = R() * 3;
  }
  const drum = cyl(0.3, 0.3, 0.9, mat(0x1f4fa8, 0.6, 0.2), 6 + R() * 4, 1.0, (R() - 0.5) * 8, g);
  drum.rotation.z = Math.PI / 2;
  return g;
}

/* ------------------------------------------------------------- decals --- */

const NOISE_GLSL = /* glsl */ `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

const REEF_FRAG = /* glsl */ `
uniform vec2 uCenter;
uniform float uRadius;
uniform float uSeed;
uniform float uTime;
uniform sampler2D uFoamMap;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uLight;
varying float vViewZ;
varying vec3 vWorld;
${NOISE_GLSL}
void main() {
  vec2 d = vWorld.xz - uCenter;
  float ang = atan(d.y, d.x);
  float r = length(d) / uRadius;
  float edge = 0.84 + 0.14 * vnoise(vec2(ang * 2.2 + uSeed, uSeed)) + 0.06 * vnoise(d * 0.03 + uSeed);
  if (r > edge + 0.2) discard;
  float inside = 1.0 - smoothstep(edge - 0.3, edge, r);
  float n = vnoise(d * 0.05 + uSeed) * 0.6 + vnoise(d * 0.17 + uSeed * 2.0) * 0.4;
  vec3 sand = vec3(0.36, 0.74, 0.68);
  vec3 coral = vec3(0.07, 0.27, 0.29);
  vec3 col = mix(coral, sand, smoothstep(0.38, 0.72, n)) * uLight;
  float a = inside * 0.66;
  float band = 1.0 - smoothstep(0.0, 0.1, abs(r - edge + 0.05));
  float f = texture2D(uFoamMap, vWorld.xz * 0.05 + vec2(uTime * 0.03, 0.0)).r;
  float pulse = 0.55 + 0.45 * sin(uTime * 1.3 + ang * 3.0);
  float foam = band * smoothstep(0.3, 0.7, f * pulse + band * 0.3);
  col = mix(col, vec3(0.95, 0.98, 1.0) * uLight, foam);
  a = max(a, foam * 0.95);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * vViewZ * vViewZ);
  col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(col, a * (1.0 - fog));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const SKIRT_FRAG = /* glsl */ `
uniform vec2 uCenter;
uniform float uRadius;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uLight;
varying float vViewZ;
varying vec3 vWorld;
${NOISE_GLSL}
void main() {
  vec2 d = vWorld.xz - uCenter;
  float r = length(d) / uRadius;
  float edge = 0.75 + 0.25 * vnoise(d * 0.06);
  if (r > edge) discard;
  float a = (1.0 - smoothstep(0.25, edge, r)) * 0.5;
  vec3 col = vec3(0.3, 0.78, 0.84) * uLight;
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * vViewZ * vViewZ);
  gl_FragColor = vec4(mix(col, uFogColor, clamp(fog, 0.0, 1.0)), a * (1.0 - fog));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const RING_FRAG = /* glsl */ `
uniform vec2 uCenter;
uniform float uRadius;
uniform vec3 uColor;
uniform float uTime;
varying vec3 vWorld;
void main() {
  float r = length(vWorld.xz - uCenter);
  float w = abs(r - uRadius * (1.0 + 0.06 * sin(uTime * 3.0)));
  float a = (1.0 - smoothstep(0.0, 3.0, w)) * 0.8;
  a = max(a, (1.0 - smoothstep(0.0, uRadius, r)) * 0.1);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * 1.5, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function decalMesh(ocean: Ocean, size: number, seg: number, frag: string, uniforms: Record<string, THREE.IUniform>, lift: number) {
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, ocean.makeDecal(frag, uniforms, lift));
  mesh.layers.set(SURFACE_LAYER);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return mesh;
}

/** Shallow coral patch: turquoise water, dark coral heads and surf on the rim. */
export function buildReef(ocean: Ocean, x: number, z: number, radius: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(decalMesh(ocean, radius * 2.6, 56, REEF_FRAG, { uCenter: { value: new THREE.Vector2(x, z) }, uRadius: { value: radius }, uSeed: { value: seed } }, 0.2));
  return g;
}

/** Pale turquoise glow of an iceberg's submerged bulk. */
export function buildIceSkirt(ocean: Ocean, x: number, z: number, radius: number): THREE.Mesh {
  const m = decalMesh(ocean, radius * 2.2, 24, SKIRT_FRAG, { uCenter: { value: new THREE.Vector2(x, z) }, uRadius: { value: radius } }, 0.15);
  m.position.set(x, 0, z);
  return m;
}

export interface WaypointRing {
  mesh: THREE.Mesh;
  set(x: number, z: number, color: number): void;
}

/** Pulsing ring painted on the sea around the active waypoint. */
export function buildWaypointRing(ocean: Ocean): WaypointRing {
  const center = { value: new THREE.Vector2() };
  const color = { value: new THREE.Color(0x63e6ff) };
  const mesh = decalMesh(ocean, 80, 28, RING_FRAG, { uCenter: center, uRadius: { value: 30 }, uColor: color }, 0.35);
  return {
    mesh,
    set(x: number, z: number, c: number) {
      mesh.position.set(x, 0, z);
      center.value.set(x, z);
      color.value.setHex(c);
    },
  };
}
