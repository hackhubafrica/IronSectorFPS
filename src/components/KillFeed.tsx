import { Crosshair, Skull } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { KillfeedEntry, KillfeedWeaponKind, TeamId } from '../game/types.ts';

interface KillFeedProps {
  entries: KillfeedEntry[];
  playerId: string;
  playerName: string;
  compact?: boolean;
}

const ENTRY_TTL_MS = 7500;
const FADE_WINDOW_MS = 1000;

function resolveWeaponKind(entry: KillfeedEntry): KillfeedWeaponKind {
  if (entry.weaponId) return entry.weaponId;
  const lower = entry.weaponName.toLowerCase();
  if (lower.includes('frag') || lower.includes('grenade')) return 'frag';
  if (lower.includes('vector')) return 'vector9';
  if (lower.includes('msr') || lower.includes('marksman')) return 'msr7';
  if (lower.includes('p220') || lower.includes('pistol')) return 'p220';
  return 'm4a1';
}

function getCombatantColor(team: TeamId, isSelf: boolean, role: 'killer' | 'victim'): string {
  if (isSelf) {
    return role === 'killer' ? 'text-amber-300 font-bold' : 'text-rose-300 font-bold';
  }
  if (team === 'alpha') return role === 'killer' ? 'text-sky-400 font-semibold' : 'text-sky-300 font-medium';
  if (team === 'bravo') return role === 'killer' ? 'text-rose-400 font-semibold' : 'text-rose-300 font-medium';
  return role === 'killer' ? 'text-amber-300 font-semibold' : 'text-slate-200 font-medium';
}

function WeaponSilhouette({ kind, headshot }: { kind: KillfeedWeaponKind; headshot: boolean }) {
  const toneClass = headshot ? 'text-amber-300' : kind === 'frag' ? 'text-orange-400' : 'text-slate-200';

  if (kind === 'm4a1') {
    return (
      <svg
        viewBox="0 0 44 16"
        className={`w-8 h-3.5 shrink-0 ${toneClass}`}
        fill="currentColor"
        aria-label="M4A1 Tactical"
      >
        {/* Stock + buffer */}
        <path d="M1 5h6l2 2H6L4 12H1V5Z" />
        {/* Receiver + carry optic */}
        <rect x="9" y="5" width="13" height="3.5" />
        <rect x="13" y="3" width="5" height="1.8" />
        {/* Grip & curved mag */}
        <path d="M10 8.5h3l-1.5 5H9l1-5Z" />
        <path d="M16.5 8.5h3.2l1.2 5.2-2.6.5-1.8-5.7Z" />
        {/* Handguard & barrel */}
        <rect x="22" y="5.2" width="11" height="2.6" />
        <rect x="33" y="5.9" width="9" height="1.3" />
        <rect x="39" y="5.3" width="3" height="2.4" />
      </svg>
    );
  }

  if (kind === 'vector9') {
    return (
      <svg
        viewBox="0 0 38 16"
        className={`w-7 h-3.5 shrink-0 ${toneClass}`}
        fill="currentColor"
        aria-label="Vector-9 CQB"
      >
        {/* Compact folded stock */}
        <path d="M2 5.5h6v2H4.5L3 11H2V5.5Z" />
        {/* Upper receiver & reflex sight */}
        <rect x="8" y="4.8" width="16" height="4.2" />
        <rect x="13" y="3" width="4.5" height="1.6" />
        {/* Rear grip */}
        <path d="M9.5 9h3l-1.3 4.8H8.5L9.5 9Z" />
        {/* Angled KRISS housing & stick mag */}
        <path d="M16.5 9h5.5l-1.5 3.5H16L16.5 9Z" />
        <path d="M18.5 11.5h2.4l-1.4 4h-2.2l1.2-4Z" />
        {/* Short suppressor barrel */}
        <rect x="24" y="5.6" width="9.5" height="2.3" />
      </svg>
    );
  }

  if (kind === 'msr7') {
    return (
      <svg
        viewBox="0 0 48 16"
        className={`w-9 h-3.5 shrink-0 ${toneClass}`}
        fill="currentColor"
        aria-label="MSR-7 Marksman"
      >
        {/* Precision skeleton stock */}
        <path d="M1 5.2h8v2.5H6L3 11.5H1V5.2Z" />
        {/* Rifle scope */}
        <rect x="12" y="2.2" width="12" height="2.2" />
        <rect x="11" y="1.8" width="2.2" height="3" />
        <rect x="22.5" y="1.8" width="2.5" height="3" />
        {/* Long receiver & grip/mag */}
        <rect x="9" y="5.2" width="16" height="3" />
        <path d="M10.5 8.2h2.8l-1.2 4.6H9.5l1-4.6Z" />
        <rect x="17" y="8.2" width="3.8" height="4" />
        {/* Long heavy barrel + brake */}
        <rect x="25" y="5.7" width="20" height="1.5" />
        <rect x="44" y="5.1" width="3" height="2.7" />
        {/* Folded bipod */}
        <path d="M29 7.2h5l-1.5 2H29v-2Z" />
      </svg>
    );
  }

  if (kind === 'p220') {
    return (
      <svg
        viewBox="0 0 26 16"
        className={`w-5 h-3.5 shrink-0 ${toneClass}`}
        fill="currentColor"
        aria-label="P220 Combat"
      >
        {/* Slide & sights */}
        <rect x="4" y="3.5" width="17" height="3.2" />
        <rect x="5" y="2.4" width="1.8" height="1.1" />
        <rect x="18.8" y="2.4" width="1.5" height="1.1" />
        {/* Frame & trigger guard */}
        <rect x="5" y="6.7" width="14" height="1.6" />
        <path d="M10.5 8.3h4v2.6h-4V8.3Zm1 .7v1.2h2V9h-2Z" />
        {/* Grip */}
        <path d="M4.8 8.3h4.2l-1.6 5.8H3.4l1.4-5.8Z" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 20 18"
      className={`w-4 h-3.5 shrink-0 ${toneClass}`}
      fill="currentColor"
      aria-label="M67 Frag"
    >
      {/* Spoon & fuse cap */}
      <rect x="8" y="2" width="4" height="2.5" />
      <path d="M12 2.5h2.5l1.5 3.5-1.4.6-1.2-2.6H12V2.5Z" />
      <circle cx="7" cy="3.2" r="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {/* Pineapple/M67 body */}
      <circle cx="10" cy="10.5" r="5.2" />
      <path d="M5.5 9.5h9v1.2h-9V9.5Z" fill="#0B0E11" opacity="0.55" />
    </svg>
  );
}

export function KillFeed({ entries, playerId, playerName, compact = false }: KillFeedProps) {
  const firstSeenRef = useRef<Map<string, number>>(new Map());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = Date.now();
    const seen = firstSeenRef.current;
    for (const entry of entries) {
      if (!seen.has(entry.id)) {
        seen.set(entry.id, t);
      }
    }
    if (seen.size > 32) {
      const activeIds = new Set(entries.map((e) => e.id));
      for (const id of seen.keys()) {
        if (!activeIds.has(id)) seen.delete(id);
      }
    }
  }, [entries]);

  useEffect(() => {
    if (entries.length === 0) return;
    setNow(Date.now());
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => window.clearInterval(id);
  }, [entries.length]);

  const maxVisible = compact ? 3 : 5;
  const visibleEntries = entries
    .filter((entry) => {
      const seenAt = firstSeenRef.current.get(entry.id) ?? now;
      return now - seenAt < ENTRY_TTL_MS;
    })
    .slice(0, maxVisible);

  if (visibleEntries.length === 0) return null;

  return (
    <div
      className="flex flex-col items-end gap-1 max-w-[235px] sm:max-w-[340px] pointer-events-none"
      aria-live="polite"
      aria-label="Combat Kill Feed"
    >
      <AnimatePresence initial={false}>
        {visibleEntries.map((kf) => {
          const seenAt = firstSeenRef.current.get(kf.id) ?? now;
          const ageMs = Math.max(0, now - seenAt);
          const fadeOpacity =
            ageMs > ENTRY_TTL_MS - FADE_WINDOW_MS
              ? Math.max(0.15, (ENTRY_TTL_MS - ageMs) / FADE_WINDOW_MS)
              : 1;

          const isSelfKiller = kf.killerId ? kf.killerId === playerId : kf.killerName === playerName;
          const isSelfVictim = kf.victimId ? kf.victimId === playerId : kf.victimName === playerName;
          const weaponKind = resolveWeaponKind(kf);

          const rowBorder = isSelfKiller
            ? 'border-amber-400/75 bg-[#12161D]/92 shadow-[0_0_12px_rgba(245,158,11,0.18)]'
            : isSelfVictim
            ? 'border-rose-500/70 bg-[#171116]/90'
            : kf.headshot
            ? 'border-amber-500/45 bg-[#0B0E11]/88'
            : 'border-[#252E3B] bg-[#0B0E11]/84';

          return (
            <motion.div
              key={kf.id}
              layout
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: fadeOpacity, x: 0 }}
              exit={{ opacity: 0, x: 14 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className={`px-2 py-1 border text-[11px] leading-none flex items-center gap-1.5 shadow-md ${rowBorder}`}
            >
              {/* Killer */}
              <span className="flex items-center gap-1 min-w-0">
                {kf.killerIsBot && (
                  <span className="hidden sm:inline-block px-1 py-0.5 text-[8px] font-mono-tabular uppercase tracking-wider bg-slate-800/90 text-slate-400 border border-slate-700/80">
                    BOT
                  </span>
                )}
                <span className={`truncate max-w-[78px] sm:max-w-[105px] ${getCombatantColor(kf.killerTeam, isSelfKiller, 'killer')}`}>
                  {kf.killerName}
                </span>
              </span>

              {/* Weapon Silhouette + Tooltip / Label */}
              <div
                className="flex items-center gap-1 px-1.5 py-0.5 bg-[#161C24]/90 border border-[#2A3442]"
                title={kf.weaponName}
              >
                <WeaponSilhouette kind={weaponKind} headshot={kf.headshot} />
                {kf.headshot && (
                  <span className="flex items-center gap-0.5 text-amber-400 font-mono-tabular text-[9px] font-bold uppercase tracking-wider">
                    <Crosshair className="w-2.5 h-2.5" />
                    <span className="hidden sm:inline">HS</span>
                  </span>
                )}
              </div>

              {/* Victim */}
              <span className="flex items-center gap-1 min-w-0">
                {kf.headshot && !isSelfKiller && (
                  <Skull className="w-3 h-3 text-amber-400 shrink-0 sm:hidden" />
                )}
                <span className={`truncate max-w-[78px] sm:max-w-[105px] ${getCombatantColor(kf.victimTeam, isSelfVictim, 'victim')}`}>
                  {kf.victimName}
                </span>
                {kf.victimIsBot && (
                  <span className="hidden sm:inline-block px-1 py-0.5 text-[8px] font-mono-tabular uppercase tracking-wider bg-slate-800/90 text-slate-400 border border-slate-700/80">
                    BOT
                  </span>
                )}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
