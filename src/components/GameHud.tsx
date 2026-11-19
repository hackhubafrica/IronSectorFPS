import { Flame, Gamepad2, Pause, Radar, Shield, Users } from 'lucide-react';
import { useEffect } from 'react';
import type { FpsEngine } from '../engine/FpsEngine.ts';
import type { HudState } from '../game/types.ts';
import { cancelHapticFeedback, triggerHapticFeedback } from '../utils/haptics.ts';
import { KillFeed } from './KillFeed.tsx';
import { MinimapRadar } from './MinimapRadar.tsx';

interface GameHudProps {
  hud: HudState;
  engine: FpsEngine;
  isTouchDevice: boolean;
  onPause: () => void;
  onToggleScoreboard: (show: boolean) => void;
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

export function GameHud({ hud, engine, isTouchDevice, onPause }: GameHudProps) {
  const crosshairGap = Math.round(6 + hud.player.spread * 520);
  const showCrosshair = hud.player.alive && hud.phase === 'active' && !(hud.player.ads && hud.player.optic === 'scope_25x');
  const damageId = hud.damageIndicator?.id;
  const shockwaveId = hud.explosionShockwave?.id;
  const shockwaveIntensity = hud.explosionShockwave?.intensity ?? 0;

  useEffect(() => {
    if (!damageId || !hud.hapticsEnabled) return;
    triggerHapticFeedback('damage', {
      enabled: hud.hapticsEnabled,
      enableWebVibration: true,
      enableGamepadRumble: hud.gamepadConnected,
      eventId: damageId,
    });
  }, [damageId, hud.hapticsEnabled, hud.gamepadConnected]);

  useEffect(() => {
    if (!shockwaveId || !hud.hapticsEnabled) return;
    triggerHapticFeedback('explosion', {
      enabled: hud.hapticsEnabled,
      intensity: shockwaveIntensity,
      enableWebVibration: true,
      enableGamepadRumble: hud.gamepadConnected,
      eventId: shockwaveId,
    });
  }, [shockwaveId, shockwaveIntensity, hud.hapticsEnabled, hud.gamepadConnected]);

  useEffect(() => {
    if (hud.phase !== 'active') {
      cancelHapticFeedback();
    }
    return () => cancelHapticFeedback();
  }, [hud.phase]);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none text-slate-100">
      {/* Explosion Shockwave Edge Flash */}
      {hud.explosionShockwave && (
        <div
          className="fixed inset-0 pointer-events-none border-[10px] border-amber-500/45"
          style={{ opacity: Math.min(0.8, hud.explosionShockwave.intensity * 0.8) }}
        />
      )}
      {/* 2.5x Scope vignette */}
      {hud.player.alive && hud.player.ads && hud.player.optic === 'scope_25x' && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[72vmin] h-[72vmin] rounded-full border-[90px] border-[#050709]/95 relative flex items-center justify-center">
            <div className="w-full h-px bg-rose-500/60" />
            <div className="h-full w-px bg-rose-500/60 absolute" />
            <div className="w-2 h-2 rounded-full bg-rose-500 absolute" />
          </div>
        </div>
      )}

      {/* Top HUD Bar: Minimap left, Match scoreboard center, Killfeed + Menu right */}
      <div className="flex items-start justify-between p-3 sm:p-4 gap-3">
        <div className="flex flex-col gap-2">
          <MinimapRadar hud={hud} />
          {hud.connectionMode === 'online' && (
            <div className="px-2.5 py-1 bg-[#0B0E11]/85 border border-slate-700/70 text-[11px] font-mono-tabular text-slate-300 flex items-center gap-2">
              <span className="text-amber-400 font-bold">{hud.roomCode ?? 'SYNC'}</span>
              <span>·</span>
              <span>{hud.pingMs}ms</span>
            </div>
          )}
          {hud.gamepadConnected && (
            <div className="px-2.5 py-1 bg-[#0B0E11]/85 border border-amber-500/50 text-[10px] font-mono-tabular uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
              <Gamepad2 className="w-3 h-3 text-amber-400" />
              <span>Controller Active</span>
            </div>
          )}
        </div>

        {/* Center Match Score & Objective Status */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-3 px-4 py-1.5 bg-[#0B0E11]/88 border border-[#2C3542] shadow-lg">
            {hud.mode === 'tdm' || hud.mode === 'domination' ? (
              <>
                <div className="text-right">
                  <span className="text-[10px] uppercase tracking-wider text-sky-400 block">Alpha</span>
                  <span className="font-mono-tabular text-lg font-bold text-sky-300 leading-none">{hud.alphaScore}</span>
                </div>
                <div className="px-3 py-1 bg-[#141920] border border-[#2C3542] text-center">
                  <span className="font-mono-tabular text-sm font-bold text-slate-100">{formatClock(hud.timeRemaining)}</span>
                  <span className="block text-[9px] uppercase text-slate-400">Limit {hud.scoreLimit}</span>
                </div>
                <div className="text-left">
                  <span className="text-[10px] uppercase tracking-wider text-rose-400 block">Bravo</span>
                  <span className="font-mono-tabular text-lg font-bold text-rose-300 leading-none">{hud.bravoScore}</span>
                </div>
              </>
            ) : hud.mode === 'extraction' ? (
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <span className="text-[10px] uppercase tracking-wider text-amber-400 block">Hazard Ops</span>
                  <span className="font-mono-tabular text-base font-bold text-slate-100">{formatClock(hud.timeRemaining)}</span>
                </div>
                <div className="h-6 w-px bg-[#2C3542]" />
                <div className="text-center">
                  <span className="text-[10px] uppercase tracking-wider text-emerald-400 block">Bag Value</span>
                  <span className="font-mono-tabular text-base font-bold text-emerald-300">${hud.player.lootValue.toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <span className="text-[10px] uppercase tracking-wider text-amber-400 block">FFA Skirmish</span>
                  <span className="font-mono-tabular text-base font-bold text-slate-100">{formatClock(hud.timeRemaining)}</span>
                </div>
                <div className="h-6 w-px bg-[#2C3542]" />
                <div className="text-center">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Kills</span>
                  <span className="font-mono-tabular text-base font-bold text-amber-300">{hud.player.kills} / {hud.scoreLimit}</span>
                </div>
              </div>
            )}
          </div>

          {hud.mode === 'domination' && (
            <div className="flex items-center gap-2">
              {hud.zones.map((z) => (
                <div
                  key={z.id}
                  className={`px-2.5 py-0.5 text-xs font-bold border ${
                    z.contested
                      ? 'bg-amber-500/25 border-amber-400 text-amber-300'
                      : z.owner === 'alpha'
                      ? 'bg-sky-500/25 border-sky-400 text-sky-300'
                      : z.owner === 'bravo'
                      ? 'bg-rose-500/25 border-rose-400 text-rose-300'
                      : 'bg-[#0B0E11]/85 border-slate-600 text-slate-300'
                  }`}
                >
                  {z.id}
                </div>
              ))}
            </div>
          )}

          {hud.mode === 'extraction' && hud.extraction.active && (
            <div className="px-4 py-1.5 bg-emerald-950/90 border border-emerald-400 text-emerald-200 text-xs font-bold uppercase tracking-wider">
              Helipad Exfil Inbound · Hold Position · {hud.extraction.countdown.toFixed(1)}s
            </div>
          )}

          {hud.masteryBanner && (
            <div className="mt-1 px-4 py-2 bg-[#141920]/95 border border-amber-500 text-center shadow-2xl">
              <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                Weapon Mastery Level {hud.masteryBanner.level}
              </div>
              <div className="font-display text-sm font-bold uppercase text-slate-100">
                {hud.masteryBanner.weaponName} · Unlocked: {hud.masteryBanner.unlockLabel}
              </div>
            </div>
          )}
        </div>

        {/* Right: Pause button & Killfeed */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                triggerHapticFeedback('ui', { enabled: hud.hapticsEnabled });
                onPause();
              }}
              className="p-2.5 bg-[#0B0E11]/88 hover:bg-[#1B222C] border border-[#2C3542] text-slate-200"
              aria-label="Pause Match"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>
          <KillFeed
            entries={hud.killfeed}
            playerId={hud.player.id}
            playerName={hud.player.name}
            compact={isTouchDevice}
          />
        </div>
      </div>

      {/* Dynamic Center Crosshair & Hitmarker */}
      {showCrosshair && (
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="w-1 h-1 rounded-full bg-amber-400/90" />
          <div className="absolute left-1/2 -translate-x-1/2 w-0.5 h-2.5 bg-slate-100/90" style={{ bottom: `${crosshairGap}px` }} />
          <div className="absolute left-1/2 -translate-x-1/2 w-0.5 h-2.5 bg-slate-100/90" style={{ top: `${crosshairGap}px` }} />
          <div className="absolute top-1/2 -translate-y-1/2 h-0.5 w-2.5 bg-slate-100/90" style={{ right: `${crosshairGap}px` }} />
          <div className="absolute top-1/2 -translate-y-1/2 h-0.5 w-2.5 bg-slate-100/90" style={{ left: `${crosshairGap}px` }} />
        </div>
      )}

      {hud.hitmarker && (
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className={`w-6 h-6 relative ${hud.hitmarker.kind === 'kill' ? 'text-rose-500' : hud.hitmarker.kind === 'head' ? 'text-amber-400' : 'text-slate-100'}`}>
            <span className="absolute left-0 top-0 w-2.5 h-0.5 bg-current rotate-45 origin-left" />
            <span className="absolute right-0 top-0 w-2.5 h-0.5 bg-current -rotate-45 origin-right" />
            <span className="absolute left-0 bottom-0 w-2.5 h-0.5 bg-current -rotate-45 origin-left" />
            <span className="absolute right-0 bottom-0 w-2.5 h-0.5 bg-current rotate-45 origin-right" />
          </div>
        </div>
      )}

      {/* Multi-Directional Incoming Bullet Hit Markers */}
      {hud.damageIndicators.map((ind) => {
        const lifeTotal = Math.max(1, ind.until - ind.createdAt);
        const remaining = Math.max(0, ind.until - performance.now());
        const alpha = Math.min(1, Math.max(0.15, remaining / lifeTotal));
        const scale = ind.damage >= 35 ? 1.15 : 1;
        return (
          <div
            key={ind.id}
            className="fixed left-1/2 top-1/2 w-56 h-56 sm:w-64 sm:h-64 pointer-events-none"
            style={{
              transform: `translate(-50%, -50%) rotate(${ind.angle}rad) scale(${scale})`,
              opacity: alpha,
            }}
          >
            <svg
              viewBox="0 0 120 44"
              className="w-28 h-10 mx-auto -mt-1 drop-shadow-[0_0_8px_rgba(244,63,94,0.65)]"
            >
              {/* Curved directional threat arc */}
              <path
                d="M 14 34 Q 60 10 106 34 L 97 38 Q 60 20 23 38 Z"
                fill={ind.armorHit ? '#38bdf8' : '#f43f5e'}
                fillOpacity={ind.armorHit ? '0.85' : '0.92'}
              />
              {/* Sharp outer bullet-source chevron */}
              <path
                d="M 48 16 L 60 4 L 72 16 L 67 18 L 60 11 L 53 18 Z"
                fill={ind.armorHit ? '#e0f2fe' : '#ffe4e6'}
              />
              {/* Inner crimson core accent on armor hits */}
              {ind.armorHit && (
                <path d="M 30 31 Q 60 17 90 31 L 85 34 Q 60 23 35 34 Z" fill="#f43f5e" fillOpacity="0.85" />
              )}
            </svg>
          </div>
        );
      })}

      {/* Interact Prompt */}
      {hud.interactPrompt && hud.player.alive && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-32 px-4 py-2 bg-[#0B0E11]/92 border border-amber-500/70 text-xs font-semibold text-amber-300 text-center">
          <div>{hud.interactPrompt}</div>
          {hud.interactProgress > 0 && (
            <div className="w-48 h-1.5 bg-slate-800 mt-1.5 overflow-hidden">
              <div className="h-full bg-amber-400" style={{ width: `${Math.round(hud.interactProgress * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      {/* Reload Bar */}
      {hud.player.reloading && hud.player.alive && (
        <div className="fixed left-1/2 -translate-x-1/2 top-[57%] w-32 bg-[#0B0E11]/85 border border-slate-700 p-1">
          <div className="text-[10px] text-center uppercase tracking-wider text-amber-300 mb-0.5">Reloading</div>
          <div className="h-1 bg-slate-800">
            <div className="h-full bg-amber-400" style={{ width: `${Math.round(hud.player.reloadProgress * 100)}%` }} />
          </div>
        </div>
      )}

      {/* Respawn overlay */}
      {!hud.player.alive && hud.phase === 'active' && (
        <div className="fixed inset-0 flex items-center justify-center bg-rose-950/35 pointer-events-none">
          <div className="px-6 py-4 bg-[#0B0E11]/92 border border-rose-500/50 text-center">
            <div className="font-display text-lg font-bold uppercase tracking-wider text-rose-400">Operator Down</div>
            <div className="font-mono-tabular text-xs text-slate-300 mt-1">
              Redeploying in {hud.player.respawnIn.toFixed(1)}s
            </div>
          </div>
        </div>
      )}

      {/* Desktop Pointer Lock Prompt (not needed when controller is driving aim) */}
      {!isTouchDevice && !hud.pointerLocked && !hud.gamepadConnected && hud.phase === 'active' && (
        <div className="fixed left-1/2 -translate-x-1/2 top-28 pointer-events-auto">
          <button
            type="button"
            onClick={() => {
              triggerHapticFeedback('ui', { enabled: hud.hapticsEnabled });
              engine.requestPointerLock();
            }}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-xl border border-amber-200"
          >
            Click Viewport to Lock Aim · [TAB] Scoreboard · [ESC] Pause
          </button>
        </div>
      )}

      {/* Bottom Vitals & Weapon Panel (hidden behind touch buttons on mobile or tucked neatly in center-bottom on touch) */}
      <div
        className={`fixed bottom-4 ${
          isTouchDevice ? 'left-1/2 -translate-x-1/2 flex-col items-center gap-1.5' : 'inset-x-4 flex justify-between items-end'
        } flex pointer-events-none`}
      >
        {/* Health & Armor */}
        <div className="px-4 py-2.5 bg-[#0B0E11]/88 border border-[#2C3542] min-w-[210px]">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="flex items-center gap-1.5 text-sky-300 font-semibold">
              <Shield className="w-3.5 h-3.5" />
              ARMOR
            </span>
            <span className="font-mono-tabular text-sky-300">{hud.player.armor}</span>
          </div>
          <div className="h-1.5 bg-slate-800 mb-2">
            <div className="h-full bg-sky-400 transition-all" style={{ width: `${(hud.player.armor / hud.player.maxArmor) * 100}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-bold text-slate-100">HP</span>
            <span className={`font-mono-tabular font-bold ${hud.player.hp <= 30 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {hud.player.hp}
            </span>
          </div>
          <div className="h-2 bg-slate-800">
            <div
              className={`h-full transition-all ${hud.player.hp <= 30 ? 'bg-rose-500' : 'bg-emerald-400'}`}
              style={{ width: `${(hud.player.hp / hud.player.maxHp) * 100}%` }}
            />
          </div>
        </div>

        {/* Desktop Weapon & Gadget Readout */}
        {!isTouchDevice && (
          <div className="px-4 py-2.5 bg-[#0B0E11]/88 border border-[#2C3542] min-w-[240px] text-right">
            <div className="flex items-center justify-end gap-3 text-[11px] text-slate-400 mb-1">
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3 text-sky-400" /> [{hud.gamepadConnected ? 'RB' : '4'}] Plates: {hud.player.armorPlates}
              </span>
              <span className="flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-400" /> [{hud.gamepadConnected ? 'LB' : 'G'}] Frag: {hud.player.grenades}
              </span>
              {hud.player.streakKills >= 3 && (
                <span className="flex items-center gap-1 text-emerald-400 font-bold">
                  <Radar className="w-3 h-3" /> [{hud.gamepadConnected ? 'D-UP' : '3'}] UAV Ready
                </span>
              )}
            </div>
            <div className="flex items-baseline justify-end gap-2">
              {hud.player.stance === 'slide' && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mr-auto">SLIDE</span>
              )}
              <span className="font-mono-tabular text-2xl font-bold text-slate-100">{hud.player.ammoInMag}</span>
              <span className="font-mono-tabular text-sm text-slate-400">/ {hud.player.reserveAmmo}</span>
            </div>
            <div className="text-[11px] uppercase tracking-wider text-amber-400 font-semibold mt-0.5 flex items-center justify-end gap-2">
              <Users className="w-3 h-3 text-slate-400" />
              <span>{hud.player.weaponName} · {hud.player.fireMode}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
