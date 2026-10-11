import { useCallback, useEffect, useState } from 'react';
import type { ActiveChoice } from '../game/Game';
import type { StoryChoice, StoryLine } from '../game/story';
import { Portrait, speakerInfo } from './Portrait';

/** Visual-novel style chapter scene with a title card, typed dialogue and an optional decision. */
export function StoryScene({
  kicker,
  title,
  lines,
  choice,
  onDone,
}: {
  kicker: string;
  title: string;
  lines: StoryLine[];
  choice: StoryChoice | null;
  onDone: (choice?: string) => void;
}) {
  const [idx, setIdx] = useState(-1);
  const [typed, setTyped] = useState(0);
  const line = idx >= 0 && idx < lines.length ? lines[idx] : null;
  const atChoice = idx >= lines.length && !!choice;

  useEffect(() => {
    if (idx !== -1) return;
    const t = window.setTimeout(() => setIdx(0), 2300);
    return () => window.clearTimeout(t);
  }, [idx]);

  useEffect(() => {
    if (!line) return;
    setTyped(0);
    const id = window.setInterval(() => setTyped((v) => (v >= line.text.length ? v : v + 2)), 18);
    return () => window.clearInterval(id);
  }, [line]);

  useEffect(() => {
    if (idx >= 0 && idx >= lines.length && !choice) onDone();
  }, [idx, lines.length, choice, onDone]);

  const advance = useCallback(() => {
    if (atChoice) return;
    if (idx === -1) return setIdx(0);
    if (line && typed < line.text.length) return setTyped(line.text.length);
    setIdx((i) => i + 1);
  }, [atChoice, idx, line, typed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance]);

  const info = line ? speakerInfo(line.speaker) : null;

  return (
    <div className="absolute inset-0 z-10 select-none" onClick={advance}>
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/25 to-black/85" />
      <div className="absolute inset-x-0 top-0 h-[8%] bg-black" />
      <div className="absolute inset-x-0 bottom-0 h-[8%] bg-black" />

      <button
        onClick={(e) => {
          e.stopPropagation();
          if (choice) setIdx(lines.length);
          else onDone();
        }}
        className="digits absolute right-4 top-[10%] z-10 rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-[10px] tracking-[0.25em] text-white/70 hover:bg-white/10"
      >
        SKIP ▸▸
      </button>

      {idx === -1 && (
        <div className="banner-anim absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <div className="h-px w-40 bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent" />
          <div className="digits mt-4 text-[11px] tracking-[0.6em] text-cyan-200/80">{kicker}</div>
          <div className="mt-2 text-[34px] font-black uppercase tracking-[0.12em] text-white txt-shadow md:text-[60px]">{title}</div>
          <div className="mt-4 h-px w-40 bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent" />
        </div>
      )}

      {line && info && (
        <div key={idx} className="fade-up absolute inset-x-0 bottom-[10%] mx-auto flex max-w-[980px] items-end gap-4 px-4 md:gap-6">
          <Portrait speaker={line.speaker} size={typeof window !== 'undefined' && window.innerWidth < 700 ? 84 : 168} />
          <div className="panel relative min-h-[120px] flex-1 rounded-xl p-4 md:p-6">
            <div className="flex items-baseline gap-3">
              <div className="text-[15px] font-bold md:text-[18px]" style={{ color: info.color }}>
                {info.name}
              </div>
              <div className="label">{info.role}</div>
            </div>
            <div className="mt-2 text-[14px] leading-relaxed text-slate-100 md:text-[17px]">
              {line.text.slice(0, typed)}
              {typed < line.text.length && <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-cyan-200 align-middle" />}
            </div>
            <div className="digits absolute bottom-2 right-4 text-[9px] tracking-[0.25em] text-white/40">
              {idx + 1}/{lines.length} · CLICK / SPACE ▸
            </div>
          </div>
        </div>
      )}

      {atChoice && choice && (
        <div className="fade-up absolute inset-0 flex flex-col items-center justify-center px-4" onClick={(e) => e.stopPropagation()}>
          <div className="digits text-[10px] tracking-[0.5em] text-amber-200/80">DECISION</div>
          <div className="mt-2 max-w-[640px] text-center text-[20px] font-bold text-white txt-shadow md:text-[26px]">{choice.prompt}</div>
          <div className="mt-6 grid w-full max-w-[760px] gap-3 md:grid-cols-2">
            {choice.options.map((o, i) => (
              <button
                key={o.id}
                onClick={() => onDone(o.id)}
                className="panel group rounded-xl p-5 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/50"
              >
                <div className="digits text-[10px] tracking-[0.3em] text-cyan-300/70">OPTION {i + 1}</div>
                <div className="mt-1 text-[18px] font-bold text-white group-hover:text-cyan-100">{o.label}</div>
                <div className="mt-1 text-[12px] text-slate-400">{o.detail}</div>
              </button>
            ))}
          </div>
          <div className="mt-4 text-[11px] text-slate-500">Your choices shape how the story ends.</div>
        </div>
      )}
    </div>
  );
}

/** In-mission radio decision; the world runs in slow motion until you answer. */
export function ChoicePanel({ choice, timeLeft, onPick }: { choice: ActiveChoice; timeLeft: number; onPick: (id: string) => void }) {
  const info = speakerInfo(choice.speaker);
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/30" style={{ boxShadow: 'inset 0 0 220px rgba(0,0,0,0.85)' }} />
      <div className="fade-up panel pointer-events-auto relative w-full max-w-[620px] rounded-xl p-5">
        <div className="flex items-start gap-4">
          <Portrait speaker={choice.speaker} size={86} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <div className="text-[15px] font-bold" style={{ color: info.color }}>
                {info.name}
              </div>
              <div className="label">{info.role}</div>
            </div>
            <div className="mt-1 text-[14px] leading-relaxed text-slate-100">{choice.text}</div>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {choice.options.map((o, i) => (
            <button key={o.id} onClick={() => onPick(o.id)} className="rounded-lg border border-white/15 bg-white/5 p-3 text-left transition hover:border-cyan-300/50 hover:bg-cyan-400/10">
              <div className="flex items-center gap-2">
                <kbd className="digits rounded border border-white/20 px-1.5 text-[10px] text-white/70">{i + 1}</kbd>
                <span className="text-[14px] font-semibold text-white">{o.label}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">{o.hint}</div>
            </button>
          ))}
        </div>
        <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-amber-300 transition-[width] duration-100" style={{ width: `${Math.max(0, (timeLeft / choice.total) * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
