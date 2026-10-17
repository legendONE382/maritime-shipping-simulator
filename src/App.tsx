import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Game, type ActiveChoice, type Banner, type Popup, type RadioMsg, type Telemetry, type Toast } from './game/Game';
import {
  ACHIEVEMENTS,
  DEFAULT_SAVE,
  MISSIONS,
  checkAchievements,
  dailySeed,
  generateContract,
  rankFor,
  todayKey,
  type EndStats,
  type MissionDef,
  type SaveData,
  type UpgradeDef,
} from './game/missions';
import { chapterFor, endingFor, linesFor, type StoryChoice, type StoryLine } from './game/story';
import { Hud, useLayout } from './ui/Hud';
import { Briefing, MainMenu, Paused, Results } from './ui/Screens';
import { ChoicePanel, StoryScene } from './ui/StoryScene';

type Phase = 'menu' | 'story' | 'brief' | 'play' | 'paused' | 'result';
const SAVE_KEY = 'master-of-the-sea-v3';

interface StoryState {
  kicker: string;
  title: string;
  lines: StoryLine[];
  choice: StoryChoice | null;
  done: (choice?: string) => void;
}

function freshSave(): SaveData {
  return { ...DEFAULT_SAVE, upgrades: { ...DEFAULT_SAVE.upgrades }, stars: {}, flags: {}, achievements: [], totals: { ...DEFAULT_SAVE.totals } };
}

function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem('master-of-the-sea-v2');
    if (!raw) return freshSave();
    const p = JSON.parse(raw) as Partial<SaveData>;
    const base = freshSave();
    return {
      ...base,
      ...p,
      upgrades: { ...base.upgrades, ...(p.upgrades ?? {}) },
      stars: p.stars ?? {},
      flags: p.flags ?? {},
      achievements: p.achievements ?? [],
      totals: { ...base.totals, ...(p.totals ?? {}) },
    };
  } catch {
    return freshSave();
  }
}

export default function App() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const telRef = useRef<Telemetry | null>(null);
  const phaseRef = useRef<Phase>('menu');
  const saveRef = useRef<SaveData>(loadSave());
  const radioQ = useRef<RadioMsg[]>([]);
  const radioBusy = useRef(false);

  const layout = useLayout();
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>('menu');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [radio, setRadio] = useState<RadioMsg | null>(null);
  const [choice, setChoice] = useState<ActiveChoice | null>(null);
  const [muted, setMuted] = useState(false);
  const [save, setSaveState] = useState<SaveData>(saveRef.current);
  const [stats, setStats] = useState<EndStats | null>(null);
  const [rankUp, setRankUp] = useState<string | null>(null);
  const [brief, setBrief] = useState<MissionDef>(MISSIONS[0]);
  const [story, setStory] = useState<StoryState | null>(null);
  const [awards, setAwards] = useState<string[]>([]);
  const [fadeKey, setFadeKey] = useState(0);
  const [rotateDismissed, setRotateDismissed] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [qualityAuto, setQualityAuto] = useState(true);
  const [, bump] = useState(0);

  phaseRef.current = phase;

  const setSave = useCallback((fn: (s: SaveData) => SaveData) => {
    const next = fn(saveRef.current);
    saveRef.current = next;
    setSaveState(next);
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const grantAchievements = useCallback(
    (s?: EndStats) => {
      const newly = checkAchievements(saveRef.current, s);
      if (!newly.length) return;
      setSave((p) => ({ ...p, achievements: [...p.achievements, ...newly] }));
      setAwards((a) => [...a, ...newly]);
    },
    [setSave]
  );

  /* ---------------------------------------------------------- bootstrap */
  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;
    const pumpRadio = () => {
      const next = radioQ.current.shift();
      if (!next) {
        radioBusy.current = false;
        setRadio(null);
        return;
      }
      radioBusy.current = true;
      setRadio(next);
      window.setTimeout(pumpRadio, 2800 + next.text.length * 42);
    };
    const game = new Game(hostRef.current, {
      onTelemetry: (t) => {
        telRef.current = t;
        if (phaseRef.current === 'play') bump((n) => (n + 1) % 100000);
      },
      onToast: (a) => {
        setToasts((prev) => [a, ...prev].slice(0, 3));
        window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== a.id)), 5200);
      },
      onBanner: (b) => {
        setBanner(b);
        window.setTimeout(() => setBanner((cur) => (cur && cur.id === b.id ? null : cur)), 3500);
      },
      onPopup: (p) => {
        setPopups((prev) => [...prev, p].slice(-4));
        window.setTimeout(() => setPopups((prev) => prev.filter((x) => x.id !== p.id)), 2000);
      },
      onRadio: (r) => {
        radioQ.current.push(r);
        if (radioQ.current.length > 3) radioQ.current.shift();
        if (!radioBusy.current) pumpRadio();
      },
      onChoice: (c) => setChoice(c),
      onEnd: (s) => {
        setStats(s);
        setChoice(null);
        const before = rankFor(saveRef.current.earnings).index;
        setSave((prev) => {
          const totals = {
            rescues: prev.totals.rescues + s.rescued,
            closeCalls: prev.totals.closeCalls + s.closeCalls,
            contracts: prev.totals.contracts + (s.success && s.mission.kind === 'contract' ? 1 : 0),
            hoseRepels: prev.totals.hoseRepels + s.hoseRepels,
            whalesSafe: prev.totals.whalesSafe + s.whaleSafe,
            outran: prev.totals.outran + s.outran,
            /* gunnery tallies feed the Mothership Hunter / Marksman / Island Breaker awards */
            skiffsSunk: prev.totals.skiffsSunk + s.combat.skiffsSunk,
            motherships: prev.totals.motherships + s.combat.mothershipsSunk,
            forts: prev.totals.forts + s.combat.shoreSitesDestroyed,
            missiles: prev.totals.missiles + s.combat.missilesFired,
          };
          const next: SaveData = { ...prev, totals, voyages: prev.voyages + 1 };
          if (s.success) {
            next.bank = prev.bank + s.total;
            next.earnings = prev.earnings + s.total;
            next.flags = { ...prev.flags, ...s.choices };
            if (s.mission.kind === 'story') {
              next.unlocked = Math.max(prev.unlocked, Math.min(MISSIONS.length - 1, s.mission.id + 1));
              next.stars = { ...prev.stars, [s.mission.id]: Math.max(prev.stars[s.mission.id] ?? 0, s.stars) };
            } else if (s.mission.kind === 'contract') {
              next.contractSeed = prev.contractSeed + 1;
            } else {
              const best = prev.dailyBest && prev.dailyBest.date === todayKey() ? prev.dailyBest.score : -1;
              if (s.total > best) next.dailyBest = { date: todayKey(), score: s.total };
            }
          }
          return next;
        });
        const after = rankFor(saveRef.current.earnings);
        setRankUp(after.index > before ? after.title : null);
        grantAchievements(s);
        window.setTimeout(() => setPhase('result'), 1800);
      },
    });
    gameRef.current = game;
    game.loadMission(MISSIONS[Math.min(saveRef.current.unlocked, MISSIONS.length - 1)], saveRef.current.upgrades, saveRef.current.flags);
    game.setCameraMode(2);
    game.setPaused(true);
    window.setTimeout(() => setReady(true), 150);
    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, [setSave, grantAchievements]);

  // achievement toasts drain one at a time
  useEffect(() => {
    if (!awards.length) return;
    gameRef.current?.audio.init();
    gameRef.current?.audio.achievement();
    const t = window.setTimeout(() => setAwards((a) => a.slice(1)), 3600);
    return () => window.clearTimeout(t);
  }, [awards]);

  /* ------------------------------------------------------------ contracts */
  const contracts = useMemo(
    () =>
      [0, 1, 2].map((i) =>
        generateContract(save.contractSeed * 97 + i * 13 + 7, Math.min(5, save.unlocked * 0.55 + save.totals.contracts * 0.2 + i * 0.7), 'contract')
      ),
    [save.contractSeed, save.unlocked, save.totals.contracts]
  );
  const daily = useMemo(() => generateContract(dailySeed(), 2.6, 'daily'), []);

  /* ------------------------------------------------------------- actions */
  const clearFeeds = useCallback(() => {
    setToasts([]);
    setPopups([]);
    setBanner(null);
    setChoice(null);
    radioQ.current = [];
    setRadio(null);
  }, []);

  const depart = useCallback(
    (m: MissionDef) => {
      const g = gameRef.current;
      if (!g) return;
      clearFeeds();
      setFadeKey((k) => k + 1);
      g.loadMission(m, saveRef.current.upgrades, saveRef.current.flags);
      g.start();
      setPhase('play');
    },
    [clearFeeds]
  );

  const showStory = useCallback((s: StoryState) => {
    gameRef.current?.setCameraMode(2);
    setStory(s);
    setPhase('story');
  }, []);

  const openMission = useCallback(
    (m: MissionDef) => {
      setBrief(m);
      const ch = m.kind === 'story' ? chapterFor(m.id) : undefined;
      const g = gameRef.current;
      if (g) {
        g.loadMission(m, saveRef.current.upgrades, saveRef.current.flags);
        g.setCameraMode(2);
        g.setPaused(true);
      }
      if (ch) {
        const lines = linesFor(ch.pre, saveRef.current.flags);
        showStory({ kicker: `CHAPTER ${ch.numeral}`, title: ch.title, lines, choice: null, done: () => setPhase('brief') });
      } else {
        setPhase('brief');
      }
    },
    [showStory]
  );

  const pause = useCallback((p: boolean) => {
    const g = gameRef.current;
    if (!g) return;
    g.setPaused(p);
    setPhase(p ? 'paused' : 'play');
  }, []);

  const toMenu = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g.loadMission(MISSIONS[Math.min(saveRef.current.unlocked, MISSIONS.length - 1)], saveRef.current.upgrades, saveRef.current.flags);
    g.setCameraMode(2);
    g.setPaused(true);
    clearFeeds();
    setPhase('menu');
  }, [clearFeeds]);

  /** After a successful story voyage: aftermath scene, decision, then the next chapter (or the ending). */
  const continueStory = useCallback(() => {
    if (!stats) return;
    const m = stats.mission;
    const flags = saveRef.current.flags;
    if (m.id === MISSIONS.length - 1) {
      const end = endingFor(flags);
      showStory({
        kicker: 'EPILOGUE · ENDING',
        title: end.title,
        lines: end.lines,
        choice: null,
        done: () => {
          setSave((p) => ({ ...p, storyDone: true }));
          grantAchievements();
          toMenu();
        },
      });
      return;
    }
    const ch = chapterFor(m.id);
    if (!ch) return toMenu();
    const decision = ch.choice && !flags[ch.choice.id] ? ch.choice : null;
    showStory({
      kicker: `CHAPTER ${ch.numeral} · AFTERMATH`,
      title: ch.title,
      lines: linesFor(ch.post, flags),
      choice: decision,
      done: (opt) => {
        if (decision && opt) {
          const o = decision.options.find((x) => x.id === opt);
          setSave((p) => ({ ...p, flags: { ...p.flags, [decision.id]: opt }, bank: p.bank + (o?.bank ?? 0), earnings: p.earnings + (o?.bank ?? 0) }));
          grantAchievements();
        }
        openMission(MISSIONS[m.id + 1]);
      },
    });
  }, [stats, showStory, setSave, grantAchievements, toMenu, openMission]);

  const toggleMute = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    const m = !g.audio.muted;
    g.audio.init();
    g.audio.setMuted(m);
    setMuted(m);
  }, []);

  const buy = useCallback(
    (u: UpgradeDef) => {
      setSave((prev) => {
        const lvl = prev.upgrades[u.id];
        const cost = u.cost[lvl];
        if (lvl >= u.cost.length || prev.bank < cost) return prev;
        return { ...prev, bank: prev.bank - cost, upgrades: { ...prev.upgrades, [u.id]: lvl + 1 } };
      });
      gameRef.current?.audio.init();
      gameRef.current?.audio.good();
    },
    [setSave]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      if (phaseRef.current === 'play') pause(true);
      else if (phaseRef.current === 'paused') pause(false);
      else if (phaseRef.current === 'brief') setPhase('menu');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pause]);

  /* ------------------------------------------- offline + battery-friendly */
  // The game is a single cached file and all progress lives in localStorage, so a dropped
  // connection never interrupts a voyage — we just tell the player, and pause on tab-hide.
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    const hide = () => {
      if (document.hidden && phaseRef.current === 'play') pause(true);
    };
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [pause]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }, []);

  const inGame = phase === 'play' || phase === 'paused';
  const showRotate = layout.touch && layout.portrait && inGame && !rotateDismissed;
  const award = awards.length ? ACHIEVEMENTS.find((a) => a.id === awards[0]) : null;
  const nextLabel = stats?.success && stats.mission.kind === 'story' ? (stats.mission.id === MISSIONS.length - 1 ? 'SEE THE ENDING →' : 'CONTINUE STORY →') : null;

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#02090f]">
      <div ref={hostRef} className={`absolute inset-0 ${phase === 'play' && !layout.touch ? 'cursor-none' : ''}`} style={{ cursor: phase === 'play' && !layout.touch ? 'none' : 'auto' }} />

      {inGame && (
        <Hud
          telRef={telRef}
          toasts={toasts}
          banner={banner}
          popups={popups}
          radio={radio}
          muted={muted}
          compact={layout.compact}
          touch={layout.touch}
          onMute={toggleMute}
          onPause={() => pause(true)}
          onFlare={() => gameRef.current?.triggerFlare()}
          onHorn={() => gameRef.current?.horn()}
          onCamera={() => gameRef.current?.cycleCamera()}
          onNavy={() => gameRef.current?.callNavy()}
          onWeapon={(i) => gameRef.current?.selectWeapon(i)}
          onFullscreen={toggleFullscreen}
          onKey={(c, d) => gameRef.current?.setKey(c, d)}
          onZoomIn={() => gameRef.current?.zoomCamera(-60)}
          onZoomOut={() => gameRef.current?.zoomCamera(60)}
          onResetCam={() => gameRef.current?.resetCamera()}
        />
      )}

      {phase === 'play' && choice && <ChoicePanel choice={choice} timeLeft={telRef.current?.choiceLeft ?? choice.total} onPick={(id) => gameRef.current?.choose(choice.id, id)} />}

      {fadeKey > 0 && inGame && <div key={fadeKey} className="fade-black pointer-events-none absolute inset-0 bg-black" />}

      {phase === 'menu' && <MainMenu save={save} touch={layout.touch} contracts={contracts} daily={daily} onBuy={buy} onStart={openMission} />}

      {phase === 'story' && story && <StoryScene key={`${story.kicker}-${story.title}`} kicker={story.kicker} title={story.title} lines={story.lines} choice={story.choice} onDone={story.done} />}

      {phase === 'brief' && <Briefing m={brief} touch={layout.touch} onGo={() => depart(brief)} onBack={() => setPhase('menu')} />}

      {phase === 'paused' && (
        <Paused
          touch={layout.touch}
          muted={muted}
          quality={gameRef.current?.getQuality() ?? 3}
          autoQuality={qualityAuto}
          onMute={toggleMute}
          onResume={() => pause(false)}
          onAbort={toMenu}
          onQuality={(q) => {
            setQualityAuto(q === null);
            gameRef.current?.setQuality(q);
            bump((n) => (n + 1) % 100000);
          }}
        />
      )}

      {phase === 'result' && stats && <Results stats={stats} rankUp={rankUp} nextLabel={nextLabel} onRetry={() => depart(stats.mission)} onNext={continueStory} onMenu={toMenu} />}

      {!online && inGame && (
        <div className="pointer-events-none absolute left-1/2 top-[52px] z-20 -translate-x-1/2 rounded-full border border-amber-300/40 bg-black/60 px-3 py-1 text-[10px] tracking-wider text-amber-100 backdrop-blur-sm">
          ⚡ Offline — running from cache, progress is saved on this device
        </div>
      )}

      {award && (
        <div key={award.id} className="toast-anim pointer-events-none absolute right-4 top-16 z-30 flex items-center gap-3 rounded-xl border border-amber-300/50 bg-black/70 px-4 py-3 backdrop-blur-md shadow-[0_0_40px_-10px_rgba(252,211,77,0.8)]">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-300/20 text-[22px]">{award.icon}</div>
          <div>
            <div className="digits text-[9px] tracking-[0.3em] text-amber-300/80">ACHIEVEMENT UNLOCKED</div>
            <div className="text-[14px] font-bold text-amber-100">{award.name}</div>
            <div className="text-[10.5px] text-slate-300">{award.desc}</div>
          </div>
        </div>
      )}

      {showRotate && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-[#02090f]/92 p-6 text-center">
          <div>
            <div className="text-[44px]">📱↻</div>
            <div className="mt-2 text-[16px] font-bold text-white">Rotate to landscape</div>
            <div className="mt-1 text-[12px] text-slate-400">The bridge is wider than it is tall.</div>
            <button onClick={() => setRotateDismissed(true)} className="digits mt-5 rounded-md border border-white/20 px-4 py-2 text-[11px] tracking-widest text-slate-200">
              PLAY ANYWAY
            </button>
          </div>
        </div>
      )}

      {!ready && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-[#02090f]">
          <div className="text-center">
            <div className="digits text-[11px] tracking-[0.4em] text-cyan-300/70">INITIALISING OCEAN</div>
            <div className="mx-auto mt-4 h-[3px] w-56 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/3 animate-[slidein_1.2s_ease-in-out_infinite] bg-cyan-300" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
