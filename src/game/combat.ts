import * as THREE from 'three';
import { makePuffTexture } from './textures';

/**
 * Action combat layer for the shipping simulator.
 *
 * Design goals:
 *   - lightweight: two Points draw calls total for all tracers/bursts, shells pooled
 *   - readable: shells are additive tracers with muzzle flash and water splashes
 *   - integrated: damage is reported back to the hostile system so pirates die for real
 *
 * Three weapon families:
 *   - `cannon`  76 mm deck gun — slow, heavy, arcing shell — motherships, forts
 *   - `ciws`    30 mm gatling — fast tracer burst — skiffs and sails
 *   - `missile` Sea Lance VLS — guided homing strike missile with lock-on
 *
 * Shore installations (island batteries) live here too: they are targets for the
 * player's guns *and* fire back with slow arcing flak shells.
 */

export type WeaponKind = 'cannon' | 'ciws' | 'missile';
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
  /** armed forts shoot back */
  gun: boolean;
  gunRange: number;
  fireCd: number;
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
  audio: { gun(vol?: number): void; explosion?(vol?: number): void; missile?(): void; lock?(ok: boolean): void };
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
  /** seconds of steady aim to lock (homing weapons) */
  lockTime?: number;
}

export const WEAPONS: WeaponSpec[] = [
  {
    kind: 'cannon',
    label: '76 mm DECK GUN',
    short: 'CANNON',
    range: 1000,
    cooldown: 1.5,
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
  {
    kind: 'missile',
    label: 'SEA LANCE VLS',
    short: 'MISSILE',
    range: 1600,
    cooldown: 2.4,
    damage: 130,
    burst: 1,
    gravity: 0.5,
    muzzleVel: 300,
    spread: 0.01,
    hint: 'Guided missile. Hold the reticle on a contact to lock, then launch. Limited VLS ammo.',
    shoreDamage: 120,
    lockTime: 1.35,
  },
];

export interface CombatStats {
  shellsFired: number;
  shellsHit: number;
  missilesFired: number;
  skiffsSunk: number;
  mothershipsSunk: number;
  shoreSitesDestroyed: number;
}

export const EMPTY_COMBAT_STATS: CombatStats = {
  shellsFired: 0,
  shellsHit: 0,
  missilesFired: 0,
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
const MISSILE_COLOR = new THREE.Color(0xfff2d8);
const ENEMY_COLOR = new THREE.Color(0xff6b4d);
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
  /** fired by a shore battery at the player's ship */
  enemy?: boolean;
  /** homing missile: steers toward targetKey while it lives */
  homing?: boolean;
  /** missile flight phase timing */
  boost?: number;
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

/** Shared shape used for missile lock-on — a live hostile or a shore battery. */
interface Lockable {
  key: string;
  kind: TargetKind;
  x: number;
  z: number;
  r: number;
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
  /** VLS cells remaining this voyage */
  ammo = 6;
  maxAmmo = 6;

  private shells: Shell[] = [];
  private flashes: Flash[] = [];
  private cds: Record<WeaponKind, number> = { cannon: 0, ciws: 0, missile: 0 };
  private tracers: FxLayer;
  private bursts: FxLayer;
  private held = false;
  private nextShoreId = 1;
  private pendingKills: { key: string; kind: TargetKind }[] = [];

  /* visible ordnance: cheap mesh pools so shells, missiles and warheads read in 3D */
  private shellMeshes: THREE.Mesh[] = [];
  private missileMeshes: THREE.Mesh[] = [];
  private flashLight: THREE.PointLight;
  private flashT = 0;
  private tmpDir = new THREE.Vector3();
  private matCannon!: THREE.MeshBasicMaterial;
  private matCiws!: THREE.MeshBasicMaterial;
  private matEnemy!: THREE.MeshBasicMaterial;
  private static readonly X_AXIS = new THREE.Vector3(1, 0, 0);

  /** aim point on the water, updated by the host from the player's reticle */
  private aimX = 1e9;
  private aimZ = 1e9;
  /** missile lock state */
  private lockable: Lockable | null = null;
  private lockT = 0;
  private lockBeeped = false;
  private noAmmoToast = 0;

  constructor(private host: CombatHost) {
    const low = host.isLowSpec();
    this.tracers = new FxLayer(low ? 240 : 460, tracerTex());
    this.bursts = new FxLayer(low ? 120 : 220, tracerTex());
    host.world.add(this.tracers.points);
    host.world.add(this.bursts.points);
    /* visible ordnance: cheap mesh pools so shells, missiles and warheads read in 3D */
    const shellGeo = new THREE.CylinderGeometry(0.6, 0.6, 9.5, 5);
    shellGeo.rotateZ(Math.PI / 2);
    this.matCannon = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    this.matCiws = new THREE.MeshBasicMaterial({ color: 0xb8ecff });
    this.matEnemy = new THREE.MeshBasicMaterial({ color: 0xff8a66 });
    for (let i = 0; i < 56; i++) {
      const m = new THREE.Mesh(shellGeo, this.matCannon);
      m.visible = false;
      m.frustumCulled = false;
      host.world.add(m);
      this.shellMeshes.push(m);
    }
    const missileBody = new THREE.CylinderGeometry(0.85, 0.6, 13.5, 7);
    missileBody.rotateZ(Math.PI / 2);
    const missileBodyCones = new THREE.ConeGeometry(0.85, 3.2, 7);
    missileBodyCones.rotateZ(-Math.PI / 2);
    missileBodyCones.translate(8.2, 0, 0);
    const missileMat = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.35, metalness: 0.55, emissive: 0x332a18 });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(missileBody, missileMat);
      m.add(new THREE.Mesh(missileBodyCones, new THREE.MeshBasicMaterial({ color: 0xffc34d })));
      m.visible = false;
      m.frustumCulled = false;
      host.world.add(m);
      this.missileMeshes.push(m);
    }
    this.flashLight = new THREE.PointLight(0xffc37a, 0, 420, 1.6);
    host.world.add(this.flashLight);
  }

  reset() {
    this.shells = [];
    this.flashes = [];
    this.pendingKills = [];
    this.cds = { cannon: 0, ciws: 0, missile: 0 };
    this.heat = 0;
    this.held = false;
    this.targets = [];
    this.shore = [];
    this.nextShoreId = 1;
    this.stats = { ...EMPTY_COMBAT_STATS };
    this.lockable = null;
    this.lockT = 0;
    this.lockBeeped = false;
    this.noAmmoToast = 0;
    this.aimX = 1e9;
    this.aimZ = 1e9;
    this.tracers.clear();
    this.bursts.clear();
  }

  dispose() {
    this.host.world.remove(this.tracers.points);
    this.host.world.remove(this.bursts.points);
    this.tracers.points.geometry.dispose();
    this.bursts.points.geometry.dispose();
    for (const m of [...this.shellMeshes, ...this.missileMeshes]) this.host.world.remove(m);
    this.host.world.remove(this.flashLight);
  }

  get weapon(): WeaponSpec {
    return WEAPONS[this.weaponIndex];
  }

  /** 0..1 reload readiness of the active weapon */
  get cooldown(): number {
    return this.cooldownOf(this.weaponIndex);
  }

  cooldownOf(i: number): number {
    const w = WEAPONS[i];
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

  /** 0..1 missile seeker lock progress; 1 = locked */
  get lock(): number {
    return this.weapon.kind === 'missile' ? this.lockT : 0;
  }

  get lockedOn(): boolean {
    return this.weapon.kind === 'missile' && this.lockT >= 1 && !!this.lockable;
  }

  selectWeapon(i: number) {
    if (i < 0 || i >= WEAPONS.length) return;
    if (i === this.weaponIndex) return;
    this.weaponIndex = i;
    this.host.toast(`Weapon · ${WEAPONS[i].label}`, 'info');
  }

  cycleWeapon() {
    this.selectWeapon((this.weaponIndex + 1) % WEAPONS.length);
  }

  setHeld(down: boolean) {
    this.held = down;
  }

  setAmmo(n: number) {
    this.ammo = n;
    this.maxAmmo = n;
  }

  /** Crosshair on the water — the host raycasts from the camera each frame. */
  setAim(x: number, z: number) {
    this.aimX = x;
    this.aimZ = z;
  }

  /** Where the reticle sits — barrels and launchers train on this. */
  getAimPoint(): { x: number; z: number } | null {
    return isFinite(this.aimX) ? { x: this.aimX, z: this.aimZ } : null;
  }

  registerShoreSite(eventId: string, x: number, z: number, radius: number, gun = true): ShoreSite {
    const site: ShoreSite = {
      id: this.nextShoreId++,
      obj: new THREE.Group(),
      x,
      z,
      radius,
      structural: 1,
      alive: true,
      eventId,
      gun,
      gunRange: 1150,
      fireCd: 3 + Math.random() * 4,
    };
    this.shore.push(site);
    return site;
  }

  sitesAlive(eventId: string): number {
    return this.shore.filter((s) => s.eventId === eventId && s.alive).length;
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

  /** What the crosshair is hovering — for the HUD "ON TARGET" state. */
  aimTarget(): { kind: TargetKind; dist: number; locked: boolean } | null {
    const l = this.lockCandidate();
    if (!l) return null;
    const dist = Math.hypot(l.x - this.host.pos.x, l.z - this.host.pos.y);
    return { kind: l.kind, dist, locked: this.lockedOn && this.lockable?.key === l.key };
  }

  /** Hostile or fort nearest to the aim point (soft aim-assist). */
  private lockCandidate(rangeMul = 1): Lockable | null {
    const w = this.weapon;
    const hx = this.host.pos.x;
    const hz = this.host.pos.y;
    let best: Lockable | null = null;
    let bd = Infinity;
    for (const t of this.targets) {
      if (!t.alive) continue;
      if (Math.hypot(t.x - hx, t.z - hz) > w.range * 1.05) continue;
      const d = Math.hypot(t.x - this.aimX, t.z - this.aimZ);
      const snap = Math.max(70, t.r * 5) * rangeMul;
      if (d < snap && d < bd) {
        bd = d;
        best = { key: t.key, kind: t.kind, x: t.x, z: t.z, r: t.r };
      }
    }
    if (!best) {
      for (const s of this.shore) {
        if (!s.alive) continue;
        if (Math.hypot(s.x - hx, s.z - hz) > w.range * 1.05) continue;
        const d = Math.hypot(s.x - this.aimX, s.z - this.aimZ);
        if (d < s.radius * 3 && d < bd) {
          bd = d;
          best = { key: `site-${s.id}`, kind: 'fort', x: s.x, z: s.z, r: s.radius };
        }
      }
    }
    return best;
  }

  /* ---------------------------------------------------------- firing -- */

  /**
   * Launch a salvo from (sx,sy,sz). The crosshair aim point rules: a hostile near it is
   * engaged with aim assist, a locked missile homes, shore sites are secondary, and
   * otherwise the salvo flies at the aim point so free shots still feel deliberate.
   * Returns the number of shells launched.
   */
  fire(sx: number, sy: number, sz: number, heading: number, aimX?: number, aimZ?: number): number {
    const w = this.weapon;
    if (this.cds[w.kind] > 0) return 0;
    if (this.overheated) {
      this.host.toast('Barrel overheated — hold fire while she cools.', 'warn');
      return 0;
    }
    if (aimX !== undefined && aimZ !== undefined) this.setAim(aimX, aimZ);
    if (!isFinite(this.aimX)) {
      const fx = Math.cos(heading);
      this.aimX = sx + fx * w.range * 0.55;
      this.aimZ = sz + Math.sin(heading) * w.range * 0.55;
    }

    if (w.kind === 'missile') {
      if (this.ammo <= 0) {
        if (this.noAmmoToast <= 0) {
          this.noAmmoToast = 3;
          this.host.toast('VLS magazine empty — missiles expended for this voyage.', 'warn');
        }
        return 0;
      }
      this.ammo--;
      this.stats.missilesFired++;
      this.stats.shellsFired++;
      this.cds[w.kind] = w.cooldown;
      this.heat = Math.min(1, this.heat + 0.1);
      this.launchMissile(sx, sy, sz);
      return 1;
    }

    /* pick a target near the crosshair for soft aim assist */
    const cand = this.lockCandidate(1.6);
    let ix: number;
    let iz: number;
    let key: string | null = null;
    if (cand && cand.kind !== 'fort') {
      const t = this.targets.find((tt) => tt.key === cand.key);
      if (t) {
        key = t.key;
        /* lead a moving skiff by a fraction of its run */
        ix = t.x + (t.x - this.host.pos.x) * 0.02;
        iz = t.z + (t.z - this.host.pos.y) * 0.02;
      } else {
        ix = this.aimX;
        iz = this.aimZ;
      }
    } else if (cand) {
      const s = this.shore.find((ss) => `site-${ss.id}` === cand.key);
      ix = s ? s.x : this.aimX;
      iz = s ? s.z : this.aimZ;
    } else {
      ix = this.aimX;
      iz = this.aimZ;
      /* clamp free shots to weapon range */
      const hx = this.host.pos.x;
      const hz = this.host.pos.y;
      const d = Math.hypot(ix - hx, iz - hz);
      if (d > w.range) {
        ix = hx + ((ix - hx) / d) * w.range;
        iz = hz + ((iz - hz) / d) * w.range;
      }
    }
    key = null; // ballistic shells may hit whatever they intersect

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
    this.heat = Math.min(1, this.heat + (w.kind === 'ciws' ? 0.045 : 0.15));
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
      this.tracers.push(sx, sy, sz, w.kind === 'ciws' ? CIWS_COLOR : CANNON_COLOR, 1, w.kind === 'ciws' ? 1.4 : 3.0);
    }

    this.flashes.push({ x: sx, y: sy, z: sz, life: 0, max: 0.16, color: MUZZLE_COLOR, size: 26 });
    /* muzzle tracer streak so the shot reads at a distance */
    for (let s = 0; s < 4; s++) {
      const f = s / 4;
      this.tracers.push(sx + nx * f * 26, sy + f * vy * 0.03, sz + nz * f * 26, w.kind === 'ciws' ? CIWS_COLOR : CANNON_COLOR, 0.9, 1.4);
    }
    /* muzzle light: a bright blink at the gun */
    this.flashLight.position.set(sx, sy + 2, sz);
    this.flashT = Math.max(this.flashT, 0.09);
    return w.burst;
  }

  /** Cold-launch a Sea Lance from the VLS: loft vertically, pitch over, then home. */
  private launchMissile(sx: number, sy: number, sz: number) {
    const locked = this.lockedOn && this.lockable ? this.lockable : this.lockCandidate(2.2);
    const s: Shell = {
      x: sx,
      y: sy + 4,
      z: sz,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 14,
      gravity: 0,
      damage: WEAPONS[2].damage,
      shoreDamage: WEAPONS[2].shoreDamage,
      targetKey: locked ? locked.key : null,
      kind: 'missile',
      homing: !!locked,
      boost: 0,
    };
    /* loft: big initial kick upward + toward the aim bearing */
    const tx = locked ? locked.x : this.aimX;
    const tz = locked ? locked.z : this.aimZ;
    const d = Math.max(1, Math.hypot(tx - sx, tz - sz));
    s.vx = ((tx - sx) / d) * 26;
    s.vz = ((tz - sz) / d) * 26;
    s.vy = 64;
    this.shells.push(s);
    this.flashes.push({ x: sx, y: sy + 6, z: sz, life: 0, max: 0.5, color: MUZZLE_COLOR, size: 40 });
    this.host.audio.missile?.();
    this.host.say('missile');
    /* reset the seeker — locking the next shot takes fresh aim */
    this.lockT = 0;
    this.lockBeeped = false;
  }

  /* ---------------------------------------------------------- update -- */

  update(dt: number) {
    this.cds.cannon = Math.max(0, this.cds.cannon - dt);
    this.cds.ciws = Math.max(0, this.cds.ciws - dt);
    this.cds.missile = Math.max(0, this.cds.missile - dt);
    this.heat = Math.max(0, this.heat - dt * 0.26);
    if (this.noAmmoToast > 0) this.noAmmoToast -= dt;

    /* ordnance visuals: drive the mesh pools from live shell state */
    {
      let bi = 0;
      let mi = 0;
      for (const s of this.shells) {
        if (s.kind === 'missile') {
          const m = this.missileMeshes[mi++];
          if (m) {
            m.visible = true;
            m.position.set(s.x, s.y, s.z);
            const sp = Math.hypot(s.vx, s.vy, s.vz);
            if (sp > 4) {
              this.tmpDir.set(s.vx / sp, s.vy / sp, s.vz / sp);
              m.quaternion.setFromUnitVectors(CombatSystem.X_AXIS, this.tmpDir);
            }
          }
        } else {
          const m = this.shellMeshes[bi++];
          if (m) {
            m.visible = true;
            m.material = s.enemy ? this.matEnemy : s.kind === 'ciws' ? this.matCiws : this.matCannon;
            m.position.set(s.x, s.y, s.z);
            const sp = Math.hypot(s.vx, s.vy, s.vz);
            if (sp > 1) {
              this.tmpDir.set(s.vx / sp, s.vy / sp, s.vz / sp);
              m.quaternion.setFromUnitVectors(CombatSystem.X_AXIS, this.tmpDir);
            }
          }
        }
      }
      for (; bi < this.shellMeshes.length; bi++) this.shellMeshes[bi].visible = false;
      for (; mi < this.missileMeshes.length; mi++) this.missileMeshes[mi].visible = false;
    }

    /* muzzle/blast light decay */
    this.flashT -= dt;
    if (this.flashT <= 0) this.flashLight.intensity = 0;
    else this.flashLight.intensity = (this.flashT / 0.35) * 26;

    /* missile seeker: keep the reticle on the same contact to build a lock */
    if (this.weapon.kind === 'missile') {
      const cand = this.lockCandidate();
      if (cand && (!this.lockable || cand.key === this.lockable.key)) {
        this.lockable = cand;
        this.lockT = Math.min(1, this.lockT + dt / (this.weapon.lockTime ?? 1.35));
        if (this.lockT >= 1 && !this.lockBeeped) {
          this.lockBeeped = true;
          this.host.audio.lock?.(true);
          this.host.toast('SEEKER LOCK — launch when ready.', 'good');
        }
      } else {
        if (this.lockable && this.lockT >= 1) this.host.audio.lock?.(false);
        this.lockable = cand;
        this.lockT = Math.max(0, this.lockT - dt * 0.9);
        this.lockBeeped = false;
      }
    } else {
      this.lockable = null;
      this.lockT = 0;
      this.lockBeeped = false;
    }

    /* held trigger (CIWS): keep firing toward the crosshair */
    if (this.held) {
      const fx = Math.cos(this.host.heading);
      const fy = Math.sin(this.host.heading);
      const side = Math.floor(performance.now() / 80) % 2 === 0 ? 1 : -1;
      const mx = this.host.pos.x + fx * 52;
      const mz = this.host.pos.y + fy * 52 + side * 12;
      if (isFinite(this.aimX)) this.fire(mx, 20, mz, this.host.heading);
      else this.fire(this.host.pos.x + fx * 52, 20, mz, this.host.heading, this.host.pos.x + fx * 320, this.host.pos.y + fy * 320);
    }

    /* shore batteries engage the ship */
    this.updateShoreGuns(dt);

    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life += dt;

      if (s.kind === 'missile') {
        s.boost = (s.boost ?? 0) + dt;
        const steering = s.boost > 0.45;
        const tgt = s.targetKey ? this.resolveLockable(s.targetKey) : null;
        const gx = tgt ? tgt.x : this.aiMissileFallbackX(s);
        const gz = tgt ? tgt.z : this.aiMissileFallbackZ(s);
        if (steering) {
          const speed = Math.min(430, 120 + s.life * 340);
          const d = Math.max(1, Math.hypot(gx - s.x, gz - s.z));
          const wantVy = tgt ? Math.max(-30, Math.min(40, ((8 - s.y) / Math.max(0.4, d / speed)) * 1.4)) : Math.max(-60, (0 - s.y) * 1.1);
          s.vx += ((gx - s.x) / d) * speed * dt * 3.2 - s.vx * dt * 1.4;
          s.vz += ((gz - s.z) / d) * speed * dt * 3.2 - s.vz * dt * 1.4;
          s.vy += (wantVy - s.vy) * Math.min(1, dt * 2.6);
        } else {
          /* cold-launch pop-up: strong vertical thrust */
          s.vy += 140 * dt;
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
        /* exhaust trail */
        this.bursts.push(s.x, s.y, s.z, MISSILE_COLOR, 0.55, 6);
        this.bursts.push(s.x, s.y, s.z, SPLASH_COLOR, 0.3, 10);
      } else {
        s.vy -= s.gravity * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
        this.tracers.push(s.x, s.y, s.z, s.enemy ? ENEMY_COLOR : s.kind === 'ciws' ? CIWS_COLOR : CANNON_COLOR, 0.9, s.kind === 'ciws' ? 1.6 : 3.4);
      }

      let consumed = false;

      /* missiles strike */
      if (s.kind === 'missile') {
        if (s.life > 0.5) {
          /* proximity fuse vs hostiles */
          for (const t of this.targets) {
            if (!t.alive) continue;
            if (Math.hypot(t.x - s.x, t.z - s.z) < t.r + 14 && Math.abs(s.y - 8) < 30) {
              this.stats.shellsHit++;
              t.hitPoints -= s.damage;
              this.blast(s.x, s.z, t.kind === 'skiff' ? 30 : 46);
              if (t.hitPoints <= 0) this.killHostile(t);
              else this.host.popup('DIRECT HIT', 'good');
              consumed = true;
              break;
            }
          }
          if (!consumed) {
            for (const site of this.shore) {
              if (!site.alive) continue;
              if (Math.hypot(site.x - s.x, site.z - s.z) < site.radius + 16 && s.y < 80) {
                this.stats.shellsHit++;
                this.damageSite(site, s.shoreDamage);
                this.blast(s.x, s.z, site.radius * 1.1);
                consumed = true;
                break;
              }
            }
          }
          if (!consumed && (s.y < 0 || s.life > s.maxLife)) {
            this.blast(s.x, s.z, 34);
            consumed = true;
          }
        } else if (s.life > s.maxLife) {
          this.blast(s.x, s.z, 34);
          consumed = true;
        }
      }

      /* enemy flak vs our hull */
      if (!consumed && s.enemy) {
        const dShip = Math.hypot(s.x - this.host.pos.x, s.z - this.host.pos.y);
        if ((s.y <= 7 && dShip < 68) || s.life > s.maxLife) {
          if (dShip < 95) {
            const fall = dShip < 34 ? 1 : dShip < 68 ? 0.6 : 0.25;
            this.host.hurt(s.damage * fall, s.damage * fall * 0.5, 0.55 * fall + 0.15);
            this.stats; // (player damage tracked host-side)
            this.host.popup(fall >= 0.6 ? 'SHELL HIT' : 'NEAR MISS', fall >= 0.6 ? 'danger' : 'warn');
            this.blast(s.x, s.z, 20 + (1 - fall) * 14);
          } else {
            this.splash(s.x, s.z, 'cannon');
          }
          consumed = true;
        } else if (s.y <= -2.5) {
          this.splash(s.x, s.z, 'ciws');
          consumed = true;
        }
      }

      if (!consumed && !s.enemy && s.kind !== 'missile') {
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
              if (t.hitPoints <= 0) this.killHostile(t);
              else this.host.popup('HIT', 'good');
              consumed = true;
              break;
            }
          }
        }

        if (!consumed && s.kind !== 'ciws') {
          for (const site of this.shore) {
            if (!site.alive) continue;
            if (Math.hypot(site.x - s.x, site.z - s.z) < site.radius && Math.abs(s.y) < 200) {
              this.stats.shellsHit++;
              this.damageSite(site, s.shoreDamage);
              this.blast(s.x, s.z, site.radius * 0.4);
              consumed = true;
              break;
            }
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

  /** Missile ended up where its target was when fired — used when the seeker lost track. */
  private aiMissileFallbackX(s: Shell) {
    return isFinite(this.aimX) ? this.aimX : s.x + s.vx;
  }
  private aiMissileFallbackZ(s: Shell) {
    return isFinite(this.aimZ) ? this.aimZ : s.z + s.vz;
  }

  private resolveLockable(key: string): Lockable | null {
    const t = this.targets.find((tt) => tt.key === key);
    if (t && t.alive) return { key, kind: t.kind, x: t.x, z: t.z, r: t.r };
    const s = this.shore.find((ss) => `site-${ss.id}` === key);
    if (s && s.alive) return { key, kind: 'fort', x: s.x, z: s.z, r: s.radius };
    return null;
  }

  private killHostile(t: Target) {
    t.alive = false;
    this.pendingKills.push({ key: t.key, kind: t.kind });
    if (t.kind === 'skiff') this.stats.skiffsSunk++;
    else this.stats.mothershipsSunk++;
    this.host.popup(t.kind === 'skiff' ? 'SKIFF SUNK' : 'MOTHERSHIP SUNK', 'good');
    this.host.addBonus(Math.round(this.host.reward() * (t.kind === 'skiff' ? 0.012 : 0.04)), t.kind === 'skiff' ? 'SKIFF DESTROYED' : 'MOTHERSHIP DESTROYED');
    this.host.say('kill');
  }

  private damageSite(site: ShoreSite, dmg: number) {
    site.structural = Math.max(0, site.structural - dmg / 260);
    if (site.structural <= 0) {
      site.alive = false;
      this.stats.shoreSitesDestroyed++;
      this.host.popup('BATTERY DESTROYED', 'good');
      this.host.addBonus(Math.round(this.host.reward() * 0.045), 'SHORE BATTERY DESTROYED');
      this.host.say('siteDestroyed');
      /* big secondary explosion */
      this.blast(site.x, site.z, site.radius * 1.5);
      this.host.audio.explosion?.(1);
    } else {
      this.host.popup('HIT', 'good');
      this.host.say('fortHit');
    }
  }

  /** Armed shore sites lob slow arcing shells at the ship — dodge by manoeuvring. */
  private updateShoreGuns(dt: number) {
    const h = this.host;
    let firing = 0;
    for (const site of this.shore) {
      if (!site.alive || !site.gun) continue;
      const dx = h.pos.x - site.x;
      const dz = h.pos.y - site.z;
      const dist = Math.hypot(dx, dz);
      /* train the little turret on us if one was built into the model */
      const turret = site.obj.getObjectByName('turret');
      if (turret) turret.rotation.y = -Math.atan2(dz, dx);
      if (dist > site.gunRange || firing >= (h.isLowSpec() ? 1 : 2)) continue;
      site.fireCd -= dt;
      if (site.fireCd > 0) continue;
      site.fireCd = 3.4 + Math.random() * 2.2;
      firing++;
      /* ballistic solution with laughable early black-powder accuracy that tightens as we close */
      const fx = Math.cos(h.heading);
      const fy = Math.sin(h.heading);
      const lead = dist / 260;
      const err = 60 + dist * 0.14;
      const tx = h.pos.x + fx * h.speed * lead + (Math.random() - 0.5) * err;
      const tz = h.pos.y + fy * h.speed * lead + (Math.random() - 0.5) * err;
      const flat = Math.max(1, Math.hypot(tx - site.x, tz - site.z));
      const g = 9;
      const tF = Math.max(1.1, flat / 220);
      const sy = 14;
      this.shells.push({
        x: site.x + (dx / dist) * -10,
        y: sy,
        z: site.z + (dz / dist) * -10,
        vx: (tx - site.x) / tF,
        vy: 0.5 * g * tF,
        vz: (tz - site.z) / tF,
        life: 0,
        maxLife: tF * 1.4,
        gravity: g,
        damage: 5.5,
        shoreDamage: 0,
        targetKey: null,
        kind: 'cannon',
        enemy: true,
      });
      this.flashes.push({ x: site.x, y: sy + 2, z: site.z, life: 0, max: 0.22, color: ENEMY_COLOR, size: 22 });
      this.host.audio.gun(Math.max(0.2, 1 - dist / 1500));
      if (dist < 900 && Math.random() < 0.35) this.host.say('incoming');
    }
  }

  private blast(x: number, z: number, radius: number) {
    const n = radius > 20 ? 26 : 14;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.3 + Math.random() * 0.8);
      this.host.spray.spawn(x + Math.cos(a) * r, 5 + Math.random() * 10, z + Math.sin(a) * r, Math.cos(a) * (20 + r), 14 + Math.random() * 24, Math.sin(a) * (20 + r), 1.0, 3.2, 0.7);
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.2 + Math.random() * 0.6);
      this.host.debris.spawn(x + Math.cos(a) * r, 5 + Math.random() * 14, z + Math.sin(a) * r, Math.cos(a) * (26 + r), 16 + Math.random() * 34, Math.sin(a) * (26 + r), 1.1, 2.6, 1);
    }
    /* layered detonation: hot core, fireball, smoke crown */
    this.bursts.push(x, 8, z, BLAST_COLOR, 1, radius * 1.8);
    this.bursts.push(x, 10, z, MUZZLE_COLOR, 0.95, radius * 1.1);
    for (let i = 0; i < 4; i++) {
      const ox = (Math.random() - 0.5) * radius;
      const oz = (Math.random() - 0.5) * radius;
      this.bursts.push(x + ox, 5 + Math.random() * 14, z + oz, i % 2 ? SPLASH_COLOR : BLAST_COLOR, 0.75, radius * (0.4 + Math.random() * 0.6));
    }
    this.flashLight.position.set(x, 14, z);
    this.flashT = Math.max(this.flashT, 0.28);
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
