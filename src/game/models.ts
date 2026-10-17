import * as THREE from 'three';
import { share } from './shared';
import { buildShip, containerGeometry, containerMaterial, type ShipModel } from './ship';
import { makeRingTexture, makeSteelTexture } from './textures';

export { type ShipModel } from './ship';

let ringTex: THREE.Texture | null = null;
function getRingTex(): THREE.Texture {
  if (!ringTex) ringTex = makeRingTexture();
  return ringTex;
}

function mat(color: number, rough = 0.62, metal = 0.25): THREE.MeshStandardMaterial {
  return share(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
}

const M = {
  glass: share(
    new THREE.MeshStandardMaterial({ color: 0x0a1622, roughness: 0.08, metalness: 0.9, emissive: 0x0a1a2a, emissiveIntensity: 0.4 })
  ),
  darkMetal: mat(0x2b3036, 0.5, 0.7),
  rock: share(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0.02, flatShading: true })),
  ice: share(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.28,
      metalness: 0,
      emissive: 0x0d1c2a,
      emissiveIntensity: 0.35,
      flatShading: true,
    })
  ),
  rust: mat(0x6c4426, 0.95, 0.2),
  black: mat(0x14161a, 0.6, 0.3),
  crane: mat(0xc0392b, 0.6, 0.4),
  skiffHull: mat(0x3b3a38, 0.8, 0.1),
  skiffCabin: mat(0x6b6f74, 0.7, 0.2),
};
export { M };

/* --------------------------------------------------------------- ships --- */

export function buildContainerShip(name: string): ShipModel {
  return buildShip({ name, company: 'BLUEWATER LINE', hullColor: '#10243b', funnel: 'navy', variant: 'container', seed: 11 });
}

const TRAFFIC_LOOKS: { color: string; funnel: 'navy' | 'red'; variant: 'container' | 'tanker'; name: string; company: string }[] = [
  { color: '#6b1b1c', funnel: 'red', variant: 'container', name: 'Meridian Star', company: 'ORIENT EXPRESS' },
  { color: '#1d3b30', funnel: 'navy', variant: 'container', name: 'Nordic Dawn', company: 'FJORD CARRIERS' },
  { color: '#2b2f36', funnel: 'red', variant: 'tanker', name: 'Pacific Grace', company: 'TRANSOCEAN' },
  { color: '#3b4a5c', funnel: 'navy', variant: 'container', name: 'Cape Venture', company: 'SOUTHERN CROSS' },
  { color: '#5a2a1a', funnel: 'navy', variant: 'tanker', name: 'Aegean Spirit', company: 'HELLAS TANKERS' },
];
let trafficCount = 0;

/** Smaller merchant (container ship or tanker) used for ambient traffic. */
export function buildTrafficShip(): THREE.Group {
  const look = TRAFFIC_LOOKS[trafficCount++ % TRAFFIC_LOOKS.length];
  const model = buildShip({
    name: look.name,
    company: look.company,
    hullColor: look.color,
    funnel: look.funnel,
    variant: look.variant,
    seed: 5 + trafficCount * 3,
    texWidth: 1024,
  });
  const wrap = new THREE.Group();
  /* 0.74 left every other vessel looking half-scale beside the player's own hull */
  model.group.scale.setScalar(0.9);
  wrap.add(model.group);
  return wrap;
}

/* ------------------------------------------------------ small craft ------ */

function hullShape(pts: [number, number][]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  return shape;
}

function extrudeFlat(shape: THREE.Shape, depth: number, scale = 1): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: 0.25 * scale,
    bevelThickness: 0.25 * scale,
    bevelSegments: 2,
    steps: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.scale(scale, 1, scale);
  return geo;
}

export function buildPirateSkiff(): THREE.Group {
  const g = new THREE.Group();
  const shape = hullShape([
    [-7, -1.7],
    [-3, -2.2],
    [2, -2.1],
    [5, -1.3],
    [7.4, 0],
    [5, 1.3],
    [2, 2.1],
    [-3, 2.2],
    [-7, 1.7],
  ]);
  const hull = extrudeFlat(shape, 1.5, 1.02);
  hull.translate(0, -1.1, 0);
  g.add(new THREE.Mesh(hull, M.skiffHull));

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.7, 2.6), M.skiffCabin);
  cabin.position.set(-1.5, 1.4, 0);
  g.add(cabin);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.35, 3), M.black);
  canopy.position.set(-1.5, 2.35, 0);
  g.add(canopy);

  for (const z of [-0.9, 0.9]) {
    const engine = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.7), M.black);
    engine.position.set(-7.4, 0.9, z);
    g.add(engine);
  }
  const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.1, 6), M.darkMetal);
  mount.position.set(1.8, 1.9, 0);
  g.add(mount);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 0.22), M.darkMetal);
  gun.position.set(3.2, 2.4, 0);
  g.add(gun);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 5), M.darkMetal);
  pole.position.set(-5.6, 3, 0);
  g.add(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.4),
    share(new THREE.MeshStandardMaterial({ color: 0xb01c1c, roughness: 0.9, side: THREE.DoubleSide }))
  );
  flag.position.set(-4.5, 4.1, 0);
  flag.rotation.y = Math.PI / 2;
  g.add(flag);
  g.traverse((o) => {
    o.castShadow = true;
  });
  return g;
}

/* ----------------------------------------------------------- obstacles --- */

function hash3(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number, z: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), sx), l(c(0, 1, 0), c(1, 1, 0), sx), sy),
    l(l(c(0, 0, 1), c(1, 0, 1), sx), l(c(0, 1, 1), c(1, 1, 1), sx), sy),
    sz
  );
}
function fbm3(x: number, y: number, z: number) {
  return vnoise(x, y, z) * 0.55 + vnoise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3, z * 4.3) * 0.15;
}

function sculptedBlob(radius: number, detail: number, squash: number, seed: number, paint: (h: number, n: number, out: THREE.Color) => void) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const p = geo.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let v = 0; v < p.count; v++) {
    const x = p.getX(v);
    const y = p.getY(v);
    const z = p.getZ(v);
    const n = fbm3(x * 0.16 + seed, y * 0.16 + seed * 0.5, z * 0.16 + seed * 0.3);
    const k = 0.6 + n * 0.9;
    p.setXYZ(v, x * k, y * k * squash, z * k);
    paint(p.getY(v), n, c);
    colors[v * 3] = c.r;
    colors[v * 3 + 1] = c.g;
    colors[v * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function foamCollar(size: number, opacity: number) {
  const collar = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: getRingTex(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity,
    })
  );
  collar.rotation.x = -Math.PI / 2;
  collar.position.y = 0.4;
  collar.name = 'foam';
  return collar;
}

export function buildRock(scale = 1): THREE.Group {
  /* game-feel: nav rocks read as pebbles from the bridge at honest scale — push them up */
  scale *= 1.45;
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const r = 4 + Math.random() * 5;
    const geo = sculptedBlob(r, 3, 0.85, Math.random() * 100, (h, n, out) => {
      const t = THREE.MathUtils.clamp((h + 2) / 9, 0, 1);
      out.setRGB(0.1 + 0.2 * t + n * 0.06, 0.095 + 0.19 * t + n * 0.055, 0.09 + 0.16 * t + n * 0.05);
      if (h < 1.4) out.lerp(new THREE.Color(0.05, 0.075, 0.05), 0.7); // wet, algae-dark band
      else if (h > r * 0.55) out.lerp(new THREE.Color(0.55, 0.55, 0.52), 0.18); // guano / salt crust
    });
    const m = new THREE.Mesh(geo, M.rock);
    m.position.set((Math.random() - 0.5) * 16 * scale, -2 + Math.random() * 2.2, (Math.random() - 0.5) * 16 * scale);
    m.rotation.y = Math.random() * 6;
    m.scale.setScalar(scale);
    m.castShadow = true;
    g.add(m);
  }
  g.add(foamCollar(52 * scale, 0.55));
  return g;
}

export function buildIceberg(scale = 1): THREE.Group {
  /* bergs must loom — at ocean distances even the big ones vanished into the swell */
  scale *= 1.5;
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const r = 8 + Math.random() * 6;
    const geo = sculptedBlob(r, 2, 1.1, Math.random() * 100, (h, n, out) => {
      const t = THREE.MathUtils.clamp((h + 4) / 16, 0, 1);
      out.setRGB(0.55 + 0.4 * t, 0.7 + 0.28 * t, 0.82 + 0.17 * t);
      out.lerp(new THREE.Color(0.35, 0.62, 0.78), (1 - t) * 0.5 + n * 0.1); // turquoise near the waterline
    });
    const m = new THREE.Mesh(geo, M.ice);
    m.position.set((Math.random() - 0.5) * 12, -2 + Math.random() * 3, (Math.random() - 0.5) * 12);
    m.scale.setScalar(scale);
    m.castShadow = true;
    g.add(m);
  }
  g.add(foamCollar(64 * scale, 0.35));
  return g;
}

export function buildMine(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 2), M.rust);
  g.add(body);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.9, 6), M.black);
    spike.position.set(Math.cos(a) * 2.4, Math.sin(a * 2) * 1.4, Math.sin(a) * 2.4);
    spike.rotation.z = -Math.PI / 2 - a;
    g.add(spike);
  }
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3b2a })
  );
  lamp.position.y = 2.6;
  g.add(lamp);
  return g;
}

/** Orange SOLAS life raft with a canopy and a strobe — the rescue objective. */
export function buildLifeRaft(): THREE.Group {
  const g = new THREE.Group();
  const orange = mat(0xff6a1a, 0.7, 0.05);
  const tube = new THREE.Mesh(new THREE.TorusGeometry(4.2, 1.3, 12, 26), orange);
  tube.rotation.x = Math.PI / 2;
  tube.position.y = 0.7;
  g.add(tube);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.5, 18), mat(0x2a2a2a, 0.9, 0));
  floor.position.y = 0.4;
  g.add(floor);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(3.4, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xff7f2a, 0.8, 0.05));
  canopy.position.y = 0.8;
  g.add(canopy);
  const strobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 3.5 })
  );
  strobe.position.y = 4.4;
  strobe.name = 'strobe';
  g.add(strobe);
  return g;
}

export function buildDriftContainer(): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    containerGeometry(),
    share(new THREE.MeshStandardMaterial({ color: 0x8f4a2c, map: containerMaterial().map, roughness: 0.8, metalness: 0.3 }))
  );
  box.position.y = -0.4;
  g.add(box);
  g.rotation.z = 0.06;
  return g;
}

/* ---------------------------------------------------------------- port --- */

const PORT_COLORS = [0x2f5f9e, 0xb3382f, 0xc9741d, 0x8a9096, 0x3a7a4f, 0x6b4a2e, 0x1f6f78, 0xd1ad2b, 0x22385e, 0xdadad4];

/** Container terminal with gantry cranes, warehouses and a stacked yard. */
export function buildPort(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const tex = makeSteelTexture('#67645f', 0.1).clone();
  tex.repeat.set(10, 50);
  tex.needsUpdate = true;
  const quayMat = share(new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 0.95, metalness: 0.05 }));
  const quay = new THREE.Mesh(new THREE.BoxGeometry(30, 18, 190), quayMat);
  quay.position.set(-16, -1, 0);
  g.add(quay);
  const apronTex = makeSteelTexture('#77736d', 0.08).clone();
  apronTex.repeat.set(20, 36);
  apronTex.needsUpdate = true;
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(120, 1.4, 200),
    share(new THREE.MeshStandardMaterial({ color: 0xffffff, map: apronTex, roughness: 0.95, metalness: 0.05 }))
  );
  apron.position.set(-70, 8.3, 0);
  g.add(apron);

  const fender = new THREE.CylinderGeometry(1.2, 1.2, 3.4, 10);
  for (let i = 0; i < 22; i++) {
    const f = new THREE.Mesh(fender, M.black);
    f.rotation.x = Math.PI / 2;
    f.position.set(-1.2, 4.6, -90 + i * 8.6);
    g.add(f);
  }

  // gantry cranes, tall enough to work the ship's stacks
  for (let i = 0; i < 3; i++) {
    const crane = new THREE.Group();
    const legGeo = new THREE.BoxGeometry(2.2, 30, 2.2);
    for (const [x, z] of [
      [0, -9],
      [0, 9],
      [16, -9],
      [16, 9],
    ]) {
      const leg = new THREE.Mesh(legGeo, M.crane);
      leg.position.set(x, 15, z);
      crane.add(leg);
    }
    const parts: [number, number, number, number, number, number, THREE.Material][] = [
      [22, 2.4, 3, 8, 30, 0, M.crane],
      [64, 1.8, 2.4, 36, 31.5, 0, M.crane],
      [26, 1.8, 2.4, -14, 31.5, 0, M.crane],
      [3.4, 3, 4, 14, 26, 8, M.glass],
    ];
    for (const [w, h, d, x, y, z, m] of parts) {
      const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      part.position.set(x, y, z);
      crane.add(part);
    }
    crane.position.set(-6, 9, -60 + i * 60);
    crane.scale.setScalar(scale * 1.5);
    g.add(crane);
  }

  for (let i = 0; i < 2; i++) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(60, 18, 44), mat(0x9aa3ab, 0.85, 0.2));
    w.position.set(-125, 18, -50 + i * 105);
    g.add(w);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(64, 2, 48), mat(0x5f686f, 0.9, 0.2));
    roof.position.set(-125, 28, -50 + i * 105);
    g.add(roof);
  }

  // stacked yard containers (shared corrugated geometry)
  const inst = new THREE.InstancedMesh(containerGeometry(), containerMaterial(), 220);
  const d = new THREE.Object3D();
  const col = new THREE.Color();
  let n = 0;
  for (let bx = 0; bx < 9 && n < 220; bx++) {
    for (let bz = 0; bz < 6 && n < 220; bz++) {
      const tiers = 1 + ((bx * 3 + bz * 7) % 4);
      for (let t = 0; t < tiers && n < 220; t++) {
        d.position.set(-46 - bx * 6.4, 10.4 + t * 2.74, -80 + bz * 28);
        d.rotation.y = Math.PI / 2;
        d.updateMatrix();
        inst.setMatrixAt(n, d.matrix);
        col.setHex(PORT_COLORS[(bx * 5 + bz * 3 + t * 2) % PORT_COLORS.length]);
        inst.setColorAt(n, col);
        n++;
      }
    }
  }
  inst.count = n;
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  g.add(inst);

  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffd27a, emissiveIntensity: 2.2, roughness: 0.4 });
  for (let i = 0; i < 8; i++) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 22, 6), M.darkMetal);
    pole.position.set(-4, 20, -84 + i * 24);
    g.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), lampMat);
    lamp.position.set(-4, 31.4, -84 + i * 24);
    g.add(lamp);
  }
  g.scale.setScalar(scale);
  return g;
}
