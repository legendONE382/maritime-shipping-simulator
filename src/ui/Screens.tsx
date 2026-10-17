import { useState } from 'react';
import {
  ACHIEVEMENTS,
  EVENT_META,
  MISSIONS,
  UPGRADES,
  rankFor,
  todayKey,
  type EndStats,
  type MissionDef,
  type SaveData,
  type UpgradeDef,
} from '../game/missions';
import { CHARACTERS, chapterFor } from '../game/story';
import { Portrait } from './Portrait';

const DIFF_COLOR: Record<string, string> = {
  Routine: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10',
  Standard: 'text-cyan-300 border-cyan-400/40 bg-cyan-500/10',
  'High Risk': 'text-amber-300 border-amber-400/40 bg-amber-500/10',
  Severe: 'text-orange-300 border-orange-400/40 bg-orange-500/10',
  Extreme: 'text-red-300 border-red-400/40 bg-red-500/10',
};

const PRIMARY =
  'digits relative overflow-hidden rounded-md bg-gradient-to-r from-cyan-400 to-emerald-300 font-bold tracking-[0.2em] text-[#04202c] transition hover:brightness-110 active:scale-[0.98]';
const GHOST = 'digits rounded-md border border-white/15 tracking-widest text-slate-200 transition hover:bg-white/10';

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="digits rounded border border-cyan-300/25 bg-white/5 px-1.5 py-0.5 text-[10px] text-cyan-100">{children}</kbd>;
}

export function Controls({ touch }: { touch: boolean }) {
  if (touch)
    return (
      <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 text-[11px] text-slate-300/85">
        <div>◀ ▶ Rudder</div>
        <div>▲ ▼ Engine telegraph</div>
        <div>🔫 Tap-gun fires · hold to spray</div>
        <div>🚀 VLS seeks a locked contact</div>
        <div>⟳ Chip cycles the weapons</div>
        <div>💦 Hold to fire hoses</div>
        <div>📡 LRAD scatters skiffs</div>
        <div>🚁 Call the navy (once)</div>
        <div>⚡ Hold for emergency power</div>
      </div>
    );
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 text-[11px] text-slate-300/85">
      <div className="flex items-center gap-2">
        <Key>W</Key>
        <Key>S</Key> Engine telegraph
      </div>
      <div className="flex items-center gap-2">
        <Key>A</Key>
        <Key>D</Key> Rudder
      </div>
      <div className="flex items-center gap-2">
        <Key>LMB</Key>
        <Key>SPACE</Key> Fire · hold for auto
      </div>
      <div className="flex items-center gap-2">
        <Key>1</Key>
        <Key>2</Key>
        <Key>3</Key>
        <Key>Q</Key> Weapons
      </div>
      <div className="flex items-center gap-2">
        <Key>SHIFT</Key> Emergency power
      </div>
      <div className="flex items-center gap-2">
        <Key>E</Key> Fire hoses (hold)
      </div>
      <div className="flex items-center gap-2">
        <Key>F</Key> LRAD · <Key>V</Key> Navy helo
      </div>
      <div className="flex items-center gap-2">
        <Key>C</Key> Camera · drag/wheel free-look · <Key>H</Key> Horn · <Key>ESC</Key> Pause
      </div>
    </div>
  );
}

function Stars({ n, size = 'text-[13px]', animate = false }: { n: number; size?: string; animate?: boolean }) {
  return (
    <div className={`flex gap-0.5 ${size}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`${i < n ? 'text-amber-300 drop-shadow-[0_0_8px_rgba(252,211,77,0.8)]' : 'text-white/15'} ${animate && i < n ? 'star-pop' : ''}`}
          style={animate ? { animationDelay: `${0.25 + i * 0.3}s` } : undefined}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function HazardIcons({ m }: { m: MissionDef }) {
  const seen = new Map<string, number>();
  for (const e of m.events) seen.set(e.kind, (seen.get(e.kind) ?? 0) + 1);
  return (
    <div className="flex flex-wrap gap-1">
      {[...seen.entries()].map(([k, n]) => {
        const meta = EVENT_META[k as keyof typeof EVENT_META];
        return (
          <span key={k} className="digits rounded bg-white/8 px-1.5 py-0.5 text-[9px] text-slate-200">
            {meta.icon} {n > 1 ? `×${n}` : ''}
            <span className="ml-1 text-slate-400">{meta.label}</span>
          </span>
        );
      })}
    </div>
  );
}

function MissionCard({ m, active, locked, stars, onClick, sub }: { m: MissionDef; active: boolean; locked: boolean; stars?: number; onClick: () => void; sub?: string }) {
  return (
    <button
      disabled={locked}
      onClick={onClick}
      className={`relative w-full overflow-hidden rounded-lg border p-3 text-left transition ${
        active
          ? 'border-cyan-300/60 bg-cyan-400/10 shadow-[0_0_30px_-8px_rgba(60,200,255,0.6)]'
          : locked
            ? 'border-white/8 bg-black/30 opacity-45'
            : 'border-white/10 bg-white/4 hover:border-cyan-300/40 hover:bg-cyan-400/5'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="digits truncate text-[9px] tracking-[0.2em] text-cyan-300/70">{sub ?? `${m.code} · ${m.region}`}</div>
          <div className="truncate text-[15px] font-semibold text-slate-50">{m.title}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            {m.from} → {m.to} · {m.distanceKm} km · {m.weather}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`digits inline-block rounded border px-1.5 py-0.5 text-[9px] ${DIFF_COLOR[m.difficulty]}`}>{m.difficulty}</div>
          <div className="digits mt-1 text-[11px] text-emerald-300">${(m.reward / 1000).toFixed(0)}k</div>
          {stars !== undefined && (
            <div className="mt-0.5 flex justify-end">
              <Stars n={stars} size="text-[11px]" />
            </div>
          )}
        </div>
      </div>
      <div className="mt-2">
        <HazardIcons m={m} />
      </div>
      {locked && <div className="absolute inset-0 grid place-items-center bg-black/40 text-[10px] tracking-widest text-slate-300">🔒 COMPLETE THE PREVIOUS CHAPTER</div>}
    </button>
  );
}

type Tab = 'story' | 'contracts' | 'shipyard' | 'awards';

/* ------------------------------------------------------------- about --- */

/** The long-form manual / pitch: everything a player might want to read, one click away. */
function AboutModal({ touch, onClose }: { touch: boolean; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-[#010b12]/85 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto flex min-h-full max-w-[860px] items-center px-4 py-8" onClick={(e) => e.stopPropagation()}>
        <div className="panel bracket relative w-full rounded-xl p-6 md:p-9">
          <button onClick={onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full border border-white/15 text-white/70 transition hover:bg-white/10 hover:text-white">✕</button>
          <div className="digits flex items-center gap-2 text-[9px] tracking-[0.4em] text-cyan-300/70">
            <span className="h-px w-8 bg-cyan-300/50" /> SHIP'S MANUAL · THE AURORA MANIFEST
          </div>
          <h2 className="mt-2 text-[30px] font-extrabold leading-tight tracking-tight text-white">About Master of the Sea</h2>
          <p className="mt-3 max-w-[640px] text-[13.5px] leading-relaxed text-slate-300/90">
            A failing shipping line. A sealed container nobody will explain. A voice on channel sixteen that knows your every move. Take the conn of the{' '}
            <span className="text-cyan-100">Aurora Trader</span> — and decide what kind of captain you are.
          </p>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div>
              <div className="label mb-2">The crew</div>
              <div className="space-y-2">
                {['okafor', 'brandt', 'voss', 'reyes', 'kestrel'].map((s) => (
                  <div key={s} className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/3 p-2">
                    <Portrait speaker={s} size={42} />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-bold text-white">{CHARACTERS[s].name}</div>
                      <div className="text-[10px] text-slate-400">{CHARACTERS[s].role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <div className="label mb-2">How it plays</div>
                <ul className="space-y-1.5 text-[12px] leading-relaxed text-slate-300/85">
                  <li><span className="text-cyan-200">⚓ A deadline sim.</span> Conn a 160-metre boxship port to port — she answers slow, turns wide and doesn't stop for anyone. Beat the clock, keep the cargo.</li>
                  <li><span className="text-red-200">💥 A gunboat when fired upon.</span> Pirates board, shore batteries shell your lanes. Hold the reticle on a contact and fire — deck gun, CIWS, and Sea Lance missiles that lock on.</li>
                  <li><span className="text-emerald-200">📜 Nine chapters.</span> A scripted campaign from a clean Dover crossing to storming Kestrel's island fortress — then endless contracts, a daily seed, and replays for stars.</li>
                  <li><span className="text-amber-200">🛠 Progression.</span> Wages fit the ship out in the Shipyard: engine, hull, radar, LRAD — and a bigger missile magazine.</li>
                </ul>
              </div>
              <div>
                <div className="label mb-2">Bridge controls</div>
                <Controls touch={touch} />
              </div>
            </div>
          </div>
          <div className="digits mt-6 text-center text-[10px] tracking-[0.3em] text-slate-500">MASTER OF THE SEA · A SINGLE-FILE SEA STORY · SAVES ON THIS DEVICE</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ main menu */
/** Game shell over the live sea: logo + captain rail + action panel. */
export function MainMenu({
  save,
  touch,
  contracts,
  daily,
  onStart,
  onBuy,
}: {
  save: SaveData;
  touch: boolean;
  contracts: MissionDef[];
  daily: MissionDef;
  onStart: (m: MissionDef) => void;
  onBuy: (u: UpgradeDef) => void;
}) {
  const [sel, setSel] = useState(Math.min(save.unlocked, MISSIONS.length - 1));
  const [csel, setCsel] = useState(0);
  const [tab, setTab] = useState<Tab>('story');
  const [about, setAbout] = useState(false);
  const m = MISSIONS[sel];
  const rank = rankFor(save.earnings);
  const totalStars = Object.values(save.stars).reduce((a, b) => a + b, 0);
  const contractsLocked = save.unlocked < 1;
  const contractList = [daily, ...contracts];
  const cm = contractList[csel] ?? daily;
  const dailyBest = save.dailyBest && save.dailyBest.date === todayKey() ? save.dailyBest.score : null;
  const ch = chapterFor(m.id);

  const tabs: [Tab, string][] = [
    ['story', 'CAMPAIGN'],
    ['contracts', 'CONTRACTS'],
    ['shipyard', 'SHIPYARD'],
    ['awards', 'AWARDS'],
  ];

  return (
    <div className="absolute inset-0 overflow-y-auto bg-gradient-to-b from-[#02090f]/85 via-[#031019]/45 to-[#02090f]/92">
      <div className="mx-auto flex min-h-full w-full max-w-[1200px] flex-col px-5 py-5 md:px-10">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/8 pb-4">
          <div>
            <div className="digits mb-1 flex items-center gap-2 text-[9px] tracking-[0.4em] text-cyan-300/70">
              <span className="h-px w-8 bg-cyan-300/50" /> THE AURORA MANIFEST
            </div>
            <h1 className="text-[34px] font-extrabold leading-[0.95] tracking-tight text-white drop-shadow-[0_6px_40px_rgba(0,0,0,0.8)] md:text-[46px]">
              MASTER <span className="bg-gradient-to-r from-cyan-200 via-sky-300 to-emerald-200 bg-clip-text text-transparent">OF THE SEA</span>
            </h1>
          </div>
          <button onClick={() => setAbout(true)} className={`${GHOST} px-4 py-2.5 text-[10px]`}>
            ⚓ ABOUT · MANUAL
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-5 pt-5 md:flex-row md:items-start md:gap-8">
          {/* captain rail */}
          <div className="fade-up space-y-4 md:w-[320px] md:shrink-0">
            <div className="panel rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="label">Master's rank</div>
                  <div className="text-[18px] font-bold text-white">{rank.title}</div>
                </div>
                <div className="text-right">
                  <div className="label">Bank</div>
                  <div className="digits text-[18px] font-bold text-emerald-300">${save.bank.toLocaleString()}</div>
                </div>
              </div>
              <div className="mt-3 h-[5px] overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300" style={{ width: `${Math.min(100, rank.progress * 100)}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[9px] text-slate-400">
                <span>{rank.next ? `Next: ${rank.next}` : 'Highest rank achieved'}</span>
                <span className="digits">
                  {totalStars}/{MISSIONS.length * 3} ★ · {save.achievements.length}/{ACHIEVEMENTS.length} 🏆
                </span>
              </div>
              <div className="digits mt-3 flex justify-between border-t border-white/8 pt-2.5 text-[10px] text-slate-400">
                <span>{save.voyages} voyages</span>
                <span>{save.totals.skiffsSunk + save.totals.motherships} sunk · {save.totals.forts} batteries</span>
              </div>
            </div>

            <button onClick={() => onStart(save.storyDone ? m : MISSIONS[Math.min(save.unlocked, MISSIONS.length - 1)])} className={`${PRIMARY} w-full px-6 py-4 text-[12px]`}>
              <span className="relative z-10">
                {save.storyDone
                  ? `⚓ SET SAIL — ${chapterFor(m.id) ? `CHAPTER ${ch?.numeral}` : m.title.toUpperCase()}`
                  : `⚔ SET SAIL — ${(() => {
                      const qch = chapterFor(MISSIONS[Math.min(save.unlocked, MISSIONS.length - 1)].id);
                      return qch ? `CHAPTER ${qch.numeral}` : 'NEXT VOYAGE';
                    })()}`}
              </span>
            </button>
            <div className="digits text-center text-[9px] tracking-[0.25em] text-slate-500">GUNS: CLICK / SPACE · LAUNCHERS: 1 · 2 · 3 · Q</div>
          </div>

          {/* operations panel */}
          <div className="fade-up panel min-w-0 flex-1 rounded-xl p-4 md:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {tabs.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`digits rounded px-3 py-1.5 text-[10px] tracking-[0.2em] transition ${tab === k ? 'bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/40' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'story' && (
            <>
              <div className="max-h-[44vh] space-y-2 overflow-y-auto pr-1 md:max-h-[380px]">
                {MISSIONS.map((mm, i) => (
                  <MissionCard
                    key={mm.id}
                    m={mm}
                    active={i === sel}
                    locked={i > save.unlocked}
                    stars={save.stars[mm.id] ?? 0}
                    sub={mm.chapter ?? mm.code}
                    onClick={() => setSel(i)}
                  />
                ))}
              </div>
              <button onClick={() => onStart(m)} className={`${PRIMARY} mt-4 w-full px-6 py-3.5 text-[12px]`}>
                <span className="relative z-10">{ch ? `PLAY CHAPTER ${ch.numeral} — ${ch.title.toUpperCase()}` : `VIEW ORDERS — ${m.code}`}</span>
                <span className="sheen absolute inset-0" />
              </button>
              {save.storyDone && <div className="mt-2 text-center text-[10px] text-emerald-300/80">Story complete — replay chapters to chase three stars.</div>}
            </>
          )}

          {tab === 'contracts' &&
            (contractsLocked ? (
              <div className="grid h-[300px] place-items-center text-center text-[12px] text-slate-400">
                <div>
                  <div className="text-[28px]">🔒</div>
                  Finish Chapter I to open the tramp charter market.
                </div>
              </div>
            ) : (
              <>
                <div className="max-h-[44vh] space-y-2 overflow-y-auto pr-1 md:max-h-[380px]">
                  {contractList.map((c, i) => (
                    <MissionCard
                      key={`${c.code}-${i}`}
                      m={c}
                      active={i === csel}
                      locked={false}
                      sub={i === 0 ? `DAILY CHARTER · ${todayKey()}${dailyBest !== null ? ` · BEST $${dailyBest.toLocaleString()}` : ''}` : `${c.code} · ${c.region}`}
                      onClick={() => setCsel(i)}
                    />
                  ))}
                </div>
                <button onClick={() => onStart(cm)} className={`${PRIMARY} mt-4 w-full px-6 py-3.5 text-[12px]`}>
                  <span className="relative z-10">{csel === 0 ? 'SAIL THE DAILY CHARTER' : `ACCEPT CONTRACT — ${cm.code}`}</span>
                  <span className="sheen absolute inset-0" />
                </button>
                <div className="mt-2 text-center text-[10px] text-slate-500">Completed contracts are replaced with new ones. Harder charters appear as your career grows.</div>
              </>
            ))}

          {tab === 'shipyard' && (
            <div className="max-h-[56vh] space-y-2 overflow-y-auto pr-1 md:max-h-[440px]">
              {UPGRADES.map((u) => {
                const lvl = save.upgrades[u.id];
                const max = u.cost.length;
                const cost = u.cost[lvl];
                const can = lvl < max && save.bank >= cost;
                return (
                  <div key={u.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/4 p-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-cyan-400/10 text-[20px] ring-1 ring-cyan-300/20">{u.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-[13px] font-semibold text-slate-50">{u.name}</div>
                        <div className="flex gap-0.5">
                          {Array.from({ length: max }).map((_, i) => (
                            <span key={i} className={`h-1.5 w-3 rounded-sm ${i < lvl ? 'bg-cyan-300 shadow-[0_0_6px_#67e8f9]' : 'bg-white/15'}`} />
                          ))}
                        </div>
                      </div>
                      <div className="text-[10.5px] text-slate-400">{u.desc}</div>
                    </div>
                    <button
                      disabled={!can}
                      onClick={() => onBuy(u)}
                      className={`digits shrink-0 rounded px-3 py-2 text-[10px] tracking-wider transition ${
                        lvl >= max ? 'bg-emerald-500/15 text-emerald-200' : can ? 'bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/40 hover:bg-cyan-400/30' : 'bg-white/5 text-slate-500'
                      }`}
                    >
                      {lvl >= max ? 'MAXED' : `$${(cost / 1000).toFixed(0)}k`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'awards' && (
            <div className="grid max-h-[56vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 md:max-h-[440px]">
              {ACHIEVEMENTS.map((a) => {
                const got = save.achievements.includes(a.id);
                return (
                  <div key={a.id} className={`flex items-center gap-3 rounded-lg border p-3 ${got ? 'border-amber-300/40 bg-amber-400/10' : 'border-white/8 bg-white/3 opacity-60'}`}>
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[20px] ${got ? 'bg-amber-300/20' : 'bg-white/5 grayscale'}`}>{a.icon}</div>
                    <div className="min-w-0">
                      <div className={`text-[12.5px] font-semibold ${got ? 'text-amber-100' : 'text-slate-300'}`}>{a.name}</div>
                      <div className="text-[10.5px] text-slate-400">{a.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>
      </div>
      {about && <AboutModal touch={touch} onClose={() => setAbout(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------- briefing */
export function Briefing({ m, touch, onGo, onBack }: { m: MissionDef; touch: boolean; onGo: () => void; onBack: () => void }) {
  const par = `${Math.floor(m.parTime / 60)}:${(m.parTime % 60).toString().padStart(2, '0')}`;
  return (
    <div className="absolute inset-0 overflow-y-auto bg-black/60 backdrop-blur-[3px]">
      <div className="mx-auto flex min-h-full max-w-[700px] items-center px-4 py-6">
        <div className="fade-up panel bracket relative w-full rounded-xl p-5 md:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="digits text-[9px] tracking-[0.3em] text-cyan-300/70">{m.chapter ? m.chapter.toUpperCase() : `VOYAGE ORDERS · ${m.code}`}</div>
              <h2 className="mt-1 text-[28px] font-bold leading-tight text-white md:text-[34px]">{m.title}</h2>
              <div className="digits mt-1 text-[12px] text-slate-300">
                {m.from} <span className="text-cyan-300">──▶</span> {m.to} · {m.distanceKm} km · {m.region}
              </div>
            </div>
            <div className={`digits shrink-0 rounded border px-2 py-1 text-[10px] ${DIFF_COLOR[m.difficulty]}`}>{m.difficulty}</div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              ['Cargo', m.cargoDesc],
              ['Charter value', `$${m.reward.toLocaleString()}`],
              ['Weather', m.weather.toUpperCase()],
              ['3★ time', `under ${par}`],
            ].map(([k, v]) => (
              <div key={k} className="panel-slim rounded p-2.5">
                <div className="label">{k}</div>
                <div className="digits mt-0.5 text-[11.5px] text-cyan-100">{v}</div>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <div className="label mb-3">Intelligence along the track</div>
            <div className="relative mx-2 h-[2px] rounded bg-gradient-to-r from-cyan-400/60 via-white/30 to-amber-300/70">
              <div className="absolute -left-2 -top-[7px] text-[12px]">🏠</div>
              <div className="absolute -right-2 -top-[7px] text-[12px]">⚓</div>
              {m.events.map((e, i) => (
                <div key={i} className="absolute -top-[9px] -translate-x-1/2" style={{ left: `${e.at * 100}%` }}>
                  <div className="grid h-5 w-5 place-items-center rounded-full border border-white/25 bg-[#07202f] text-[10px]">{EVENT_META[e.kind].icon}</div>
                </div>
              ))}
              {(m.choices ?? []).map((c) => (
                <div key={c.id} className="absolute -top-[9px] -translate-x-1/2" style={{ left: `${c.at * 100}%` }}>
                  <div className="grid h-5 w-5 place-items-center rounded-full border border-amber-300/50 bg-[#2a1d07] text-[10px]">❓</div>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-1.5">
              {m.events.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-[11.5px] text-slate-300">
                  <span className="digits w-9 text-[9px] text-slate-500">{Math.round(e.at * 100)}%</span>
                  <span>{EVENT_META[e.kind].icon}</span>
                  <span>{EVENT_META[e.kind].task(e)}</span>
                  {e.kind === 'distress' && <span className="text-[9px] text-slate-500">optional · bonus</span>}
                </div>
              ))}
              {(m.choices ?? []).map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-[11.5px] text-amber-200/80">
                  <span className="digits w-9 text-[9px] text-slate-500">{Math.round(c.at * 100)}%</span>
                  <span>❓</span>
                  <span>Someone will make you an offer over the radio</span>
                </div>
              ))}
              <div className="flex items-center gap-2 text-[11.5px] text-slate-300">
                <span className="digits w-9 text-[9px] text-slate-500">100%</span>
                <span>⚓</span>
                <span>Berth at {m.to} under 8 knots</span>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-1.5">
            <div className="label">Master's briefing</div>
            {m.brief.map((b) => (
              <div key={b} className="flex gap-2 text-[12px] leading-relaxed text-slate-300">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-cyan-300" />
                {b}
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-white/10 pt-4">
            <Controls touch={touch} />
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button onClick={onBack} className="digits text-[11px] tracking-widest text-slate-400 hover:text-slate-200">
              ← BACK
            </button>
            <button onClick={onGo} className={`${PRIMARY} px-6 py-3 text-[12px]`}>
              <span className="relative z-10">SET SAIL</span>
              <span className="sheen absolute inset-0" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- paused */
const QUALITY_LABELS = ['Battery saver', 'Low', 'Balanced', 'Full detail'];

export function Paused({
  touch,
  muted,
  quality,
  autoQuality,
  onResume,
  onAbort,
  onMute,
  onQuality,
}: {
  touch: boolean;
  muted: boolean;
  quality: number;
  autoQuality: boolean;
  onResume: () => void;
  onAbort: () => void;
  onMute: () => void;
  onQuality: (q: number | null) => void;
}) {
  return (
    <div className="absolute inset-0 grid place-items-center overflow-y-auto bg-[#020a12]/70 p-4 backdrop-blur-[6px]">
      <div className="fade-up panel w-full max-w-[480px] rounded-xl p-6 text-center">
        <div className="digits text-[9px] tracking-[0.4em] text-cyan-300/70">ENGINE ROOM · STANDBY</div>
        <h2 className="mt-2 text-[32px] font-bold text-white">PAUSED</h2>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button onClick={onResume} className={`${PRIMARY} px-6 py-3 text-[12px]`}>
            RESUME
          </button>
          <button onClick={onMute} className={`${GHOST} px-4 py-3 text-[11px]`}>
            {muted ? 'SOUND OFF' : 'SOUND ON'}
          </button>
          <button onClick={onAbort} className="digits rounded-md border border-red-400/30 px-4 py-3 text-[11px] tracking-widest text-red-200 hover:bg-red-500/15">
            ABANDON
          </button>
        </div>

        <div className="mt-5 border-t border-white/10 pt-4 text-left">
          <div className="label mb-2">Graphics · {QUALITY_LABELS[quality]}</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {QUALITY_LABELS.map((l, i) => (
              <button
                key={l}
                onClick={() => onQuality(i)}
                className={`digits rounded px-2.5 py-1.5 text-[10px] tracking-wider transition ${
                  quality === i ? 'bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/40' : 'text-slate-400 hover:bg-white/10'
                }`}
              >
                {l}
              </button>
            ))}
            <button
              onClick={() => onQuality(null)}
              className={`digits rounded px-2.5 py-1.5 text-[10px] tracking-wider transition ${
                autoQuality ? 'bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-300/40' : 'text-slate-400 hover:bg-white/10'
              }`}
            >
              AUTO
            </button>
          </div>
          <div className="mt-1.5 text-[10px] text-slate-500">Auto keeps the frame rate steady by lowering detail only when needed.</div>
        </div>
        <div className="mt-6 border-t border-white/10 pt-4 text-left">
          <Controls touch={touch} />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- results */
export function Results({
  stats,
  rankUp,
  nextLabel,
  onRetry,
  onNext,
  onMenu,
}: {
  stats: EndStats;
  rankUp: string | null;
  nextLabel: string | null;
  onRetry: () => void;
  onNext: () => void;
  onMenu: () => void;
}) {
  const rows: [string, string][] = [
    ['Cargo delivered', `${stats.deliveredTons.toLocaleString()} t · ${(stats.cargoDelivered * 100).toFixed(0)}%`],
    ['Hull remaining', `${(stats.hullLeft * 100).toFixed(0)}%`],
    ['Passage time', `${Math.floor(stats.timeTaken / 60)}m ${Math.floor(stats.timeTaken % 60)}s · par ${Math.floor(stats.mission.parTime / 60)}m ${stats.mission.parTime % 60}s`],
    ['Close calls · best chain', `${stats.closeCalls} · ×${(1 + (stats.maxChain - 1) * 0.25).toFixed(2)}`],
  ];
  const acc = stats.combat.shellsFired > 0 ? Math.round((stats.combat.shellsHit / stats.combat.shellsFired) * 100) : 0;
  const feats: [string, number | string][] = [
    ['☠ Skiffs sunk', stats.combat.skiffsSunk],
    ['🏴‍☠️ Motherships', stats.combat.mothershipsSunk],
    ['🏝 Batteries', stats.combat.shoreSitesDestroyed],
    ['🚀 Missiles', stats.combat.missilesFired],
    ['🎯 Accuracy', `${acc}%`],
    ['🛟 Rescued', stats.rescued],
    ['💦 Hosed off', stats.hoseRepels],
    ['💨 Outran', stats.outran],
    ['🏴 Boarded', stats.boarded],
    ['🐋 Whale-safe', stats.whaleSafe],
  ];
  const isDaily = stats.mission.kind === 'daily';
  return (
    <div className="absolute inset-0 overflow-y-auto bg-[#020a12]/75 backdrop-blur-[5px]">
      <div className="mx-auto flex min-h-full max-w-[680px] items-center px-4 py-6">
        <div className="fade-up panel bracket relative w-full rounded-xl p-5 md:p-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={`digits text-[9px] tracking-[0.4em] ${stats.success ? 'text-emerald-300/80' : 'text-red-300/80'}`}>
                {stats.success ? 'VESSEL BERTHED · CARGO DISCHARGED' : 'VOYAGE TERMINATED'}
              </div>
              <h2 className={`mt-2 text-[30px] font-extrabold leading-none md:text-[42px] ${stats.success ? 'text-white' : 'text-red-200'}`}>{stats.success ? 'DELIVERY COMPLETE' : 'CHARTER FAILED'}</h2>
              <div className="digits mt-2 text-[11px] text-slate-400">
                {stats.mission.chapter ?? stats.mission.code} · {stats.mission.from} → {stats.mission.to}
              </div>
              {!stats.success && <div className="mt-1 text-[12px] text-red-200/80">{stats.failReason}</div>}
            </div>
            {stats.mission.kind === 'story' && <Stars n={stats.stars} size="text-[30px] md:text-[38px]" animate />}
          </div>

          {rankUp && (
            <div className="mt-4 rounded-lg border border-amber-300/40 bg-amber-400/10 px-4 py-2 text-[12px] text-amber-100">
              ⚓ Promoted — you now hold the rank of <span className="font-bold">{rankUp}</span>.
            </div>
          )}
          {isDaily && stats.success && <div className="mt-4 rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-[12px] text-cyan-100">Daily charter score recorded: ${stats.total.toLocaleString()}</div>}

          <div className="mt-4 grid grid-cols-5 gap-1.5">
            {feats.map(([k, v]) => (
              <div key={k} className="panel-slim rounded p-1.5 text-center">
                <div className="digits text-[13.5px] font-bold text-white">{v}</div>
                <div className="text-[7.5px] uppercase tracking-wide text-slate-400">{k}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              {rows.map(([k, v]) => (
                <div key={k} className="panel-slim flex items-center justify-between gap-3 rounded px-3 py-2">
                  <span className="label">{k}</span>
                  <span className="digits text-right text-[11px] text-cyan-100">{v}</span>
                </div>
              ))}
              {stats.eventLog.length > 0 && (
                <div className="panel-slim rounded px-3 py-2">
                  <div className="label mb-1">Voyage log</div>
                  <div className="max-h-[96px] space-y-0.5 overflow-y-auto">
                    {stats.eventLog.map((r, i) => (
                      <div key={i} className={`digits text-[10px] ${r.includes('−$') ? 'text-red-300/80' : 'text-emerald-200/80'}`}>
                        · {r}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="panel-slim rounded p-4">
              <div className="label">Settlement</div>
              <div className="mt-2 space-y-1.5 text-[12px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Freight payment</span>
                  <span className="digits text-emerald-200">${stats.payout.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Performance bonus</span>
                  <span className="digits text-cyan-200">${stats.bonus.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Seamanship awards</span>
                  <span className="digits text-cyan-200">${stats.eventBonus.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Repairs, fines & penalties</span>
                  <span className="digits text-red-300">−${stats.penalties.toLocaleString()}</span>
                </div>
                <div className="my-2 h-px bg-white/10" />
                <div className="flex items-baseline justify-between">
                  <span className="label">Net settlement</span>
                  <span className="digits text-[22px] font-bold text-white">${stats.total.toLocaleString()}</span>
                </div>
              </div>
              <div className="mt-3 space-y-0.5">
                {stats.reasons.map((r) => (
                  <div key={r} className="text-[10px] text-slate-400">
                    · {r}
                  </div>
                ))}
                {stats.success && stats.stars < 3 && stats.mission.kind === 'story' && (
                  <div className="pt-1 text-[10px] text-amber-200/70">3★ needs ≥90% cargo, ≥45% hull and arrival under par time.</div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button onClick={onMenu} className="digits text-[11px] tracking-widest text-slate-400 hover:text-slate-200">
              ← MENU
            </button>
            <div className="flex gap-2">
              <button onClick={onRetry} className={`${GHOST} px-5 py-3 text-[11px]`}>
                SAIL AGAIN
              </button>
              {nextLabel && (
                <button onClick={onNext} className={`${PRIMARY} px-6 py-3 text-[12px]`}>
                  {nextLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
