import * as THREE from 'three';
import type { Ocean, WakeTrail } from './ocean';
import type { GameAudio } from './audio';
import { buildTrafficShip } from './models';
import { buildTrawler } from './craft';
import { share } from './shared';
import type { WorldContact } from './pirates';

type Kind = 'info' | 'warn' | 'danger' | 'good';

export interface TrafficHost {
  ocean: Ocean;
  world: THREE.Group;
  audio: GameAudio;
  pos: THREE.Vector2;
  heading: number;
  speed: number;
  toast(text: string, kind: Kind): void;
  fouled(name: string): void;
  shipImpact(x: number, z: number, strength: number, name: string): void;
  closeCall(): void;
}

const MERCHANT_NAMES = ['MSC Aurelia', 'Maersk Halden', 'Ever Gallant', 'CMA CGM Tosca', 'Hapag Westfalen', 'ONE Harmony', 'Cosco Pride', 'Yang Ming Unity'];
const TRAWLER_NAMES = ['FV Morning Star', 'FV Ocean Harvest', 'FV Saint Brendan', 'FV Kittiwake', 'FV Lucky Seven', 'FV Northern Rose', 'FV Sea Wren'];
const FLOATS = 30;

interface Net {
  trail: THREE.Vector2[];
  floats: THREE.InstancedMesh;
  torn: number;
}
interface Vessel {
  kind: 'merchant' | 'trawler';
  obj: THREE.Group;
  pos: THREE.Vector2;
  heading: number;
  base: number;
  speed: number;
  cruise: number;
  len: number;
  beam: number;
  wake: WakeTrail | null;
  avoid: number;
  hornCd: number;
  phase: number;
  name: string;
  cd: number;
  near: number;
  tracking: boolean;
  hit: boolean;
  net: Net | null;
}

let floatGeo: THREE.SphereGeometry | null = null;
let floatMat: THREE.MeshStandardMaterial | null = null;

function segX(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  const d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx);
  const d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function wrap(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Merchant traffic that obeys COLREGs (alter course to starboard when a close-quarters
 * situation develops, five short blasts when in doubt) and trawlers towing nets.
 */
export class TrafficSystem {
  vessels: Vessel[] = [];
  private host: TrafficHost;
  private dummy = new THREE.Object3D();
  private nameIdx = 0;

  constructor(host: TrafficHost) {
    this.host = host;
  }

  clear() {
    for (const v of this.vessels) if (v.wake) this.host.ocean.removeWake(v.wake);
    this.vessels = [];
  }

  private base(kind: Vessel['kind'], obj: THREE.Group, p: THREE.Vector2, heading: number, speed: number, len: number, beam: number, name: string): Vessel {
    return {
      kind,
      obj,
      pos: p.clone(),
      heading,
      base: heading,
      speed,
      cruise: speed,
      len,
      beam,
      wake: null,
      avoid: 0,
      hornCd: 0,
      phase: Math.random() * 100,
      name,
      cd: 0,
      near: 9999,
      tracking: false,
      hit: false,
      net: null,
    };
  }

  addMerchant(p: THREE.Vector2, heading: number, speed: number) {
    const obj = buildTrafficShip();
    obj.rotation.order = 'YXZ';
    obj.position.set(p.x, 0, p.y);
    this.host.world.add(obj);
    const v = this.base('merchant', obj, p, heading, speed, 128, 20, MERCHANT_NAMES[this.nameIdx++ % MERCHANT_NAMES.length]);
    v.wake = this.host.ocean.createWake();
    this.vessels.push(v);
  }

  addTrawler(p: THREE.Vector2, heading: number) {
    const obj = buildTrawler(this.nameIdx);
    obj.position.set(p.x, 0, p.y);
    this.host.world.add(obj);
    if (!floatGeo) floatGeo = new THREE.SphereGeometry(0.55, 8, 6);
    if (!floatMat) floatMat = share(new THREE.MeshStandardMaterial({ color: 0xff6a10, roughness: 0.55, metalness: 0, emissive: 0x401000, emissiveIntensity: 0.4 }));
    const floats = new THREE.InstancedMesh(floatGeo, floatMat, FLOATS);
    floats.count = 0;
    floats.frustumCulled = false;
    this.host.world.add(floats);
    const v = this.base('trawler', obj, p, heading, 2.4, 26, 7, TRAWLER_NAMES[this.nameIdx++ % TRAWLER_NAMES.length]);
    // pre-lay the net astern so it is already streaming when we arrive
    const trail: THREE.Vector2[] = [];
    for (let k = 0; k < FLOATS; k++) {
      const d = 13 + k * 6;
      trail.push(new THREE.Vector2(p.x - Math.cos(heading) * d + Math.sin(k * 0.5) * 3, p.y - Math.sin(heading) * d + Math.cos(k * 0.4) * 3));
    }
    v.net = { trail, floats, torn: 0 };
    this.vessels.push(v);
  }

  riskAhead(): boolean {
    const h = this.host;
    const fx = Math.cos(h.heading);
    const fy = Math.sin(h.heading);
    for (const v of this.vessels) {
      const dx = v.pos.x - h.pos.x;
      const dz = v.pos.y - h.pos.y;
      const rel = dx * fx + dz * fy;
      const across = -dx * fy + dz * fx;
      if (rel > 0 && rel < 480 && Math.abs(across) < 50 + v.beam) return true;
    }
    return false;
  }

  contacts(): WorldContact[] {
    return this.vessels.map((v) => ({ x: v.pos.x, z: v.pos.y, type: v.kind === 'merchant' ? 'traffic' : 'fishing' }));
  }

  update(dt: number, hull: [number, number, number][], bow: THREE.Vector2, stern: THREE.Vector2) {
    const h = this.host;
    const pvx = Math.cos(h.heading) * h.speed;
    const pvz = Math.sin(h.heading) * h.speed;
    for (const v of this.vessels) {
      v.cd -= dt;
      v.hornCd -= dt;
      v.phase += dt;
      let dirx = Math.cos(v.heading);
      let dirz = Math.sin(v.heading);
      const rx = v.pos.x - h.pos.x;
      const rz = v.pos.y - h.pos.y;
      const dist = Math.hypot(rx, rz);

      if (v.kind === 'merchant') {
        // closest point of approach against our own track
        const wx = dirx * v.speed - pvx;
        const wz = dirz * v.speed - pvz;
        const w2 = wx * wx + wz * wz;
        const tcpa = w2 > 0.01 ? -(rx * wx + rz * wz) / w2 : 999;
        const cpa = Math.hypot(rx + wx * tcpa, rz + wz * tcpa);
        if (tcpa > 0 && tcpa < 120 && cpa < 300 && dist < 3000) v.avoid = 20;
        let target = v.base;
        if (v.avoid > 0) {
          v.avoid -= dt;
          target = v.base + 0.6; // Rule 8: substantial alteration to starboard
        }
        v.heading += THREE.MathUtils.clamp(wrap(target - v.heading), -0.07 * dt, 0.07 * dt);
        if (tcpa > 0 && tcpa < 50 && cpa < 150 && dist < 1000 && v.hornCd <= 0) {
          v.hornCd = 35;
          h.audio.horn(THREE.MathUtils.clamp(1 - dist / 1300, 0.15, 0.7), true);
          h.toast(`${v.name}: five short blasts — "your intentions are unclear!"`, 'warn');
        }
        v.speed += (v.cruise - v.speed) * dt * 0.05;
        if (dist > 5200) {
          v.pos.x = h.pos.x + (rx > 0 ? -1 : 1) * 3600;
          v.wake?.reset();
        }
      } else if (v.net) {
        v.heading += (Math.sin(v.phase * 0.09) * 0.04 + Math.sin(v.phase * 0.023) * 0.02) * dt;
        const net = v.net;
        const sx = v.pos.x - dirx * v.len * 0.5;
        const sz = v.pos.y - dirz * v.len * 0.5;
        if (net.torn > 0) {
          net.torn -= dt;
        } else if (!net.trail.length || Math.hypot(sx - net.trail[0].x, sz - net.trail[0].y) > 6) {
          net.trail.unshift(new THREE.Vector2(sx, sz));
          if (net.trail.length > FLOATS) net.trail.pop();
        }
        net.floats.count = net.trail.length;
        net.trail.forEach((p, k) => {
          this.dummy.position.set(p.x, h.ocean.height(p.x, p.y) + 0.15, p.y);
          this.dummy.updateMatrix();
          net.floats.setMatrixAt(k, this.dummy.matrix);
        });
        net.floats.instanceMatrix.needsUpdate = true;
        if (net.torn <= 0) {
          for (let k = 0; k < net.trail.length - 1; k++) {
            const a = net.trail[k];
            const b = net.trail[k + 1];
            if (segX(bow.x, bow.y, stern.x, stern.y, a.x, a.y, b.x, b.y)) {
              net.torn = 45;
              net.trail = [];
              net.floats.count = 0;
              h.fouled(v.name);
              break;
            }
          }
        }
      }

      dirx = Math.cos(v.heading);
      dirz = Math.sin(v.heading);
      v.pos.x += dirx * v.speed * dt;
      v.pos.y += dirz * v.speed * dt;

      // float on the swell with pitch and roll
      const L2 = v.len * 0.4;
      const y = h.ocean.height(v.pos.x, v.pos.y, 20);
      const yf = h.ocean.height(v.pos.x + dirx * L2, v.pos.y + dirz * L2, 20);
      const ya = h.ocean.height(v.pos.x - dirx * L2, v.pos.y - dirz * L2, 20);
      const ys = h.ocean.height(v.pos.x - dirz * v.beam * 0.5, v.pos.y + dirx * v.beam * 0.5, 20);
      const yp = h.ocean.height(v.pos.x + dirz * v.beam * 0.5, v.pos.y - dirx * v.beam * 0.5, 20);
      v.obj.position.set(v.pos.x, y * 0.9, v.pos.y);
      v.obj.rotation.y = -v.heading;
      v.obj.rotation.z = Math.atan2(yf - ya, L2 * 2) * 0.85;
      v.obj.rotation.x = -Math.atan2(ys - yp, v.beam) * (v.kind === 'trawler' ? 0.9 : 0.6);
      if (v.wake) v.wake.update(dt, v.pos.x + dirx * v.len * 0.5, v.pos.y + dirz * v.len * 0.5, v.speed, v.len, v.beam);

      // collisions and close calls against our hull circles
      let gapMin = 9999;
      const r = v.beam * 0.62;
      for (const o of [-0.33, 0, 0.33]) {
        const cx = v.pos.x + dirx * o * v.len;
        const cz = v.pos.y + dirz * o * v.len;
        for (const [hx, hz, hr] of hull) {
          const g = Math.hypot(cx - hx, cz - hz) - r - hr;
          gapMin = Math.min(gapMin, g);
          if (g < 0 && v.cd <= 0) {
            v.cd = 2.5;
            v.hit = true;
            v.speed *= 0.4;
            h.shipImpact(v.pos.x, v.pos.y, v.kind === 'merchant' ? 1 : 0.55, v.name);
          }
        }
      }
      if (gapMin < 120) {
        v.tracking = true;
        v.near = Math.min(v.near, gapMin);
      } else if (v.tracking) {
        v.tracking = false;
        if (!v.hit && v.near < 28 && Math.abs(h.speed) > 7) h.closeCall();
        v.near = 9999;
        v.hit = false;
      }
    }
  }
}
