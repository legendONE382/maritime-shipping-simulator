import * as THREE from 'three';
import { Ocean, SURFACE_LAYER } from './ocean';
import { SHARED } from './shared';
import { SHIP_L, allWindowMaterials } from './ship';
import { GameAudio } from './audio';
import { ParticleField } from './particles';
import { buildContainerShip, buildIceberg, buildLifeRaft, buildPort, buildRock } from './models';
import { buildBuoy, buildDriftDebris, buildFort, buildIceSkirt, buildIsland, buildMooredMine, buildReef, buildWaypointRing, type BuoyKind, type WaypointRing } from './craft';
import { PirateSystem, type NavyState, type WorldMarker } from './pirates';
import { TrafficSystem } from './traffic';
import { WildlifeSystem } from './wildlife';
import { CombatSystem, WEAPONS, type CombatStats, type Target, type TargetKind } from './combat';
import { DEFAULT_UPGRADES, EVENT_META, starsFor, type ChoiceOption, type EndStats, type MissionChoice, type MissionDef, type MissionEvent, type Upgrades } from './missions';
import { GENERIC_RADIO, RADIO, type Flags, type RadioCue } from './story';
import { makePuffTexture, makeRainTexture } from './textures';

export type { CombatStats } from './combat';
export type { NavyState } from './pirates';

/* ------------------------------------------------------------------ types */

export type ContactType =
  | 'pirate'
  | 'mothership'
  | 'navy'
  | 'fort'
  | 'rock'
  | 'ice'
  | 'mine'
  | 'drift'
  | 'reef'
  | 'traffic'
  | 'fishing'
  | 'whale'
  | 'storm'
  | 'wp'
  | 'port'
  | 'raft';
export interface Contact {
  x: number;
  y: number;
  type: ContactType;
}

export type MarkerType = 'wp' | 'port' | 'pirate' | 'mothership' | 'navy' | 'fort' | 'whale' | 'raft' | 'storm';
export interface Marker {
  id: string;
  type: MarkerType;
  nx: number;
  ny: number;
  onScreen: boolean;
  dist: number;
  bearing: number;
  label: string;
}

export interface Task {
  id: string;
  label: string;
  done: boolean;
  failed: boolean;
  active: boolean;
  optional: boolean;
}

export type ObjectiveKind = 'nav' | 'combat' | 'storm' | 'rescue' | 'dock' | 'hazard' | 'wildlife';
export interface Objective {
  title: string;
  detail: string;
  kind: ObjectiveKind;
  urgent: boolean;
}

export interface Telemetry {
  speed: number;
  maxSpeed: number;
  throttle: number;
  rudder: number;
  heading: number;
  hull: number;
  fuel: number;
  cargo: number;
  progress: number;
  distanceToGo: number;
  eta: number;
  elapsed: number;
  seaState: number;
  wind: number;
  weather: string;
  inStorm: boolean;
  piratesNear: number;
  risk: string | null;
  keelClearance: number;
  flareCd: number;
  flareMax: number;
  boosting: boolean;
  contacts: Contact[];
  radarRange: number;
  camera: string;
  docking: boolean;
  speedOk: boolean;
  wave: number;
  damageFlash: number;
  intro: boolean;
  objective: Objective;
  tasks: Task[];
  markers: Marker[];
  bonus: number;
  missionTitle: string;
  missionCode: string;
  hasPirates: boolean;
  hoseOn: boolean;
  hosePressure: number;
  navyState: NavyState;
  navyEta: number;
  chain: number;
  chainT: number;
  fouled: number;
  slowmo: boolean;
  choiceLeft: number;
  /** action layer: currently selected weapon */
  weapon: string;
  weaponShort: string;
  weaponHint: string;
  weaponCooldown: number;
  weaponHeat: number;
  weaponOverheated: boolean;
  weaponSlot: number;
  /** per-slot reload state (0..1) for the weapon dock */
  weaponCds: number[];
  /** VLS missile status */
  missiles: number;
  maxMissiles: number;
  /** seeker lock 0..1 (1 = locked) */
  lock: number;
  locked: boolean;
  /** soft aim-assist: crosshair is over a valid target */
  aimOnTarget: boolean;
  aimKind: string | null;
  aimDist: number;
  /** live shells — used by the HUD tracer gauge */
  shellsInFlight: number;
  /** combat tallies accumulated this voyage */
  combat: CombatStats;
}

export type AlertKind = 'info' | 'warn' | 'danger' | 'good';
export interface Toast {
  id: number;
  text: string;
  kind: AlertKind;
}
export interface Banner {
  id: number;
  title: string;
  sub: string;
  kind: AlertKind;
}
export interface Popup {
  id: number;
  text: string;
  kind: AlertKind;
}
export interface RadioMsg {
  id: number;
  speaker: string;
  text: string;
}
export interface ActiveChoice {
  id: string;
  speaker: string;
  text: string;
  options: ChoiceOption[];
  total: number;
}

export interface GameCallbacks {
  onTelemetry: (t: Telemetry) => void;
  onToast: (t: Toast) => void;
  onBanner: (b: Banner) => void;
  onPopup: (p: Popup) => void;
  onEnd: (s: EndStats) => void;
  onRadio: (r: RadioMsg) => void;
  onChoice: (c: ActiveChoice | null) => void;
}

interface Hazard {
  obj: THREE.Object3D;
  pos: THREE.Vector2;
  radius: number;
  kind: 'rock' | 'ice' | 'mine' | 'drift' | 'reef';
  alive: boolean;
  cd: number;
  drift?: THREE.Vector2;
  phase: number;
  near: number;
  hit: boolean;
  tracking: boolean;
  sink: number;
}
interface Storm {
  pos: THREE.Vector2;
  radius: number;
  drift: THREE.Vector2;
  intensity: number;
  cloud: THREE.Points;
  disc: THREE.Mesh;
  entered: boolean;
  eventId: string;
}
interface Raft {
  obj: THREE.Group;
  pos: THREE.Vector2;
  timer: number;
  rescued: boolean;
  smokeCd: number;
}
interface Bobber {
  obj: THREE.Object3D;
  x: number;
  z: number;
  phase: number;
  lamp: THREE.Sprite | null;
  period: number;
}
interface RuntimeEvent extends MissionEvent {
  id: string;
  fired: boolean;
  done: boolean;
  failed: boolean;
  skipped: boolean;
  mark: number;
}
interface LiveCue extends RadioCue {
  used: boolean;
}
interface LiveChoice extends MissionChoice {
  fired: boolean;
}

/* --------------------------------------------------------------- helpers */

const CAMERA_MODES = ['CHASE', 'BRIDGE', 'CINEMATIC', 'OVERHEAD', 'FREE'];
const BASE_MAX_SPEED = 26;
const KN = 1.94384 * 0.52;
const DOCK_SPEED = 8.5;
const RESCUE_SPEED = 10;
const INTRO_LEN = 4.2;
const CHOICE_TIME = 15;
const HULL_PTS: [number, number][] = [
  [74, 7],
  [46, 11.5],
  [10, 12.5],
  [-26, 12.5],
  [-58, 11],
  [-76, 8],
];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fmtDist(d: number) {
  return d >= 1000 ? `${(d / 1000).toFixed(2)} km` : `${d.toFixed(0)} m`;
}
function normDeg(d: number) {
  let x = d % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}

/* ------------------------------------------------------------------ game */

export class Game {
  /* surface shared with the pirate / traffic / wildlife systems */
  ocean!: Ocean;
  world = new THREE.Group();
  audio = new GameAudio();
  pos = new THREE.Vector2(0, 0);
  heading = 0;
  speed = 0;
  rudder = 0;
  env = 0;
  inStorm = false;
  spray!: ParticleField;
  debris!: ParticleField;
  wake!: ParticleField;
  paused = true;
  finished = false;

  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private smoke!: ParticleField;
  private funnelTop: THREE.Object3D | null = null;
  private nightLights: THREE.Sprite[] = [];
  private sun = new THREE.Vector3();
  private dirLight = new THREE.DirectionalLight(0xfff2dd, 3.2);
  private hemi = new THREE.HemisphereLight(0x9fc4e0, 0x0a1a24, 0.18);
  private shipTmp = new THREE.Vector3();
  private clock = new THREE.Clock();
  private fog = new THREE.FogExp2(0x9fc4e0, 0.00016);
  private shipYaw = new THREE.Group();
  private shipTilt = new THREE.Group();
  private radarBar: THREE.Object3D | null = null;
  private rain: THREE.Points;
  private rainVel!: Float32Array;
  private rainBase!: Float32Array;
  private puffTex: THREE.Texture;

  private hazards: Hazard[] = [];
  private storms: Storm[] = [];
  private raft: Raft | null = null;
  private events: RuntimeEvent[] = [];
  private waypoints: THREE.Vector2[] = [];
  private wpIndex = 1;
  private pillar: THREE.Mesh | null = null;
  private ring: WaypointRing | null = null;
  private wpBuoy: Bobber | null = null;
  private bobbers: Bobber[] = [];
  private pirates: PirateSystem;
  private traffic: TrafficSystem;
  private wildlife: WildlifeSystem;
  private combat: CombatSystem;
  private combatTargets = new Map<string, Target>();
  private gunMounts: THREE.Object3D[] = [];
  private ciws: THREE.Object3D | null = null;
  private muzzleTimer = 0;

  private cbs: GameCallbacks;
  private mission: MissionDef | null = null;
  private routeLength = 1;
  private worldCenter = new THREE.Vector2();
  private lowSpec: boolean;
  private baseFov = 58;
  private flags: Flags = {};
  private choiceFlags: Record<string, string> = {};
  private cues: LiveCue[] = [];
  private choices: LiveChoice[] = [];
  private activeChoice: (LiveChoice & { timeLeft: number }) | null = null;
  private timeScale = 1;
  private genericCd: Record<string, number> = {};
  private startCue = 0;
  private navyEta = 38;

  // upgrades
  private up: Upgrades = { ...DEFAULT_UPGRADES };
  private maxSpeed = BASE_MAX_SPEED;
  private dmgMul = 1;
  private stormMul = 1;
  private flareMax = 16;
  private flareRange = 420;
  private radarRange = 2400;

  // ship state
  private throttle = 0;
  private throttleTarget = 0;
  private rudderTarget = 0;
  private hull = 100;
  private fuel = 100;
  private cargo = 100;
  private boosting = false;
  private elapsed = 0;
  private fouledT = 0;

  // environment
  private weatherBase = 0;
  private stormFactor = 0;
  private fogExtra = 0;
  private fogTarget = 0;
  private shake = 0;
  private flash = 0;
  private lightningTimer = 4;
  private wavePhase = 0;

  // gameplay & scoring
  private flareCd = 0;
  private collideCd = 0;
  private keel = 46;
  private risk: string | null = null;
  private docking = false;
  private toastCd = 0;
  private bonusEarned = 0;
  private bonusLog: string[] = [];
  private fines = 0;
  private closeCalls = 0;
  private attacksRepelled = 0;
  private rescuedCount = 0;
  private groundings = 0;
  private fouledDuring = false;
  private damageFlash = 0;
  private introTimer = 0;
  private lowHullSaid = false;
  private dockSaid = false;
  private chain = 1;
  private chainProgress = 0;
  private chainTimer = 0;
  private maxChain = 1;

  private telemetryAcc = 0;
  /* adaptive quality: 0 battery-saver → 3 full detail */
  private quality = 3;
  private qualityLocked: number | null = null;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private adaptCd = 4;
  private camMode = 0;
  private camModeManual = false;
  private camYaw = 0;
  private camPitch = -0.3;
  private camTargetYaw = 0;
  private camTargetPitch = -0.3;
  private camDist = 300;
  private camTargetDist = 300;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camDragging = false;
  private camLastX = 0;
  private camLastY = 0;
  private camTouchDist = 0;
  private camTouchCount = 0;
  private keys: Record<string, boolean> = {};
  private disposed = false;
  private idCounter = 1;
  private tmpV3 = new THREE.Vector3();

  /* crosshair aim + click-to-fire (desktop). The reticle raycasts onto the sea plane. */
  private aimNdc = new THREE.Vector2(0.14, -0.04);
  private aimAge = 99;
  private hasFinePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
  private raycaster = new THREE.Raycaster();
  private mouseDownAt = 0;
  private mouseDownX = 0;
  private mouseDownY = 0;
  private mouseDragged = false;

  constructor(container: HTMLElement, cbs: GameCallbacks) {
    this.container = container;
    this.cbs = cbs;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    this.lowSpec = coarse || container.clientWidth < 900;

    // render straight to the drawing buffer: hardware MSAA keeps edges crisp and there is no
    // full-screen post pass left to soften the image or burn battery
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.78;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (!this.lowSpec) this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(58, container.clientWidth / container.clientHeight, 1, 60000);
    this.camera.position.set(-160, 55, 0);
    this.camera.layers.enable(SURFACE_LAYER);
    this.applyFov();

    this.scene.fog = this.fog;
    this.scene.add(this.hemi);
    this.dirLight.position.set(-200, 180, 120);
    if (!this.lowSpec) {
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.set(2048, 2048);
      const sc = this.dirLight.shadow.camera;
      sc.left = -150;
      sc.right = 150;
      sc.top = 150;
      sc.bottom = -150;
      sc.near = 10;
      sc.far = 1600;
      this.dirLight.shadow.bias = -0.0004;
      this.dirLight.shadow.normalBias = 0.9;
    }
    this.scene.add(this.dirLight, this.dirLight.target);
    this.scene.add(this.world);

    this.puffTex = makePuffTexture();
    this.wake = new ParticleField(this.lowSpec ? 400 : 700, this.puffTex, 0xe8f4ff, false);
    this.spray = new ParticleField(this.lowSpec ? 450 : 800, this.puffTex, 0xdff0ff, false);
    this.debris = new ParticleField(400, this.puffTex, 0xffb26b, true);
    this.smoke = new ParticleField(this.lowSpec ? 60 : 120, this.puffTex, 0xdddddd, false);
    this.scene.add(this.wake.points, this.spray.points, this.debris.points, this.smoke.points);

    this.rain = this.buildRain(this.lowSpec ? 1100 : 2200);
    this.scene.add(this.rain);

    this.ocean = new Ocean(this.renderer, this.scene, this.fog.color, this.lowSpec);

    this.applyQuality();

    this.pirates = new PirateSystem(this);
    this.traffic = new TrafficSystem(this);
    this.wildlife = new WildlifeSystem(this);
    this.combat = new CombatSystem(this);

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.handlePointerUp);
    this.renderer.domElement.addEventListener('wheel', this.handleWheel, { passive: false });
    this.renderer.domElement.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.renderer.domElement.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.renderer.domElement.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    this.renderer.setAnimationLoop(this.loop);
  }

  /* ------------------------------------------------------------- setup -- */

  private applyFov() {
    const aspect = this.camera.aspect;
    this.baseFov = aspect < 0.9 ? 80 : aspect < 1.4 ? 68 : 58;
  }

  /**
   * Render-scale / feature level. Dropping a level shrinks the drawing buffer and then
   * sheds the two most expensive features (planar ship reflections, then shadows), which
   * keeps the frame rate stable on phones and old laptops.
   */
  private applyQuality() {
    const dpr = window.devicePixelRatio || 1;
    const scale = [0.7, 0.85, 1.0, Math.min(dpr, 1.75)][this.quality] ?? 1;
    this.renderer.setPixelRatio(Math.max(0.6, Math.min(dpr, scale * Math.max(1, Math.min(dpr, 1.25)))));
    this.handleResize();
    const reflections = this.quality >= 2 && !this.lowSpec;
    this.ocean.setReflections(reflections);
    const shadows = this.quality >= 2 && !this.lowSpec;
    if (this.dirLight.castShadow !== shadows) {
      this.dirLight.castShadow = shadows;
      for (const m of allWindowMaterials()) m.needsUpdate = true;
    }
  }

  /** Manual override from the pause menu; null returns control to the auto-tuner. */
  setQuality(q: number | null) {
    this.qualityLocked = q;
    if (q !== null && q !== this.quality) {
      this.quality = q;
      this.applyQuality();
    }
    this.adaptCd = 8;
  }

  getQuality() {
    return this.qualityLocked ?? this.quality;
  }

  private autoTune(rawDt: number) {
    this.fpsAcc += rawDt;
    this.fpsFrames++;
    this.adaptCd -= rawDt;
    if (this.fpsAcc < 1.25) return;
    const fps = this.fpsFrames / this.fpsAcc;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    if (this.adaptCd > 0 || this.qualityLocked !== null) return;
    if (fps < 42 && this.quality > 0) {
      this.quality--;
      this.applyQuality();
      this.adaptCd = 5;
      this.toast('Graphics adjusted to keep the game smooth.', 'info');
    } else if (fps > 57 && this.quality < 3) {
      this.quality++;
      this.applyQuality();
      this.adaptCd = 8;
    }
  }

  private buildRain(n: number) {
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n);
    const base = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      base[i * 3] = (Math.random() - 0.5) * 420;
      base[i * 3 + 1] = Math.random() * 200;
      base[i * 3 + 2] = (Math.random() - 0.5) * 420;
      vel[i] = 130 + Math.random() * 120;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainVel = vel;
    this.rainBase = base;
    const p = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: makeRainTexture(),
        size: 7,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: 0xcfe2ff,
      })
    );
    p.frustumCulled = false;
    p.visible = false;
    return p;
  }

  private clearWorld() {
    this.traffic.clear();
    this.wildlife.clear();
    this.world.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
      for (const mm of mats) if (!SHARED.has(mm)) mm.dispose();
    });
    this.scene.remove(this.world);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.hazards = [];
    this.storms = [];
    this.raft = null;
    this.events = [];
    this.bobbers = [];
    this.pillar = null;
    this.ring = null;
    this.wpBuoy = null;
    this.shipYaw = new THREE.Group();
    this.shipTilt = new THREE.Group();
  }

  loadMission(mission: MissionDef, upgrades?: Upgrades, flags?: Flags) {
    this.mission = mission;
    this.flags = { ...(flags ?? {}) };
    this.choiceFlags = {};
    this.up = { ...(upgrades ?? this.up) };
    this.maxSpeed = BASE_MAX_SPEED * (1 + 0.06 * this.up.engine);
    this.dmgMul = 1 - 0.14 * this.up.hull;
    this.stormMul = 1 - 0.22 * this.up.stab;
    this.flareMax = 16 - 3 * this.up.lrad;
    this.flareRange = 420 + 90 * this.up.lrad;
    this.radarRange = 2400 + 700 * this.up.radar;
    this.navyEta = this.flags.navy === 'tell' ? 20 : 36;

    this.finished = false;
    this.paused = true;
    this.hull = 100;
    this.fuel = 100;
    this.cargo = 100;
    this.elapsed = 0;
    this.speed = 0;
    this.throttle = 0.42;
    this.throttleTarget = 0.42;
    this.rudder = 0;
    this.rudderTarget = 0;
    this.wpIndex = 1;
    this.flareCd = 0;
    this.heading = 0;
    this.camMode = 0;
    this.docking = false;
    this.bonusEarned = 0;
    this.bonusLog = [];
    this.fines = 0;
    this.closeCalls = 0;
    this.attacksRepelled = 0;
    this.rescuedCount = 0;
    this.groundings = 0;
    this.fouledDuring = false;
    this.fouledT = 0;
    this.damageFlash = 0;
    this.fogExtra = 0;
    this.fogTarget = 0;
    this.stormFactor = 0;
    this.inStorm = false;
    this.introTimer = 0;
    this.lowHullSaid = false;
    this.dockSaid = false;
    this.chain = 1;
    this.chainProgress = 0;
    this.chainTimer = 0;
    this.maxChain = 1;
    this.keys = {};
    this.genericCd = {};
    this.activeChoice = null;
    this.timeScale = 1;
    this.startCue = 0;
    this.weatherBase =
      mission.weather === 'storm' ? 0.8 : mission.weather === 'rough' ? 0.45 : mission.weather === 'overcast' ? 0.22 : 0.02;
    this.env = this.weatherBase;

    this.clearWorld();
    this.pirates.reset(mission.events.some((e) => e.kind === 'pirates' || e.kind === 'hunt'));
    this.combat.reset();
    this.combat.setAmmo(6 + this.up.vls * 4);
    this.combatTargets.clear();
    this.aimAge = 99;
    const R = rng(mission.id * 7919 + 17);

    // radio script and mid-voyage decisions
    this.cues = mission.kind === 'story' ? (RADIO[mission.id] ?? []).map((c) => ({ ...c, used: false })) : [];
    this.choices = (mission.choices ?? []).map((c) => ({ ...c, fired: false }));

    // ship
    const model = buildContainerShip('Aurora Trader');
    this.radarBar = model.radarBar;
    this.funnelTop = model.funnelTop;
    this.nightLights = model.nightLights;
    this.gunMounts = model.gunMounts ?? [];
    this.ciws = model.ciwsTurret ?? null;
    this.shipTilt.add(model.group);
    this.shipYaw.add(this.shipTilt);
    this.world.add(this.shipYaw);

    // route
    const dist = mission.distanceKm * 1000;
    const pts: THREE.Vector2[] = [];
    const legs = Math.max(5, Math.round(dist / 1100));
    const amp = 240 + mission.obstacleDensity * 260;
    const ph = R() * Math.PI * 2;
    const ph2 = R() * Math.PI * 2;
    for (let i = 0; i <= legs; i++) {
      const t = i / legs;
      const z = i === 0 || i === legs ? 0 : Math.sin(t * Math.PI * 1.6 + ph) * amp + Math.sin(t * Math.PI * 3.1 + ph2) * amp * 0.35;
      pts.push(new THREE.Vector2(t * dist, z));
    }
    this.waypoints = pts;
    this.routeLength = dist;
    this.worldCenter.set(dist / 2, 0);

    const linePts: THREE.Vector3[] = [];
    for (let i = 0; i <= legs * 8; i++) {
      const p = this.routePoint(i / (legs * 8));
      linePts.push(new THREE.Vector3(p.x, 1.5, p.y));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(linePts),
      new THREE.LineDashedMaterial({ color: 0x4fd1ff, dashSize: 40, gapSize: 30, transparent: true, opacity: 0.25 })
    );
    line.computeLineDistances();
    line.layers.set(SURFACE_LAYER);
    this.world.add(line);

    // waypoint: safe-water buoy, sea ring and a faint locator beam
    this.ring = buildWaypointRing(this.ocean);
    this.world.add(this.ring.mesh);
    this.pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 4, 160, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x63e6ff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.pillar.layers.set(SURFACE_LAYER);
    this.world.add(this.pillar);
    this.wpBuoy = this.addBuoy('safe', 0, 0, 1.2);

    // ports with lit channel marks
    const start = buildPort(0.9);
    start.position.set(pts[0].x - 20, 0, pts[0].y - 140);
    start.rotation.y = -Math.PI / 2;
    this.world.add(start);
    const end = buildPort(1);
    end.position.set(pts[pts.length - 1].x + 20, 0, pts[pts.length - 1].y + 140);
    end.rotation.y = Math.PI / 2;
    this.world.add(end);
    for (const x of [320, 680, dist - 680, dist - 320]) {
      const c = this.routePoint(x / dist);
      this.addBuoy('port', x, c.y - 110);
      this.addBuoy('starboard', x, c.y + 110);
    }

    // distant headlands
    for (let i = 0; i < 6; i++) {
      const c = this.routePoint(0.1 + R() * 0.8);
      const rock = buildRock(3 + R() * 2.5);
      rock.position.set(c.x, 0, c.y + (R() < 0.5 ? -1 : 1) * (1700 + R() * 900));
      this.world.add(rock);
    }

    // ambient hazards off the track
    const count = Math.round(6 + mission.obstacleDensity * 14);
    for (let i = 0; i < count; i++) {
      const c = this.routePoint(0.1 + R() * 0.8);
      let lat = (R() - 0.5) * 1400;
      if (Math.abs(lat) < 80) lat += Math.sign(lat || 1) * 140;
      if (R() < 0.45) this.addRock(c.x, c.y + lat, 0.8 + R() * 0.9);
      else this.addDrift(c.x, c.y + lat, R);
    }
    if (mission.obstacleDensity > 0.55) {
      const c = this.routePoint(0.3 + R() * 0.4);
      const r = 160 + R() * 60;
      this.addReef(c.x, c.y + (R() < 0.5 ? -1 : 1) * (r + 260), r);
    }

    // traffic separation scheme: same-direction lane to starboard, opposing lane to port
    for (let i = 0; i < mission.traffic; i++) {
      const c = this.routePoint(0.12 + R() * 0.76);
      const same = R() < 0.5;
      this.traffic.addMerchant(new THREE.Vector2(c.x, c.y + (same ? 620 : -640) + (R() - 0.5) * 160), (same ? 0 : Math.PI) + (R() - 0.5) * 0.1, 6.5 + R() * 4);
    }

    this.events = mission.events
      .slice()
      .sort((a, b) => a.at - b.at)
      .map((e, i) => ({ ...e, id: `${e.kind}-${i}`, fired: false, done: false, failed: false, skipped: false, mark: 0 }));

    this.pos.set(0, 0);
    this.shipYaw.position.set(0, 0, 0);
    this.camPos.set(-250, 80, 30);
    this.camLook.set(60, 18, 0);
    this.ocean.wake.reset();
    this.setEnvironment();
    this.updateEnvironment(1);
    this.placeWaypoint();
  }

  /** Begin the voyage: cinematic fly-in, then hand over control. */
  start() {
    this.introTimer = INTRO_LEN;
    this.camMode = 0;
    this.startCue = INTRO_LEN + 0.6;
    this.setPaused(false);
    const m = this.mission!;
    this.banner(m.title.toUpperCase(), `${m.from}  →  ${m.to}  ·  ${m.cargoDesc}`, 'info');
  }

  private routePoint(t: number): THREE.Vector2 {
    const pts = this.waypoints;
    const n = pts.length;
    const f = THREE.MathUtils.clamp(t, 0, 1) * (n - 1);
    const i = Math.min(n - 2, Math.floor(f));
    const k = f - i;
    return new THREE.Vector2(pts[i].x + (pts[i + 1].x - pts[i].x) * k, pts[i].y + (pts[i + 1].y - pts[i].y) * k);
  }

  private progress() {
    return THREE.MathUtils.clamp(this.pos.x / this.routeLength, 0, 1);
  }

  private placeWaypoint() {
    const n = this.waypoints.length;
    const final = this.wpIndex >= n - 1;
    const wp = this.waypoints[Math.min(this.wpIndex, n - 1)];
    const col = final ? 0xffd166 : 0x63e6ff;
    this.ring?.set(wp.x, wp.y, col);
    if (this.pillar) {
      this.pillar.position.set(wp.x, 80, wp.y);
      (this.pillar.material as THREE.MeshBasicMaterial).color.setHex(col);
    }
    if (this.wpBuoy) {
      this.wpBuoy.x = wp.x;
      this.wpBuoy.z = wp.y - 48;
      this.wpBuoy.obj.visible = !final;
    }
  }

  private addBuoy(kind: BuoyKind, x: number, z: number, scale = 1): Bobber {
    const b = buildBuoy(kind, scale);
    b.group.position.set(x, 0, z);
    this.world.add(b.group);
    const bob: Bobber = { obj: b.group, x, z, phase: Math.random() * 6, lamp: b.lamp, period: kind === 'safe' ? 6 : kind === 'cardinal' ? 1.2 : 4 };
    this.bobbers.push(bob);
    return bob;
  }

  private makeStorm(x: number, z: number, radius: number, intensity: number, eventId: string): Storm {
    const n = this.lowSpec ? 60 : 120;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.5 + Math.random() * 0.55);
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 60 + Math.random() * 190;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const cloud = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ map: this.puffTex, size: 230, transparent: true, opacity: 0.55, depthWrite: false, color: 0x262c33, sizeAttenuation: true })
    );
    cloud.frustumCulled = false;
    cloud.position.set(x, 0, z);
    this.world.add(cloud);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshBasicMaterial({ color: 0x1c2530, transparent: true, opacity: 0, depthWrite: false })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(x, 5, z);
    disc.scale.setScalar(radius);
    this.world.add(disc);
    const a = Math.random() * Math.PI * 2;
    return { pos: new THREE.Vector2(x, z), radius, drift: new THREE.Vector2(Math.cos(a) * 2.5, Math.sin(a) * 2.5), intensity, cloud, disc, entered: false, eventId };
  }

  private newHazard(obj: THREE.Object3D, x: number, z: number, radius: number, kind: Hazard['kind'], sink = 0): Hazard {
    obj.position.set(x, 0, z);
    this.world.add(obj);
    const h: Hazard = { obj, pos: new THREE.Vector2(x, z), radius, kind, alive: true, cd: 0, phase: Math.random() * 9, near: 9999, hit: false, tracking: false, sink };
    this.hazards.push(h);
    return h;
  }

  private addRock(x: number, z: number, s: number) {
    this.newHazard(buildRock(s), x, z, 26 * s * 1.2, 'rock');
  }
  private addIce(x: number, z: number, s: number, skirt = true) {
    this.newHazard(buildIceberg(s), x, z, 34 * s * 1.22, 'ice');
    if (skirt) this.world.add(buildIceSkirt(this.ocean, x, z, 34 * s * 1.5));
  }
  private addMine(x: number, z: number) {
    this.newHazard(buildMooredMine(), x, z, 7, 'mine', -0.75);
  }
  private addDrift(x: number, z: number, R: () => number) {
    const h = this.newHazard(buildDriftDebris(Math.floor(R() * 1000)), x, z, 9, 'drift', -1.15);
    h.drift = new THREE.Vector2((R() - 0.5) * 1.6, (R() - 0.5) * 1.6);
  }
  private addReef(x: number, z: number, r: number) {
    const g = buildReef(this.ocean, x, z, r, Math.random() * 50);
    for (let k = 0; k < 3; k++) {
      const rock = buildRock(0.22 + Math.random() * 0.15);
      rock.position.set((Math.random() - 0.5) * r * 0.8, -1.4, (Math.random() - 0.5) * r * 0.8);
      g.add(rock);
    }
    this.world.add(g);
    this.hazards.push({ obj: g, pos: new THREE.Vector2(x, z), radius: r * 0.88, kind: 'reef', alive: true, cd: 0, phase: 0, near: 9999, hit: false, tracking: false, sink: 0 });
  }

  private setEnvironment() {
    const elev = Math.max(2, this.mission ? this.mission.sunElevation : 18);
    const phi = THREE.MathUtils.degToRad(90 - elev);
    const azimuth = 28 + (((this.mission?.id ?? 0) * 17) % 44);
    this.sun.setFromSphericalCoords(1, phi, THREE.MathUtils.degToRad(azimuth));
    this.ocean.setSun(this.sun, elev);
    this.dirLight.color.copy(this.ocean.sunColor);
    this.syncSunLight();
  }

  private syncSunLight() {
    const c = this.shipYaw.position;
    this.dirLight.target.position.set(c.x, 0, c.z);
    this.dirLight.target.updateMatrixWorld();
    this.dirLight.position.set(c.x + this.sun.x * 700, this.sun.y * 700, c.z + this.sun.z * 700);
  }

  private glowWindows() {
    const elev = this.mission ? this.mission.sunElevation : 20;
    const dark = THREE.MathUtils.clamp(this.env * 0.55 + (1 - elev / 24) * 0.55 + this.fogExtra * 0.2, 0, 1);
    for (const m of allWindowMaterials()) m.emissiveIntensity = 0.08 + dark * 1.5;
    for (const s of this.nightLights) s.material.opacity = Math.max(0, dark - 0.25) * 0.75;
  }

  /* ------------------------------------------------------------- input -- */

  setKey(code: string, down: boolean) {
    this.keys[code] = down;
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Equal', 'Minus', 'KeyR'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.setKey(e.code, true);
    if (e.code === 'KeyF') this.triggerFlare();
    if (e.code === 'Space' || e.code === 'KeyX' || e.code === 'KeyG') this.fireWeapon(false);
    if (e.code === 'KeyC') this.cycleCamera();
    if (e.code === 'KeyQ') this.cycleWeapon();
    if (e.code === 'KeyR') this.resetCamera();
    if (e.code === 'Equal' || e.code === 'NumpadAdd') this.zoomCamera(-50);
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.zoomCamera(50);
    if (e.code === 'KeyH') this.horn();
    if (e.code === 'KeyV') this.callNavy();
    if (this.activeChoice && (e.code === 'Digit1' || e.code === 'Digit2')) {
      const opt = this.activeChoice.options[e.code === 'Digit1' ? 0 : 1];
      if (opt) this.choose(this.activeChoice.id, opt.id);
    } else if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
      this.selectWeapon(Number(e.code.slice(-1)) - 1);
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.setKey(e.code, false);
    if (e.code === 'Space' || e.code === 'KeyX' || e.code === 'KeyG') this.combat.setHeld(false);
    if (e.code === 'ShiftLeft' && this.combat.weapon.kind !== 'ciws') this.combat.setHeld(false);
  };

  private handleBlur = () => {
    this.keys = {};
  };

  private handlePointerDown = (e: PointerEvent) => {
    this.audio.init();
    this.audio.resume();
    if (e.button === 0 && !this.paused) {
      this.camDragging = true;
      this.camLastX = e.clientX;
      this.camLastY = e.clientY;
      this.camTouchCount = 1;
      /* click-to-fire bookkeeping: a press only becomes camera-drag past a few px */
      this.mouseDownAt = performance.now();
      this.mouseDownX = e.clientX;
      this.mouseDownY = e.clientY;
      this.mouseDragged = false;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  };

  /** Keep the crosshair NDC up to date (fine pointers track even without buttons). */
  private trackAim(e: PointerEvent) {
    const r = this.container.getBoundingClientRect();
    if (r.width < 2) return;
    this.aimNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    this.aimAge = 0;
  }

  private handlePointerMove = (e: PointerEvent) => {
    this.trackAim(e);
    if (!this.camDragging || this.paused) return;
    if (!this.mouseDragged && Math.hypot(e.clientX - this.mouseDownX, e.clientY - this.mouseDownY) > 7) this.mouseDragged = true;
    const dx = e.clientX - this.camLastX;
    const dy = e.clientY - this.camLastY;
    this.camLastX = e.clientX;
    this.camLastY = e.clientY;
    this.camTargetYaw += dx * 0.005;
    this.camTargetPitch += dy * 0.003;
    this.camTargetPitch = THREE.MathUtils.clamp(this.camTargetPitch, -1.2, 0.2);
    if (!this.camModeManual) {
      this.camModeManual = true;
      if (this.camMode !== CAMERA_MODES.indexOf('FREE')) {
        this.camMode = CAMERA_MODES.indexOf('FREE');
        if (this.camMode < 0) this.camMode = CAMERA_MODES.length - 1;
        this.toast('Camera · FREE', 'info');
      }
    }
    e.preventDefault();
  };
  private handlePointerUp = (e: PointerEvent) => {
    this.camDragging = false;
    this.combat.setHeld(false);
    /* a clean short click (not a camera drag) fires the active weapon */
    if (e.button === 0 && !this.mouseDragged && !this.paused && e.pointerType === 'mouse' && performance.now() - this.mouseDownAt < 450) {
      this.fireWeapon(false);
    }
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    this.camTouchCount = 0;
    this.camTouchDist = 0;
  };
  private handleWheel = (e: WheelEvent) => {
    if (this.paused) return;
    const delta = e.deltaY * 0.001;
    this.camTargetDist += delta * 200;
    this.camTargetDist = THREE.MathUtils.clamp(this.camTargetDist, 80, 800);
    if (!this.camModeManual) {
      this.camModeManual = true;
      if (this.camMode !== CAMERA_MODES.indexOf('FREE')) {
        this.camMode = CAMERA_MODES.indexOf('FREE');
        if (this.camMode < 0) this.camMode = CAMERA_MODES.length - 1;
        this.toast('Camera · FREE', 'info');
      }
    }
    e.preventDefault();
  };
  private handleTouchStart = (e: TouchEvent) => {
    if (this.paused) return;
    if (e.touches.length === 1) {
      this.camDragging = true;
      this.camLastX = e.touches[0].clientX;
      this.camLastY = e.touches[0].clientY;
      this.camTouchCount = 1;
      this.camTouchDist = 0;
    } else if (e.touches.length === 2) {
      this.camDragging = true;
      this.camTouchCount = 2;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.camTouchDist = Math.hypot(dx, dy);
    }
    this.audio.init();
    this.audio.resume();
    e.preventDefault();
  };
  private handleTouchMove = (e: TouchEvent) => {
    if (!this.camDragging || this.paused) return;
    if (e.touches.length === 1 && this.camTouchCount === 1) {
      const dx = e.touches[0].clientX - this.camLastX;
      const dy = e.touches[0].clientY - this.camLastY;
      this.camLastX = e.touches[0].clientX;
      this.camLastY = e.touches[0].clientY;
      this.camTargetYaw += dx * 0.006;
      this.camTargetPitch += dy * 0.004;
      this.camTargetPitch = THREE.MathUtils.clamp(this.camTargetPitch, -1.2, 0.2);
    } else if (e.touches.length === 2 && this.camTouchCount === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (this.camTouchDist > 0) {
        const scale = this.camTouchDist / dist;
        this.camTargetDist *= scale;
        this.camTargetDist = THREE.MathUtils.clamp(this.camTargetDist, 80, 800);
      }
      this.camTouchDist = dist;
      if (!this.camModeManual) {
        this.camModeManual = true;
        if (this.camMode !== CAMERA_MODES.indexOf('FREE')) {
          this.camMode = CAMERA_MODES.indexOf('FREE');
          if (this.camMode < 0) this.camMode = CAMERA_MODES.length - 1;
          this.toast('Camera · FREE', 'info');
        }
      }
    }
    if (!this.camModeManual) {
      this.camModeManual = true;
      if (this.camMode !== CAMERA_MODES.indexOf('FREE')) {
        this.camMode = CAMERA_MODES.indexOf('FREE');
        if (this.camMode < 0) this.camMode = CAMERA_MODES.length - 1;
        this.toast('Camera · FREE', 'info');
      }
    }
    e.preventDefault();
  };
  private handleTouchEnd = (e: TouchEvent) => {
    this.camDragging = false;
    this.camTouchCount = 0;
    this.camTouchDist = 0;
    if (e.touches.length === 0) {
      this.camDragging = false;
    }
  };

  cycleCamera() {
    this.camModeManual = false;
    this.camMode = (this.camMode + 1) % CAMERA_MODES.length;
    const mode = CAMERA_MODES[this.camMode];
    if (mode === 'FREE') {
      this.camTargetYaw = this.camYaw;
      this.camTargetPitch = this.camPitch;
    }
    this.toast('Camera · ' + mode, 'info');
  }

  setCameraMode(i: number) {
    this.camModeManual = false;
    this.camMode = i % CAMERA_MODES.length;
    const mode = CAMERA_MODES[this.camMode];
    if (mode === 'FREE') {
      this.camTargetYaw = this.camYaw;
      this.camTargetPitch = this.camPitch;
    }
  }

  resetCamera() {
    this.camModeManual = false;
    this.camMode = CAMERA_MODES.indexOf('CHASE');
    if (this.camMode < 0) this.camMode = 0;
    this.camTargetDist = 300;
    this.camTargetYaw = 0;
    this.camTargetPitch = -0.25;
    this.toast('Camera reset', 'info');
  }

  zoomCamera(delta: number) {
    this.camTargetDist += delta;
    this.camTargetDist = THREE.MathUtils.clamp(this.camTargetDist, 80, 800);
    this.camModeManual = true;
    if (this.camMode !== CAMERA_MODES.indexOf('FREE')) {
      this.camMode = CAMERA_MODES.indexOf('FREE');
      if (this.camMode < 0) this.camMode = CAMERA_MODES.length - 1;
      this.toast('Camera · FREE', 'info');
    }
  }

  horn() {
    this.audio.init();
    this.audio.horn();
  }

  callNavy() {
    if (this.paused || this.finished) return;
    if (this.pirates.callNavy(this.navyEta)) {
      this.say('navy');
      this.popup(`NAVY HELICOPTER · ETA ${this.navyEta}s`, 'info');
    } else if (this.pirates.navyState === 'unavailable') {
      this.toast('No naval units in range on this passage.', 'info');
    }
  }

  triggerFlare() {
    if (this.flareCd > 0 || this.finished || this.paused) return;
    this.audio.init();
    this.audio.flare();
    this.flareCd = this.flareMax;
    const hit = this.pirates.lrad(this.flareRange);
    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 40;
      this.debris.spawn(this.pos.x - fx * 30, 22, this.pos.y - fy * 30, Math.cos(a) * r, 18 + Math.random() * 30, Math.sin(a) * r, 1.3, 5, 1);
    }
    if (hit > 0) {
      this.addBonus(Math.round(this.reward() * 0.008) * hit, `${hit} SKIFF${hit > 1 ? 'S' : ''} REPELLED`);
      this.audio.good();
    } else {
      this.toast('LRAD discharged — no hostile contacts inside range.', 'info');
    }
  }

  /* ---------------------------------------------------- action combat -- */

  get weaponSpecs() {
    return WEAPONS;
  }

  selectWeapon(i: number) {
    this.combat.selectWeapon(i);
  }

  cycleWeapon() {
    this.combat.cycleWeapon();
  }

  /** Fire the active weapon. `held` keeps CIWS firing while the trigger is down. */
  fireWeapon(held: boolean) {
    if (this.paused || this.finished) return;
    this.combat.setHeld(held);
    if (held) return;
    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);
    const w = this.combat.weapon;
    /* muzzle per mount: deck gun on the bow wings, CIWS atop the bridge, VLS just aft of it */
    let mx: number;
    let my = 20;
    let mz: number;
    if (w.kind === 'ciws') {
      mx = this.pos.x - fx * 30;
      mz = this.pos.y - fy * 30;
      my = 30;
    } else if (w.kind === 'missile') {
      mx = this.pos.x + fx * 40;
      mz = this.pos.y + fy * 40;
      my = 12;
    } else {
      const side = Math.floor(performance.now() / 90) % 2 === 0 ? 1 : -1;
      mx = this.pos.x + fx * 58 - fy * side * 11.5;
      mz = this.pos.y + fy * 58 + fx * side * 11.5;
    }
    const launched = this.combat.fire(mx, my, mz, this.heading);
    if (launched === 0 && this.combat.overheated) this.toast('Barrel overheated — she is cooling.', 'warn');
    else if (launched > 0) {
      this.muzzleTimer = 0.08;
      this.audio.init();
      if (w.kind !== 'missile') this.say('firing');
    }
  }

  get combatTallies(): CombatStats {
    return this.combat.stats;
  }

  /** Hostile just destroyed by the deck guns — stop its AI and log the kill. */
  killTarget(key: string, kind: TargetKind) {
    if (kind === 'skiff') this.pirates.sinkSkiff(key);
    else this.pirates.sinkDhow(key);
  }

  choose(id: string, option: string) {
    if (!this.activeChoice || this.activeChoice.id !== id) return;
    this.activeChoice = null;
    this.cbs.onChoice(null);
    if (id === 'kestrel_offer') {
      if (option === 'comply') {
        this.choiceFlags.gaveBox = 'yes';
        this.cargo = Math.max(11, this.cargo - 12);
        for (const e of this.events)
          if (e.kind === 'pirates' && !e.fired) {
            e.fired = true;
            e.skipped = true;
          }
        this.banner('CONTAINER JETTISONED', 'Bay four is empty. The skiffs stay home — for now.', 'warn');
        this.say('choice_comply');
      } else {
        this.choiceFlags.gaveBox = 'no';
        this.say('choice_refuse');
      }
    }
  }

  /* --------------------------------------------------------- messaging -- */

  toast(text: string, kind: AlertKind) {
    this.cbs.onToast({ id: this.idCounter++, text, kind });
  }
  banner(title: string, sub: string, kind: AlertKind) {
    this.cbs.onBanner({ id: this.idCounter++, title, sub, kind });
  }
  popup(text: string, kind: AlertKind) {
    this.cbs.onPopup({ id: this.idCounter++, text, kind });
  }
  reward() {
    return this.mission?.reward ?? 300000;
  }

  /** A seamanship award; feeds and is multiplied by the chain. */
  addBonus(amount: number, label: string) {
    const mult = 1 + (this.chain - 1) * 0.25;
    const total = Math.round(amount * mult);
    this.bonusEarned += total;
    this.bonusLog.push(`${label} +$${total.toLocaleString()}${this.chain > 1 ? ` (×${mult.toFixed(2)})` : ''}`);
    this.popup(`${label}  +$${total.toLocaleString()}`, 'good');
    this.chainProgress += 0.55;
    if (this.chainProgress >= 1 && this.chain < 5) {
      this.chain++;
      this.chainProgress = 0;
      this.maxChain = Math.max(this.maxChain, this.chain);
      this.popup(`CHAIN ×${(1 + (this.chain - 1) * 0.25).toFixed(2)}`, 'info');
    }
    this.chainTimer = 24;
  }

  fine(amount: number, label: string) {
    this.fines += amount;
    this.bonusLog.push(`${label} −$${amount.toLocaleString()}`);
    this.popup(`${label}  −$${amount.toLocaleString()}`, 'danger');
    this.chain = 1;
    this.chainProgress = 0;
  }

  say(trigger: string) {
    if (!this.mission) return;
    const cue = this.cues.find((c) => !c.used && c.on === trigger && (!c.if || c.if(this.flags)));
    if (cue) {
      cue.used = true;
      this.radio(cue.speaker, cue.text);
      return;
    }
    if (this.elapsed - (this.genericCd[trigger] ?? -999) < 25) return;
    const pool = GENERIC_RADIO[trigger];
    if (!pool) return;
    this.genericCd[trigger] = this.elapsed;
    const l = pool[Math.floor(Math.random() * pool.length)];
    this.radio(l.speaker, l.text);
  }

  private radio(speaker: string, text: string) {
    this.audio.squelch();
    this.cbs.onRadio({ id: this.idCounter++, speaker, text });
  }

  /** Damage from any source. Big hits break the chain. */
  hurt(hull: number, cargo: number, shake: number) {
    if (this.finished) return;
    const hd = hull * this.dmgMul;
    this.hull = Math.max(0, this.hull - hd);
    this.cargo = Math.max(0, this.cargo - cargo);
    this.shake = Math.max(this.shake, shake);
    this.damageFlash = Math.max(this.damageFlash, Math.min(1, 0.15 + hd * 0.035));
    if (hd >= 6) {
      if (this.chain > 1) this.popup('CHAIN BROKEN', 'danger');
      this.chain = 1;
      this.chainProgress = 0;
      this.say('damage');
    }
    if (this.hull < 30 && !this.lowHullSaid) {
      this.lowHullSaid = true;
      this.say('lowHull');
    }
    if (this.hull <= 0) this.endMission(false, 'The ship foundered — all hands took to the boats.');
    else if (this.cargo <= 10) this.endMission(false, 'Cargo integrity lost — charter cancelled.');
  }

  shipImpact(x: number, z: number, strength: number, name: string) {
    if (this.collideCd > 0) return;
    this.collideCd = 0.8;
    const dmg = (12 + Math.abs(this.speed) * 0.6) * strength;
    this.speed *= 0.5;
    const a = Math.atan2(this.pos.y - z, this.pos.x - x);
    this.pos.x += Math.cos(a) * 14 * strength;
    this.pos.y += Math.sin(a) * 14 * strength;
    this.toast(`Collision with ${name}!`, 'danger');
    this.audio.impact(Math.min(2.2, dmg / 12));
    this.hurt(dmg, dmg * 0.5, Math.min(1.4, 0.5 + dmg * 0.03));
  }

  closeCall() {
    this.closeCalls++;
    this.addBonus(1500 + Math.round(Math.abs(this.speed) * 110), 'CLOSE CALL');
    this.audio.good();
  }

  fouled(name: string) {
    this.fouledT = 16;
    this.fouledDuring = true;
    this.banner('PROPELLER FOULED', `${name}'s net is wrapped round the shaft — revs limited`, 'danger');
    this.say('netFouled');
    this.fine(8000, 'NET DAMAGES');
    this.audio.impact(0.6);
  }

  /* -------------------------------------------------------------- loop -- */

  private handleResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.applyFov();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  setPaused(p: boolean) {
    this.paused = p;
    if (!p) {
      this.audio.init();
      this.audio.resume();
      this.clock.getDelta();
    } else {
      this.audio.update(0, 0, 0);
      this.audio.setHose(false);
      this.audio.setHeli(0);
      this.keys = {};
    }
  }

  private loop = () => {
    const raw = this.clock.getDelta();
    const dt = Math.min(0.05, raw);
    this.autoTune(raw);
    if (!this.paused && !this.finished) this.update(dt);
    else this.idleUpdate(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private settleShip(k: number, speedRatio = 0, rudder = 0) {
    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);
    const px = this.pos.x;
    const py = this.pos.y;
    const h = (a: number, b: number) => this.ocean.height(px + fx * a - fy * b, py + fy * a + fx * b, 40);
    const hC = h(0, 0);
    const hB = h(62, 0);
    const hS = h(-62, 0);
    const hP = h(0, -12);
    const hSt = h(0, 12);
    const stab = 1 - 0.15 * this.up.stab;
    const pitch = THREE.MathUtils.clamp(Math.atan2(hB - hS, 124), -0.13, 0.13) * stab;
    const roll = (THREE.MathUtils.clamp(Math.atan2(hSt - hP, 24), -0.2, 0.2) * 0.9 + rudder * speedRatio * 0.1) * stab;
    this.shipTilt.rotation.x = THREE.MathUtils.lerp(this.shipTilt.rotation.x, -roll, k);
    this.shipTilt.rotation.z = THREE.MathUtils.lerp(this.shipTilt.rotation.z, pitch, k);
    this.shipTilt.position.y = THREE.MathUtils.lerp(this.shipTilt.position.y, (hC + hB + hS + hP + hSt) / 5, k * 1.2);
  }

  private updateSmoke(dt: number) {
    if (this.funnelTop && Math.random() < dt * (this.paused ? 6 : 10)) {
      this.funnelTop.getWorldPosition(this.shipTmp);
      const burn = 0.4 + Math.max(0, this.throttle) * 0.5;
      const speed = Math.abs(this.speed) / this.maxSpeed;
      this.smoke.spawn(
        this.shipTmp.x + (Math.random() - 0.5) * 1.5,
        this.shipTmp.y + 1,
        this.shipTmp.z + (Math.random() - 0.5) * 1.5,
        (-2 - this.env * 3 - speed * 2) + (Math.random() - 0.5) * 1,
        (2 + Math.random() * 1.5 * burn + speed * 1.5),
        (1 + (Math.random() - 0.5) * 1),
        (1.5 + Math.random() * 0.8),   // shorter lifetime
        (2.5 + Math.random() * 1.0),   // smaller size
        (0.08 * Math.min(1, burn))   // lower opacity
      );
    }
    this.smoke.update(dt, 0.08, 0.9);
  }

  private updateBobbers() {
    const t = this.wavePhase;
    const now = performance.now() / 1000;
    for (const b of this.bobbers) {
      b.obj.position.set(b.x, this.ocean.height(b.x, b.z) - 0.2, b.z);
      b.obj.rotation.x = Math.sin(t * 1.1 + b.phase) * 0.09;
      b.obj.rotation.z = Math.cos(t * 0.9 + b.phase) * 0.09;
      if (b.lamp) b.lamp.material.opacity = (now + b.phase) % b.period < 0.55 ? 1 : 0.05;
    }
  }

  private idleUpdate(dt: number) {
    this.animateWaterSurface(dt);
    if (this.radarBar) this.radarBar.rotation.y += dt * 1.2;
    this.settleShip(0.06);
    this.syncSunLight();
    this.updateCamera(dt, true);
    this.updateSmoke(dt);
    this.updateBobbers();
    this.ocean.wake.update(dt, this.pos.x + SHIP_L * 0.47, this.pos.y, 0, SHIP_L, 24);
    this.wake.update(dt, 1.2, 2.2);
    this.spray.update(dt, 1.2, 2.2, 6);
    this.debris.update(dt, 1.6, 1.2);
  }

  private update(rawDt: number) {
    if (this.activeChoice) {
      this.activeChoice.timeLeft -= rawDt;
      if (this.activeChoice.timeLeft <= 0) this.choose(this.activeChoice.id, this.activeChoice.defaultOption);
    }
    this.timeScale += ((this.activeChoice ? 0.22 : 1) - this.timeScale) * Math.min(1, rawDt * 4);
    const dt = rawDt * this.timeScale;

    this.elapsed += dt;
    if (this.introTimer > 0) this.introTimer -= dt;
    if (this.toastCd > 0) this.toastCd -= dt;
    if (this.fouledT > 0) this.fouledT -= dt;
    if (this.startCue > 0) {
      this.startCue -= dt;
      if (this.startCue <= 0) this.say('start');
    }
    this.chainTimer -= dt;
    if (this.chainTimer <= 0 && this.chain > 1) {
      this.chain--;
      this.chainProgress = 0;
      this.chainTimer = 12;
    }

    this.updateInput(dt);
    this.updatePhysics(dt);
    const progress = this.progress();
    this.updateEvents(progress);
    this.updateCues(progress);
    this.updateStorms(dt);
    this.updateHazards(dt);

    const hull = this.hullCircles();
    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);
    const bow = new THREE.Vector2(this.pos.x + fx * 78, this.pos.y + fy * 78);
    const stern = new THREE.Vector2(this.pos.x - fx * 80, this.pos.y - fy * 80);
    this.pirates.update(dt);
    this.traffic.update(dt, hull, bow, stern);
    this.wildlife.update(dt, hull);
    this.syncCombatTargets();
    this.updateAim(rawDt);
    this.combat.update(dt);
    this.updateSiteVisuals(dt);
    this.animateWeaponMounts(dt);

    this.updateRaft(dt);
    this.checkWaypoints();
    this.checkDocking();
    this.animateWaterSurface(dt);
    this.syncSunLight();
    this.updateSmoke(dt);
    this.updateBobbers();
    this.wake.update(dt, 0.9, 2.6);
    this.spray.update(dt, 1.1, 1.8, 6);
    this.debris.update(dt, 1.3, 1.2);
    this.updateEnvironment(dt);
    this.updateCamera(dt, false);
    this.consumeResources(dt);
    this.audio.update(Math.max(0, this.throttle), Math.min(1, this.env * 0.8 + this.stormFactor * 0.4), Math.abs(this.speed) / this.maxSpeed);

    this.telemetryAcc += rawDt;
    if (this.telemetryAcc > 0.07) {
      this.telemetryAcc = 0;
      this.emitTelemetry();
    }
  }

  private hullCircles(): [number, number, number][] {
    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);
    return HULL_PTS.map(([o, r]) => [this.pos.x + fx * o, this.pos.y + fy * o, r]);
  }

  private updateInput(dt: number) {
    const up = this.keys['KeyW'] || this.keys['ArrowUp'];
    const down = this.keys['KeyS'] || this.keys['ArrowDown'];
    const left = this.keys['KeyA'] || this.keys['ArrowLeft'];
    const right = this.keys['KeyD'] || this.keys['ArrowRight'];
    this.boosting = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']) && this.fuel > 0 && this.fouledT <= 0;
    this.pirates.hoseOn = !!this.keys['KeyE'];

    /* held triggers: space/G/X keep the guns cycling; so does a long mouse press */
    if (this.keys['Space'] || this.keys['KeyG'] || this.keys['KeyX']) this.combat.setHeld(true);
    if (this.camDragging && !this.mouseDragged && this.camTouchCount === 1 && performance.now() - this.mouseDownAt > 340) this.combat.setHeld(true);

    if (up) this.throttleTarget = Math.min(1, this.throttleTarget + dt * 0.85);
    else if (down) this.throttleTarget = Math.max(-0.28, this.throttleTarget - dt * 0.95);
    this.throttle += (this.throttleTarget - this.throttle) * Math.min(1, dt * 2.5);

    const rTarget = (left ? -1 : 0) + (right ? 1 : 0);
    this.rudderTarget += (rTarget - this.rudderTarget) * Math.min(1, dt * 3.2);
    if (this.flareCd > 0) this.flareCd = Math.max(0, this.flareCd - dt);
    if (this.collideCd > 0) this.collideCd -= dt;
  }

  private updatePhysics(dt: number) {
    const stormDrag = this.stormFactor * 0.12;
    const boost = this.boosting ? 1.28 : 1;
    let target = Math.max(-7, this.maxSpeed * boost * this.throttleTarget - stormDrag * this.maxSpeed);
    if (this.fouledT > 0) target = Math.min(target, this.maxSpeed * 0.35);
    const accel = (this.throttleTarget > 0 ? 0.055 : 0.09) * (1 + 0.12 * this.up.engine);
    this.speed += (target - this.speed) * Math.min(1, dt * accel * 6);

    const speedRatio = Math.abs(this.speed) / this.maxSpeed;
    const turnRate = this.rudderTarget * 0.24 * (0.28 + 0.72 * speedRatio) * (this.throttleTarget < 0 ? -1 : 1);
    this.heading += turnRate * dt;
    this.rudder += (this.rudderTarget - this.rudder) * Math.min(1, dt * 4);

    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);
    const drift = turnRate * 22 + Math.sin(this.elapsed * 0.3) * this.stormFactor * 1.6;
    this.pos.x += (fx * this.speed - fy * drift) * dt;
    this.pos.y += (fy * this.speed + fx * drift) * dt;
    this.shipYaw.position.set(this.pos.x, 0, this.pos.y);
    this.shipYaw.rotation.y = -this.heading;
    this.settleShip(0.12, speedRatio, this.rudder);

    const spd = Math.abs(this.speed);
    const bowX = this.pos.x + fx * 74;
    const bowY = this.pos.y + fy * 74;
    const sternX = this.pos.x - fx * 78;
    const sternY = this.pos.y - fy * 78;
    const bowH = this.ocean.height(bowX, bowY, 40);
    const sternH = this.ocean.height(sternX, sternY, 40);
    this.ocean.wake.update(dt, bowX, bowY, spd, SHIP_L, 24);
    if (spd > 3) {
      const n = spd > 18 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const a = (Math.random() - 0.5) * 1.6;
        this.spray.spawn(
          bowX + (Math.random() - 0.5) * 14, bowH + 1 + Math.random() * 2, bowY + (Math.random() - 0.5) * 14,
          -fx * spd * 0.28 + Math.cos(a) * 6, 3 + Math.random() * 6 * (spd / this.maxSpeed), -fy * spd * 0.28 + Math.sin(a) * 6,
          1.1 + Math.random() * 0.8, 5 + spd * 0.22, 0.7
        );
      }
      const side = Math.random() < 0.5 ? 1 : -1;
      this.wake.spawn(
        sternX - fx * Math.random() * 30 - fy * side * 6 * Math.random(), sternH + 0.9, sternY - fy * Math.random() * 30 + fx * side * 6 * Math.random(),
        -fx * spd * 0.15 + (Math.random() - 0.5) * 3, 0.2, -fy * spd * 0.15 + (Math.random() - 0.5) * 3,
        3.6 + Math.random() * 2.4, 8 + Math.random() * 6, 0.26
      );
    }
    if (this.radarBar) this.radarBar.rotation.y += dt * 1.4;
    if (this.stormFactor > 0.3 && Math.random() < this.stormFactor * dt * 6) {
      for (let i = 0; i < 14; i++)
        this.spray.spawn(
          this.pos.x + fx * (20 + Math.random() * 60), 14 + Math.random() * 8, this.pos.y + (Math.random() - 0.5) * 24,
          (Math.random() - 0.5) * 14, 4 + Math.random() * 8, (Math.random() - 0.5) * 14, 1.4, 5, 0.8
        );
    }
  }

  private animateWaterSurface(dt: number) {
    this.wavePhase += dt * (0.85 + this.stormFactor * 0.75);
    this.ocean.update(dt, this.camera, this.fog.density);
    if (this.raft && !this.raft.rescued) {
      const strobe = this.raft.obj.getObjectByName('strobe') as THREE.Mesh | undefined;
      if (strobe) (strobe.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(this.elapsed * 9) > 0.6 ? 6 : 0.4;
    }
  }

  private updateEnvironment(dt: number) {
    let f = this.weatherBase;
    let nearStorm = 0;
    for (const s of this.storms) {
      const d = s.pos.distanceTo(this.pos);
      if (d < s.radius + 900) {
        const k = 1 - THREE.MathUtils.clamp((d - s.radius * 0.35) / (s.radius + 900), 0, 1);
        f = Math.max(f, s.intensity * k);
      }
      nearStorm = Math.max(nearStorm, 1 - THREE.MathUtils.clamp((d - s.radius) / 1800, 0, 1));
    }
    this.env += (f - this.env) * Math.min(1, dt * 0.5);
    this.stormFactor += ((this.inStorm ? 1 : 0) - this.stormFactor) * Math.min(1, dt * 0.6);
    this.fogExtra += (this.fogTarget - this.fogExtra) * Math.min(1, dt * 0.35);

    const e = this.env;
    this.fog.density = 0.00008 + e * 0.00045 + this.fogExtra * 0.0011;
    this.fog.color
      .set(0x9fc4e0)
      .lerp(new THREE.Color(0x2b323b), Math.min(1, e * 1.15))
      .lerp(new THREE.Color(0xb9c3c9), this.fogExtra * 0.7);
    this.ocean.setWeather(e, this.stormFactor, this.fogExtra, this.flash);
    const lightFactor = (1 - e * 0.85) * (1 - this.fogExtra * 0.45);
    this.dirLight.intensity = 3.4 * this.ocean.sunIntensity * lightFactor + this.flash * 6;
    this.hemi.intensity = 0.18 + e * 0.12 + this.fogExtra * 0.2 + this.flash * 3;
    this.scene.environmentIntensity = 0.9 * (1 - e * 0.55) * (1 - this.fogExtra * 0.25) + this.flash * 1.2;
    this.renderer.toneMappingExposure = 0.62 + e * 0.08 + this.flash * 0.8;
    // lightning now reads as a scene light rather than a screen-space glow
    this.dirLight.intensity += this.flash * 2;
    this.glowWindows();

    const rainMat = this.rain.material as THREE.PointsMaterial;
    rainMat.opacity += (Math.max(0, e - 0.3) * 0.85 - rainMat.opacity) * Math.min(1, dt * 1.5);
    this.rain.visible = rainMat.opacity > 0.02;
    if (this.rain.visible) {
      const posAttr = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const cx = this.camera.position.x;
      const cz = this.camera.position.z;
      for (let i = 0; i < this.rainVel.length; i++) {
        arr[i * 3 + 1] -= this.rainVel[i] * dt;
        if (arr[i * 3 + 1] < -20) {
          arr[i * 3] = this.rainBase[i * 3] + cx;
          arr[i * 3 + 1] = this.rainBase[i * 3 + 1] + 150;
          arr[i * 3 + 2] = this.rainBase[i * 3 + 2] + cz;
        } else {
          arr[i * 3] += Math.sin(this.elapsed * 0.4) * 12 * dt;
        }
      }
      posAttr.needsUpdate = true;
    }

    if (nearStorm > 0.15 || this.stormFactor > 0.4) {
      this.lightningTimer -= dt * (0.3 + nearStorm + this.stormFactor);
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 3 + Math.random() * 8;
        this.flash = 0.35 + Math.max(nearStorm, this.stormFactor) * 0.65;
        this.audio.thunder();
      }
    }
    this.flash = Math.max(0, this.flash - dt * 3.4);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.8);
  }

  /* ------------------------------------------------------ events & cues -- */

  private updateCues(progress: number) {
    for (const c of this.cues) {
      if (!c.used && c.at !== undefined && progress >= c.at && (!c.if || c.if(this.flags))) {
        c.used = true;
        this.radio(c.speaker, c.text);
      }
    }
    if (!this.activeChoice) {
      for (const c of this.choices) {
        if (!c.fired && progress >= c.at) {
          c.fired = true;
          this.activeChoice = { ...c, timeLeft: CHOICE_TIME };
          this.audio.squelch();
          this.cbs.onChoice({ id: c.id, speaker: c.speaker, text: c.text, options: c.options, total: CHOICE_TIME });
          break;
        }
      }
    }
  }

  private updateEvents(progress: number) {
    const m = this.mission!;
    for (const e of this.events) {
      if (!e.fired) {
        if (progress >= e.at) this.fireEvent(e);
        continue;
      }
      if (e.done || e.failed) continue;
      switch (e.kind) {
        case 'pirates':
          if (e.skipped) e.done = true;
          else if (this.pirates.isSpawned(e.id) && !this.pirates.activeFor(e.id)) {
            e.done = true;
            this.attacksRepelled++;
            this.addBonus(Math.round(m.reward * 0.04), 'ATTACK REPELLED');
            this.audio.good();
          }
          break;
        case 'storm':
          if (progress > e.at + 0.27) {
            e.done = true;
            const s = this.storms.find((st) => st.eventId === e.id);
            this.addBonus(Math.round(m.reward * 0.03), s?.entered ? 'STORM WEATHERED' : 'STORM AVOIDED');
          }
          break;
        case 'distress':
          if (this.raft?.rescued) e.done = true;
          else if (!this.raft || this.raft.timer <= 0 || progress > e.at + 0.32) {
            e.failed = true;
            if (this.raft) this.world.remove(this.raft.obj);
            this.raft = null;
            this.toast('Contact with the life raft lost. Survivors presumed drowned.', 'warn');
          }
          break;
        case 'minefield':
        case 'icefield':
          if (progress > e.at + 0.17) {
            e.done = true;
            if (this.groundings === e.mark) this.addBonus(Math.round(m.reward * 0.02), e.kind === 'minefield' ? 'MINEFIELD CLEARED' : 'ICE FIELD CLEARED');
          }
          break;
        case 'reef':
          if (progress > e.at + 0.18) {
            e.done = true;
            if (this.groundings === e.mark) this.addBonus(Math.round(m.reward * 0.025), 'CLEAN REEF PASSAGE');
          }
          break;
        case 'fishing':
          if (progress > e.at + 0.2) {
            e.done = true;
            if (!this.fouledDuring) this.addBonus(Math.round(m.reward * 0.015), 'FLEET CLEARED');
          }
          break;
        case 'whales':
          if (this.wildlife.resolved(e.id) || progress > e.at + 0.3) e.done = true;
          break;
        case 'fog':
          if (progress > e.at + 0.18) {
            e.done = true;
            this.fogTarget = 0;
            this.toast('Clear of the fog bank. Visibility improving.', 'good');
          }
          break;
        case 'traffic':
          if (progress > e.at + 0.14) e.done = true;
          break;
        case 'hunt':
          if (!this.pirates.dhowAlive(e.id)) {
            e.done = true;
            this.attacksRepelled++;
            this.addBonus(Math.round(m.reward * 0.07), 'MOTHERSHIP HUNTED DOWN');
            this.banner('MOTHERSHIP SUNK', 'Bounty confirmed by the Coalition — clean kill', 'good');
            this.audio.good();
          } else if (progress > e.at + 0.45) {
            e.failed = true;
            this.toast('The mothership slipped away over the horizon — bounty lost.', 'warn');
          }
          break;
        case 'shorestrike': {
          if (this.combat.sitesAlive(e.id) === 0) {
            e.done = true;
            this.attacksRepelled++;
            this.addBonus(Math.round(m.reward * 0.08), 'BATTERIES SILENCED');
            this.banner('BATTERIES SILENCED', 'The island is dark — proceed to the berth', 'good');
            this.audio.good();
          } else if (progress > e.at + 0.44) {
            e.failed = true;
            this.toast('Shore batteries left active — tasking incomplete. The navy will have questions.', 'warn');
          }
          break;
        }
      }
    }
  }

  private fireEvent(e: RuntimeEvent) {
    e.fired = true;
    e.mark = this.groundings;
    const side = Math.random() < 0.5 ? 1 : -1;
    switch (e.kind) {
      case 'pirates': {
        const n = e.count ?? 2;
        this.pirates.spawnAttack(e.id, n, side);
        this.audio.alarm();
        this.banner('PIRATES INBOUND', `Mothership ${side > 0 ? 'to starboard' : 'to port'} launching ${n} skiffs — speed, hoses [E], LRAD [F]`, 'danger');
        this.say('pirates');
        break;
      }
      case 'storm': {
        const c = this.routePoint(Math.min(0.97, e.at + 0.11));
        const s = this.makeStorm(c.x + 60, c.y + (Math.random() - 0.5) * 240, e.radius ?? 700, 0.75 + Math.random() * 0.25, e.id);
        this.storms.push(s);
        this.banner('STORM CELL AHEAD', `A wall of weather ${fmtDist(c.x - this.pos.x)} off the bow — skirt it, or slow to half ahead`, 'warn');
        this.audio.thunder();
        this.say('storm');
        break;
      }
      case 'distress': {
        const c = this.routePoint(Math.min(0.97, e.at + 0.08));
        const p = new THREE.Vector2(c.x, c.y + side * (200 + Math.random() * 140));
        const obj = buildLifeRaft();
        obj.position.set(p.x, 0, p.y);
        this.world.add(obj);
        this.raft = { obj, pos: p, timer: 190, rescued: false, smokeCd: 0 };
        this.banner('MAYDAY RECEIVED', `Life raft ${fmtDist(p.distanceTo(this.pos))} ${side > 0 ? 'to starboard' : 'to port'} — come alongside under 10 kn`, 'info');
        this.audio.alarm();
        this.say('distress');
        break;
      }
      case 'minefield':
        this.spawnField(e, 'mine');
        this.banner('MINEFIELD', 'Drifting contact mines across the lane — pick your way through', 'danger');
        this.audio.alarm();
        this.say('minefield');
        break;
      case 'icefield':
        this.spawnField(e, 'ice');
        this.banner('ICE FIELD', 'Bergs and growlers ahead — the radar paints them before you see them', 'warn');
        this.say('icefield');
        break;
      case 'fog':
        this.fogTarget = 1;
        this.banner('FOG BANK', 'Visibility collapsing — steer by compass and radar', 'warn');
        this.audio.horn();
        this.say('fog');
        break;
      case 'traffic': {
        const c = this.routePoint(Math.min(0.97, e.at + 0.1));
        this.traffic.addMerchant(new THREE.Vector2(c.x, c.y + side * 650), side > 0 ? -Math.PI / 2 : Math.PI / 2, 8.5);
        this.banner('CROSSING TRAFFIC', 'Merchant vessel crossing ahead — she is the stand-on vessel', 'warn');
        this.audio.horn();
        this.say('traffic');
        break;
      }
      case 'whales': {
        const c = this.routePoint(Math.min(0.95, e.at + 0.1));
        this.wildlife.spawnPod(e.id, new THREE.Vector2(c.x, c.y + side * 90), -side, 3 + Math.floor(Math.random() * 2));
        this.banner('WHALES AHEAD', 'A humpback pod is crossing the lane — slow below 12 kn and give them room', 'info');
        this.say('whales');
        break;
      }
      case 'fishing': {
        const n = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const c = this.routePoint(Math.min(0.95, e.at + 0.05 + Math.random() * 0.12));
          this.traffic.addTrawler(new THREE.Vector2(c.x + (Math.random() - 0.5) * 200, c.y + (Math.random() - 0.5) * 700), Math.random() * Math.PI * 2);
        }
        this.banner('FISHING FLEET', 'Trawlers working the lane — keep clear of the orange net floats', 'warn');
        this.say('fishing');
        break;
      }
      case 'reef': {
        const c = this.routePoint(Math.min(0.95, e.at + 0.09));
        const r1 = 150 + Math.random() * 90;
        const r2 = 140 + Math.random() * 90;
        this.addReef(c.x, c.y + 125 + r1, r1);
        this.addReef(c.x + 170, c.y - 125 - r2, r2);
        for (const dx of [-220, 220]) {
          this.addBuoy('port', c.x + dx, c.y - 105);
          this.addBuoy('starboard', c.x + dx, c.y + 105);
        }
        this.banner('REEF PASSAGE', 'Shallow coral either side — keep between the red and green marks', 'warn');
        this.say('reef');
        break;
      }
      case 'hunt': {
        const n = e.count ?? 3;
        this.pirates.spawnHunt(e.id, n, side);
        this.audio.alarm();
        this.banner('MOTHERSHIP LOCATED', `${side > 0 ? 'Starboard' : 'Port'} bow — ${n} skiffs screening her. Guns free — sink her for the bounty`, 'danger');
        this.say('hunt');
        break;
      }
      case 'shorestrike':
        this.spawnIslandStrike(e);
        this.audio.alarm();
        this.banner('SHORE BATTERIES LIVE', 'Shellfire inbound — keep way on her, reticle on the island, and return fire', 'danger');
        this.say('shorestrike');
        break;
    }
  }

  /** Fortified island on the beam with armed coastal batteries. */
  private spawnIslandStrike(e: RuntimeEvent) {
    const count = e.count ?? 3;
    const c = this.routePoint(Math.min(0.96, e.at + 0.11));
    const sideSign = Math.random() < 0.5 ? 1 : -1;
    const R = 330 + Math.random() * 40;
    const island = buildIsland(e.id.length * 17 + count, R);
    const iz = c.y + sideSign * R * 1.12;
    island.group.position.set(c.x, 0, iz);
    /* face the fort rim toward the route */
    island.group.rotation.y = sideSign > 0 ? Math.PI : 0;
    this.world.add(island.group);
    /* the landmass itself is a collision hazard */
    this.newHazard(island.group, c.x, iz, R * 0.95, 'rock');
    for (let i = 0; i < count; i++) {
      const slot = island.slots[i % island.slots.length];
      /* rotate the local slot into world space */
      const rot = island.group.rotation.y;
      const wx = c.x + Math.cos(rot) * slot.x - Math.sin(rot) * slot.z;
      const wz = iz + Math.sin(rot) * slot.x + Math.cos(rot) * slot.z;
      const fort = buildFort();
      fort.group.position.set(wx, slot.y * 0.5, wz);
      /* leave group yaw at identity: the combat system trains each turret (yaw only) itself */
      this.world.add(fort.group);
      const site = this.combat.registerShoreSite(e.id, wx, wz, 26, i < count); /* all armed */
      site.obj = fort.group;
    }
    /* sortie a defensive patrol once the island is under attack */
    if (count >= 3) this.pirates.spawnAttack(`${e.id}-guard`, 2, sideSign);
  }

  private spawnField(e: RuntimeEvent, kind: 'mine' | 'ice') {
    const n = e.count ?? 10;
    const R = rng(this.mission!.id * 131 + Math.round(e.at * 1000));
    const gapZ = (R() - 0.5) * 320;
    for (let i = 0; i < n; i++) {
      const c = this.routePoint(Math.min(0.97, e.at + 0.045 + R() * 0.085));
      let z = c.y + (R() - 0.5) * 640;
      if (Math.abs(z - (c.y + gapZ)) < 55) z += Math.sign(z - (c.y + gapZ) || 1) * 100;
      if (kind === 'mine') this.addMine(c.x, z);
      else this.addIce(c.x, z, 0.7 + R() * 0.9);
    }
    if (kind === 'ice') {
      // growlers: small, low and easy to miss visually
      for (let i = 0; i < Math.round(n * 0.8); i++) {
        const c = this.routePoint(Math.min(0.97, e.at + 0.03 + R() * 0.1));
        this.addIce(c.x, c.y + (R() - 0.5) * 520, 0.2 + R() * 0.12, false);
      }
    }
  }

  /* ------------------------------------------------------------ storms -- */

  private updateStorms(dt: number) {
    this.inStorm = false;
    for (const s of this.storms) {
      s.pos.addScaledVector(s.drift, dt);
      s.cloud.position.set(s.pos.x, 0, s.pos.y);
      s.cloud.rotation.y += dt * 0.02;
      s.disc.position.set(s.pos.x, 5, s.pos.y);
      const d = s.pos.distanceTo(this.pos);
      const inside = d < s.radius;
      (s.cloud.material as THREE.PointsMaterial).opacity = 0.55 * THREE.MathUtils.clamp((d - s.radius * 0.55) / (s.radius * 0.6), 0.12, 1);
      const dm = s.disc.material as THREE.MeshBasicMaterial;
      dm.opacity += ((inside ? 0.24 : 0) - dm.opacity) * Math.min(1, dt);
      if (inside) {
        this.inStorm = true;
        if (!s.entered) {
          s.entered = true;
          this.toast('Inside the storm cell. Speed is damage — come down to half ahead.', 'warn');
        }
        const spdK = 0.5 + Math.abs(this.speed) / this.maxSpeed;
        this.hull -= dt * 0.3 * s.intensity * spdK * this.stormMul;
        this.cargo -= dt * 0.16 * s.intensity * spdK * this.stormMul;
        const a = Math.atan2(this.pos.y - s.pos.y, this.pos.x - s.pos.x);
        this.pos.x += Math.cos(a) * 4.5 * s.intensity * dt;
        this.pos.y += Math.sin(a) * 4.5 * s.intensity * dt;
        this.shake = Math.max(this.shake, 0.35 * s.intensity);
        if (this.hull <= 0) this.endMission(false, 'Foundered in the storm.');
      }
    }
  }

  /* ----------------------------------------------------------- hazards -- */

  private updateHazards(dt: number) {
    this.keel = 46;
    let risk: string | null = null;
    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);
    const spd = Math.abs(this.speed);
    for (const h of this.hazards) {
      if (h.cd > 0) h.cd -= dt;
      if (h.drift) {
        h.pos.addScaledVector(h.drift, dt);
        h.obj.position.x = h.pos.x;
        h.obj.position.z = h.pos.y;
      }
      if (h.kind === 'mine' || h.kind === 'drift') {
        h.obj.position.y = this.ocean.height(h.pos.x, h.pos.y) + h.sink;
        h.obj.rotation.z = Math.sin(this.wavePhase + h.phase) * 0.08 + (h.kind === 'drift' ? 0.1 : 0);
        h.obj.rotation.x = Math.cos(this.wavePhase * 0.8 + h.phase) * 0.07 + (h.kind === 'drift' ? 0.2 : 0);
      }
      if (!h.alive) continue;
      const d = h.pos.distanceTo(this.pos);
      if (d > 700) continue;
      if (h.kind === 'rock' || h.kind === 'ice' || h.kind === 'reef') {
        const shoal = Math.max(0, 1 - Math.max(0, d - h.radius) / 260);
        this.keel = Math.min(this.keel, 46 - shoal * (h.kind === 'reef' ? 44 : 34));
      }
      let gapMin = 9999;
      for (const [ox, r] of HULL_PTS) {
        const px = this.pos.x + fx * ox;
        const py = this.pos.y + fy * ox;
        const dd = Math.hypot(h.pos.x - px, h.pos.y - py);
        gapMin = Math.min(gapMin, dd - r - h.radius);
        if (dd < r + h.radius && h.cd <= 0) {
          this.resolveImpact(h);
          break;
        }
      }
      if (h.kind !== 'drift') {
        if (gapMin < 140) {
          h.tracking = true;
          h.near = Math.min(h.near, gapMin);
        } else if (h.tracking) {
          h.tracking = false;
          if (!h.hit && h.near < 24 && spd > 7) this.closeCall();
          h.near = 9999;
          h.hit = false;
        }
      }
      if (risk === null && d < 340 + h.radius) {
        const rel = (h.pos.x - this.pos.x) * fx + (h.pos.y - this.pos.y) * fy;
        const across = (h.pos.x - this.pos.x) * -fy + (h.pos.y - this.pos.y) * fx;
        if (rel > 0 && Math.abs(across) < 60 + h.radius) risk = h.kind === 'mine' ? 'MINE' : h.kind === 'ice' ? 'ICE' : h.kind === 'reef' ? 'REEF' : 'ROCKS';
      }
    }
    if (!risk && this.traffic.riskAhead()) risk = 'VESSEL';
    this.risk = risk;
  }

  private resolveImpact(h: Hazard) {
    h.cd = 1.4;
    h.hit = true;
    const impactSpeed = Math.abs(this.speed);
    let dmg = 0;
    if (h.kind === 'mine') {
      dmg = 24 + impactSpeed * 0.8;
      h.alive = false;
      this.world.remove(h.obj);
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2;
        this.debris.spawn(h.pos.x, 3, h.pos.y, Math.cos(a) * (30 + Math.random() * 40), 12 + Math.random() * 25, Math.sin(a) * (30 + Math.random() * 40), 1.6, 6, 1);
      }
      for (let i = 0; i < 30; i++) this.spray.spawn(h.pos.x, 2, h.pos.y, (Math.random() - 0.5) * 12, 20 + Math.random() * 25, (Math.random() - 0.5) * 12, 2.4, 9, 0.9);
      this.groundings++;
      this.banner('MINE STRIKE', 'Hull breached below the waterline — damage control parties away', 'danger');
    } else if (h.kind === 'reef') {
      h.cd = 2.2;
      this.groundings++;
      const a = Math.atan2(this.pos.y - h.pos.y, this.pos.x - h.pos.x);
      this.pos.x += Math.cos(a) * 6;
      this.pos.y += Math.sin(a) * 6;
      if (impactSpeed > 4) {
        dmg = 10 + impactSpeed * 0.85;
        this.speed *= 0.2;
        this.banner('AGROUND', 'Coral tearing at the hull — back her off the reef', 'danger');
      } else {
        dmg = 2.5;
        this.speed *= 0.6;
        this.toast('Scraping the reef — ease her off!', 'warn');
      }
    } else if (h.kind === 'rock' || h.kind === 'ice') {
      dmg = (h.kind === 'ice' ? 15 : 20) + impactSpeed * 0.9;
      this.speed *= 0.28;
      this.groundings++;
      const a = Math.atan2(this.pos.y - h.pos.y, this.pos.x - h.pos.x);
      this.pos.x += Math.cos(a) * 12;
      this.pos.y += Math.sin(a) * 12;
      for (let i = 0; i < 26; i++) {
        const ang = Math.random() * Math.PI * 2;
        this.spray.spawn(h.pos.x + (this.pos.x - h.pos.x) * 0.4, 3, h.pos.y + (this.pos.y - h.pos.y) * 0.4, Math.cos(ang) * 26, 8 + Math.random() * 14, Math.sin(ang) * 26, 1.4, 7, 0.9);
      }
      this.toast(h.kind === 'ice' ? 'Ice impact — plating buckled amidships.' : 'Grounding! We have struck rocks.', 'danger');
    } else {
      dmg = 4 + impactSpeed * 0.15;
      h.alive = false;
      this.world.remove(h.obj);
      this.toast('Lost container struck — minor damage to the bow plating.', 'warn');
    }
    if (this.collideCd <= 0) {
      this.collideCd = 0.6;
      this.audio.impact(Math.min(2.2, dmg / 12));
      this.hurt(dmg, dmg * 0.55 * this.dmgMul, Math.min(1.4, 0.5 + dmg * 0.03));
    }
  }

  /* ----------------------------------------------------- action combat */

  /** Feed the crosshair into the combat system: mouse ray to the sea plane, or soft-lock on touch. */
  private updateAim(rawDt: number) {
    this.aimAge += rawDt;
    const w = this.combat.weapon;
    if (this.hasFinePointer && this.aimAge < 8) {
      this.camera.updateMatrixWorld();
      this.raycaster.setFromCamera(this.aimNdc, this.camera);
      const ray = this.raycaster.ray;
      if (ray.direction.y < -0.002) {
        const t = -ray.origin.y / ray.direction.y;
        if (t > 1 && t < 9000) {
          this.combat.setAim(ray.origin.x + ray.direction.x * t, ray.origin.z + ray.direction.z * t);
          return;
        }
      }
    }
    /* touch / stale mouse: soft-lock the closest hostile, a shore battery, else open water */
    const t = this.combat.currentTarget();
    if (t) this.combat.setAim(t.x, t.z);
    else {
      const s = this.combat.nearestShore(this.pos.x, this.pos.y, w.range);
      if (s) this.combat.setAim(s.x, s.z);
      else {
        const fx = Math.cos(this.heading);
        const fy = Math.sin(this.heading);
        this.combat.setAim(this.pos.x + fx * 420, this.pos.y + fy * 420);
      }
    }
  }

  /** Dead batteries sag, tilt and burn — a cheap aftermath that reads at distance. */
  private updateSiteVisuals(dt: number) {
    for (const s of this.combat.shore) {
      if (s.alive) continue;
      s.obj.rotation.z += (0.13 - s.obj.rotation.z) * Math.min(1, dt);
      s.obj.position.y += (-3.2 - s.obj.position.y) * Math.min(1, dt * 0.5);
      if (Math.random() < dt * 4)
        this.debris.spawn(s.x + (Math.random() - 0.5) * 14, 7 + Math.random() * 6, s.z + (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 2, 5 + Math.random() * 4, (Math.random() - 0.5) * 2, 3, 6, 0.5);
    }
  }

  /** Mirror live pirate contacts into the combat target list each frame. */
  private syncCombatTargets() {
    const list = this.pirates.combatTargets();
    const seen = new Set<string>();
    for (const c of list) {
      seen.add(c.key);
      const existing = this.combatTargets.get(c.key);
      if (existing) {
        existing.x = c.x;
        existing.z = c.z;
      } else {
        this.combatTargets.set(c.key, {
          key: c.key,
          kind: c.kind,
          x: c.x,
          z: c.z,
          hitPoints: c.hitPoints,
          maxHP: c.hitPoints,
          r: c.radius,
          alive: true,
        });
      }
    }
    for (const key of [...this.combatTargets.keys()]) if (!seen.has(key)) this.combatTargets.delete(key);
    this.combat.targets = [...this.combatTargets.values()];
  }

  /** Animate the deck gun barrels and CIWS towards whatever they are tracking. */
  private animateWeaponMounts(dt: number) {
    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);
    const w = this.combat.weapon;
    let trackX = this.pos.x + fx * 300;
    let trackZ = this.pos.y + fy * 300;
    const t = this.combat.nearestTarget(this.pos.x, this.pos.y, w.range);
    if (t) {
      trackX = t.x;
      trackZ = t.z;
    } else {
      const s = this.combat.nearestShore(this.pos.x, this.pos.y, w.range * 1.4);
      if (s) {
        trackX = s.x;
        trackZ = s.z;
      }
    }
    /* barrels lean left/right when tracking, and pitch with the muzzle rise */
    const rel = (trackX - this.pos.x) * -fy + (trackZ - this.pos.y) * fx;
    const yaw = THREE.MathUtils.clamp(rel / 400, -1, 1) * 0.45;
    for (const m of this.gunMounts) {
      m.rotation.y = THREE.MathUtils.lerp(m.rotation.y, yaw, Math.min(1, dt * 3));
      m.rotation.x = -this.muzzleTimer * 0.22;
    }
    if (this.ciws) {
      this.ciws.rotation.y = THREE.MathUtils.lerp(this.ciws.rotation.y, -yaw * 1.6, Math.min(1, dt * 8));
      this.ciws.rotation.x = -this.muzzleTimer * 0.3;
    }
    if (this.muzzleTimer > 0) this.muzzleTimer = Math.max(0, this.muzzleTimer - dt);
  }

  /* -------------------------------------------------------------- raft -- */

  private updateRaft(dt: number) {
    const r = this.raft;
    if (!r || r.rescued) return;
    r.timer -= dt;
    r.obj.position.y = this.ocean.height(r.pos.x, r.pos.y) - 0.3;
    r.obj.rotation.z = Math.sin(this.wavePhase * 1.3) * 0.1;
    r.obj.rotation.x = Math.cos(this.wavePhase) * 0.08;
    r.smokeCd -= dt;
    if (r.smokeCd <= 0) {
      r.smokeCd = 0.1;
      this.debris.spawn(r.pos.x, r.obj.position.y + 2.5, r.pos.y, (Math.random() - 0.5) * 2, 9 + Math.random() * 4, (Math.random() - 0.5) * 2, 2.8, 7, 0.9);
    }
    const d = r.pos.distanceTo(this.pos);
    if (d < 125) {
      if (Math.abs(this.speed) < RESCUE_SPEED) {
        r.rescued = true;
        this.world.remove(r.obj);
        this.rescuedCount++;
        this.addBonus(Math.round(this.reward() * 0.08), 'SURVIVORS RECOVERED');
        this.banner('SURVIVORS RECOVERED', 'All souls safe aboard — the charterer will hear of this', 'good');
        this.audio.good();
        this.say('rescued');
      } else if (this.toastCd <= 0) {
        this.toastCd = 4;
        this.toast('Too fast to recover survivors — come down below 10 kn alongside the raft.', 'warn');
      }
    }
  }

  /* --------------------------------------------------------- waypoints -- */

  private checkWaypoints() {
    const n = this.waypoints.length;
    if (this.wpIndex >= n - 1) return;
    if (this.pos.distanceTo(this.waypoints[this.wpIndex]) < 330) {
      this.wpIndex++;
      this.placeWaypoint();
      if (this.wpIndex >= n - 1) {
        this.popup('FINAL APPROACH', 'info');
        this.toast(`Final leg — line up on ${this.mission!.to} and slow below 8 kn to berth.`, 'warn');
      } else {
        this.addBonus(1200, `WAYPOINT ${this.wpIndex - 1}/${n - 2}`);
      }
      this.audio.good();
    }
  }

  private checkDocking() {
    const last = this.waypoints[this.waypoints.length - 1];
    const d = this.pos.distanceTo(last);
    this.docking = d < 450;
    if (this.docking && !this.dockSaid) {
      this.dockSaid = true;
      this.say('dock');
    }
    if (d < 150 && Math.abs(this.speed) < DOCK_SPEED) {
      this.endMission(true, '');
      return;
    }
    if (this.docking && this.toastCd <= 0) {
      if (d < 150) {
        this.toastCd = 3;
        this.toast(`Too fast for the berth — ${(Math.abs(this.speed) * KN).toFixed(0)} kn. Ring down to dead slow.`, 'warn');
      } else if (this.pos.x > last.x + 420) {
        this.toastCd = 5;
        this.toast('You have overshot the berth — come about and approach again.', 'warn');
      }
    }
  }

  private consumeResources(dt: number) {
    const burn = (0.05 + Math.max(0, this.throttle) * (this.boosting ? 0.22 : 0.115)) * dt;
    this.fuel = Math.max(0, this.fuel - burn);
    if (this.fuel <= 0) {
      this.throttleTarget = 0;
      if (Math.abs(this.speed) < 1.2) this.endMission(false, 'Fuel exhausted — vessel adrift, cargo forfeit.');
    }
    if (this.cargo <= 10) this.endMission(false, 'Cargo integrity lost — charter cancelled.');
  }

  private endMission(success: boolean, reason: string) {
    if (this.finished) return;
    this.finished = true;
    this.keys = {};
    this.audio.setHose(false);
    this.audio.setHeli(0);
    if (this.activeChoice) {
      this.activeChoice = null;
      this.cbs.onChoice(null);
    }
    const m = this.mission!;
    const cargoRatio = Math.max(0, this.cargo / 100);
    const hullRatio = Math.max(0, this.hull / 100);
    const deliveredTons = Math.round(m.cargoTons * cargoRatio);
    const payout = success ? Math.round(m.reward * (0.3 + 0.7 * cargoRatio)) : 0;
    const reasons: string[] = [];
    let bonus = 0;
    if (success) {
      if (cargoRatio > 0.9) {
        bonus += m.reward * 0.18;
        reasons.push('Pristine cargo +18%');
      }
      if (this.elapsed < m.parTime) {
        bonus += m.reward * 0.12;
        reasons.push('Ahead of schedule +12%');
      }
      if (hullRatio > 0.75) {
        bonus += m.reward * 0.08;
        reasons.push('Hull in class +8%');
      }
      if (Math.abs(this.speed) < 4) {
        bonus += m.reward * 0.05;
        reasons.push('Textbook berthing +5%');
      }
    }
    const penalties = Math.round((success ? (1 - hullRatio) * m.reward * 0.22 : m.reward * 0.08) + this.fines);
    const eventBonus = success ? this.bonusEarned : Math.round(this.bonusEarned * 0.25);
    const total = Math.max(0, Math.round(payout + bonus + eventBonus - penalties));
    if (success) {
      this.audio.horn();
      this.banner('CARGO DELIVERED', `${deliveredTons.toLocaleString()} t alongside at ${m.to}`, 'good');
    } else {
      this.banner('VOYAGE LOST', reason, 'danger');
    }
    this.cbs.onEnd({
      success,
      mission: m,
      stars: starsFor(m, success, cargoRatio, this.elapsed, hullRatio),
      combat: { ...this.combat.stats },
      cargoDelivered: cargoRatio,
      hullLeft: hullRatio,
      fuelLeft: this.fuel / 100,
      timeTaken: this.elapsed,
      deliveredTons,
      payout,
      bonus: Math.round(bonus),
      eventBonus,
      penalties,
      total,
      reasons,
      eventLog: this.bonusLog,
      closeCalls: this.closeCalls,
      rescued: this.rescuedCount,
      attacksRepelled: this.attacksRepelled,
      hoseRepels: this.pirates.hoseRepels,
      outran: this.pirates.outran,
      boarded: this.pirates.boarded,
      whaleSafe: this.wildlife.whaleSafe,
      whaleStrikes: this.wildlife.whaleStrikes,
      navyCalled: this.pirates.navyCalled,
      maxChain: this.maxChain,
      choices: { ...this.choiceFlags },
      failReason: reason,
    });
  }

  /* ------------------------------------------------------------ camera -- */

  private updateCamera(dt: number, idle: boolean) {
    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);
    const mode = CAMERA_MODES[this.camMode];
    const bob = Math.sin(this.wavePhase * 1.1) * (1 + this.env * 3);
    if (!idle && this.introTimer > 0) {
      const k = 1 - this.introTimer / INTRO_LEN;
      const e = k * k * (3 - 2 * k);
      const sx = this.pos.x + fx * 330 - fy * 230;
      const sz = this.pos.y + fy * 330 + fx * 230;
      const ex = this.pos.x - fx * 235 - fy * 30;
      const ez = this.pos.y - fy * 235 + fx * 30;
      this.camPos.set(THREE.MathUtils.lerp(sx, ex, e), THREE.MathUtils.lerp(150, 78, e), THREE.MathUtils.lerp(sz, ez, e));
      this.camLook.set(this.pos.x + fx * 40, 20, this.pos.y + fy * 40);
    } else {
      let want: THREE.Vector3;
      let look: THREE.Vector3;
      const heave = this.shipTilt.position.y;
      if (mode === 'CHASE') {
        want = new THREE.Vector3(this.pos.x - fx * 235 - fy * 30, 78 + bob + heave * 0.5, this.pos.y - fy * 235 + fx * 30);
        look = new THREE.Vector3(this.pos.x + fx * 120, 20, this.pos.y + fy * 120);
      } else if (mode === 'BRIDGE') {
        want = new THREE.Vector3(this.pos.x - fx * 38, 34.6 + heave + bob * 0.4, this.pos.y - fy * 38);
        look = new THREE.Vector3(this.pos.x + fx * 400, 12 + bob, this.pos.y + fy * 400);
      } else if (mode === 'CINEMATIC') {
        const a = (idle ? performance.now() / 1000 : this.elapsed) * 0.11;
        want = new THREE.Vector3(this.pos.x + Math.cos(a) * 240, 40 + Math.sin(a * 0.7) * 16 + bob, this.pos.y + Math.sin(a) * 240);
        look = new THREE.Vector3(this.pos.x + fx * 30, 18, this.pos.y + fy * 30);
      } else if (mode === 'OVERHEAD') {
        want = new THREE.Vector3(this.pos.x - fx * 40, 520, this.pos.y - fy * 40);
        look = new THREE.Vector3(this.pos.x + fx * 120, 0, this.pos.y + fy * 120);
      } else {
        // FREE camera - orbit around ship
        this.camYaw += (this.camTargetYaw - this.camYaw) * Math.min(1, dt * 5);
        this.camPitch += (this.camTargetPitch - this.camPitch) * Math.min(1, dt * 5);
        this.camDist += (this.camTargetDist - this.camDist) * Math.min(1, dt * 6);
        this.camYaw = this.camYaw % (Math.PI * 2);
        const cy = Math.cos(this.camYaw);
        const sy = Math.sin(this.camYaw);
        const cp = Math.cos(this.camPitch);
        const sp = Math.sin(this.camPitch);
        const dx = cy * cp * this.camDist;
        const dy = sp * this.camDist;
        const dz = sy * cp * this.camDist;
        want = new THREE.Vector3(this.pos.x + dx, this.pos.y + dy + heave * 0.2, this.pos.y + dz);
        look = new THREE.Vector3(this.pos.x + fx * 60, this.shipTilt.position.y + 15, this.pos.y + fy * 60);
      }
      const k = idle ? Math.min(1, dt * 2) : Math.min(1, dt * (mode === 'BRIDGE' ? 6 : (mode === 'FREE' ? 4 : 2.8)));
      this.camPos.lerp(want, k);
      this.camLook.lerp(look, Math.min(1, dt * 3.2));
    }
    const sh = this.shake * 1.6 + this.stormFactor * 0.5;
    const minY = this.ocean.height(this.camPos.x, this.camPos.z) + 7;
    this.camera.position.set(
      this.camPos.x + (Math.random() - 0.5) * sh,
      Math.max(minY, this.camPos.y + (Math.random() - 0.5) * sh),
      this.camPos.z + (Math.random() - 0.5) * sh
    );
    this.camera.lookAt(this.camLook);
    if (sh > 0.05) this.camera.rotateZ((Math.random() - 0.5) * sh * 0.02);
    const wantFov = this.baseFov + (this.boosting && !idle ? 7 : 0) + this.stormFactor * 2 - (this.activeChoice ? 6 : 0);
    if (Math.abs(this.camera.fov - wantFov) > 0.05) {
      this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
  }

  private project(x: number, y: number, z: number) {
    const v = this.tmpV3.set(x, y, z).applyMatrix4(this.camera.matrixWorldInverse);
    const behind = v.z > 0;
    v.applyMatrix4(this.camera.projectionMatrix);
    let nx = v.x;
    let ny = v.y;
    if (behind) {
      nx = -nx;
      ny = -1.3;
    }
    return { nx, ny, onScreen: !behind && Math.abs(nx) < 1 && Math.abs(ny) < 1 };
  }

  /* --------------------------------------------------------- telemetry -- */

  private buildObjective(): Objective {
    const m = this.mission!;
    const n = this.waypoints.length;
    const kn = Math.abs(this.speed) * KN;
    const last = this.waypoints[n - 1];
    if (this.docking) {
      const ok = Math.abs(this.speed) < DOCK_SPEED;
      return { title: `BERTH AT ${m.to.toUpperCase()}`, detail: ok ? `${kn.toFixed(1)} kn — speed good, hold her steady` : `${kn.toFixed(1)} kn — slow below 8 kn to berth`, kind: 'dock', urgent: !ok };
    }
    const strike = this.events.find((e) => e.kind === 'shorestrike' && e.fired && !e.done && !e.failed);
    if (strike) {
      const total = strike.count ?? 3;
      const left = this.combat.sitesAlive(strike.id);
      return {
        title: left > 0 ? `DESTROY THE BATTERIES · ${total - left}/${total}` : 'BATTERIES SILENCED',
        detail: left > 0 ? 'Coastal guns engaging — keep moving · reticle on the island, [1] gun · [3] missile' : 'The island is dark — proceed to the berth',
        kind: 'combat',
        urgent: left > 0,
      };
    }
    const hunt = this.events.find((e) => e.kind === 'hunt' && e.fired && !e.done && !e.failed);
    if (hunt) {
      return {
        title: 'SINK THE MOTHERSHIP',
        detail: 'She is the bounty — kill the screen or run them down · [SPACE] fire · [Q] weapon',
        kind: 'combat',
        urgent: true,
      };
    }
    const threat = this.pirates.threat();
    if (threat.count > 0) {
      const boarding = threat.alongside > 0;
      const tools = this.pirates.hosing
        ? 'HOSES ON'
        : boarding
          ? 'HOSES [E] · HARD RUDDER'
          : this.flareCd > 0
            ? `LRAD ${Math.ceil(this.flareCd)}s · BOOST`
            : threat.nearest < this.flareRange
              ? 'LRAD IN RANGE [F]'
              : 'SPEED & LRAD [F]';
      const navy = this.pirates.navyState === 'ready' ? ' · NAVY [V]' : this.pirates.navyState === 'inbound' ? ` · NAVY ${Math.ceil(this.pirates.navyTimer)}s` : '';
      return {
        title: boarding ? `REPEL BOARDERS · ${Math.round(threat.board * 100)}%` : 'REPEL THE PIRATES',
        detail: `${threat.count} skiff${threat.count > 1 ? 's' : ''} · ${fmtDist(threat.nearest)} · ${tools}${navy}`,
        kind: 'combat',
        urgent: true,
      };
    }
    if (this.raft && !this.raft.rescued) {
      const d = this.raft.pos.distanceTo(this.pos);
      if (d < 1600) return { title: 'RECOVER SURVIVORS', detail: `Life raft ${fmtDist(d)} · alongside under 10 kn · ${Math.ceil(this.raft.timer)}s`, kind: 'rescue', urgent: this.raft.timer < 40 };
    }
    const pod = this.wildlife.nearPod();
    if (pod && pod.dist < 1300) return { title: 'GIVE WAY TO THE WHALES', detail: `Pod ${fmtDist(pod.dist)} · keep under 12 kn · now ${kn.toFixed(0)} kn`, kind: 'wildlife', urgent: kn > 12.5 };
    if (this.inStorm) return { title: 'WEATHER THE STORM', detail: `${kn.toFixed(0)} kn · reduce to half ahead · hull ${this.hull.toFixed(0)}%`, kind: 'storm', urgent: kn > 14 };
    if (this.fouledT > 0) return { title: 'PROPELLER FOULED', detail: `Divers clearing the net · ${Math.ceil(this.fouledT)}s · revs limited`, kind: 'hazard', urgent: true };
    const wp = this.waypoints[Math.min(this.wpIndex, n - 1)];
    const dWp = wp.distanceTo(this.pos);
    const field = this.events.find((e) => e.fired && !e.done && !e.failed && ['minefield', 'icefield', 'fog', 'reef', 'fishing'].includes(e.kind));
    if (field) {
      const titles: Record<string, string> = {
        minefield: 'NAVIGATE THE MINEFIELD',
        icefield: 'THREAD THE ICE FIELD',
        fog: 'TRANSIT THE FOG BANK',
        reef: 'THREAD THE REEF PASSAGE',
        fishing: 'AVOID THE NETS',
      };
      return { title: titles[field.kind], detail: `Next mark ${fmtDist(dWp)} · ${this.risk ? `${this.risk} AHEAD — ALTER COURSE` : 'watch the radar'}`, kind: 'hazard', urgent: !!this.risk };
    }
    if (this.wpIndex >= n - 1) return { title: `PROCEED TO ${m.to.toUpperCase()}`, detail: `${fmtDist(last.distanceTo(this.pos))} to the berth`, kind: 'nav', urgent: false };
    return { title: `REACH WAYPOINT ${this.wpIndex}/${n - 2}`, detail: `${fmtDist(dWp)}${this.risk ? ` · ${this.risk} AHEAD` : ''}`, kind: 'nav', urgent: !!this.risk };
  }

  private taskList(): Task[] {
    const m = this.mission!;
    const tasks: Task[] = this.events
      .filter((e) => e.fired)
      .map((e) => ({
        id: e.id,
        label: e.skipped ? 'Pirates stood down — box jettisoned' : EVENT_META[e.kind].task(e),
        done: e.done,
        failed: e.failed,
        active: !e.done && !e.failed,
        optional: e.kind === 'distress',
      }));
    tasks.push({ id: 'berth', label: `Berth at ${m.to}`, done: false, failed: false, active: this.docking, optional: false });
    return tasks;
  }

  private emitTelemetry() {
    const m = this.mission;
    if (!m) return;
    const n = this.waypoints.length;
    const last = this.waypoints[n - 1];
    const distToGo = this.pos.distanceTo(last);
    const fx = Math.cos(this.heading);
    const fy = Math.sin(this.heading);

    const contacts: Contact[] = [];
    const pushC = (x: number, y: number, type: ContactType) => {
      const dx = x - this.pos.x;
      const dy = y - this.pos.y;
      if (Math.hypot(dx, dy) > this.radarRange) return;
      contacts.push({ x: dx * -fy + dy * fx, y: dx * fx + dy * fy, type });
    };
    for (const h of this.hazards) if (h.alive) pushC(h.pos.x, h.pos.y, h.kind);
    for (const c of this.pirates.contacts()) pushC(c.x, c.z, c.type);
    for (const c of this.traffic.contacts()) pushC(c.x, c.z, c.type);
    for (const c of this.wildlife.contacts()) pushC(c.x, c.z, c.type);
    for (const s of this.storms) pushC(s.pos.x, s.pos.y, 'storm');
    for (const s of this.combat.shore) if (s.alive) pushC(s.x, s.z, 'fort');
    if (this.raft && !this.raft.rescued) pushC(this.raft.pos.x, this.raft.pos.y, 'raft');
    const wp = this.waypoints[Math.min(this.wpIndex, n - 1)];
    const isFinal = this.wpIndex >= n - 1;
    pushC(wp.x, wp.y, isFinal ? 'port' : 'wp');

    this.camera.updateMatrixWorld();
    const markers: Marker[] = [];
    const addM = (id: string, type: MarkerType, x: number, z: number, y: number, label: string) => {
      const dx = x - this.pos.x;
      const dy = z - this.pos.y;
      const p = this.project(x, y, z);
      markers.push({ id, type, nx: p.nx, ny: p.ny, onScreen: p.onScreen, dist: Math.hypot(dx, dy), bearing: normDeg(((Math.atan2(dy, dx) - this.heading) * 180) / Math.PI), label });
    };
    addM('wp', isFinal ? 'port' : 'wp', wp.x, wp.y, isFinal ? 40 : 30, isFinal ? `BERTH · ${m.to.toUpperCase()}` : `WP ${this.wpIndex}/${n - 2}`);
    const world: WorldMarker[] = [...this.pirates.markers(), ...this.wildlife.markers()];
    for (const wm of world) addM(wm.id, wm.type, wm.x, wm.z, wm.y, wm.label);
    if (this.raft && !this.raft.rescued) addM('raft', 'raft', this.raft.pos.x, this.raft.pos.y, 6, 'MAYDAY');
    for (const s of this.combat.shore) if (s.alive) addM(`fort${s.id}`, 'fort', s.x, s.z, 14, `BATTERY ${Math.round(s.structural * 100)}%`);
    this.storms.forEach((s, i) => {
      const d = s.pos.distanceTo(this.pos);
      if (d < 3200 && d > s.radius) addM(`s${i}`, 'storm', s.pos.x, s.pos.y, 140, 'STORM');
    });

    const threat = this.pirates.threat();
    const aim = this.combat.aimTarget();
    this.cbs.onTelemetry({
      speed: Math.abs(this.speed) * KN,
      maxSpeed: this.maxSpeed * 1.28 * KN,
      throttle: this.throttle,
      rudder: this.rudder,
      heading: ((Math.atan2(fx, -fy) * 180) / Math.PI + 360) % 360,
      hull: this.hull,
      fuel: this.fuel,
      cargo: this.cargo,
      progress: this.progress(),
      distanceToGo: distToGo / 1000,
      eta: distToGo / Math.max(3, Math.abs(this.speed)),
      elapsed: this.elapsed,
      seaState: 0.5 + this.env * 4.5,
      wind: 8 + this.env * 62,
      weather: m.weather,
      inStorm: this.inStorm,
      piratesNear: threat.count,
      risk: this.risk,
      keelClearance: this.keel,
      flareCd: this.flareCd,
      flareMax: this.flareMax,
      boosting: this.boosting,
      contacts,
      radarRange: this.radarRange,
      camera: CAMERA_MODES[this.camMode],
      docking: this.docking,
      speedOk: Math.abs(this.speed) < DOCK_SPEED,
      wave: this.ocean.height(this.pos.x, this.pos.y),
      damageFlash: this.damageFlash,
      intro: this.introTimer > 0,
      objective: this.buildObjective(),
      tasks: this.taskList(),
      markers,
      bonus: this.bonusEarned,
      missionTitle: m.title,
      missionCode: m.code,
      hasPirates: this.pirates.navyState !== 'unavailable',
      hoseOn: this.pirates.hosing,
      hosePressure: this.pirates.pressure,
      navyState: this.pirates.navyState,
      navyEta: this.pirates.navyTimer,
      chain: this.chain,
      chainT: Math.max(0, Math.min(1, this.chainTimer / 24)),
      fouled: Math.max(0, this.fouledT),
      slowmo: !!this.activeChoice,
      choiceLeft: this.activeChoice?.timeLeft ?? 0,
      weapon: this.combat.weapon.label,
      weaponShort: this.combat.weapon.short,
      weaponHint: this.combat.weapon.hint,
      weaponCooldown: this.combat.cooldown,
      weaponHeat: this.combat.heat,
      weaponOverheated: this.combat.overheated,
      weaponSlot: this.combat.weaponIndex,
      weaponCds: WEAPONS.map((_, i) => this.combat.cooldownOf(i)),
      missiles: this.combat.ammo,
      maxMissiles: this.combat.maxAmmo,
      lock: this.combat.lock,
      locked: this.combat.lockedOn,
      aimOnTarget: !!aim,
      aimKind: aim?.kind ?? null,
      aimDist: aim?.dist ?? 0,
      shellsInFlight: this.combat.shellsInFlight,
      combat: this.combat.stats,
    });
  }

  /* -------------------------------------------------------------- life -- */

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('wheel', this.handleWheel);
    this.renderer.domElement.removeEventListener('touchstart', this.handleTouchStart as any);
    this.renderer.domElement.removeEventListener('touchmove', this.handleTouchMove as any);
    this.renderer.domElement.removeEventListener('touchend', this.handleTouchEnd as any);
    this.traffic.clear();
    this.combat.dispose();
    this.audio.dispose();
    this.ocean.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) this.container.removeChild(this.renderer.domElement);
  }

  isLowSpec(): boolean {
    return this.lowSpec;
  }

}
