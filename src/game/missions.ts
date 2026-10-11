export type WeatherKind = 'clear' | 'overcast' | 'rough' | 'storm';
export type EventKind =
  | 'pirates'
  | 'storm'
  | 'distress'
  | 'minefield'
  | 'icefield'
  | 'fog'
  | 'traffic'
  | 'whales'
  | 'fishing'
  | 'reef';

/** A scripted encounter that fires when the ship reaches `at` (0..1) along the route. */
export interface MissionEvent {
  at: number;
  kind: EventKind;
  count?: number;
  radius?: number;
}

export interface ChoiceOption {
  id: string;
  label: string;
  hint: string;
}

/** A decision offered over the radio mid-voyage (time slows while it is open). */
export interface MissionChoice {
  at: number;
  id: string;
  speaker: string;
  text: string;
  options: ChoiceOption[];
  defaultOption: string;
}

export type MissionKind = 'story' | 'contract' | 'daily';
export type Difficulty = 'Routine' | 'Standard' | 'High Risk' | 'Severe' | 'Extreme';

export interface MissionDef {
  id: number;
  code: string;
  title: string;
  kind: MissionKind;
  chapter?: string;
  from: string;
  to: string;
  region: string;
  cargoDesc: string;
  cargoTons: number;
  reward: number;
  distanceKm: number;
  weather: WeatherKind;
  sunElevation: number;
  obstacleDensity: number;
  traffic: number;
  parTime: number;
  difficulty: Difficulty;
  brief: string[];
  events: MissionEvent[];
  choices?: MissionChoice[];
}

export const EVENT_META: Record<EventKind, { icon: string; label: string; task: (e: MissionEvent) => string }> = {
  pirates: { icon: '☠', label: 'Pirate attack', task: (e) => `Repel the pirate attack (${e.count ?? 2} skiffs)` },
  storm: { icon: '⚡', label: 'Storm cell', task: () => 'Weather the storm cell' },
  distress: { icon: '🆘', label: 'Distress call', task: () => 'Recover survivors from the life raft' },
  minefield: { icon: '✸', label: 'Minefield', task: () => 'Pick a way through the minefield' },
  icefield: { icon: '❄', label: 'Ice field', task: () => 'Thread the ice field' },
  fog: { icon: '🌫', label: 'Fog bank', task: () => 'Transit the fog bank on instruments' },
  traffic: { icon: '⛴', label: 'Crossing traffic', task: () => 'Give way to crossing traffic' },
  whales: { icon: '🐋', label: 'Whale pod', task: () => 'Pass the whale pod without a strike' },
  fishing: { icon: '🎣', label: 'Fishing fleet', task: () => "Keep clear of the trawlers' nets" },
  reef: { icon: '🪸', label: 'Reef passage', task: () => 'Navigate the reef passage' },
};

export const MISSIONS: MissionDef[] = [
  {
    id: 0,
    code: 'VOY-1041',
    title: 'Maiden Crossing',
    kind: 'story',
    chapter: 'Chapter I — A Clean Year',
    from: 'Rotterdam',
    to: 'Felixstowe',
    region: 'North Sea · Dover Strait approaches',
    cargoDesc: 'Consumer electronics · 1,180 TEU',
    cargoTons: 18400,
    reward: 240000,
    distanceKm: 4.2,
    weather: 'clear',
    sunElevation: 24,
    obstacleDensity: 0.3,
    traffic: 3,
    parTime: 235,
    difficulty: 'Routine',
    brief: [
      'A shake-down run for a new master. Clear skies, busy lanes, a well-marked channel.',
      'A yacht went missing off the route last night — keep a lookout for a life raft.',
      'Berth under 8 knots. Pilots get nervous when 160 metres of steel comes in hot.',
    ],
    events: [
      { at: 0.24, kind: 'traffic' },
      { at: 0.4, kind: 'fishing' },
      { at: 0.62, kind: 'distress' },
    ],
  },
  {
    id: 1,
    code: 'VOY-1177',
    title: 'North Sea Squall',
    kind: 'story',
    chapter: 'Chapter II — Voices on Sixteen',
    from: 'Hamburg',
    to: 'Immingham',
    region: 'German Bight · Dogger Bank',
    cargoDesc: 'Automotive parts · 1,420 TEU',
    cargoTons: 24100,
    reward: 380000,
    distanceKm: 5.4,
    weather: 'rough',
    sunElevation: 14,
    obstacleDensity: 0.45,
    traffic: 3,
    parTime: 305,
    difficulty: 'Standard',
    brief: [
      'A deep low is tracking across the Bight. Expect a violent squall line mid-passage.',
      'Dogger Bank trawlers are working the lane, and a field of old contact mines has broken loose.',
      'Inside a storm cell, speed is damage: come down to half ahead and keep her head to sea.',
    ],
    events: [
      { at: 0.22, kind: 'storm', radius: 620 },
      { at: 0.42, kind: 'fishing' },
      { at: 0.6, kind: 'minefield', count: 11 },
      { at: 0.82, kind: 'traffic' },
    ],
  },
  {
    id: 2,
    code: 'VOY-2263',
    title: 'Strait Runner',
    kind: 'story',
    chapter: 'Chapter III — The Strait',
    from: 'Port Said',
    to: 'Jeddah',
    region: 'Red Sea · Bab-el-Mandeb approaches',
    cargoDesc: 'Refrigerated produce · 1,660 TEU',
    cargoTons: 27600,
    reward: 520000,
    distanceKm: 6.2,
    weather: 'overcast',
    sunElevation: 32,
    obstacleDensity: 0.5,
    traffic: 4,
    parTime: 350,
    difficulty: 'High Risk',
    brief: [
      'Skiffs launched from a mothership have boarded two merchants this month.',
      'Best Management Practice: speed, hard rudder to throw them off, fire hoses on the rails, LRAD for range.',
      'Coral reefs crowd the channel. A coaster has gone dark in the haze and may be in trouble.',
    ],
    events: [
      { at: 0.14, kind: 'reef' },
      { at: 0.27, kind: 'pirates', count: 2 },
      { at: 0.45, kind: 'fog' },
      { at: 0.57, kind: 'distress' },
      { at: 0.75, kind: 'pirates', count: 3 },
    ],
  },
  {
    id: 3,
    code: 'VOY-3308',
    title: 'Cape of Storms',
    kind: 'story',
    chapter: 'Chapter IV — Cape of Storms',
    from: 'Cape Town',
    to: 'Durban',
    region: 'Agulhas Bank · Wild Coast',
    cargoDesc: 'Heavy machinery · 2,050 TEU',
    cargoTons: 33800,
    reward: 760000,
    distanceKm: 7.0,
    weather: 'storm',
    sunElevation: 8,
    obstacleDensity: 0.62,
    traffic: 3,
    parTime: 395,
    difficulty: 'Severe',
    brief: [
      'Full gale on the Agulhas current. Two storm cells sit squarely across the rhumb line.',
      'Bergs calved far south have drifted into the lane — growlers are nearly invisible to the eye.',
      'A pirate mothership is shadowing the coast. Kestrel will want to talk.',
    ],
    events: [
      { at: 0.16, kind: 'icefield', count: 9 },
      { at: 0.3, kind: 'storm', radius: 780 },
      { at: 0.57, kind: 'pirates', count: 3 },
      { at: 0.78, kind: 'storm', radius: 560 },
    ],
    choices: [
      {
        at: 0.47,
        id: 'kestrel_offer',
        speaker: 'kestrel',
        text: 'Captain. Put the sealed box over the side and my boys stay home. Refuse, and they come aboard to take it.',
        options: [
          { id: 'refuse', label: 'Hold course', hint: 'Keep the box — the pirates will attack' },
          { id: 'comply', label: 'Jettison the container', hint: 'Lose 12% cargo — no attack' },
        ],
        defaultOption: 'refuse',
      },
    ],
  },
  {
    id: 4,
    code: 'VOY-4120',
    title: 'Arctic Relief',
    kind: 'story',
    chapter: 'Chapter V — Arctic Relief',
    from: 'Murmansk',
    to: 'Longyearbyen',
    region: 'Barents Sea · Svalbard',
    cargoDesc: 'Humanitarian relief · 1,900 TEU',
    cargoTons: 29800,
    reward: 900000,
    distanceKm: 7.6,
    weather: 'overcast',
    sunElevation: 10,
    obstacleDensity: 0.6,
    traffic: 2,
    parTime: 425,
    difficulty: 'Severe',
    brief: [
      'A settlement is cut off; every container lost is a family without heat.',
      'Pack ice is breaking up early. Humpbacks are migrating through the lane.',
      'A fishing crew abandoned ship in the ice last night. They will not last long in that water.',
    ],
    events: [
      { at: 0.16, kind: 'icefield', count: 12 },
      { at: 0.32, kind: 'whales' },
      { at: 0.46, kind: 'storm', radius: 700 },
      { at: 0.62, kind: 'icefield', count: 10 },
      { at: 0.8, kind: 'distress' },
    ],
  },
  {
    id: 5,
    code: 'VOY-4415',
    title: 'Ghost Convoy',
    kind: 'story',
    chapter: 'Chapter VI — Ghost Convoy',
    from: 'Singapore',
    to: 'Hong Kong',
    region: 'South China Sea · Paracel passage',
    cargoDesc: 'High-value pharma · 2,400 TEU',
    cargoTons: 39500,
    reward: 1250000,
    distanceKm: 8.6,
    weather: 'storm',
    sunElevation: 4,
    obstacleDensity: 0.82,
    traffic: 4,
    parTime: 485,
    difficulty: 'Extreme',
    brief: [
      'Dusk transit under a typhoon remnant: fog, reefs, a minefield, two pirate waves and a storm wall.',
      'Everything that can go wrong on this lane is on this lane. Kestrel has nothing left to lose.',
      'A clean delivery here makes your name. Losing her ends it.',
    ],
    events: [
      { at: 0.1, kind: 'fog' },
      { at: 0.2, kind: 'reef' },
      { at: 0.32, kind: 'minefield', count: 14 },
      { at: 0.44, kind: 'pirates', count: 3 },
      { at: 0.58, kind: 'storm', radius: 860 },
      { at: 0.7, kind: 'distress' },
      { at: 0.84, kind: 'pirates', count: 4 },
    ],
  },
];

/* ------------------------------------------------------------ contracts */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PORTS: [string, string][] = [
  ['Rotterdam', 'North Sea'],
  ['Antwerp', 'Scheldt'],
  ['Le Havre', 'English Channel'],
  ['Algeciras', 'Gibraltar Strait'],
  ['Piraeus', 'Aegean Sea'],
  ['Port Said', 'Suez approaches'],
  ['Salalah', 'Arabian Sea'],
  ['Colombo', 'Laccadive Sea'],
  ['Singapore', 'Malacca Strait'],
  ['Busan', 'Korea Strait'],
  ['Santos', 'South Atlantic'],
  ['Lagos', 'Gulf of Guinea'],
  ['Halifax', 'North Atlantic'],
  ['Reykjavík', 'Denmark Strait'],
  ['Valparaíso', 'Humboldt Current'],
];
const CARGOS = [
  'Consumer electronics',
  'Frozen seafood',
  'Pharmaceuticals',
  'Coffee & cocoa',
  'Wind turbine parts',
  'Machine tools',
  'Textiles',
  'Medical supplies',
  'Auto parts',
  'Luxury vehicles',
  'Solar panels',
  'Fine wines',
];
const TITLES = ['Coastal Hop', 'Long Haul', 'Hot Cargo', 'Night Run', 'Express Lane', 'Rough Passage', 'Reefer Rush', 'Graveyard Shift', 'Blue Riband', 'Tramp Run'];

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dailySeed() {
  let h = 2166136261;
  for (const ch of todayKey()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Procedural tramp charter. `tier` 0..5 scales weather, hazards and pay. */
export function generateContract(seed: number, tier: number, kind: 'contract' | 'daily'): MissionDef {
  const R = rng(seed);
  const pick = <T>(a: T[]): T => a[Math.floor(R() * a.length)];
  const t = Math.max(0, Math.min(5, tier));
  const a = pick(PORTS);
  let b = pick(PORTS);
  while (b[0] === a[0]) b = pick(PORTS);
  const wr = R();
  const weather: WeatherKind =
    t < 1 ? (wr < 0.6 ? 'clear' : 'overcast') : wr < 0.22 ? 'clear' : wr < 0.5 ? 'overcast' : wr < 0.8 ? 'rough' : 'storm';
  const n = Math.min(6, 2 + Math.floor(t * 0.7) + (R() < 0.5 ? 1 : 0));
  const pool: EventKind[] =
    t < 1
      ? ['traffic', 'fishing', 'distress', 'whales', 'reef', 'fog']
      : ['traffic', 'fishing', 'distress', 'whales', 'reef', 'minefield', 'fog', 'storm', 'pirates', 'pirates'];
  if (weather !== 'clear' && t >= 1) pool.push('icefield');
  const events: MissionEvent[] = [];
  for (let i = 0; i < n; i++) {
    const k = pick(pool);
    const ev: MissionEvent = { at: Math.round((0.12 + (i / n) * 0.74 + R() * 0.04) * 100) / 100, kind: k };
    if (k === 'pirates') ev.count = Math.min(4, 1 + Math.floor(t / 2) + (R() < 0.4 ? 1 : 0));
    if (k === 'minefield') ev.count = 8 + Math.round(t * 1.5);
    if (k === 'icefield') ev.count = 7 + Math.round(t * 1.5);
    if (k === 'storm') ev.radius = 520 + Math.round(R() * 320);
    events.push(ev);
  }
  const distanceKm = Math.round((4 + t * 0.7 + R() * 1.4) * 10) / 10;
  const reward = Math.round(((180000 + t * 140000 + n * 45000) * (kind === 'daily' ? 1.3 : 1)) / 1000) * 1000;
  const parTime = Math.round(((distanceKm * 1000) / 26) * 1.45 + n * 5);
  const diffs: Difficulty[] = ['Routine', 'Standard', 'High Risk', 'Severe', 'Extreme'];
  const teu = 900 + Math.round(R() * 1600);
  const wText = { clear: 'Fair weather forecast', overcast: 'Overcast, moderate sea', rough: 'Rough sea, near gale', storm: 'Storm warning in force' }[weather];
  return {
    id: kind === 'daily' ? 900 : 100 + (seed % 700),
    code: `${kind === 'daily' ? 'DLY' : 'TRP'}-${1000 + (seed % 9000)}`,
    title: kind === 'daily' ? 'Daily Charter' : pick(TITLES),
    kind,
    from: a[0],
    to: b[0],
    region: `${a[1]} → ${b[1]}`,
    cargoDesc: `${pick(CARGOS)} · ${teu.toLocaleString()} TEU`,
    cargoTons: teu * 16,
    reward,
    distanceKm,
    weather,
    sunElevation: 4 + Math.round(R() * 30),
    obstacleDensity: Math.min(0.9, 0.25 + t * 0.12),
    traffic: 2 + Math.floor(R() * 3),
    parTime,
    difficulty: diffs[Math.min(4, Math.floor(t))],
    brief: [
      `Tramp charter from ${a[0]} to ${b[0]}. ${wText}.`,
      `Intelligence along the track: ${events.map((e) => EVENT_META[e.kind].label.toLowerCase()).join(', ')}.`,
      kind === 'daily'
        ? "Everyone sails the same Daily Charter today — your best settlement is recorded."
        : 'Pays on delivery. Seamanship awards build your chain multiplier.',
    ],
    events,
  };
}

/* ----------------------------------------------------------- progression */

export interface Upgrades {
  hull: number;
  engine: number;
  lrad: number;
  radar: number;
  stab: number;
}
export type UpgradeId = keyof Upgrades;

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  desc: string;
  cost: number[];
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'hull', name: 'Reinforced Hull', icon: '🛡️', desc: '−14% impact damage per level', cost: [160000, 300000, 520000] },
  { id: 'engine', name: 'Engine Overhaul', icon: '⚙️', desc: '+6% top speed, quicker response per level', cost: [200000, 360000, 600000] },
  { id: 'lrad', name: 'LRAD Mk II', icon: '📡', desc: '−3 s recharge, +90 m range per level', cost: [140000, 260000, 420000] },
  { id: 'radar', name: 'Long-range Radar', icon: '🛰️', desc: '+700 m detection range per level', cost: [120000, 260000] },
  { id: 'stab', name: 'Fin Stabilisers', icon: '🌊', desc: '−22% storm damage, steadier deck per level', cost: [180000, 340000] },
];

export const DEFAULT_UPGRADES: Upgrades = { hull: 0, engine: 0, lrad: 0, radar: 0, stab: 0 };

export interface Totals {
  rescues: number;
  closeCalls: number;
  contracts: number;
  hoseRepels: number;
  whalesSafe: number;
  outran: number;
}

export interface SaveData {
  bank: number;
  earnings: number;
  unlocked: number;
  upgrades: Upgrades;
  stars: Record<number, number>;
  voyages: number;
  flags: Record<string, string>;
  achievements: string[];
  totals: Totals;
  dailyBest: { date: string; score: number } | null;
  contractSeed: number;
  storyDone: boolean;
}

export const DEFAULT_SAVE: SaveData = {
  bank: 0,
  earnings: 0,
  unlocked: 0,
  upgrades: { ...DEFAULT_UPGRADES },
  stars: {},
  voyages: 0,
  flags: {},
  achievements: [],
  totals: { rescues: 0, closeCalls: 0, contracts: 0, hoseRepels: 0, whalesSafe: 0, outran: 0 },
  dailyBest: null,
  contractSeed: 1,
  storyDone: false,
};

export const RANKS = [
  { min: 0, title: 'Deck Cadet' },
  { min: 250000, title: 'Third Officer' },
  { min: 800000, title: 'Second Officer' },
  { min: 1600000, title: 'Chief Officer' },
  { min: 2800000, title: 'Captain' },
  { min: 4500000, title: 'Commodore' },
];

export function rankFor(earnings: number) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (earnings >= RANKS[i].min) idx = i;
  const cur = RANKS[idx];
  const next = RANKS[idx + 1];
  const progress = next ? (earnings - cur.min) / (next.min - cur.min) : 1;
  return { title: cur.title, next: next?.title ?? null, progress, index: idx };
}

export function starsFor(m: MissionDef, success: boolean, cargo: number, time: number, hull: number): number {
  if (!success) return 0;
  let s = 1;
  if (cargo >= 0.7 || time <= m.parTime * 1.3) s = 2;
  if (cargo >= 0.9 && time <= m.parTime && hull >= 0.45) s = 3;
  return s;
}

/* ---------------------------------------------------------- achievements */

export interface Achievement {
  id: string;
  icon: string;
  name: string;
  desc: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', icon: '⚓', name: 'First Landfall', desc: 'Complete your first delivery' },
  { id: 'perfect', icon: '★', name: 'Perfectionist', desc: 'Earn three stars on any story voyage' },
  { id: 'legend', icon: '👑', name: 'Fleet Legend', desc: 'Three stars on every story voyage' },
  { id: 'rescue', icon: '🛟', name: 'Good Samaritan', desc: 'Recover survivors from a life raft' },
  { id: 'angel', icon: '😇', name: 'Guardian Angel', desc: 'Recover survivors five times' },
  { id: 'hose', icon: '💦', name: 'Cold Shower', desc: 'Drive off a skiff with the fire hoses' },
  { id: 'outrun', icon: '💨', name: 'Clean Pair of Heels', desc: 'Outrun a pirate skiff' },
  { id: 'needle', icon: '🪡', name: 'Needle Threader', desc: 'Score 10 close calls in total' },
  { id: 'whale', icon: '🐋', name: 'Gentle Giant', desc: 'Pass a whale pod slowly without a strike' },
  { id: 'untouched', icon: '🛡️', name: 'Untouched', desc: 'Deliver with a perfect hull' },
  { id: 'navy', icon: '🚁', name: 'Friends in High Places', desc: 'Call in the navy helicopter' },
  { id: 'chain', icon: '⛓', name: 'Unbroken Chain', desc: 'Reach a ×5 seamanship chain' },
  { id: 'story', icon: '📜', name: 'The Aurora Manifest', desc: 'Finish the story' },
  { id: 'tramp', icon: '🧭', name: 'Tramp Steamer', desc: 'Complete five contracts' },
  { id: 'million', icon: '💰', name: 'Millionaire', desc: 'Hold $1,000,000 in the bank' },
];

export function checkAchievements(save: SaveData, s?: EndStats): string[] {
  const has = new Set(save.achievements);
  const out: string[] = [];
  const t = save.totals;
  const add = (id: string, cond: boolean) => {
    if (cond && !has.has(id)) out.push(id);
  };
  add('first', Object.keys(save.stars).length > 0 || t.contracts > 0);
  add('perfect', Object.values(save.stars).some((v) => v >= 3));
  add('legend', MISSIONS.every((m) => (save.stars[m.id] ?? 0) >= 3));
  add('rescue', t.rescues >= 1);
  add('angel', t.rescues >= 5);
  add('hose', t.hoseRepels >= 1);
  add('outrun', t.outran >= 1);
  add('needle', t.closeCalls >= 10);
  add('whale', t.whalesSafe >= 1);
  add('untouched', !!s && s.success && s.hullLeft >= 0.995);
  add('navy', !!s && s.navyCalled);
  add('chain', !!s && s.maxChain >= 5);
  add('story', save.storyDone);
  add('tramp', t.contracts >= 5);
  add('million', save.bank >= 1000000);
  return out;
}

export interface EndStats {
  success: boolean;
  mission: MissionDef;
  stars: number;
  cargoDelivered: number;
  hullLeft: number;
  fuelLeft: number;
  timeTaken: number;
  deliveredTons: number;
  payout: number;
  bonus: number;
  eventBonus: number;
  penalties: number;
  total: number;
  reasons: string[];
  eventLog: string[];
  closeCalls: number;
  rescued: number;
  attacksRepelled: number;
  hoseRepels: number;
  outran: number;
  boarded: number;
  whaleSafe: number;
  whaleStrikes: number;
  navyCalled: boolean;
  maxChain: number;
  choices: Record<string, string>;
  failReason: string;
}
