import { useState } from 'react';
import { CHARACTERS } from '../game/story';

/** Character portrait with a coloured frame; falls back to an icon if the image is missing. */
export function Portrait({ speaker, size, className = '' }: { speaker: string; size: number; className?: string }) {
  const c = CHARACTERS[speaker];
  const [err, setErr] = useState(false);
  if (!c) return null;
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-lg border bg-black/60 ${className}`}
      style={{ width: size, height: size, borderColor: `${c.color}88`, boxShadow: `0 0 22px ${c.color}33` }}
    >
      {c.portrait && !err ? (
        <img
          src={c.portrait}
          alt={c.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setErr(true)}
          draggable={false}
        />
      ) : (
        <div className="grid h-full w-full place-items-center" style={{ fontSize: size * 0.45 }}>
          {c.icon}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
    </div>
  );
}

export function speakerInfo(speaker: string) {
  return CHARACTERS[speaker] ?? { name: speaker, role: '', color: '#e2e8f0', portrait: '', icon: '📻' };
}
