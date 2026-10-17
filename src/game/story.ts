/* The Aurora Manifest — campaign script, radio chatter and endings. */

export interface Character {
  name: string;
  role: string;
  color: string;
  portrait: string;
  icon: string;
}

export const CHARACTERS: Record<string, Character> = {
  okafor: { name: 'Amara Okafor', role: 'Chief Officer', color: '#67e8f9', portrait: 'portraits/okafor.jpg', icon: '⚓' },
  brandt: { name: 'Teo Brandt', role: 'Chief Engineer', color: '#fbbf24', portrait: 'portraits/brandt.jpg', icon: '⚙️' },
  voss: { name: 'Harlan Voss', role: 'Owner · Bluewater Line', color: '#c4b5fd', portrait: 'portraits/voss.jpg', icon: '💼' },
  reyes: { name: 'Cdr. Lena Reyes', role: 'Combined Maritime Forces', color: '#86efac', portrait: 'portraits/reyes.jpg', icon: '🎖️' },
  kestrel: { name: 'Kestrel', role: 'Unknown · VHF Channel 16', color: '#fca5a5', portrait: 'portraits/kestrel.jpg', icon: '☠' },
  vts: { name: 'Vessel Traffic Service', role: 'Coastal VTS', color: '#cbd5e1', portrait: '', icon: '📡' },
  skipper: { name: 'Trawler Skipper', role: 'Fishing vessel', color: '#fdba74', portrait: '', icon: '🎣' },
  survivor: { name: 'Survivor', role: 'Recovered from life raft', color: '#fda4af', portrait: '', icon: '🛟' },
};

export type Flags = Record<string, string>;

export interface StoryLine {
  speaker: string;
  text: string;
  if?: (f: Flags) => boolean;
}

export interface StoryChoice {
  id: string;
  prompt: string;
  options: { id: string; label: string; detail: string; bank?: number }[];
}

export interface Chapter {
  mission: number;
  numeral: string;
  title: string;
  pre: StoryLine[];
  post: StoryLine[];
  choice?: StoryChoice;
}

const kept = (f: Flags) => f.gaveBox !== 'yes';

export const CHAPTERS: Chapter[] = [
  {
    mission: 0,
    numeral: 'I',
    title: 'A Clean Year',
    pre: [
      { speaker: 'voss', text: 'Captain. Welcome to Bluewater Line — four ships, three mortgages and one last chance.' },
      { speaker: 'voss', text: 'Our insurer, Meridian Holdings, wants a clean year. No losses, no claims. Give me that and this company lives.' },
      { speaker: 'okafor', text: "Amara Okafor, Chief Officer. I've kept the Aurora afloat through two owners and a bankruptcy. Try not to be disaster number three." },
      { speaker: 'brandt', text: "Brandt, engine room. She's old but she's honest. Ring the telegraph gently and she'll take you anywhere." },
      { speaker: 'okafor', text: 'Easy run to Felixstowe. A yacht went missing off our route last night, so keep your eyes open.' },
    ],
    post: [
      { speaker: 'okafor', text: 'All fast and secure. Not bad for a first run, Captain.' },
      { speaker: 'voss', text: 'Splendid. One more thing — a priority client has a sealed container going east. BWLU 771042. Paid in advance. No inspection.' },
      { speaker: 'okafor', text: "\"No inspection\" is how ships end up on the evening news, Captain." },
    ],
    choice: {
      id: 'sealed',
      prompt: 'Voss wants the sealed container loaded without inspection.',
      options: [
        { id: 'accept', label: 'Take the box', detail: '+$150,000 handling fee. Voss trusts you.', bank: 150000 },
        { id: 'inspect', label: 'Demand an inspection', detail: 'No fee. Okafor trusts you.' },
      ],
    },
  },
  {
    mission: 1,
    numeral: 'II',
    title: 'Voices on Sixteen',
    pre: [
      { speaker: 'okafor', text: "Voss refused the inspection and loaded the box anyway. Welded seals, a satellite tag, and a manifest that says 'machine parts'.", if: (f) => f.sealed === 'inspect' },
      { speaker: 'okafor', text: "Your sealed box is in bay four, Captain. It has its own satellite transponder. Machine parts don't phone home.", if: (f) => f.sealed !== 'inspect' },
      { speaker: 'brandt', text: "Glass is falling like a stone. There's a squall line out there the size of Denmark." },
      { speaker: 'okafor', text: "And the navy says a field of old contact mines broke loose on the Dogger Bank. Broke loose — or was cut loose." },
    ],
    post: [
      { speaker: 'okafor', text: "That voice on channel sixteen. Whoever 'Kestrel' is, they knew our name, our cargo and our ETA." },
      { speaker: 'brandt', text: "Our passage plan only went to two places: the office, and Meridian's underwriters." },
      { speaker: 'voss', text: 'Paranoia is bad for business, Captain. Next stop: the Red Sea. Keep her moving.' },
    ],
  },
  {
    mission: 2,
    numeral: 'III',
    title: 'The Strait',
    pre: [
      { speaker: 'reyes', text: 'Commander Lena Reyes, Combined Maritime Forces. Eleven attacks in this strait this year. Every one of them on a Meridian-insured ship.' },
      { speaker: 'reyes', text: "If they come for you, call us. I have one helicopter for four hundred miles of sea, so choose your moment." },
      { speaker: 'okafor', text: 'Fire hoses are rigged on both rails. Speed, hard rudder, hoses, LRAD — we make ourselves the hardest target in the strait.' },
    ],
    post: [
      { speaker: 'okafor', text: "The coaster crew we pulled out said the skiffs kept asking for 'the Bluewater box' — before they realised they had the wrong ship." },
      { speaker: 'reyes', text: 'Captain, is there anything aboard that makes you a target? Anything at all?' },
    ],
    choice: {
      id: 'navy',
      prompt: 'Commander Reyes is asking about the sealed container.',
      options: [
        { id: 'tell', label: 'Tell Reyes everything', detail: 'The navy helicopter responds faster from now on. Voss will be furious.' },
        { id: 'silent', label: 'Say nothing', detail: 'Voss pays a $200,000 "loyalty bonus".', bank: 200000 },
      ],
    },
  },
  {
    mission: 3,
    numeral: 'IV',
    title: 'Cape of Storms',
    pre: [
      { speaker: 'voss', text: 'You talked to the navy. Do you have any idea what you have done? That box is my insurance — literally.', if: (f) => f.navy === 'tell' },
      { speaker: 'voss', text: 'Good. Discretion is a rare quality at sea. The box stays with you until Durban.', if: (f) => f.navy !== 'tell' },
      { speaker: 'brandt', text: "Two storm cells and ice where ice has no business being. I'll keep her breathing. You keep her pointed." },
      { speaker: 'okafor', text: 'And somewhere off the Wild Coast, a mothership is waiting for us.' },
    ],
    post: [
      { speaker: 'okafor', text: "We dropped it. They took it. Kestrel didn't even say thank you.", if: (f) => f.gaveBox === 'yes' },
      { speaker: 'voss', text: 'You gave it to them. Then we are finished, Captain. All of us.', if: (f) => f.gaveBox === 'yes' },
      { speaker: 'okafor', text: 'We held. Captain — Brandt cut the seals on the box. You need to hear this.', if: kept },
      { speaker: 'brandt', text: 'No drugs, no guns. A ledger and a hard drive. Payments from Meridian Holdings to someone called Kestrel. Ship names. Dates. Every hijacking for three years.', if: kept },
      { speaker: 'okafor', text: 'Meridian insures the ships, pays the pirates, then collects on the claims. Piracy is their business model.', if: kept },
    ],
  },
  {
    mission: 4,
    numeral: 'V',
    title: 'Arctic Relief',
    pre: [
      { speaker: 'voss', text: "So now you know. I was going to sell that ledger back to Meridian — enough to save Bluewater ten times over. Don't look at me like that.", if: kept },
      { speaker: 'voss', text: 'Meridian cancelled our cover. One charter still pays: relief cargo to Svalbard. Nobody else will touch it.', if: (f) => f.gaveBox === 'yes' },
      { speaker: 'okafor', text: 'A settlement up north is cut off. Fuel, food, medicine. Every container we lose is a family without heat.' },
      { speaker: 'reyes', text: "I'm flying north with you as far as Bear Island. Get that ledger to Hong Kong and Meridian falls.", if: (f) => f.navy === 'tell' && kept(f) },
    ],
    post: [
      { speaker: 'okafor', text: "The settlement's lights are back on. The fishermen we pulled out of the ice want to name a boat after you. It's a very small boat." },
      { speaker: 'kestrel', text: 'Clever Captain. Hong Kong is a long way, and the South China Sea is very wide. And very, very dark.', if: kept },
      { speaker: 'kestrel', text: "You gave me the box, Captain, but you've seen what was in it. Loose ends are bad for business.", if: (f) => f.gaveBox === 'yes' },
    ],
  },
  {
    mission: 5,
    numeral: 'VI',
    title: 'Ghost Convoy',
    pre: [
      { speaker: 'reyes', text: 'Hong Kong Marine Police and my task force are waiting at Kwai Chung. Get the ledger alongside and it is over.', if: (f) => f.navy === 'tell' && kept(f) },
      { speaker: 'voss', text: 'My buyers are waiting in Hong Kong. Deliver the ledger to them and Bluewater is rich. Everyone gets paid.', if: (f) => f.navy !== 'tell' && kept(f) },
      { speaker: 'okafor', text: 'Typhoon remnant, a minefield and every gun Kestrel can hire. This is the voyage they write songs about. Or obituaries.' },
      { speaker: 'brandt', text: "She's got one more hard run in her. Let's make it a good one." },
    ],
    post: [],
  },
  {
    mission: 6,
    numeral: 'VII',
    title: 'Guns for Hire',
    pre: [
      { speaker: 'reyes', text: "Meridian is finished, Captain — and so, almost, is the trade it built. Almost. Kestrel's network is bleeding, but the skiff packs still work the Malacca Strait." },
      { speaker: 'reyes', text: 'The Coalition needs armed auxiliaries it can trust. Naval stores to Colombo — and if the packs come out, you are cleared to put them down. There is a bounty on every kill.' },
      { speaker: 'okafor', text: "They've bolted a 76-millimetre gun onto my forecastle, Captain. My cargo ship. I don't know whether to be proud or terrified." },
      { speaker: 'brandt', text: "A Phalanx on the bridge roof and Sea Lance missiles in a box forward. Strangest load I've ever signed for — but she's ready." },
    ],
    post: [
      { speaker: 'reyes', text: 'Confirmed kills logged, bounty wired. The strait is quieter tonight because of you.' },
      { speaker: 'kestrel', text: 'Guns now, Captain. You used to be interesting. Now you are merely dangerous.' },
      { speaker: 'okafor', text: "He called within the hour of the last kill. He's watching us — or someone near him is." },
    ],
  },
  {
    mission: 7,
    numeral: 'VIII',
    title: 'The Island',
    pre: [
      { speaker: 'reyes', text: "Overflight found it. An islet off Socotra — bunkers, coastal guns, skiff pens. Kestrel's forward anchorage, and the source of every attack this year." },
      { speaker: 'reyes', text: 'My frigates are twelve hours out. You are ninety minutes out. Rules of engagement: the batteries first, then anything that sorties.' },
      { speaker: 'okafor', text: 'Precision munitions in the hold and coastal guns on the beach. If they hit our cargo, the fireworks will be seen from space.' },
      { speaker: 'brandt', text: 'Keep her moving, Captain. A ship at flank speed is a hard target. A ship at dead slow is artillery practice.' },
    ],
    post: [
      { speaker: 'okafor', text: 'The island is dark. Not one gun left. Listen to it — nothing.' },
      { speaker: 'reyes', text: "Battery destruction confirmed by drone. Kestrel just lost his safe harbour, and he is very, very angry." },
      { speaker: 'kestrel', text: "You shell men's homes now, Captain. Between us — I didn't think you had it in you. Judgement is coming." },
    ],
  },
  {
    mission: 8,
    numeral: 'IX',
    title: 'Judgement',
    pre: [
      { speaker: 'okafor', text: 'Kestrel Shoal. Everything he has left: four batteries, every skiff in the basin, and a storm to hide it all under.' },
      { speaker: 'reyes', text: 'This is the last operation, Captain. Take the island and the network dies tonight. The Coalition owes you a clean sea.' },
      { speaker: 'voss', text: 'Whatever happens out there — Bluewater survives because of you. That is worth more than the bonus. Almost.' },
      { speaker: 'brandt', text: "She's fuelled, she's armed, and she's angry. Let's finish it." },
    ],
    post: [],
  },
];

export function chapterFor(missionId: number): Chapter | undefined {
  return CHAPTERS.find((c) => c.mission === missionId);
}

export function linesFor(lines: StoryLine[], f: Flags): StoryLine[] {
  return lines.filter((l) => !l.if || l.if(f));
}

export function endingFor(f: Flags): { title: string; lines: StoryLine[] } {
  if (f.gaveBox === 'yes')
    return {
      title: 'Quiet Waters',
      lines: [
        { speaker: 'okafor', text: "We made it. Nobody will ever know what we carried — because in the end, we didn't." },
        { speaker: 'brandt', text: 'Meridian walks. Kestrel sails on. Some voyages you just survive, Captain.' },
        { speaker: 'okafor', text: "But the crew is alive, and so is the Aurora. That's not nothing." },
      ],
    };
  if (f.navy === 'tell')
    return {
      title: 'The Ledger',
      lines: [
        { speaker: 'reyes', text: "Meridian's directors were arrested an hour ago. Kestrel's network is collapsing port by port. You did that, Captain." },
        { speaker: 'voss', text: 'Bluewater has a new insurer, a new contract, and — apparently — a conscience. I suppose I can live with that.' },
        { speaker: 'okafor', text: "I'll sail with you anywhere, Captain. Wherever she's headed next." },
      ],
    };
  return {
    title: "Voss's Bargain",
    lines: [
      { speaker: 'voss', text: 'Meridian paid. Every cent. Bluewater has six new ships, and you have a bonus with far too many zeros.' },
      { speaker: 'okafor', text: "I'm signing off, Captain. I can't sail on blood money. Good luck." },
      { speaker: 'kestrel', text: 'Business as usual, Captain. See you on sixteen.' },
    ],
  };
}

/* ----------------------------------------------------------- radio cues */

export interface RadioCue {
  at?: number;
  on?: string;
  speaker: string;
  text: string;
  if?: (f: Flags) => boolean;
}

export const RADIO: Record<number, RadioCue[]> = {
  0: [
    { on: 'start', speaker: 'okafor', text: 'Engines answering, Captain. The Felixstowe pilot wants us in before the tide turns — no pressure.' },
    { on: 'traffic', speaker: 'vts', text: 'Aurora Trader, Thames VTS. Container ship crossing ahead of you — she is the stand-on vessel.' },
    { on: 'fishing', speaker: 'okafor', text: "Trawlers ahead. See the orange floats? That's their net. Run over it and it wraps round our propeller." },
    { on: 'distress', speaker: 'okafor', text: "There's the missing yacht's raft! Bring us alongside nice and slow — under ten knots." },
    { on: 'rescued', speaker: 'survivor', text: "Thank you... thank you. We'd been drifting since midnight." },
    { at: 0.86, speaker: 'brandt', text: "Engine's purring, Captain. Bring her in gently and the first round's on me." },
  ],
  1: [
    { on: 'start', speaker: 'brandt', text: 'Barometer reads nine-seven-one and dropping. Hope you had a light breakfast.' },
    { on: 'storm', speaker: 'okafor', text: "Squall line on radar. We can skirt it to the north, or punch through at half ahead. Your call." },
    { on: 'fishing', speaker: 'skipper', text: 'Big ship! Big ship! Mind my nets or I will have your licence!' },
    { at: 0.5, speaker: 'kestrel', text: 'Aurora Trader, Aurora Trader. Nice ship, Captain. Nicer cargo. Mind the mines — some of them are mine.' },
    { at: 0.515, speaker: 'okafor', text: "Who the hell was that? That's no coastguard station I know." },
    { on: 'minefield', speaker: 'okafor', text: 'Mines in the water dead ahead. Radar paints them before you see them — find the gap.' },
  ],
  2: [
    { on: 'start', speaker: 'okafor', text: 'Hoses rigged on both rails, Captain. If a skiff gets alongside, hold [E] and soak them.' },
    { on: 'reef', speaker: 'okafor', text: 'Reef passage. Pale water is shallow water — keep between the red and green marks.' },
    { on: 'pirates', speaker: 'kestrel', text: 'Good afternoon, Captain. My friends would like a look inside bay four.' },
    { on: 'pirates', speaker: 'reyes', text: 'Aurora, this is Warship Valiant. My helicopter is yours — call it on [V].' },
    { on: 'distress', speaker: 'okafor', text: 'Coaster crew in a life raft! The same skiffs hit them an hour ago.' },
    { on: 'rescued', speaker: 'survivor', text: "They kept shouting about 'the Bluewater box'... we didn't know what they meant." },
  ],
  3: [
    { on: 'start', speaker: 'okafor', text: 'The Agulhas current is running against the swell. Waves here have broken tankers in half.' },
    { on: 'icefield', speaker: 'okafor', text: "Ice in the lane. The bergs you can see. It's the growlers riding low that'll open us up." },
    { on: 'choice_refuse', speaker: 'kestrel', text: 'Brave. Expensive — but brave.' },
    { on: 'choice_comply', speaker: 'kestrel', text: 'A pleasure doing business, Captain. My boys will stay home.' },
    { on: 'pirates', speaker: 'okafor', text: 'Mothership launching — three skiffs, and they came to fight!' },
    { at: 0.92, speaker: 'okafor', text: 'Durban pilot boarding. We made it round the Cape, Captain.' },
  ],
  4: [
    { on: 'start', speaker: 'okafor', text: 'Ice reports from Bear Island. Trust the radar more than your eyes up here.' },
    { on: 'whales', speaker: 'okafor', text: 'Humpbacks crossing ahead! Come down under twelve knots and give them room — a strike would kill them.' },
    { on: 'distress', speaker: 'okafor', text: "Life raft in the ice! They've been out there eighteen hours." },
    { on: 'rescued', speaker: 'survivor', text: 'The ice took our boat in minutes... we thought nobody was coming.' },
    { at: 0.92, speaker: 'okafor', text: 'Longyearbyen has its lights on for us, Captain.' },
  ],
  5: [
    { on: 'start', speaker: 'okafor', text: 'This is it, Captain. All hands to stations. Hoses manned, citadel ready.' },
    { at: 0.38, speaker: 'kestrel', text: 'Captain. Every skiff I own is waiting in the dark for you.' },
    { on: 'pirates', speaker: 'okafor', text: 'Contacts everywhere — skiffs on both beams!' },
    { on: 'pirates', speaker: 'reyes', text: 'Aurora, Valiant. Helicopter is spun up and waiting — call it in!', if: (f) => f.navy === 'tell' },
    { on: 'pirates', speaker: 'okafor', text: 'Last wave, Captain. Give them everything she has.', if: (f) => f.navy !== 'tell' },
    { at: 0.93, speaker: 'okafor', text: 'Kwai Chung in sight. Bring her home.' },
  ],
  6: [
    { on: 'start', speaker: 'brandt', text: 'Gun crews closed up and VLS armed, Captain. Left-click or [SPACE] to fire, [Q] to change weapon.' },
    { on: 'hunt', speaker: 'reyes', text: 'Mothership bearing off your bow. Weapons free — put her down.' },
    { on: 'pirates', speaker: 'reyes', text: 'Skiff pack inbound. CIWS will shred anything that closes inside 600 metres.' },
    { on: 'kill', speaker: 'reyes', text: 'Splash one. Confirmed. The bounty accumulates nicely.' },
    { at: 0.5, speaker: 'kestrel', text: 'You have become expensive to kill, Captain.' },
    { at: 0.93, speaker: 'okafor', text: 'Colombo pilot station ahead. Guns safed, hands to docking stations.' },
  ],
  7: [
    { on: 'start', speaker: 'okafor', text: 'The island is on radar. Those batteries reach out past a kilometre — we stay mobile or we die.' },
    { on: 'shorestrike', speaker: 'reyes', text: 'Coastal guns are live — shells inbound. Reticle on the batteries, Captain. Make it loud.' },
    { on: 'siteDestroyed', speaker: 'reyes', text: "Battery down, drone confirms. That's how it's done." },
    { on: 'incoming', speaker: 'brandt', text: 'Shells in the air! Rudder over and pile on the revs!' },
    { on: 'pirates', speaker: 'okafor', text: "They've sortied the skiffs — keep them off the forecastle while the big gun works!" },
    { at: 0.93, speaker: 'okafor', text: 'Djibouti lights on the horizon. We are still afloat — which surprises me.' },
  ],
  8: [
    { on: 'start', speaker: 'okafor', text: 'Kestrel Shoal dead ahead. Storm cover will not hide four batteries from this radar.' },
    { on: 'shorestrike', speaker: 'kestrel', text: 'Captain. My island says hello. Let us see if your Sea Lances are faster than my guns.' },
    { on: 'siteDestroyed', speaker: 'reyes', text: 'Another battery silent. Their grid is collapsing — keep firing!' },
    { on: 'kill', speaker: 'reyes', text: "Another hull down. Kestrel's navy is running out of ships." },
    { on: 'hunt', speaker: 'reyes', text: "That's his last mothership on your scope. Finish it." },
    { at: 0.58, speaker: 'kestrel', text: 'ENOUGH. Take the ships, take the sea — Kestrel Shoal is MINE.' },
    { on: 'distress', speaker: 'okafor', text: "A raft — survivors from Kestrel's own people. We stop. That's who we are." },
    { at: 0.93, speaker: 'reyes', text: 'Victoria pilot coming out. It is over, Captain. Come home.' },
  ],
};

export const GENERIC_RADIO: Record<string, { speaker: string; text: string }[]> = {
  start: [
    { speaker: 'okafor', text: 'Lines are clear and engines answering. She is all yours, Captain.' },
    { speaker: 'brandt', text: 'Main engine warmed and happy. Ring her up when ready.' },
  ],
  pirates: [
    { speaker: 'okafor', text: 'Fast movers on radar — skiffs launching off a mothership!' },
    { speaker: 'okafor', text: 'Pirates! Ring up full ahead and get ready to manoeuvre.' },
  ],
  boarding: [
    { speaker: 'okafor', text: "They've got a ladder on the rail! Hoses — now!" },
    { speaker: 'okafor', text: 'Boarders aft! Hard over and shake them off!' },
  ],
  boarded: [{ speaker: 'okafor', text: "They're aboard! Crew to the citadel — they're breaking into the containers!" }],
  hoseRepel: [
    { speaker: 'okafor', text: "Ha! They're bailing water — that skiff's breaking off!" },
    { speaker: 'brandt', text: "Nothing like eighty tonnes of seawater an hour to cool a man's ambitions." },
  ],
  outran: [{ speaker: 'okafor', text: "They can't hold our speed. Skiff falling astern!" }],
  kill: [
    { speaker: 'brandt', text: "Scratch one — she's going down by the bow!" },
    { speaker: 'okafor', text: 'Direct hit. Target destroyed. Guns crew is grinning like children.' },
  ],
  missile: [
    { speaker: 'brandt', text: "VLS away! Bird's in the air and seeking!" },
    { speaker: 'okafor', text: 'Sea Lance launched — seeker active, watch it fly.' },
  ],
  siteDestroyed: [
    { speaker: 'okafor', text: "Battery's gone — look at it burn." },
    { speaker: 'brandt', text: 'Secondary explosions! Magazine cooked off — scratch one gun.' },
  ],
  fortHit: [
    { speaker: 'brandt', text: "Hit! Concrete's cracked but she's still standing — again!" },
  ],
  incoming: [
    { speaker: 'okafor', text: 'Incoming shellfire — hang on!' },
    { speaker: 'brandt', text: 'Shells in the air! Evasive rudder — GO!' },
  ],
  hunt: [
    { speaker: 'okafor', text: 'Mothership on radar — fat, slow and full of fuel. Weapons free, Captain.' },
  ],
  shorestrike: [
    { speaker: 'okafor', text: 'Batteries opening up from the shore! Evasive pattern!' },
  ],
  navy: [{ speaker: 'reyes', text: 'Aurora, Warship Valiant. Helicopter launching — keep them off you until we arrive.' }],
  navyArrive: [{ speaker: 'reyes', text: 'Helicopter on scene. All skiffs, this is the navy — break off now.' }],
  storm: [
    { speaker: 'brandt', text: "Storm cell ahead. Drive through that at full speed and I'll be welding all night." },
    { speaker: 'okafor', text: 'Weather wall on radar. Skirt it if you can — slow down if you can’t.' },
  ],
  distress: [{ speaker: 'okafor', text: 'Mayday on sixteen — life raft sighted. Slow under ten knots to recover them.' }],
  rescued: [{ speaker: 'okafor', text: 'Survivors aboard and wrapped in blankets. Well done, Captain.' }],
  minefield: [{ speaker: 'okafor', text: 'Drifting contact mines ahead. Pick your way through — gently.' }],
  icefield: [{ speaker: 'okafor', text: "Ice ahead. The big ones you can see. It's the growlers that kill you." }],
  fog: [{ speaker: 'okafor', text: 'Fog bank. Sound the horn [H] and trust the radar.' }],
  traffic: [{ speaker: 'vts', text: 'Aurora Trader, VTS. Crossing traffic on your bow — she has right of way.' }],
  whales: [{ speaker: 'okafor', text: 'Whales crossing ahead! Slow down and give them room.' }],
  fishing: [{ speaker: 'skipper', text: 'Merchant ship, keep clear of my nets! Orange floats, can you see them?' }],
  reef: [{ speaker: 'okafor', text: 'Reef ahead. Pale water means shallow water — stay in the channel.' }],
  damage: [
    { speaker: 'brandt', text: 'That one hurt her, Captain!' },
    { speaker: 'brandt', text: 'Plating breached forward — pumps are holding. For now.' },
  ],
  lowHull: [{ speaker: 'brandt', text: "She can't take much more! Hull is critical!" }],
  whaleStrike: [{ speaker: 'okafor', text: "We hit a whale. God... that's going to be in every newspaper." }],
  whaleSafe: [{ speaker: 'okafor', text: 'Pod is clear astern. Beautifully done, Captain.' }],
  netFouled: [{ speaker: 'skipper', text: "You've torn my nets! That's a season's catch, you maniac!" }],
  dock: [{ speaker: 'okafor', text: 'Pilot is aboard. Ease her in under eight knots.' }],
};
