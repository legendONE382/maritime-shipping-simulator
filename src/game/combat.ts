import * as THREE from 'three';
import { makePuffTexture } from './textures';

/**
 * Action combat layer for the shipping simulator.
 *
 * Design goals:
 *   - lightweight: two Points draw calls total, no per-shell objects
 *   - readable: shells are additive tracers with muzzle flash and water splashes
 *   - integrated: damage is reported back to the hostile system so pirates die for real
 *
 * Two weapon families:
 *   - `cannon`  slow, heavy, arcing shell — motherships, shore sites, ice hazards
 *   - `ciws`    fast, straight burst of 30 mm tracer — skiffs and sails
 */

export type WeaponKind = 'cannon' | 'ciws';
export type TargetKind = 'skiff' | 'dhow' | 'fort';

export interface Target {
  /** unique handle from the host, e.g. "skiff-0-3" */
  key: string;
  kind: TargetKind;
  x: number;
  z: number;
  /** hull integrity remaining 0..100 */
  hitPoints: number;
  maxHP: number;
  /** collision radius in world units */
  r: number;
  alive: boolean;
}

export interface ShoreSite {
  id: number;
  obj: THREE.Object3D;
  x: number;
  z: number;
  radius: number;
  /** 0..1 — buildings degrade progressively as they are hit */
  structural: number;
  alive: boolean;
  eventId: string;
}

export interface CombatHost {
  world: THREE.Group;
  pos: { x: number; y: number };
  heading: number;
  speed: number;
  env: number;
  /** true on phones / small screens — trims particle budgets */
  isLowSpec(): boolean;
  /** foam / water emitters already used for spray and debris */
  spray: { spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, alpha: number): void };
  debris: { spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, alpha: number): void };
  audio: { gun(vol?: number): void };
  hurt(hull: number, cargo: number, shake: number): void;
  toast(text: string, kind: 'info' | 'warn' | 'danger' | 'good'): void;
  popup(text: string, kind: 'info' | 'warn' | 'danger' | 'good'): void;
  say(trigger: string): void;
  addBonus(amount: number, label: string): void;
  reward(): number;
  /** retire a hostile the player has destroyed */
  killTarget(key: string, kind: TargetKind): void;
}

export interface WeaponSpec {
  kind: WeaponKind;
  label: string;
  short: string;
  range: number;
  cooldown: number;
  /** damage per shell */
  damage: number;
  /** shells per trigger pull */
  burst: number;
  /** ballistic falloff: 0 = flat, 1 = heavy arc */
  gravity: number;
  muzzleVel: number;
  /** radians of random dispersion */
  spread: number;
  /** HUD blurb */
  hint: string;
  /** damage applied when shelling a shore installation */
  shoreDamage: number;
}

export const WEAPONS: WeaponSpec[] = [
  {
    kind: 'cannon',
    label: '76 mm DECK GUN',
    short: 'CANNON',
    range: 1000,
    cooldown: 1.7,
    damage: 46,
    burst: 1,
    gravity: 1,
    muzzleVel: 380,
    spread: 0.015,
    hint: 'Slow and heavy. Kills motherships, breaks shore installations.',
    shoreDamage: 42,
  },
  {
    kind: 'ciws',
    label: 'CIWS · 30 mm',
    short: 'CIWS',
    range: 620,
    cooldown: 0.1,
    damage: 15,
    burst: 3,
    gravity: 0.12,
    muzzleVel: 540,
    spread: 0.04,
    hint: 'Fast tracer bursts. Shreds skiffs and sails.',
    shoreDamage: 7,
  },
];

export interface CombatStats {
  shellsFired: number;
  shellsHit: number;
  skiffsSunk: number;
  mothershipsSunk: number;
  shoreSitesDestroyed: number;
}

export const EMPTY_COMBAT_STATS: CombatStats = {
  shellsFired: 0,
  shellsHit: 0,
  skiffsSunk: 0,
  mothershipsSunk: 0,
  shoreSitesDestroyed: 0,
};

/* --------------------------------------------------------------- render */

let sharedTex: THREE.Texture | null = null;
function tracerTex() {
  return (sharedTex ??= makePuffTexture(64, 0.05));
}

const CANNON_COLOR = new THREE.Color(0xffbe6b);
const CIWS_COLOR = new THREE.Color(0xa8e8ff);
const MUZZLE_COLOR = new THREE.Color(0xfff0c0);
const BLAST_COLOR = new THREE.Color(0xffa94d);
const SPLASH_COLOR = new THREE.Color(0xbfe6ff);

interface Shell {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  gravity: number;
  damage: number;
  shoreDamage: number;
  targetKey: string | null;
  kind: WeaponKind;
}

interface Flash {
  x: number;
  y: number;
  z: number;
  life: number;
  max: number;
  color: THREE.Color;
  size: number;
}

/**
 * One Points cloud used for every additive tracer / burst in the scene. Sprites are
 * recycled round-robin so the geometry never grows.
 */
class FxLayer {
  points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private alpha: Float32Array;
  private size: Float32Array;
  private n: number;
  private idx = 0;

  constructor(n: number, tex: THREE.Texture) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.size = new Float32Array(n);
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -99999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } },
      vertexShader: `
        attribute float aAlpha; attribute float aSize; attribute vec3 aColor;
        varying float vAlpha; varying vec3 vColor;
        void main(){
          vAlpha = aAlpha; vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (900.0 / max(2.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying float vAlpha; varying vec3 vColor;
        void main(){
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor, t.a * vAlpha);
          if (gl_FragColor.a < 0.02) discard;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }

  push(x: number, y: number, z: number, c: THREE.Color, a: number, size: number) {
    const i = this.idx;
    this.idx = (this.idx + 1) % this.n;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 3] = c.r;
    this.col[i * 3 + 1] = c.g;
    this.col[i * 3 + 2] = c.b;
    this.alpha[i] = a;
    this.size[i] = size;
  }

  commit() {
    const g = this.points.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < this.n; i++) {
      this.alpha[i] = 0;
      this.pos[i * 3 + 1] = -99999;
    }
    this.commit();
  }
}

/* ------------------------------------------------------------- system -- */

export class CombatSystem {
  targets: Target[] = [];
  shore: ShoreSite[] = [];
  stats: CombatStats = { ...EMPTY_COMBAT_STATS };
  weaponIndex = 0;
  /** 0..1 barrel heat — at 1.0 the gun must cool before firing again */
  heat = 0;

  private shells: Shell[] = [];
  private flashes: Flash[] = [];
  private cds: Record<WeaponKind, number> = { cannon: 0, ciws: 0 };
  private tracers: FxLayer;
  private bursts: FxLayer;
  private held = false;
  private nextShoreId = 1;
  private pendingKills: { key: string; kind: TargetKind }[] = [];

  constructor(private host: CombatHost) {
    const low = host.isLowSpec();
    this.tracers = new FxLayer(low ? 220 : 420, tracerTex());
    this.bursts = new FxLayer(low ? 110 : 200, tracerTex());
    host.world.add(this.tracers.points);
    host.world.add(this.bursts.points);
  }

  reset() {
    this.shells = [];
    this.flashes = [];
    this.pendingKills = [];
    this.cds = { cannon: 0, ciws: 0 };
    this.heat = 0;
    this.held = false;
    this.targets = [];
    this.shore = [];
    this.nextShoreId = 1;
    this.stats = { ...EMPTY_COMBAT_STATS };
    this.tracers.clear();
    this.bursts.clear();
  }

  dispose() {
    this.host.world.remove(this.tracers.points);
    this.host.world.remove(this.bursts.points);
  }

  get weapon(): WeaponSpec {
    return WEAPONS[this.weaponIndex];
  }

  /** 0..1 reload readiness of the active weapon */
  get cooldown(): number {
    const w = this.weapon;
    return 1 - Math.min(1, this.cds[w.kind] / Math.max(0.001, w.cooldown));
  }

  get overheated(): boolean {
    return this.heat >= 1;
  }

  get shellsInFlight(): number {
    return this.shells.length;
  }

  get accuracy(): number {
    return this.stats.shellsFired === 0 ? 0 : this.stats.shellsHit / this.stats.shellsFired;
  }

  selectWeapon(i: number) {
    if (i < 0 || i >= WEAPONS.length) return;
    this.weaponIndex = i;
    this.host.toast(`Weapon · ${WEAPONS[i].label}`, 'info');
  }

  cycleWeapon() {
    this.selectWeapon((this.weaponIndex + 1) % WEAPONS.length);
  }

  setHeld(down: boolean) {
    this.held = down;
  }

  registerShoreSite(eventId: string, x: number, z: number, radius: number): ShoreSite {
    const site: ShoreSite = {
      id: this.nextShoreId++,
      obj: new THREE.Group(),
      x,
      z,
      radius,
      structural: 1,
      alive: true,
      eventId,
    };
    this.shore.push(site);
    return site;
  }

  nearestTarget(x: number, z: number, range: number): Target | null {
    let best: Target | null = null;
    let bd = range;
    for (const t of this.targets) {
      if (!t.alive) continue;
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  nearestShore(x: number, z: number, range: number): ShoreSite | null {
    let best: ShoreSite | null = null;
    let bd = range;
    for (const s of this.shore) {
      if (!s.alive) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** Current hostile under the guns — used by the HUD target box. */
  currentTarget(): Target | null {
    const h = this.host;
    return this.nearestTarget(h.pos.x, h.pos.y, this.weapon.range);
  }

  /* ---------------------------------------------------------- firing -- */

  /**
   * Launch a salvo from (sx,sy,sz). A hostile inside the weapon's range is engaged
   * directly; a shore site takes priority after that; otherwise the salvo flies toward
   * the player's current look direction so free-flung shots still feel deliberate.
   * Returns the number of shells launched.
   */
  fire(sx: number, sy: number, sz: number, heading: number, aimX: number, aimZ: number): number {
    const w = this.weapon;
    if (this.cds[w.kind] > 0) return 0;
    if (this.overheated) {
      this.host.toast('Barrel overheated — hold fire while she cools.', 'warn');
      return 0;
    }

    const target = this.nearestTarget(sx, sz, w.range);
    const site = target ? null : this.nearestShore(sx, sz, w.range);
    let ix: number;
    let iz: number;
    let key: string | null = null;

    if (target) {
      key = target.key;
      /* small lead so moving skiffs can be hit */
      const speed = Math.hypot(this.host.pos.x - target.x, this.host.pos.y - target.z);
      ix = target.x + (target.x - sx) * 0.02 * Math.min(1, speed / 200);
      iz = target.z + (target.z - sz) * 0.02 * Math.min(1, speed / 200);
    } else if (site) {
      ix = site.x;
      iz = site.z;
    } else if (Math.hypot(aimX - sx, aimZ - sz) > 1) {
      ix = aimX;
      iz = aimZ;
    } else {
      const fx = Math.cos(heading);
      const fy = Math.sin(heading);
      ix = sx + fx * w.range * 0.55;
      iz = sz + fy * w.range * 0.55;
    }

    const dx = ix - sx;
    const dz = iz - sz;
    const flat = Math.max(1, Math.hypot(dx, dz));
    const nx = dx / flat;
    const nz = dz / flat;
    /* solve the ballistic arc for the aim point at sea level */
    const g = 5.4 * w.gravity * 3.2;
    let vHoriz: number;
    let vy: number;
    if (g > 0.05) {
      const tFlat = Math.max(0.45, flat / Math.max(90, w.muzzleVel * 0.62));
      vHoriz = flat / tFlat;
      vy = (0.5 * g * tFlat * tFlat) / tFlat;
    } else {
      vHoriz = w.muzzleVel;
      vy = 0;
    }

    this.cds[w.kind] = w.cooldown;
    this.heat = Math.min(1, this.heat + (w.kind === 'ciws' ? 0.045 : 0.17));
    this.stats.shellsFired += w.burst;
    this.host.audio.gun(w.kind === 'ciws' ? 0.55 : 1);

    for (let b = 0; b < w.burst; b++) {
      const a = (Math.random() - 0.5) * w.spread * 2;
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      this.shells.push({
        x: sx,
        y: sy,
        z: sz,
        vx: nx * cs * vHoriz - nz * sn * vHoriz * 0.02,
        vy: vy + (Math.random() - 0.5) * 5,
        vz: nx * sn * vHoriz * 0.02 + nz * cs * vHoriz,
        life: 0,
        maxLife: Math.min(5, flat / Math.max(120, vHoriz * 0.75)),
        gravity: g,
        damage: w.burst > 1 ? w.damage * 0.4 : w.damage,
        shoreDamage: w.shoreDamage,
        targetKey: key,
        kind: w.kind,
      });
      this.tracers.push(sx, sy, sz, w.kind === 'ciws' ? CIWS_COLOR : CANNON_COLOR, 1, w.kind === 'ciws' ? 0.9 : 2.1);
    }

    this.flashes.push({ x: sx, y: sy, z: sz, life: 0, max: 0.16, color: MUZZLE_COLOR, size: 26 });
    /* muzzle tracer streak so the shot reads at a distance */
    for (let s = 0; s < 4; s++) {
      const f = s / 4;
      this.tracers.push(sx + nx * f * 26, sy + f * vy * 0.03, sz + nz * f * 26, w.kind === 'ciws' ? CIWS_COLOR : CANNON_COLOR, 0.9, 1.4);
    }
    return w.burst;
  }

  /* ---------------------------------------------------------- update -- */

  update(dt: number) {
    this.cds.cannon = Math.max(0, this.cds.cannon - dt);
    this.cds.ciws = Math.max(0, this.cds.ciws - dt);
    this.heat = Math.max(0, this.heat - dt * 0.26);

    if (this.held) {
      const fx = Math.cos(this.host.heading);
      const fy = Math.sin(this.host.heading);
      const side = Math.floor(performance.now() / 80) % 2 === 0 ? 1 : -1;
      this.fire(this.host.pos.x + fx * 52, 20, this.host.pos.y + fy * 52 + side * 12, this.host.heading, this.host.pos.x + fx * 320, this.host.pos.y + fy * 320);
    }

    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life += dt;
      s.vy -= s.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      this.tracers.push(s.x, s.y, s.z, s.kind === 'ciws' ? CIWS_COLOR : CANNON_COLOR, 0.85, s.kind === 'ciws' ? 1 : 2.2);

      let consumed = false;

      if (s.y <= -2.5 || s.life > s.maxLife) {
        this.splash(s.x, s.z, s.kind);
        consumed = true;
      }

      if (!consumed) {
        for (const t of this.targets) {
          if (!t.alive) continue;
          if (s.targetKey && t.key !== s.targetKey) continue;
          if (s.kind === 'ciws' && t.kind !== 'skiff') continue;
          if (s.kind === 'cannon' && t.kind === 'skiff' && Math.hypot(t.x - s.x, t.z - s.z) > t.r + 6) continue;
          if (Math.hypot(t.x - s.x, t.z - s.z) < t.r && Math.abs(s.y) < 26) {
            this.stats.shellsHit++;
            t.hitPoints -= s.damage;
            this.blast(t.x, t.z, t.kind === 'skiff' ? 14 : 40);
            if (t.hitPoints <= 0) {
              t.alive = false;
              this.pendingKills.push({ key: t.key, kind: t.kind });
              if (t.kind === 'skiff') this.stats.skiffsSunk++;
              else this.stats.mothershipsSunk++;
              this.host.popup(t.kind === 'skiff' ? 'SKIFF SUNK' : 'MOTHERSHIP SUNK', 'good');
              this.host.addBonus(Math.round(this.host.reward() * (t.kind === 'skiff' ? 0.012 : 0.03)), t.kind === 'skiff' ? 'SKIFF DESTROYED' : 'MOTHERSHIP DESTROYED');
              this.host.say('kill');
            } else {
              this.host.popup('HIT', 'good');
            }
            consumed = true;
            break;
          }
        }
      }

      if (!consumed) {
        for (const site of this.shore) {
          if (!site.alive) continue;
          if (s.kind === 'ciws') break;
          if (Math.hypot(site.x - s.x, site.z - s.z) < site.radius && Math.abs(s.y) < 200) {
            this.stats.shellsHit++;
            site.structural = Math.max(0, site.structural - s.shoreDamage / 260);
            this.blast(s.x, s.z, site.radius * 0.4);
            if (site.structural <= 0) {
              site.alive = false;
              this.stats.shoreSitesDestroyed++;
              this.host.popup('SITE NEUTRALISED', 'good');
              this.host.addBonus(Math.round(this.host.reward() * 0.035), 'SHORE SITE DESTROYED');
              this.host.say('siteDestroyed');
            } else {
              this.host.popup('HIT', 'good');
            }
            consumed = true;
            break;
          }
        }
      }

      if (consumed) this.shells.splice(i, 1);
    }

    /* retire hostiles the player destroyed */
    for (const k of this.pendingKills) {
      this.host.killTarget(k.key, k.kind);
      this.targets = this.targets.filter((t) => t.alive);
    }
    this.pendingKills = [];

    /* fx lifetimes */
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life += dt;
      const k = 1 - f.life / f.max;
      if (k <= 0) this.flashes.splice(i, 1);
      else this.bursts.push(f.x, f.y, f.z, f.color, k, f.size * (1 + (1 - k) * 1.6));
    }

    this.tracers.commit();
    this.bursts.commit();
  }

  private blast(x: number, z: number, radius: number) {
    const n = radius > 20 ? 26 : 14;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.3 + Math.random() * 0.8);
      this.host.spray.spawn(x + Math.cos(a) * r, 5 + Math.random() * 10, z + Math.sin(a) * r, Math.cos(a) * (20 + r), 14 + Math.random() * 24, Math.sin(a) * (20 + r), 1.0, 3.2, 0.7);
    }
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.2 + Math.random() * 0.6);
      this.host.debris.spawn(x + Math.cos(a) * r, 5 + Math.random() * 12, z + Math.sin(a) * r, Math.cos(a) * 34, 16 + Math.random() * 30, Math.sin(a) * 34, 0.8, 2.2, 1);
    }
    this.bursts.push(x, 10, z, BLAST_COLOR, 1, radius * 1.6);
    this.host.audio.gun(0.35);
  }

  private splash(x: number, z: number, kind: WeaponKind) {
    const n = kind === 'ciws' ? 7 : 24;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 5 + Math.random() * (kind === 'ciws' ? 10 : 22);
      this.host.spray.spawn(x + Math.cos(a) * r, 2 + Math.random() * 4, z + Math.sin(a) * r, Math.cos(a) * 18, 9 + Math.random() * 20, Math.sin(a) * 18, 0.85, 3.4, 0.6);
      if (kind === 'cannon')
        this.host.debris.spawn(x + Math.cos(a) * r, 2 + Math.random() * 5, z + Math.sin(a) * r, Math.cos(a) * 28, 12 + Math.random() * 22, Math.sin(a) * 28, 0.75, 1.9, 1);
    }
    this.bursts.push(x, 2, z, SPLASH_COLOR, 0.9, kind === 'ciws' ? 26 : 60);
  }
}
