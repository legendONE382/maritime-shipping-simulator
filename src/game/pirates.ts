import * as THREE from 'three';
import type { Ocean } from './ocean';
import type { GameAudio } from './audio';
import type { ParticleField } from './particles';
import { buildDhow, buildHelicopter, buildSkiff, type HeliModel } from './craft';

type Kind = 'info' | 'warn' | 'danger' | 'good';

export interface PirateHost {
  ocean: Ocean;
  world: THREE.Group;
  audio: GameAudio;
  pos: THREE.Vector2;
  heading: number;
  speed: number;
  rudder: number;
  env: number;
  spray: ParticleField;
  debris: ParticleField;
  wake: ParticleField;
  hurt(hull: number, cargo: number, shake: number): void;
  toast(text: string, kind: Kind): void;
  banner(title: string, sub: string, kind: Kind): void;
  popup(text: string, kind: Kind): void;
  say(trigger: string): void;
  addBonus(amount: number, label: string): void;
  reward(): number;
}

export type NavyState = 'unavailable' | 'ready' | 'inbound' | 'onscene' | 'used';

export interface WorldMarker {
  id: string;
  type: 'pirate' | 'mothership' | 'navy' | 'whale';
  x: number;
  y: number;
  z: number;
  label: string;
}
export interface WorldContact {
  x: number;
  z: number;
  type: 'pirate' | 'mothership' | 'navy' | 'traffic' | 'fishing' | 'whale';
}

const HALF_BEAM = 12.5;

type SkiffState = 'wait' | 'approach' | 'alongside' | 'flee';
interface Dhow {
  obj: THREE.Group;
  pos: THREE.Vector2;
  heading: number;
  speed: number;
  eventId: string;
  leaving: boolean;
  /** hunt mission: this mothership is the objective — she shadows us for the kill */
  hunter: boolean;
}
interface Skiff {
  obj: THREE.Group;
  ladder: THREE.Group;
  pos: THREE.Vector2;
  vel: THREE.Vector2;
  heading: number;
  state: SkiffState;
  delay: number;
  side: number;
  slot: number;
  board: number;
  drench: number;
  push: number;
  fireCd: number;
  fleeT: number;
  chase: number;
  ladderT: number;
  warned: boolean;
  eventId: string;
  dhow: Dhow | null;
  offset: THREE.Vector2;
  hunter: boolean;
}
interface Heli {
  model: HeliModel;
  pos: THREE.Vector3;
  heading: number;
  angle: number;
  t: number;
}

function wrap(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Somali-style skiff attacks per BMP5: a mothership launches skiffs that try to come
 * alongside the low aft freeboard and hook a ladder on. Counters: speed (skiffs can't
 * hold > ~30 kn or operate in heavy seas), hard rudder wash, fire hoses, LRAD, navy.
 */
export class PirateSystem {
  skiffs: Skiff[] = [];
  dhows: Dhow[] = [];
  heli: Heli | null = null;
  navyState: NavyState = 'unavailable';
  navyTimer = 0;
  hoseOn = false;
  hosing = false;
  pressure = 1;
  hoseRepels = 0;
  outran = 0;
  boarded = 0;
  navyCalled = false;
  private host: PirateHost;
  private spawned = new Set<string>();
  private roughWarned = false;
  private tmp = new THREE.Vector2();
  private clock = 0;

  constructor(host: PirateHost) {
    this.host = host;
  }

  reset(available: boolean) {
    this.host.audio.setHose(false);
    this.host.audio.setHeli(0);
    this.skiffs = [];
    this.dhows = [];
    this.heli = null;
    this.spawned.clear();
    this.navyState = available ? 'ready' : 'unavailable';
    this.navyTimer = 0;
    this.hoseOn = false;
    this.hosing = false;
    this.pressure = 1;
    this.hoseRepels = 0;
    this.outran = 0;
    this.boarded = 0;
    this.navyCalled = false;
    this.roughWarned = false;
  }

  spawnAttack(eventId: string, count: number, side: number, hunter = false) {
    const h = this.host;
    const fx = Math.cos(h.heading);
    const fy = Math.sin(h.heading);
    const rx = -fy;
    const rz = fx;
    /* hunters cut the corner: they spawn closer and wider, already working the intercept */
    const ahead = hunter ? 850 : 650;
    const abeam = hunter ? 1150 : 1050;
    const dp = new THREE.Vector2(h.pos.x + fx * ahead + rx * side * abeam, h.pos.y + fy * ahead + rz * side * abeam);
    const obj = buildDhow();
    obj.position.set(dp.x, 0, dp.y);
    h.world.add(obj);
    const dhow: Dhow = { obj, pos: dp, heading: h.heading, speed: hunter ? 6 : 4, eventId, leaving: false, hunter };
    this.dhows.push(dhow);
    for (let i = 0; i < count; i++) {
      const m = buildSkiff(i * 7 + eventId.length * 3 + count);
      const along = i * 9 - 12;
      const offset = new THREE.Vector2(fx * along - rx * side * 9, fy * along - rz * side * 9);
      const pos = dp.clone().add(offset);
      m.group.position.set(pos.x, 0, pos.y);
      h.world.add(m.group);
      this.skiffs.push({
        obj: m.group,
        ladder: m.ladder,
        pos,
        vel: new THREE.Vector2(),
        heading: h.heading,
        state: 'wait',
        delay: 1.5 + i * 2.4,
        side: count >= 3 ? (i % 2 === 0 ? side : -side) : side,
        slot: -55 + (i % 3) * 21,
        board: 0,
        drench: 0,
        push: 0,
        fireCd: 2 + Math.random() * 2,
        fleeT: 0,
        chase: 0,
        ladderT: 0,
        warned: false,
        eventId,
        dhow,
        offset,
        hunter,
      });
    }
    this.spawned.add(eventId);
  }

  /** A government-contract hunt: the mothership IS the objective. */
  spawnHunt(eventId: string, count: number, side: number) {
    this.spawnAttack(eventId, count, side, true);
  }

  dhowAlive(eventId: string): boolean {
    return this.dhows.some((d) => d.eventId === eventId);
  }

  isSpawned(id: string) {
    return this.spawned.has(id);
  }

  activeFor(id: string) {
    return this.skiffs.some((s) => s.eventId === id && s.state !== 'flee');
  }

  threat() {
    let count = 0;
    let nearest = Infinity;
    let board = 0;
    let alongside = 0;
    for (const s of this.skiffs) {
      if (s.state !== 'approach' && s.state !== 'alongside') continue;
      count++;
      nearest = Math.min(nearest, s.pos.distanceTo(this.host.pos));
      if (s.state === 'alongside') {
        alongside++;
        board = Math.max(board, s.board);
      }
    }
    return { count, nearest, board, alongside };
  }

  private flee(s: Skiff, t: number) {
    s.state = 'flee';
    s.fleeT = t;
    s.board = 0;
    s.drench = 0;
  }

  lrad(range: number): number {
    let n = 0;
    for (const s of this.skiffs) {
      if (s.state === 'flee') continue;
      if (s.pos.distanceTo(this.host.pos) < range) {
        this.flee(s, 22);
        n++;
      }
    }
    return n;
  }

  callNavy(eta: number): boolean {
    if (this.navyState !== 'ready') return false;
    const h = this.host;
    this.navyState = 'inbound';
    this.navyTimer = eta;
    this.navyCalled = true;
    const fx = Math.cos(h.heading);
    const fy = Math.sin(h.heading);
    const model = buildHelicopter();
    const start = new THREE.Vector3(h.pos.x - fx * eta * 70 - fy * 400, 120, h.pos.y - fy * eta * 70 + fx * 400);
    model.group.position.copy(start);
    h.world.add(model.group);
    this.heli = { model, pos: start.clone(), heading: h.heading, angle: 0, t: 0 };
    return true;
  }

  update(dt: number) {
    const h = this.host;
    this.clock += dt;
    const fx = Math.cos(h.heading);
    const fy = Math.sin(h.heading);
    const rx = -fy;
    const rz = fx;
    const spd = Math.abs(h.speed);
    const svx = fx * h.speed;
    const svz = fy * h.speed;
    const maxV = Math.max(11, 30 - h.env * 17);

    /* fire hoses: limited water pressure that recovers when idle */
    this.hosing = this.hoseOn && this.pressure > 0.02;
    if (this.hosing) this.pressure = Math.max(0, this.pressure - dt / 9);
    else this.pressure = Math.min(1, this.pressure + dt / 14);
    h.audio.setHose(this.hosing);
    if (this.hosing) {
      for (const side of [-1, 1]) {
        const o = -62 + Math.random() * 74;
        const px = h.pos.x + fx * o + rx * side * (HALF_BEAM + 0.4);
        const pz = h.pos.y + fy * o + rz * side * (HALF_BEAM + 0.4);
        const out = 15 + Math.random() * 6;
        h.spray.spawn(px, 13, pz, rx * side * out + svx * 0.9, 3 + Math.random() * 3, rz * side * out + svz * 0.9, 1.2, 2.4, 0.75);
      }
    }

    /* open boats can't work in heavy weather */
    if (h.env > 0.72 && this.skiffs.some((s) => s.state === 'approach' || s.state === 'alongside')) {
      for (const s of this.skiffs) if (s.state === 'approach' || s.state === 'alongside') this.flee(s, 25);
      if (!this.roughWarned) {
        this.roughWarned = true;
        h.toast('Seas too rough for open boats — the skiffs are turning back.', 'good');
      }
    }

    for (let i = this.skiffs.length - 1; i >= 0; i--) {
      const s = this.skiffs[i];
      const dxs = h.pos.x - s.pos.x;
      const dzs = h.pos.y - s.pos.y;
      const dist = Math.hypot(dxs, dzs);
      const off = HALF_BEAM + 6.5 + s.push;
      const tx = h.pos.x + fx * s.slot + rx * s.side * off;
      const tz = h.pos.y + fy * s.slot + rz * s.side * off;

      if (s.state === 'wait') {
        s.delay -= dt;
        if (s.dhow) {
          s.pos.set(s.dhow.pos.x + s.offset.x, s.dhow.pos.y + s.offset.y);
          s.vel.set(Math.cos(s.dhow.heading) * s.dhow.speed, Math.sin(s.dhow.heading) * s.dhow.speed);
        }
        if (s.delay <= 0) {
          s.state = 'approach';
          s.chase = 0;
        }
      } else if (s.state === 'approach') {
        const ax = tx + svx * 1.1;
        const az = tz + svz * 1.1;
        const dx = ax - s.pos.x;
        const dz = az - s.pos.y;
        const d = Math.hypot(dx, dz) || 1;
        const want = Math.min(maxV, spd + d * 0.5);
        this.tmp.set((dx / d) * want, (dz / d) * want);
        s.vel.lerp(this.tmp, Math.min(1, dt * 1.4));
        s.chase += dt;
        s.ladderT = Math.max(0, s.ladderT - dt * 0.8);
        if (Math.hypot(tx - s.pos.x, tz - s.pos.y) < 22) s.state = 'alongside';
        if (dist > (s.hunter ? 3000 : 1500) || (s.chase > (s.hunter ? 40 : 22) && dist > 380 && spd > maxV * 0.92)) {
          this.flee(s, 18);
          this.outran++;
          h.addBonus(Math.round(h.reward() * 0.01), 'OUTRAN SKIFF');
          h.say('outran');
        }
      } else if (s.state === 'alongside') {
        const ex = tx - s.pos.x;
        const ez = tz - s.pos.y;
        s.vel.set(svx + ex * 1.6, svz + ez * 1.6);
        s.push = Math.max(0, s.push - dt * 3);
        s.ladderT = Math.min(1, s.ladderT + dt * 0.6);
        if (spd > maxV + 1) {
          s.state = 'approach';
          h.popup("SKIFF CAN'T HOLD PACE", 'good');
        } else {
          if (Math.abs(h.rudder) > 0.6 && spd > 8) {
            s.board = Math.max(0, s.board - dt * 0.28);
            s.push += dt * 10;
            if (s.push > 14) {
              s.state = 'approach';
              s.push = 0;
              s.chase = 0;
              h.addBonus(Math.round(h.reward() * 0.006), 'THROWN BY THE WASH');
            }
          }
          if (this.hosing) {
            s.drench += dt * 0.42;
            s.board = Math.max(0, s.board - dt * 0.3);
          } else if (s.push < 4) {
            const rate = 0.075 * (spd < 11 ? 1 : spd < 17 ? 0.5 : 0.16);
            s.board += dt * rate;
          }
          if (s.board > 0.45 && !s.warned) {
            s.warned = true;
            h.say('boarding');
            h.audio.alarm();
          }
          if (s.drench >= 1) {
            this.flee(s, 25);
            this.hoseRepels++;
            h.addBonus(Math.round(h.reward() * 0.015), 'SKIFF HOSED OFF');
            h.say('hoseRepel');
          } else if (s.board >= 1) {
            this.boarded++;
            h.hurt(1.5, 14, 0.45);
            h.banner('BOARDED', 'Pirates over the rail — they looted the containers in bay six', 'danger');
            h.say('boarded');
            this.flee(s, 30);
          }
        }
      } else {
        s.fleeT -= dt;
        const d = dist || 1;
        this.tmp.set((-dxs / d) * 27, (-dzs / d) * 27);
        s.vel.lerp(this.tmp, Math.min(1, dt * 1.2));
        s.ladderT = Math.max(0, s.ladderT - dt);
        if ((s.fleeT <= 0 && dist > 700) || dist > 1700) {
          h.world.remove(s.obj);
          this.skiffs.splice(i, 1);
          continue;
        }
      }

      /* small-arms fire: muzzle flash at the skiff, sparks along our hull */
      if ((s.state === 'approach' && dist < 280) || s.state === 'alongside') {
        s.fireCd -= dt;
        if (s.fireCd <= 0) {
          s.fireCd = (s.state === 'alongside' ? 2.4 : 1.2) + Math.random() * 1.5;
          const mx = s.pos.x + Math.cos(s.heading) * 2.5;
          const mz = s.pos.y + Math.sin(s.heading) * 2.5;
          h.debris.spawn(mx, h.ocean.height(mx, mz) + 2.3, mz, 0, 0.5, 0, 0.1, 4, 1);
          const sideSign = (s.pos.x - h.pos.x) * rx + (s.pos.y - h.pos.y) * rz > 0 ? 1 : -1;
          const o = (Math.random() - 0.5) * 110;
          const hx = h.pos.x + fx * o + rx * sideSign * HALF_BEAM;
          const hz = h.pos.y + fy * o + rz * sideSign * HALF_BEAM;
          const hy = 7 + Math.random() * 9;
          for (let k = 0; k < 5; k++)
            h.debris.spawn(hx, hy, hz, (Math.random() - 0.5) * 8 + rx * sideSign * 3, Math.random() * 5, (Math.random() - 0.5) * 8 + rz * sideSign * 3, 0.35, 1.4, 1);
          h.hurt(0.12, 0.22, 0.1);
          h.audio.gun(Math.max(0.25, 1 - dist / 600));
        }
      }

      /* integrate and pose on the swell */
      s.pos.addScaledVector(s.vel, dt);
      const v = s.vel.length();
      if (v > 0.6) s.heading += wrap(Math.atan2(s.vel.y, s.vel.x) - s.heading) * Math.min(1, dt * 4);
      const y = h.ocean.height(s.pos.x, s.pos.y);
      const yb = h.ocean.height(s.pos.x + Math.cos(s.heading) * 4, s.pos.y + Math.sin(s.heading) * 4);
      s.obj.position.set(s.pos.x, y + 0.05, s.pos.y);
      s.obj.rotation.y = -s.heading;
      s.obj.rotation.z = Math.min(1, v / maxV) * 0.1 + Math.atan2(yb - y, 4) * 0.7;
      s.obj.rotation.x = Math.sin(this.clock * 2 + i) * 0.05;
      s.ladder.rotation.z = 0.04 + s.ladderT * 1.05;
      s.ladder.rotation.x = -s.side * s.ladderT * 0.35;
      if (v > 9 && Math.random() < dt * 30) {
        const bx = s.pos.x - Math.cos(s.heading) * 5.2;
        const bz = s.pos.y - Math.sin(s.heading) * 5.2;
        h.spray.spawn(bx, y + 0.6, bz, -Math.cos(s.heading) * v * 0.3, 3 + Math.random() * 3, -Math.sin(s.heading) * v * 0.3, 0.9, 2.6, 0.6);
        h.wake.spawn(bx, y + 0.4, bz, 0, 0.2, 0, 2.6, 4, 0.4);
      }
    }

    /* motherships shadow us, then slip away once their skiffs are spent */
    for (let i = this.dhows.length - 1; i >= 0; i--) {
      const d = this.dhows[i];
      const busy = this.skiffs.some((s) => s.dhow === d && s.state !== 'flee');
      if (!d.leaving && !busy) d.leaving = true;
      if (d.leaving) {
        const away = Math.atan2(d.pos.y - h.pos.y, d.pos.x - h.pos.x);
        d.heading += wrap(away - d.heading) * Math.min(1, dt * 0.15);
        d.speed = Math.min(d.hunter ? 7.5 : 6.5, d.speed + dt * 0.3);
      } else if (d.hunter) {
        /* hunters run parallel-close, keeping the fight on us */
        const want = Math.atan2(h.pos.y - d.pos.y, h.pos.x - d.pos.x);
        d.heading += wrap(want - d.heading) * Math.min(1, dt * 0.12);
        d.speed = d.pos.distanceTo(h.pos) > 620 ? 9 : 5;
      } else {
        d.heading += wrap(h.heading - d.heading) * Math.min(1, dt * 0.1);
      }
      d.pos.x += Math.cos(d.heading) * d.speed * dt;
      d.pos.y += Math.sin(d.heading) * d.speed * dt;
      d.obj.position.set(d.pos.x, h.ocean.height(d.pos.x, d.pos.y, 20) * 0.9, d.pos.y);
      d.obj.rotation.y = -d.heading;
      d.obj.rotation.z = Math.sin(this.clock * 0.6 + i) * 0.04;
      d.obj.rotation.x = Math.sin(this.clock * 0.9 + i * 2) * 0.05;
      if (d.leaving && d.pos.distanceTo(h.pos) > (d.hunter ? 5500 : 3500)) {
        h.world.remove(d.obj);
        this.dhows.splice(i, 1);
      }
    }

    this.updateHeli(dt, fx, fy, rx, rz);
  }

  private updateHeli(dt: number, fx: number, fy: number, rx: number, rz: number) {
    const hl = this.heli;
    const h = this.host;
    if (!hl) {
      h.audio.setHeli(0);
      return;
    }
    const m = hl.model;
    m.rotor.rotation.y += dt * 42;
    m.tail.rotation.z += dt * 70;
    let tx: number;
    let ty: number;
    let tz: number;
    let v: number;
    if (this.navyState === 'inbound') {
      this.navyTimer -= dt;
      tx = h.pos.x + rx * 110 + fx * 40;
      ty = 48;
      tz = h.pos.y + rz * 110 + fy * 40;
      v = Math.min(110, Math.hypot(tx - hl.pos.x, tz - hl.pos.z) / Math.max(0.6, this.navyTimer));
      if (this.navyTimer <= 0) {
        this.navyState = 'onscene';
        hl.t = 24;
        hl.angle = Math.atan2(hl.pos.z - h.pos.y, hl.pos.x - h.pos.x);
        for (const s of this.skiffs) if (s.state !== 'flee') this.flee(s, 30);
        for (const d of this.dhows) d.leaving = true;
        h.banner('NAVY ON SCENE', 'Helicopter overhead — the skiffs are scattering', 'good');
        h.say('navyArrive');
      }
    } else if (this.navyState === 'onscene') {
      hl.t -= dt;
      hl.angle += dt * 0.32;
      tx = h.pos.x + Math.cos(hl.angle) * 140;
      ty = 46 + Math.sin(hl.angle * 2) * 4;
      tz = h.pos.y + Math.sin(hl.angle) * 140;
      v = 70;
      if (hl.t <= 0) this.navyState = 'used';
    } else {
      tx = hl.pos.x + Math.cos(hl.heading) * 300;
      ty = 160;
      tz = hl.pos.z + Math.sin(hl.heading) * 300;
      v = 80;
    }
    const dx = tx - hl.pos.x;
    const dy = ty - hl.pos.y;
    const dz = tz - hl.pos.z;
    const d = Math.hypot(dx, dy, dz);
    const step = Math.min(d, v * dt);
    if (d > 0.01) {
      hl.pos.x += (dx / d) * step;
      hl.pos.y += (dy / d) * step;
      hl.pos.z += (dz / d) * step;
    }
    let bank = 0;
    if (Math.hypot(dx, dz) > 2) {
      const want = Math.atan2(dz, dx);
      const diff = wrap(want - hl.heading);
      hl.heading += diff * Math.min(1, dt * 1.5);
      bank = THREE.MathUtils.clamp(diff * 0.6, -0.4, 0.4);
    }
    m.group.position.copy(hl.pos);
    m.group.rotation.set(bank, -hl.heading, -0.1 * Math.min(1, v / 60));
    const dist = Math.hypot(hl.pos.x - h.pos.x, hl.pos.z - h.pos.y);
    h.audio.setHeli(Math.max(0, 1 - dist / 1600) * 0.9);
    if (this.navyState === 'used' && dist > 3000) {
      h.world.remove(m.group);
      this.heli = null;
      h.audio.setHeli(0);
    }
  }

  markers(): WorldMarker[] {
    const out: WorldMarker[] = [];
    this.skiffs.forEach((s, i) => {
      if (s.state === 'approach' || s.state === 'alongside')
        out.push({
          id: `sk${i}`,
          type: 'pirate',
          x: s.pos.x,
          y: 4,
          z: s.pos.y,
          label: s.state === 'alongside' ? (this.hosing ? `HOSED ${Math.round(s.drench * 100)}%` : `BOARDING ${Math.round(s.board * 100)}%`) : 'SKIFF',
        });
    });
    this.dhows.forEach((d, i) => {
      if (!d.leaving) out.push({ id: `dh${i}`, type: 'mothership', x: d.pos.x, y: 20, z: d.pos.y, label: d.hunter ? '🎯 MOTHERSHIP' : 'MOTHERSHIP' });
    });
    if (this.heli && this.navyState === 'inbound')
      out.push({ id: 'heli', type: 'navy', x: this.heli.pos.x, y: this.heli.pos.y, z: this.heli.pos.z, label: `NAVY · ${Math.ceil(this.navyTimer)}s` });
    return out;
  }

  contacts(): WorldContact[] {
    const out: WorldContact[] = [];
    for (const s of this.skiffs) out.push({ x: s.pos.x, z: s.pos.y, type: 'pirate' });
    for (const d of this.dhows) out.push({ x: d.pos.x, z: d.pos.y, type: 'mothership' });
    if (this.heli) out.push({ x: this.heli.pos.x, z: this.heli.pos.z, type: 'navy' });
    return out;
  }

  /** Combat view of live hostiles: key, world position, kind, radius and hull HP. */
  combatTargets(): { key: string; kind: 'skiff' | 'dhow'; x: number; z: number; radius: number; hitPoints: number }[] {
    const out: { key: string; kind: 'skiff' | 'dhow'; x: number; z: number; radius: number; hitPoints: number }[] = [];
    for (let i = 0; i < this.skiffs.length; i++) {
      const s = this.skiffs[i];
      if (s.state === 'flee') continue;
      out.push({ key: `skiff-${s.eventId}-${i}`, kind: 'skiff', x: s.pos.x, z: s.pos.y, radius: 12, hitPoints: 80 });
    }
    for (let i = 0; i < this.dhows.length; i++) {
      const d = this.dhows[i];
      out.push({ key: `dhow-${d.eventId}-${i}`, kind: 'dhow', x: d.pos.x, z: d.pos.y, radius: 21, hitPoints: 200 });
    }
    return out;
  }

  /** A skiff destroyed by the player's guns: blow it out of the water. */
  sinkSkiff(key: string) {
    const i = Number(key.split('-')[2]);
    const s = this.skiffs[i];
    if (!s) return;
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 12;
      this.host.debris.spawn(s.pos.x + Math.cos(a) * r, 2 + Math.random() * 4, s.pos.y + Math.sin(a) * r, Math.cos(a) * (24 + r), 12 + Math.random() * 22, Math.sin(a) * (24 + r), 1.4, 2.6, 1);
    }
    for (let k = 0; k < 16; k++) this.host.spray.spawn(s.pos.x + (Math.random() - 0.5) * 20, 2, s.pos.y + (Math.random() - 0.5) * 20, 0, 10 + Math.random() * 14, 0, 1, 3, 0.8);
    this.host.world.remove(s.obj);
    this.skiffs.splice(i, 1);
  }

  /** A mothership destroyed by the player's guns. */
  sinkDhow(key: string) {
    const i = Number(key.split('-')[2]);
    const d = this.dhows[i];
    if (!d) return;
    for (let k = 0; k < 60; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 26;
      this.host.debris.spawn(d.pos.x + Math.cos(a) * r, 3 + Math.random() * 10, d.pos.y + Math.sin(a) * r, Math.cos(a) * (20 + r), 14 + Math.random() * 26, Math.sin(a) * (20 + r), 2.2, 3.6, 1);
    }
    for (let k = 0; k < 30; k++) this.host.spray.spawn(d.pos.x + (Math.random() - 0.5) * 44, 2, d.pos.y + (Math.random() - 0.5) * 44, 0, 10 + Math.random() * 18, 0, 1.4, 3.6, 0.85);
    /* any skiffs still riding with her are orphaned to the open sea */
    for (const s of this.skiffs) if (s.dhow === d) s.dhow = null;
    this.host.world.remove(d.obj);
    this.dhows.splice(i, 1);
  }
}
