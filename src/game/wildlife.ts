import * as THREE from 'three';
import type { Ocean } from './ocean';
import type { GameAudio } from './audio';
import type { ParticleField } from './particles';
import { buildWhale, type WhaleModel } from './craft';
import type { WorldContact, WorldMarker } from './pirates';

export interface WildHost {
  ocean: Ocean;
  world: THREE.Group;
  audio: GameAudio;
  pos: THREE.Vector2;
  heading: number;
  speed: number;
  spray: ParticleField;
  say(trigger: string): void;
  addBonus(amount: number, label: string): void;
  fine(amount: number, label: string): void;
  reward(): number;
}

interface Whale {
  model: WhaleModel;
  pos: THREE.Vector2;
  offset: THREE.Vector2;
  heading: number;
  t: number;
  period: number;
  depth: number;
  struck: boolean;
  blown: number;
  cycle: number;
}
interface Pod {
  id: string;
  center: THREE.Vector2;
  dir: THREE.Vector2;
  whales: Whale[];
  near: boolean;
  maxSpeed: number;
  resolved: boolean;
  strikes: number;
}

/** Migrating humpback pods: surface, blow, fluke and dive while crossing the lane. */
export class WildlifeSystem {
  pods: Pod[] = [];
  whaleSafe = 0;
  whaleStrikes = 0;
  private host: WildHost;

  constructor(host: WildHost) {
    this.host = host;
  }

  clear() {
    this.pods = [];
    this.whaleSafe = 0;
    this.whaleStrikes = 0;
  }

  spawnPod(id: string, center: THREE.Vector2, dirSign: number, count: number) {
    const h = this.host;
    const fx = Math.cos(h.heading);
    const fy = Math.sin(h.heading);
    const dir = new THREE.Vector2(-fy * dirSign, fx * dirSign);
    const pod: Pod = { id, center: center.clone(), dir, whales: [], near: false, maxSpeed: 0, resolved: false, strikes: 0 };
    for (let i = 0; i < count; i++) {
      const model = buildWhale();
      const s = i === count - 1 ? 0.55 : 0.85 + Math.random() * 0.3; // a calf trails the pod
      model.group.scale.setScalar(s);
      h.world.add(model.group);
      pod.whales.push({
        model,
        pos: center.clone(),
        offset: new THREE.Vector2((Math.random() - 0.5) * 120, (Math.random() - 0.5) * 70),
        heading: Math.atan2(dir.y, dir.x),
        t: Math.random() * 20,
        period: 22 + Math.random() * 6,
        depth: -9,
        struck: false,
        blown: 0,
        cycle: -1,
      });
    }
    this.pods.push(pod);
  }

  resolved(id: string) {
    return this.pods.some((p) => p.id === id && p.resolved);
  }

  nearPod(): { dist: number } | null {
    let best: { dist: number } | null = null;
    for (const p of this.pods) {
      if (p.resolved) continue;
      const d = p.center.distanceTo(this.host.pos);
      if (!best || d < best.dist) best = { dist: d };
    }
    return best;
  }

  update(dt: number, hull: [number, number, number][]) {
    const h = this.host;
    const spd = Math.abs(h.speed);
    for (const pod of this.pods) {
      pod.center.addScaledVector(pod.dir, 1.4 * dt);
      const podHeading = Math.atan2(pod.dir.y, pod.dir.x);
      for (const w of pod.whales) {
        w.t += dt;
        const cycle = Math.floor(w.t / w.period);
        if (cycle !== w.cycle) {
          w.cycle = cycle;
          w.blown = 0;
        }
        const u = w.t - cycle * w.period;
        let depth: number;
        let pitch: number;
        let fluke = 0;
        if (u < 10) {
          depth = -0.55 + 0.3 * Math.sin(u * 0.9);
          pitch = 0.06 * Math.sin(u * 0.9 + 1.2);
          if ((u > 0.4 && w.blown === 0) || (u > 5.2 && w.blown === 1)) {
            w.blown++;
            this.blow(w);
          }
        } else if (u < 13) {
          const k = (u - 10) / 3;
          depth = -0.55 - k * 4.5;
          pitch = -0.45 * k;
          fluke = k;
        } else {
          depth = -9;
          pitch = 0;
        }
        w.offset.x += Math.sin(w.t * 0.1 + w.period) * dt * 0.8;
        w.pos.set(pod.center.x + w.offset.x * pod.dir.y + w.offset.y * pod.dir.x, pod.center.y - w.offset.x * pod.dir.x + w.offset.y * pod.dir.y);
        w.heading = podHeading + Math.sin(w.t * 0.07 + w.period) * 0.25;
        w.depth = depth;
        const y = h.ocean.height(w.pos.x, w.pos.y, 20) * 0.8 + depth;
        const g = w.model.group;
        g.visible = depth > -7;
        g.position.set(w.pos.x, y, w.pos.y);
        g.rotation.y = -w.heading;
        g.rotation.z = pitch;
        w.model.tail.rotation.z = -fluke * 1.15 + (u < 10 ? Math.sin(u * 1.5) * 0.12 : 0);

        if (!w.struck && depth > -4) {
          for (const [hx, hz, hr] of hull) {
            if (Math.hypot(w.pos.x - hx, w.pos.y - hz) < hr + 7 && spd > 2) {
              w.struck = true;
              w.t = cycle * w.period + 10; // forced dive
              pod.strikes++;
              this.whaleStrikes++;
              h.fine(45000, 'WHALE STRIKE');
              h.say('whaleStrike');
              h.audio.impact(0.8);
              break;
            }
          }
        }
      }

      const d = pod.center.distanceTo(h.pos);
      if (d < 750) {
        pod.near = true;
        pod.maxSpeed = Math.max(pod.maxSpeed, spd);
      }
      if (pod.near && d > 1000 && !pod.resolved) {
        pod.resolved = true;
        if (pod.strikes === 0) {
          if (pod.maxSpeed < 12.5) {
            this.whaleSafe++;
            h.addBonus(Math.round(h.reward() * 0.04), 'WHALE-SAFE PASSAGE');
            h.say('whaleSafe');
          } else {
            h.addBonus(Math.round(h.reward() * 0.008), 'WHALES PASSED');
          }
        }
      }
    }
  }

  private blow(w: Whale) {
    const h = this.host;
    const hx = w.pos.x + Math.cos(w.heading) * 4;
    const hz = w.pos.y + Math.sin(w.heading) * 4;
    const y = h.ocean.height(hx, hz) + 1.2;
    for (let k = 0; k < 14; k++)
      h.spray.spawn(hx, y, hz, (Math.random() - 0.5) * 1.6, 9 + Math.random() * 7, (Math.random() - 0.5) * 1.6, 2.2, 4 + Math.random() * 3, 0.55);
    const dist = w.pos.distanceTo(h.pos);
    if (dist < 900) h.audio.blow(Math.max(0.1, 1 - dist / 900));
  }

  markers(): WorldMarker[] {
    const out: WorldMarker[] = [];
    for (const p of this.pods) {
      if (p.resolved) continue;
      const d = p.center.distanceTo(this.host.pos);
      if (d < 2600) out.push({ id: `pod-${p.id}`, type: 'whale', x: p.center.x, y: 3, z: p.center.y, label: 'WHALES' });
    }
    return out;
  }

  contacts(): WorldContact[] {
    const out: WorldContact[] = [];
    for (const p of this.pods) for (const w of p.whales) if (w.depth > -5) out.push({ x: w.pos.x, z: w.pos.y, type: 'whale' });
    return out;
  }
}
