import * as THREE from 'three';

/** Vertical extent mapped by the hull texture (metres below / above the waterline). */
export const HULL_D = 11;
export const HULL_TOP = 16.5;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/* ------------------------------------------------- periodic value noise -- */

function makeLattice(n: number, rand: () => number) {
  const g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return g;
}

function sampleLattice(g: Float32Array, n: number, x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const x0 = ((xi % n) + n) % n;
  const y0 = ((yi % n) + n) % n;
  const x1 = (x0 + 1) % n;
  const y1 = (y0 + 1) % n;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = g[y0 * n + x0];
  const b = g[y0 * n + x1];
  const c = g[y1 * n + x0];
  const d = g[y1 * n + x1];
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function periodicFbm(size: number, basePeriod: number, octaves: number, seed: number, shape: (v: number) => number) {
  const rand = mulberry32(seed);
  const grids: { n: number; g: Float32Array }[] = [];
  for (let o = 0; o < octaves; o++) {
    const n = basePeriod << o;
    grids.push({ n, g: makeLattice(n, rand) });
  }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      let amp = 1;
      let norm = 0;
      for (let o = 0; o < octaves; o++) {
        const { n, g } = grids[o];
        sum += shape(sampleLattice(g, n, (x / size) * n, (y / size) * n)) * amp;
        norm += amp;
        amp *= 0.5;
      }
      out[y * size + x] = sum / norm;
    }
  }
  return out;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------- water --- */

/**
 * Seamless water normal map built from a wind-biased wave spectrum. A mix of
 * sharp-crested and round waves gives believable chop instead of a grid pattern.
 */
export function makeWaterNormalTexture(size = 512, seed = 7): THREE.Texture {
  const rand = mulberry32(seed);
  const waves: { kx: number; ky: number; amp: number; ph: number; sharp: boolean }[] = [];
  const count = size >= 512 ? 80 : 52;
  for (let i = 0; i < count; i++) {
    const kx = Math.round((rand() * 2 - 1) * 15);
    const ky = Math.round((rand() * 2 - 1) * 15);
    if (kx === 0 && ky === 0) continue;
    const kl = Math.hypot(kx, ky);
    const ang = Math.atan2(ky, kx);
    const wind = 0.22 + 0.78 * Math.pow(Math.cos(ang - 0.5), 2);
    waves.push({ kx, ky, amp: wind / Math.pow(kl, 1.12), ph: rand() * Math.PI * 2, sharp: rand() < 0.5 });
  }

  const h = new Float32Array(size * size);
  const TWO_PI = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    const v = (y / size) * TWO_PI;
    for (let x = 0; x < size; x++) {
      const u = (x / size) * TWO_PI;
      let sum = 0;
      for (let i = 0; i < waves.length; i++) {
        const w = waves[i];
        const s = Math.sin(w.kx * u + w.ky * v + w.ph);
        sum += w.amp * (w.sharp ? 1 - Math.abs(s) : s);
      }
      h[y * size + x] = sum;
    }
  }

  const gx = new Float32Array(size * size);
  const gy = new Float32Array(size * size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  let sq = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = at(x + 1, y) - at(x - 1, y);
      const dy = at(x, y + 1) - at(x, y - 1);
      gx[y * size + x] = dx;
      gy[y * size + x] = dy;
      sq += dx * dx + dy * dy;
    }
  }
  const rms = Math.sqrt(sq / (size * size * 2)) || 1;
  const k = 0.42 / rms; // normalise so the typical slope is ~0.42

  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let i = 0; i < size * size; i++) {
    const dx = -gx[i] * k;
    const dy = -gy[i] * k;
    const len = Math.sqrt(dx * dx + dy * dy + 1);
    data[i * 4] = (dx / len * 0.5 + 0.5) * 255;
    data[i * 4 + 1] = (dy / len * 0.5 + 0.5) * 255;
    data[i * 4 + 2] = (1 / len) * 255;
    data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Lacy, seamless sea-foam mask (R channel). */
export function makeFoamTexture(size = 512, seed = 31): THREE.Texture {
  const billow = periodicFbm(size, 6, 5, seed, (v) => v);
  const lace = periodicFbm(size, 9, 4, seed + 9, (v) => {
    const r = 1 - Math.abs(2 * v - 1);
    return r * r;
  });
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = smoothstep(0.22, 0.88, 0.55 * billow[i] + 0.8 * lace[i] - 0.1);
    const b = Math.round(v * 255);
    img.data[i * 4] = b;
    img.data[i * 4 + 1] = b;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* --------------------------------------------------------- particles ---- */

/** Soft round sprite used for foam / spray / smoke particles. */
export function makePuffTexture(size = 128, hardness = 0.22): THREE.Texture {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(hardness, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // break up the perfect circle so clustered puffs read as spray, not discs
  const rand = mulberry32(5);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2;
    const r = size * (0.18 + rand() * 0.3);
    ctx.fillStyle = `rgba(0,0,0,${0.15 + rand() * 0.25})`;
    ctx.beginPath();
    ctx.arc(size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r, 2 + rand() * 7, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Vertical streak sprite used for rain. */
export function makeRainTexture(): THREE.Texture {
  const w = 32;
  const h = 128;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(200,220,255,0)');
  g.addColorStop(0.45, 'rgba(210,228,255,0.85)');
  g.addColorStop(0.55, 'rgba(210,228,255,0.85)');
  g.addColorStop(1, 'rgba(200,220,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(w * 0.44, 0, w * 0.12, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Additive ring used for rock foam collars. */
export function makeRingTexture(size = 256): THREE.Texture {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.0)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.3)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(21);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) {
    const a = rand() * Math.PI * 2;
    const r = size * (0.2 + rand() * 0.3);
    ctx.beginPath();
    ctx.arc(size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r, 1 + rand() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* -------------------------------------------------------------- ships --- */

const hullCache = new Map<string, THREE.Texture>();

/**
 * Painted, weathered hull plating. Mapped by height (v) so the red anti-fouling,
 * boot-top and topside always meet the waterline. `side` flips the lettering so
 * names read correctly from either rail.
 */
export function makeHullTexture(name: string, side: 1 | -1, hullHex: string, company: string, w = 2048): THREE.Texture {
  const key = `${name}|${side}|${hullHex}|${company}|${w}`;
  const cached = hullCache.get(key);
  if (cached) return cached;

  const h = w / 4;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(name.length * 131 + (side > 0 ? 7 : 19) + hullHex.charCodeAt(2));
  const pxPerM = h / (HULL_D + HULL_TOP);
  const yWater = (HULL_TOP / (HULL_D + HULL_TOP)) * h;

  // topside paint with a soft vertical gradient
  const base = new THREE.Color(hullHex);
  const top = base.clone().offsetHSL(0, 0, 0.035);
  const g = ctx.createLinearGradient(0, 0, 0, yWater);
  g.addColorStop(0, `#${top.getHexString()}`);
  g.addColorStop(1, `#${base.getHexString()}`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // anti-fouling below the waterline
  const af = ctx.createLinearGradient(0, yWater, 0, h);
  af.addColorStop(0, '#8e1c1c');
  af.addColorStop(1, '#4d0f10');
  ctx.fillStyle = af;
  ctx.fillRect(0, yWater, w, h - yWater);
  // boot-top band
  ctx.fillStyle = '#121416';
  ctx.fillRect(0, yWater - pxPerM * 1.5, w, pxPerM * 1.5);
  // waterline grime / salt line
  const gl = ctx.createLinearGradient(0, yWater - pxPerM * 4, 0, yWater - pxPerM * 1.5);
  gl.addColorStop(0, 'rgba(20,16,12,0)');
  gl.addColorStop(1, 'rgba(20,16,12,0.35)');
  ctx.fillStyle = gl;
  ctx.fillRect(0, yWater - pxPerM * 4, w, pxPerM * 2.5);

  // plating: strakes + staggered butt welds
  const strake = pxPerM * 2.4;
  const pxPerMx = w / 160;
  for (let row = 0, y = yWater - pxPerM * 1.5; y > 0; row++, y -= strake) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, y, w, 1.4);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, y + 1.4, w, 1);
    const seam = pxPerMx * 12;
    for (let x = (row % 2) * seam * 0.5; x < w; x += seam) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(x, y - strake, 1.2, strake);
    }
  }

  // paint wear patches
  for (let i = 0; i < 260; i++) {
    const x = rand() * w;
    const y = rand() * (yWater - 8);
    const ww = 6 + rand() * 60;
    const hh = 3 + rand() * 18;
    ctx.fillStyle = rand() < 0.5 ? `rgba(255,255,255,${0.012 + rand() * 0.03})` : `rgba(0,0,0,${0.02 + rand() * 0.05})`;
    ctx.fillRect(x, y, ww, hh);
  }

  // rust streaks running from scuppers and fittings
  for (let i = 0; i < 190; i++) {
    const x = rand() * w;
    const len = 30 + rand() * pxPerM * 9;
    const y0 = rand() * pxPerM * 3;
    const sg = ctx.createLinearGradient(0, y0, 0, y0 + len);
    const a = 0.1 + rand() * 0.2;
    sg.addColorStop(0, `rgba(122,62,28,${a})`);
    sg.addColorStop(1, 'rgba(122,62,28,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(x, y0, 1.5 + rand() * 4, len);
  }

  // lettering (mirrored placement per side so it reads bow-first from outside)
  const nameU = side > 0 ? 0.8 : 0.2;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(244,247,250,0.95)';
  ctx.font = `bold ${Math.round(pxPerM * 3.4)}px "Arial Black", Helvetica, Arial, sans-serif`;
  ctx.fillText(name.toUpperCase(), w * nameU, yWater - pxPerM * 9.5);
  ctx.font = `800 ${Math.round(pxPerM * 5.4)}px "Arial Black", Helvetica, Arial, sans-serif`;
  ctx.fillStyle = 'rgba(240,244,248,0.92)';
  ctx.fillText(company.toUpperCase(), w * 0.5, yWater - pxPerM * 6.2);
  ctx.font = `600 ${Math.round(pxPerM * 1.1)}px Helvetica, Arial, sans-serif`;
  ctx.fillStyle = 'rgba(230,236,240,0.7)';
  ctx.fillText('PANAMA', w * (side > 0 ? 0.08 : 0.92), yWater - pxPerM * 4);

  // draft marks at the bow and stern
  ctx.font = `700 ${Math.round(pxPerM * 0.62)}px Helvetica, Arial, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (const ux of [0.012, 0.988]) {
    for (let m = 2; m <= 11; m += 1) {
      const y = yWater + (m - 1) * pxPerM * 1.0;
      if (y < h - 6) ctx.fillText(String(m * 1 + 1), w * ux, y);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  hullCache.set(key, tex);
  return tex;
}

let containerTex: THREE.Texture | null = null;
/** Corrugated steel container wall. Neutral grey so instance colours tint it. */
export function makeContainerTexture(): THREE.Texture {
  if (containerTex) return containerTex;
  const w = 256;
  const h = 128;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(77);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const rib = 0.78 + 0.22 * Math.cos((x / 32) * Math.PI * 2);
      let shade = rib;
      if (y < 9) shade = 0.58 + 0.12 * Math.sin(x * 0.4);
      else if (y > h - 12) shade = 0.5;
      else if (y < 12 || y > h - 15) shade *= 0.86;
      shade *= 0.97 + rand() * 0.05;
      const v = Math.round(Math.min(1, shade) * 255);
      const i = (y * w + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // grime + rust streaks
  for (let i = 0; i < 30; i++) {
    const x = rand() * w;
    const len = 20 + rand() * 60;
    const sg = ctx.createLinearGradient(0, 10, 0, 10 + len);
    sg.addColorStop(0, `rgba(110,70,40,${0.12 + rand() * 0.18})`);
    sg.addColorStop(1, 'rgba(110,70,40,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(x, 10, 1 + rand() * 3, len);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  containerTex = tex;
  return tex;
}

export interface FacadeSet {
  wall: THREE.Texture;
  wallGlow: THREE.Texture;
  bridge: THREE.Texture;
  bridgeGlow: THREE.Texture;
}
let facadeSet: FacadeSet | null = null;

/** Accommodation-block windows (one tile = 16 m × 3 m). Glow maps light a few cabins. */
export function makeFacadeTextures(): FacadeSet {
  if (facadeSet) return facadeSet;
  const rand = mulberry32(404);
  const W = 1024;
  const H = 192;

  const build = (bridge: boolean) => {
    const col = makeCanvas(W, H);
    const glow = makeCanvas(W, H);
    const c = col.getContext('2d')!;
    const g = glow.getContext('2d')!;
    c.fillStyle = bridge ? '#e4e8eb' : '#eceff1';
    c.fillRect(0, 0, W, H);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    // subtle panel seams
    c.fillStyle = 'rgba(0,0,0,0.08)';
    for (let x = 0; x < W; x += 64) c.fillRect(x, 0, 1.5, H);
    c.fillStyle = 'rgba(0,0,0,0.12)';
    c.fillRect(0, H - 3, W, 3);

    if (bridge) {
      // continuous wheelhouse glazing with mullions
      const y0 = H * 0.2;
      const y1 = H * 0.78;
      const gg = c.createLinearGradient(0, y0, 0, y1);
      gg.addColorStop(0, '#5d7f99');
      gg.addColorStop(0.45, '#223445');
      gg.addColorStop(1, '#0d1823');
      c.fillStyle = gg;
      c.fillRect(0, y0, W, y1 - y0);
      c.fillStyle = '#d9dee2';
      for (let x = 0; x < W; x += 85) c.fillRect(x, y0, 5, y1 - y0);
      g.fillStyle = 'rgba(255,210,140,0.55)';
      g.fillRect(0, y0 + 6, W, (y1 - y0) * 0.5);
    } else {
      const winW = 70;
      const winH = 74;
      const step = W / 8;
      for (let i = 0; i < 8; i++) {
        const x = i * step + (step - winW) / 2;
        const y = H * 0.26;
        c.fillStyle = '#c3cacf';
        c.fillRect(x - 4, y - 4, winW + 8, winH + 8);
        const gg = c.createLinearGradient(0, y, 0, y + winH);
        gg.addColorStop(0, '#4a6a84');
        gg.addColorStop(0.5, '#1c2b3a');
        gg.addColorStop(1, '#101b26');
        c.fillStyle = gg;
        c.fillRect(x, y, winW, winH);
        if (rand() < 0.42) {
          g.fillStyle = `rgba(255,${190 + Math.round(rand() * 40)},${120 + Math.round(rand() * 50)},${0.7 + rand() * 0.3})`;
          g.fillRect(x + 3, y + 3, winW - 6, winH - 6);
        }
      }
    }
    const mk = (cv: HTMLCanvasElement, srgb: boolean) => {
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      return t;
    };
    return { map: mk(col, true), glow: mk(glow, true) };
  };

  const wall = build(false);
  const br = build(true);
  facadeSet = { wall: wall.map, wallGlow: wall.glow, bridge: br.map, bridgeGlow: br.glow };
  return facadeSet;
}

const steelCache = new Map<string, THREE.Texture>();
/** Gritty painted steel, tileable (deck, hatch covers, quay). */
export function makeSteelTexture(hex: string, grit = 0.08): THREE.Texture {
  const key = hex + grit;
  const cached = steelCache.get(key);
  if (cached) return cached;
  const size = 256;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(hex.length * 977 + hex.charCodeAt(1));
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  const noise = periodicFbm(size, 8, 4, 12, (v) => v);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < size * size; i++) {
    const n = (noise[i] - 0.5) * 2 * grit * 255 + (rand() - 0.5) * grit * 120;
    img.data[i * 4] = Math.max(0, Math.min(255, img.data[i * 4] + n));
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, img.data[i * 4 + 1] + n));
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, img.data[i * 4 + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, size, 2);
  ctx.fillRect(0, 0, 2, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  steelCache.set(key, tex);
  return tex;
}
