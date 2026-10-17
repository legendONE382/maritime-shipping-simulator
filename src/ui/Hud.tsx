import { useEffect, useRef, useState } from 'react';
import type { Banner, ContactType, Marker, MarkerType, Popup, RadioMsg, Telemetry, Toast } from '../game/Game';
import { Portrait, speakerInfo } from './Portrait';

/* --------------------------------------------------------------- layout */
export function useLayout() {
  const read = () => ({
    compact: window.innerWidth < 900 || window.innerHeight < 540,
    touch: window.matchMedia('(pointer: coarse)').matches,
    portrait: window.innerHeight > window.innerWidth,
  });
  const [l, setL] = useState(read);
  useEffect(() => {
    const h = () => setL(read());
    window.addEventListener('resize', h);
    window.addEventListener('orientationchange', h);
    return () => {
      window.removeEventListener('resize', h);
      window.removeEventListener('orientationchange', h);
    };
  }, []);
  return l;
}

const MARKER_STYLE: Record<MarkerType, { color: string; glyph: string }> = {
  wp: { color: '#67e8f9', glyph: '◆' },
  port: { color: '#fde68a', glyph: '⚓' },
  pirate: { color: '#f87171', glyph: '▲' },
  mothership: { color: '#fca5a5', glyph: '⛵' },
  navy: { color: '#86efac', glyph: '✚' },
  fort: { color: '#fb923c', glyph: '▣' },
  whale: { color: '#93c5fd', glyph: '◒' },
  raft: { color: '#fb923c', glyph: '◉' },
  storm: { color: '#a78bfa', glyph: '◍' },
};

const CONTACT_COLOR: Record<ContactType, string> = {
  pirate: '#ff4d4d',
  mothership: '#ff9f9f',
  navy: '#86efac',
  fort: '#fb923c',
  rock: '#c9a227',
  ice: '#9fe8ff',
  mine: '#ff8a3d',
  drift: '#8a97a1',
  reef: '#2dd4bf',
  traffic: '#4fd1ff',
  fishing: '#fdba74',
  whale: '#93c5fd',
  storm: '#8b7cff',
  wp: '#63ffb0',
  port: '#ffe07a',
  raft: '#fb923c',
};

const CARDINAL: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };

function fmtDist(d: number) {
  return d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${d.toFixed(0)} m`;
}

const TELEGRAPH: [number, string][] = [
  [-1, 'FULL ASTERN'],
  [-0.15, 'SLOW ASTERN'],
  [0.02, 'ALL STOP'],
  [0.25, 'DEAD SLOW'],
  [0.5, 'HALF AHEAD'],
  [0.78, 'FULL AHEAD'],
  [0.98, 'FLANK'],
];
function telegraph(t: number) {
  let out = TELEGRAPH[0][1];
  for (const [min, label] of TELEGRAPH) if (t >= min) out = label;
  return out;
}

/* ---------------------------------------------------------------- radar */
function Radar({ telRef, size }: { telRef: React.MutableRefObject<Telemetry | null>; size: number }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvas.current;
      const t = telRef.current;
      if (!c || !t) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio, 2);
      if (c.width !== size * dpr) {
        c.width = size * dpr;
        c.height = size * dpr;
      }
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      const R = size / 2 - 2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, 'rgba(8,40,40,0.55)');
      g.addColorStop(1, 'rgba(2,14,18,0.78)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,235,190,0.18)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (R * i) / 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx, cy - R);
      ctx.lineTo(cx, cy + R);
      ctx.moveTo(cx - R, cy);
      ctx.lineTo(cx + R, cy);
      ctx.stroke();
      const ang = ((performance.now() / 1000) * 1.6) % (Math.PI * 2);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      const sg = ctx.createLinearGradient(0, 0, R, 0);
      sg.addColorStop(0, 'rgba(110,255,205,0.3)');
      sg.addColorStop(1, 'rgba(110,255,205,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, -0.6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      for (const p of t.contacts) {
        const mx = cx + (p.x / t.radarRange) * R;
        const my = cy - (p.y / t.radarRange) * R;
        if (Math.hypot(mx - cx, my - cy) > R - 2) continue;
        const r = p.type === 'storm' ? 5 : p.type === 'reef' ? 4.5 : ['traffic', 'port', 'mothership'].includes(p.type) ? 3.6 : p.type === 'pirate' ? 3.2 : 2.3;
        ctx.fillStyle = CONTACT_COLOR[p.type];
        ctx.shadowColor = CONTACT_COLOR[p.type];
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(mx, my, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(cx, cy - 6);
      ctx.lineTo(cx + 4, cy + 5);
      ctx.lineTo(cx, cy + 3);
      ctx.lineTo(cx - 4, cy + 5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,235,205,0.3)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [telRef, size]);
  return <canvas ref={canvas} style={{ width: size, height: size }} className="rounded-full" />;
}

/* -------------------------------------------------------------- compass */
function CompassStrip({ heading, markers, width }: { heading: number; markers: Marker[]; width: number }) {
  const span = 55;
  const ticks = [];
  const start = Math.ceil((heading - span) / 10) * 10;
  for (let d = start; d <= heading + span; d += 10) {
    const rel = d - heading;
    const deg = ((d % 360) + 360) % 360;
    const major = deg % 30 === 0;
    ticks.push(
      <div key={d} className="absolute top-0 flex flex-col items-center" style={{ left: `${50 + (rel / span) * 50}%`, transform: 'translateX(-50%)' }}>
        <div className={major ? 'h-2.5 w-px bg-white/75' : 'h-1.5 w-px bg-white/30'} />
        {major && <span className={`digits mt-0.5 text-[8px] ${CARDINAL[deg] ? 'font-bold text-amber-200' : 'text-white/70'}`}>{CARDINAL[deg] ?? deg.toString().padStart(3, '0')}</span>}
      </div>
    );
  }
  return (
    <div className="relative" style={{ width, height: 36 }}>
      <div className="absolute inset-x-0 top-0 h-[26px] bg-gradient-to-r from-transparent via-black/40 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-[26px] overflow-hidden">{ticks}</div>
      <div className="absolute inset-x-0 top-[20px] h-3 overflow-hidden">
        {markers
          .filter((mk) => Math.abs(mk.bearing) <= span)
          .map((mk) => (
            <div
              key={mk.id}
              className={`absolute -translate-x-1/2 text-[9px] leading-none ${mk.type === 'pirate' ? 'edge-pulse' : ''}`}
              style={{ left: `${50 + (mk.bearing / span) * 50}%`, color: MARKER_STYLE[mk.type].color, textShadow: `0 0 6px ${MARKER_STYLE[mk.type].color}` }}
            >
              {MARKER_STYLE[mk.type].glyph}
            </div>
          ))}
      </div>
      <div className="absolute left-1/2 top-0 h-3.5 w-px -translate-x-1/2 bg-amber-300 shadow-[0_0_6px_#fcd34d]" />
      <div className="digits absolute left-1/2 top-[25px] -translate-x-1/2 text-[11px] font-bold leading-none text-amber-200 txt-shadow">{heading.toFixed(0).padStart(3, '0')}°</div>
    </div>
  );
}

/* -------------------------------------------------------------- markers */
function MarkerView({ mk, compact }: { mk: Marker; compact: boolean }) {
  const st = MARKER_STYLE[mk.type];
  let nx = mk.nx;
  let ny = mk.ny;
  const insetX = 0.86;
  const insetY = compact ? 0.6 : 0.72;
  const off = !mk.onScreen || Math.abs(nx) > insetX || Math.abs(ny) > insetY;
  if (off) {
    const k = Math.max(Math.abs(nx) / insetX, Math.abs(ny) / insetY, 1e-4);
    nx /= k;
    ny /= k;
  }
  const left = `${((nx + 1) / 2) * 100}%`;
  const top = `${((1 - ny) / 2) * 100}%`;
  const angle = (Math.atan2(-ny, nx) * 180) / Math.PI;
  const pulse = mk.type === 'pirate' || mk.label.startsWith('BOARDING') ? 'edge-pulse' : '';
  if (off) {
    return (
      <div className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left, top }}>
        <div className={`text-[20px] leading-none ${pulse}`} style={{ color: st.color, transform: `rotate(${angle}deg)`, textShadow: `0 0 10px ${st.color}` }}>
          ➤
        </div>
        <div className="digits mt-0.5 text-[9px] tracking-wider txt-shadow" style={{ color: st.color }}>
          {mk.label} · {fmtDist(mk.dist)}
        </div>
      </div>
    );
  }
  return (
    <div className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left, top }}>
      {mk.type === 'wp' ? (
        <div className="h-3.5 w-3.5 rotate-45 border-2" style={{ borderColor: st.color, boxShadow: `0 0 14px ${st.color}` }} />
      ) : (
        <div className={`text-[18px] leading-none ${pulse}`} style={{ color: st.color, textShadow: `0 0 10px ${st.color}` }}>
          {st.glyph}
        </div>
      )}
      <div className="digits mt-1 rounded bg-black/45 px-1.5 py-0.5 text-[9px] tracking-wider" style={{ color: st.color }}>
        {mk.label} · {fmtDist(mk.dist)}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- radio */
function RadioBox({ msg, compact }: { msg: RadioMsg; compact: boolean }) {
  const info = speakerInfo(msg.speaker);
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = window.setInterval(() => setN((v) => (v >= msg.text.length ? v : v + 2)), 20);
    return () => window.clearInterval(id);
  }, [msg]);
  return (
    <div key={msg.id} className="toast-anim flex items-start gap-3 rounded-xl border border-white/10 bg-black/55 p-2.5 backdrop-blur-md" style={{ boxShadow: `0 0 30px -10px ${info.color}` }}>
      <Portrait speaker={msg.speaker} size={compact ? 40 : 54} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[12px] font-bold" style={{ color: info.color }}>
            {info.name}
          </span>
          <span className="digits text-[8px] tracking-[0.2em] text-white/40">📻 {info.role.toUpperCase()}</span>
        </div>
        <div className={`leading-snug text-slate-100 ${compact ? 'text-[10.5px]' : 'text-[12.5px]'}`}>{msg.text.slice(0, n)}</div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- vitals */
function Vital({ label, value, color, danger, compact }: { label: string; value: number; color: string; danger: boolean; compact: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <span className="label shrink-0" style={{ width: compact ? 30 : 38, fontSize: compact ? 7 : 8 }}>
        {label}
      </span>
      <div className="h-[4px] flex-1 overflow-hidden rounded-full bg-white/12">
        <div className={`h-full rounded-full ${danger ? 'animate-pulse' : ''}`} style={{ width: `${v}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
      </div>
      <span className={`digits w-6 text-right text-[9px] txt-shadow ${danger ? 'text-red-300' : 'text-white/85'}`}>{v.toFixed(0)}</span>
    </div>
  );
}

/* ------------------------------------------------------------ abilities */
function Ability({
  icon,
  label,
  hint,
  fill = 1,
  badge,
  active = false,
  disabled = false,
  size = 48,
  ringColor,
  onDown,
  onUp,
  onClick,
}: {
  icon: string;
  label: string;
  hint?: string;
  fill?: number;
  badge?: string;
  active?: boolean;
  disabled?: boolean;
  size?: number;
  ringColor?: string;
  onDown?: () => void;
  onUp?: () => void;
  onClick?: () => void;
}) {
  const r = 21;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fill));
  const ready = f >= 0.999 && !disabled;
  return (
    <div className={`flex flex-col items-center gap-1 ${disabled ? 'opacity-40' : ''}`}>
      <button
        disabled={disabled}
        onPointerDown={(e) => {
          if (onDown) {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            onDown();
          }
        }}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={onClick}
        onContextMenu={(e) => e.preventDefault()}
        className={`touch-btn relative grid place-items-center rounded-full border backdrop-blur-sm transition ${
          active ? 'border-cyan-200/80 bg-cyan-400/30' : ready ? 'border-white/25 bg-black/40 hover:bg-white/10' : 'border-white/10 bg-black/50'
        }`}
        style={{ width: size, height: size }}
      >
        <svg className="absolute inset-0" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
          <circle
            cx="24"
            cy="24"
            r={r}
            fill="none"
            stroke={ringColor ?? (ready ? '#67e8f9' : '#64748b')}
            strokeWidth="2.5"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - f)}
            strokeLinecap="round"
            transform="rotate(-90 24 24)"
          />
        </svg>
        <span className={`text-[19px] leading-none ${ready || active ? '' : 'opacity-50'}`}>{icon}</span>
        {badge && <span className="digits absolute -bottom-1 rounded bg-black/70 px-1 text-[9px] font-bold text-white">{badge}</span>}
      </button>
      <span className="label text-[7px] txt-shadow">
        {label}
        {hint ? <span className="ml-1 text-white/45">{hint}</span> : null}
      </span>
    </div>
  );
}

function HoldButton({ code, onKey, children, className }: { code: string; onKey: (c: string, d: boolean) => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        onKey(code, true);
      }}
      onPointerUp={() => onKey(code, false)}
      onPointerCancel={() => onKey(code, false)}
      onContextMenu={(e) => e.preventDefault()}
      className={`touch-btn grid place-items-center rounded-full border border-white/25 bg-black/40 text-white/90 backdrop-blur-sm active:bg-cyan-400/30 ${className ?? ''}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------ gunnery --- */

const SLOT_META: { icon: string; name: string; keyHint: string }[] = [
  { icon: '🔫', name: '76MM', keyHint: '1' },
  { icon: '🔱', name: 'CIWS', keyHint: '2' },
  { icon: '🚀', name: 'VLS', keyHint: '3' },
];

/** One weapon slot in the dock: reload ring, active frame, ammo/heat state. */
function WeaponSlot({
  i,
  fill,
  active,
  heat,
  heatOn,
  ammo,
  size = 52,
  onClick,
}: {
  i: number;
  fill: number;
  active: boolean;
  heat?: number;
  heatOn?: boolean;
  ammo?: number;
  size?: number;
  onClick: () => void;
}) {
  const meta = SLOT_META[i];
  const r = 22;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fill));
  const outOfAmmo = ammo !== undefined && ammo <= 0;
  return (
    <div className={`flex flex-col items-center gap-0.5 ${outOfAmmo ? 'opacity-40' : ''}`}>
      <button
        onClick={onClick}
        className={`touch-btn relative grid place-items-center rounded-lg border backdrop-blur-sm transition ${
          active ? 'border-red-300/70 bg-red-400/15 shadow-[0_0_18px_-4px_rgba(255,120,80,0.55)]' : 'border-white/20 bg-black/40 hover:bg-white/10'
        }`}
        style={{ width: size, height: size }}
        title={`${meta.name} [${meta.keyHint}]`}
      >
        <svg className="absolute inset-0" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
          <circle cx="24" cy="24" r={r} fill="none" stroke={active ? '#fca5a5' : '#67e8f9'} strokeWidth="2.5" strokeDasharray={c} strokeDashoffset={c * (1 - f)} strokeLinecap="round" transform="rotate(-90 24 24)" />
        </svg>
        <span className={`text-[18px] leading-none ${f < 1 ? 'opacity-50' : ''}`}>{meta.icon}</span>
        <span className="digits absolute left-1 top-0.5 rounded bg-black/60 px-1 text-[8px] font-bold text-white/70">{meta.keyHint}</span>
        {ammo !== undefined && <span className="digits absolute -bottom-1 right-0 rounded bg-black/75 px-1 text-[9px] font-bold text-amber-200">×{ammo}</span>}
      </button>
      {heat !== undefined ? (
        <div className="h-[3px] w-9 overflow-hidden rounded-full bg-white/12">
          <div className={`h-full rounded-full ${heatOn ? 'animate-pulse' : ''}`} style={{ width: `${heat * 100}%`, background: heat > 0.8 ? '#f87171' : '#fbbf24' }} />
        </div>
      ) : (
        <span className="label text-[7px] txt-shadow">{meta.name}</span>
      )}
    </div>
  );
}

/** Mouse-following reticle — position is driven by ref so it tracks at full frame rate. */
function Crosshair({ t }: { t: Telemetry }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let x = window.innerWidth * 0.5;
    let y = window.innerHeight * 0.48;
    const el = ref.current;
    if (el) el.style.transform = `translate(${x}px, ${y}px)`;
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (el) el.style.transform = `translate(${x}px, ${y}px)`;
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);
  const onT = t.aimOnTarget;
  const locked = t.locked;
  const col = locked ? '#f87171' : onT ? '#fb923c' : '#67e8f9';
  const r = 21;
  const c = 2 * Math.PI * r;
  const lockable = t.weaponSlot === 2;
  return (
    <div ref={ref} className="absolute left-0 top-0 z-10 will-change-transform">
      <div className="relative -ml-[26px] -mt-[26px] h-[52px] w-[52px]">
        {/* lock progress ring (missiles) */}
        {lockable && (
          <svg className="absolute inset-0" viewBox="0 0 52 52">
            <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="2" />
            <circle cx="26" cy="26" r={r} fill="none" stroke={col} strokeWidth="2.5" strokeDasharray={c} strokeDashoffset={c * (1 - t.lock)} strokeLinecap="round" transform="rotate(-90 26 26)" />
          </svg>
        )}
        {/* reticle cross */}
        <div className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: col, boxShadow: `0 0 8px ${col}` }} />
        {[0, 90, 180, 270].map((deg) => (
          <div
            key={deg}
            className="absolute left-1/2 top-1/2 h-[9px] w-[2px]"
            style={{
              background: col,
              boxShadow: `0 0 6px ${col}`,
              transform: `translate(-50%,-50%) rotate(${deg}deg) translateY(${t.aimOnTarget ? -14 : -17}px)`,
              transition: 'transform 120ms ease-out',
              opacity: 0.9,
            }}
          />
        ))}
        {lockable && t.lock > 0.02 && (
          <div className={`digits absolute left-1/2 top-[52px] -translate-x-1/2 whitespace-nowrap text-center text-[9px] font-bold tracking-[0.2em] ${locked ? 'edge-pulse' : ''}`} style={{ color: col }}>
            {locked ? '◈ SEEKER LOCK' : `LOCK ${Math.round(t.lock * 100)}%`}
          </div>
        )}
        {t.aimOnTarget && !lockable && (
          <div className="digits absolute left-1/2 top-[50px] -translate-x-1/2 whitespace-nowrap text-[9px] tracking-[0.2em]" style={{ color: col }}>
            {t.aimKind === 'fort' ? '◈ BATTERY' : t.aimKind === 'dhow' ? '◈ MOTHERSHIP' : '◈ SKIFF'} · {(t.aimDist / 1000).toFixed(2)} KM
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ HUD */
export function Hud({
  telRef,
  toasts,
  banner,
  popups,
  radio,
  muted,
  compact,
  touch,
  onMute,
  onPause,
  onFlare,
  onHorn,
  onCamera,
  onNavy,
  onWeapon,
  onFullscreen,
  onKey,
  onZoomIn,
  onZoomOut,
  onResetCam,
}: {
  telRef: React.MutableRefObject<Telemetry | null>;
  toasts: Toast[];
  banner: Banner | null;
  popups: Popup[];
  radio: RadioMsg | null;
  muted: boolean;
  compact: boolean;
  touch: boolean;
  onMute: () => void;
  onPause: () => void;
  onFlare: () => void;
  onHorn: () => void;
  onCamera: () => void;
  onNavy: () => void;
  onWeapon: (i: number) => void;
  onFullscreen?: () => void;
  onKey: (code: string, down: boolean) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetCam?: () => void;
}) {
  const t = telRef.current;
  if (!t) return null;
  const obj = t.objective;
  const objColor =
    obj.kind === 'combat'
      ? 'text-red-300'
      : obj.kind === 'rescue'
        ? 'text-orange-200'
        : obj.kind === 'storm'
          ? 'text-violet-200'
          : obj.kind === 'dock'
            ? 'text-amber-200'
            : obj.kind === 'wildlife'
              ? 'text-sky-200'
              : 'text-cyan-100';
  const bannerColor = banner?.kind === 'danger' ? 'text-red-300' : banner?.kind === 'warn' ? 'text-amber-200' : banner?.kind === 'good' ? 'text-emerald-200' : 'text-white';
  const iconBtn = 'touch-btn grid place-items-center rounded-full border border-white/15 bg-black/35 text-[13px] text-white/85 backdrop-blur-sm transition hover:bg-white/10';
  const iconSize = compact ? 32 : 36;
  const mult = 1 + (t.chain - 1) * 0.25;

  const navyBadge = t.navyState === 'inbound' ? `${Math.ceil(t.navyEta)}s` : t.navyState === 'onscene' ? 'ON' : undefined;
  const navyFill = t.navyState === 'ready' ? 1 : t.navyState === 'inbound' ? 0.5 : t.navyState === 'onscene' ? 1 : 0;
  const lradFill = 1 - t.flareCd / t.flareMax;

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <div className="vignette absolute inset-0" />
      <div className="absolute inset-0 transition-opacity duration-150" style={{ opacity: t.damageFlash, boxShadow: 'inset 0 0 180px rgba(255,30,30,0.85)' }} />
      {t.hull < 30 && <div className="absolute inset-0 animate-pulse" style={{ boxShadow: 'inset 0 0 140px rgba(255,0,0,0.35)' }} />}
      {t.inStorm && <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 160px rgba(40,50,90,0.55)' }} />}
      {t.hoseOn && <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 120px rgba(120,200,255,0.25)' }} />}

      <div className="absolute inset-x-0 top-0 bg-black transition-all duration-700" style={{ height: t.intro || t.slowmo ? '9%' : 0 }} />
      <div className="absolute inset-x-0 bottom-0 bg-black transition-all duration-700" style={{ height: t.intro || t.slowmo ? '9%' : 0 }} />

      {!t.intro && !t.slowmo && t.markers.map((mk) => <MarkerView key={mk.id} mk={mk} compact={compact} />)}

      {banner && (
        <div key={banner.id} className="banner-anim absolute inset-x-0 top-[20%] flex flex-col items-center px-6 text-center">
          <div className="h-px w-32 bg-gradient-to-r from-transparent via-white/70 to-transparent" />
          <div className={`mt-3 font-black uppercase leading-none tracking-[0.22em] txt-shadow ${bannerColor} ${compact ? 'text-[26px]' : 'text-[52px]'}`}>{banner.title}</div>
          <div className={`mt-2 uppercase tracking-[0.18em] text-white/85 txt-shadow ${compact ? 'text-[9px]' : 'text-[12px]'}`}>{banner.sub}</div>
          <div className="mt-3 h-px w-32 bg-gradient-to-r from-transparent via-white/70 to-transparent" />
        </div>
      )}

      <div className="absolute left-1/2 top-[36%] flex -translate-x-1/2 flex-col items-center gap-1">
        {popups.map((p) => (
          <div
            key={p.id}
            className={`popup-anim digits whitespace-nowrap font-black tracking-[0.2em] txt-shadow ${compact ? 'text-[13px]' : 'text-[19px]'} ${
              p.kind === 'good' ? 'text-emerald-300' : p.kind === 'danger' ? 'text-red-300' : 'text-cyan-200'
            }`}
          >
            {p.text}
          </div>
        ))}
      </div>

      {!t.intro && (
        <>
          {/* objective tracker */}
          <div className={`absolute ${compact ? 'left-3 top-2 max-w-[34vw]' : 'left-5 top-4 max-w-[360px]'}`}>
            <div className="label txt-shadow" style={{ fontSize: compact ? 7 : 9 }}>
              {t.missionCode} · {t.missionTitle}
            </div>
            <div className={`font-extrabold uppercase tracking-wide txt-shadow ${objColor} ${compact ? 'text-[12px]' : 'text-[17px]'} ${obj.urgent ? 'warn-flash' : ''}`}>{obj.title}</div>
            <div className={`digits text-white/80 txt-shadow ${compact ? 'text-[9px]' : 'text-[11px]'}`}>{obj.detail}</div>
            {t.chain > 1 && (
              <div className="mt-1.5 inline-flex items-center gap-2 rounded-full border border-emerald-300/40 bg-emerald-400/10 px-2 py-0.5">
                <span className="digits text-[10px] font-bold text-emerald-200">⛓ CHAIN ×{mult.toFixed(2)}</span>
                <span className="h-[3px] w-12 overflow-hidden rounded-full bg-white/15">
                  <span className="block h-full bg-emerald-300" style={{ width: `${t.chainT * 100}%` }} />
                </span>
              </div>
            )}
            {!compact && t.tasks.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {t.tasks.slice(-4).map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center gap-2 text-[11px] txt-shadow ${task.done ? 'text-emerald-300/80' : task.failed ? 'text-red-300/60 line-through' : task.active ? 'text-white/85' : 'text-white/45'}`}
                  >
                    <span className="text-[9px]">{task.done ? '◆' : task.failed ? '✕' : '◇'}</span>
                    <span>
                      {task.label}
                      {task.optional && !task.done && !task.failed ? <span className="ml-1 text-white/40">(optional)</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* compass + toasts */}
          <div className="absolute left-1/2 top-2 flex -translate-x-1/2 flex-col items-center gap-1">
            <CompassStrip heading={t.heading} markers={t.markers} width={compact ? 190 : 300} />
            <div className="flex flex-col items-center gap-1">
              {toasts.slice(0, compact ? 1 : 2).map((a) => (
                <div
                  key={a.id}
                  className={`toast-anim digits rounded-full border bg-black/45 px-3 py-1 text-center backdrop-blur-sm ${compact ? 'max-w-[62vw] text-[9px]' : 'max-w-[520px] text-[11px]'} ${
                    a.kind === 'danger' ? 'border-red-400/40 text-red-200' : a.kind === 'warn' ? 'border-amber-300/40 text-amber-100' : a.kind === 'good' ? 'border-emerald-300/40 text-emerald-100' : 'border-white/15 text-white/85'
                  }`}
                >
                  {a.text}
                </div>
              ))}
            </div>
          </div>

          {/* top-right controls */}
          <div className={`pointer-events-auto absolute flex flex-wrap gap-2 ${compact ? 'right-2 top-2 max-w-[40vw] justify-end' : 'right-4 top-4'}`}>
            <button onClick={onMute} className={iconBtn} style={{ width: iconSize, height: iconSize }} title="Sound">
              {muted ? '🔇' : '🔊'}
            </button>
            {touch && onZoomIn && (
              <button onClick={onZoomIn} className={iconBtn} style={{ width: iconSize, height: iconSize }} title="Zoom In [+]">
                +
              </button>
            )}
            {touch && onZoomOut && (
              <button onClick={onZoomOut} className={iconBtn} style={{ width: iconSize, height: iconSize }} title="Zoom Out [-]">
                −
              </button>
            )}
            {touch && onResetCam && (
              <button onClick={onResetCam} className={iconBtn} style={{ width: iconSize, height: iconSize }} title="Reset Camera [R]">
                ⟲
              </button>
            )}
            <button onClick={onCamera} className={iconBtn} style={{ width: iconSize, height: iconSize }} title="Camera [C]">
              🎥
            </button>
            {onFullscreen && (
              <button onClick={onFullscreen} className={iconBtn} style={{ width: iconSize, height: iconSize }} title="Fullscreen [F11]">
                ⛶
              </button>
            )}
            <button onClick={onPause} className={iconBtn} style={{ width: iconSize, height: iconSize }} title="Pause [Esc]">
              ❚❚
            </button>
          </div>

          {/* radio chatter */}
          {radio && (
            <div className={`absolute ${compact ? 'bottom-[62px] left-1/2 w-[58vw] -translate-x-1/2' : 'bottom-[108px] left-5 w-[400px]'}`}>
              <RadioBox msg={radio} compact={compact} />
            </div>
          )}

          {/* vitals */}
          <div className={`absolute ${compact ? 'left-3 top-[76px] w-[118px] space-y-0.5' : 'bottom-6 left-5 w-[180px] space-y-1.5'}`}>
            <Vital label="HULL" value={t.hull} color="#38bdf8" danger={t.hull < 30} compact={compact} />
            <Vital label="CARGO" value={t.cargo} color="#34d399" danger={t.cargo < 35} compact={compact} />
            <Vital label="FUEL" value={t.fuel} color="#fbbf24" danger={t.fuel < 15} compact={compact} />
            {!compact && (
              <div className="label pt-1 text-[8px] txt-shadow">
                UKC {t.keelClearance.toFixed(0)} m · swell {Math.abs(t.wave).toFixed(1)} m · {t.wind.toFixed(0)} kn wind
                {t.bonus > 0 ? <span className="ml-2 text-emerald-300">+${t.bonus.toLocaleString()}</span> : null}
              </div>
            )}
          </div>

          {/* speed cluster */}
          {compact ? (
            <div className={`absolute ${touch ? 'bottom-2 left-1/2 -translate-x-1/2 text-center' : 'bottom-3 right-4 text-right'}`}>
              <div className="digits text-[26px] font-bold leading-none text-white txt-shadow">
                {t.speed.toFixed(1)}
                <span className="ml-1 text-[9px] text-white/60">KN</span>
              </div>
              <div className={`digits text-[8px] tracking-[0.2em] ${t.fouled > 0 ? 'text-red-300' : t.boosting ? 'text-orange-300' : t.docking && !t.speedOk ? 'text-red-300' : 'text-cyan-200/80'}`}>
                {t.fouled > 0 ? `PROP FOULED ${Math.ceil(t.fouled)}s` : t.boosting ? 'EMERGENCY POWER' : telegraph(t.throttle)}
              </div>
            </div>
          ) : (
            <div className="absolute bottom-5 right-5 flex items-end gap-4">
              <div className="text-right">
                <div className="digits text-[46px] font-bold leading-none text-white txt-shadow">
                  {t.speed.toFixed(1)}
                  <span className="ml-1 text-[11px] text-white/60">KN</span>
                </div>
                <div
                  className={`digits mt-1 text-[10px] tracking-[0.25em] txt-shadow ${
                    t.fouled > 0 ? 'warn-flash text-red-300' : t.boosting ? 'text-orange-300' : t.docking && !t.speedOk ? 'warn-flash text-red-300' : 'text-cyan-200/85'
                  }`}
                >
                  {t.fouled > 0 ? `PROP FOULED · ${Math.ceil(t.fouled)}s` : t.boosting ? 'EMERGENCY POWER' : telegraph(t.throttle)}
                </div>
                <div className="mt-1.5 flex items-center justify-end gap-2">
                  <span className="label text-[7px]">RUDDER</span>
                  <div className="relative h-[4px] w-20 rounded-full bg-white/12">
                    <div className="absolute left-1/2 top-[-2px] h-[8px] w-px bg-white/40" />
                    <div className="absolute top-0 h-full rounded-full bg-amber-300" style={{ left: `${50 + Math.min(0, t.rudder * 50)}%`, width: `${Math.abs(t.rudder) * 50}%` }} />
                  </div>
                </div>
              </div>
              <div className="relative flex flex-col items-center">
                <div className="relative mr-1 h-[88px] w-[5px] rounded-full bg-white/12">
                  <div className="absolute left-[-3px] top-[72%] h-px w-[11px] bg-white/40" />
                  <div
                    className="absolute left-0 w-full rounded-full"
                    style={{
                      bottom: t.throttle >= 0 ? '28%' : `${28 + t.throttle * 100}%`,
                      height: `${Math.abs(t.throttle) * (t.throttle >= 0 ? 72 : 100)}%`,
                      background: t.throttle >= 0 ? 'linear-gradient(0deg,#22d3ee,#4ade80)' : '#fbbf24',
                    }}
                  />
                </div>
                <span className="label mt-1 text-[7px]">ENG</span>
              </div>
              <Radar telRef={telRef} size={120} />
            </div>
          )}

          {/* crosshair reticle (fine pointers) */}
          {!touch && <Crosshair t={t} />}

          {/* desktop ability dock */}
          {!touch && (
            <div className="pointer-events-auto absolute bottom-5 left-1/2 flex -translate-x-1/2 items-end gap-4">
              <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-black/30 px-2.5 py-2 backdrop-blur-sm">
                <WeaponSlot i={0} fill={t.weaponCds[0] ?? 1} active={t.weaponSlot === 0} onClick={() => onWeapon(0)} />
                <WeaponSlot i={1} fill={t.weaponCds[1] ?? 1} active={t.weaponSlot === 1} heat={t.weaponSlot === 1 ? t.weaponHeat : undefined} heatOn={t.weaponOverheated} onClick={() => onWeapon(1)} />
                <WeaponSlot i={2} fill={t.weaponCds[2] ?? 1} active={t.weaponSlot === 2} ammo={t.missiles} onClick={() => onWeapon(2)} />
                <div className="mb-1 pl-1 text-left">
                  <div className="label text-[7px] txt-shadow">{t.weaponShort}</div>
                  <div className="digits text-[8px] text-white/50 txt-shadow">CLICK / SPACE</div>
                </div>
              </div>
              <Ability icon="⚡" label="BOOST" hint="SHIFT" active={t.boosting} onDown={() => onKey('ShiftLeft', true)} onUp={() => onKey('ShiftLeft', false)} />
              {t.hasPirates && (
                <Ability icon="💦" label="HOSES" hint="E" fill={t.hosePressure} active={t.hoseOn} ringColor="#7dd3fc" onDown={() => onKey('KeyE', true)} onUp={() => onKey('KeyE', false)} />
              )}
              <Ability icon="📡" label="LRAD" hint="F" fill={lradFill} badge={t.flareCd > 0 ? `${Math.ceil(t.flareCd)}` : undefined} size={56} onClick={onFlare} />
              {t.hasPirates && (
                <Ability
                  icon="🚁"
                  label="NAVY"
                  hint="V"
                  fill={navyFill}
                  badge={navyBadge}
                  active={t.navyState === 'onscene'}
                  disabled={t.navyState === 'used'}
                  ringColor="#86efac"
                  onClick={onNavy}
                />
              )}
              <Ability icon="📢" label="HORN" hint="H" onClick={onHorn} />
            </div>
          )}

          {/* touch controls */}
          {touch && (
            <>
              <div className="pointer-events-auto absolute bottom-4 left-3 flex gap-3">
                <HoldButton code="KeyA" onKey={onKey} className="h-[64px] w-[64px] text-[22px]">
                  ◀
                </HoldButton>
                <HoldButton code="KeyD" onKey={onKey} className="h-[64px] w-[64px] text-[22px]">
                  ▶
                </HoldButton>
              </div>
              <div className="pointer-events-auto absolute bottom-4 right-3 flex items-end gap-3">
                <div className="flex flex-col items-center gap-2">
                  <HoldButton code="KeyX" onKey={onKey} className="h-[72px] w-[72px] border-red-300/40 bg-red-500/15 text-[26px] active:bg-red-400/30">
                    {SLOT_META[t.weaponSlot].icon}
                  </HoldButton>
                  <button onClick={() => onWeapon((t.weaponSlot + 1) % 3)} className="touch-btn digits rounded-lg border border-white/20 bg-black/45 px-2 py-1 text-[9px] tracking-wider text-cyan-100">
                    {SLOT_META[t.weaponSlot].name}
                    {t.weaponSlot === 2 ? ` ×${t.missiles}` : ''} ⟳
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {t.hasPirates && (
                    <Ability icon="💦" label="HOSE" fill={t.hosePressure} active={t.hoseOn} ringColor="#7dd3fc" size={46} onDown={() => onKey('KeyE', true)} onUp={() => onKey('KeyE', false)} />
                  )}
                  {t.hasPirates && (
                    <Ability icon="🚁" label="NAVY" fill={navyFill} badge={navyBadge} disabled={t.navyState === 'used'} ringColor="#86efac" size={46} onClick={onNavy} />
                  )}
                  <Ability icon="📡" label="LRAD" fill={lradFill} badge={t.flareCd > 0 ? `${Math.ceil(t.flareCd)}` : undefined} size={46} onClick={onFlare} />
                  <Ability icon="⚡" label="BOOST" active={t.boosting} size={46} onDown={() => onKey('ShiftLeft', true)} onUp={() => onKey('ShiftLeft', false)} />
                </div>
                <div className="flex flex-col gap-2">
                  <HoldButton code="KeyW" onKey={onKey} className="h-[56px] w-[56px] text-[18px]">
                    ▲
                  </HoldButton>
                  <HoldButton code="KeyS" onKey={onKey} className="h-[56px] w-[56px] text-[18px]">
                    ▼
                  </HoldButton>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
