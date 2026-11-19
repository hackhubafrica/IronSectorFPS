import { Award, Crosshair, LogOut, Play, RotateCcw, Shield, Trophy } from 'lucide-react';
import type { HudState, WeaponId, WeaponProgress } from '../game/types.ts';
import { getWeaponMasteryInfo, WEAPONS } from '../game/weapons.ts';

interface ScoreboardModalProps {
  hud: HudState;
}

export function ScoreboardModal({ hud }: ScoreboardModalProps) {
  const sorted = [...hud.combatants].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0B0E11]/75 p-4 pointer-events-none">
      <div className="w-full max-w-2xl bg-[#141920] border border-[#2C3542] shadow-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#252D38] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            <span className="font-display text-sm font-bold uppercase tracking-wider text-slate-100">
              Tactical Scoreboard · {hud.mode.toUpperCase()}
            </span>
          </div>
          {hud.roomCode && (
            <span className="text-xs font-mono-tabular text-amber-400">ROOM {hud.roomCode}</span>
          )}
        </div>
        <div className="divide-y divide-[#1E2631] max-h-[65vh] overflow-y-auto">
          <div className="grid grid-cols-12 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 bg-[#0E1318]">
            <span className="col-span-5">Operator</span>
            <span className="col-span-2 text-center">Team</span>
            <span className="col-span-2 text-right">Kills</span>
            <span className="col-span-1 text-right">Deaths</span>
            <span className="col-span-2 text-right">Score</span>
          </div>
          {sorted.map((c) => (
            <div
              key={c.id}
              className={`grid grid-cols-12 px-5 py-2.5 text-sm items-center ${
                c.id === hud.player.id ? 'bg-amber-500/12 text-amber-300 font-semibold' : 'text-slate-200'
              }`}
            >
              <span className="col-span-5 truncate">
                {c.name} {c.isBot ? <span className="text-[10px] text-slate-500 ml-1">[AI]</span> : null}
              </span>
              <span
                className={`col-span-2 text-center text-xs uppercase font-bold ${
                  c.team === 'alpha' ? 'text-sky-400' : c.team === 'bravo' ? 'text-rose-400' : 'text-amber-400'
                }`}
              >
                {c.team}
              </span>
              <span className="col-span-2 text-right font-mono-tabular">{c.kills}</span>
              <span className="col-span-1 text-right font-mono-tabular text-slate-400">{c.deaths}</span>
              <span className="col-span-2 text-right font-mono-tabular">{c.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface PauseModalProps {
  hud: HudState;
  onResume: () => void;
  onExit: () => void;
}

export function PauseModal({ hud, onResume, onExit }: PauseModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E11]/82 p-4">
      <div className="w-full max-w-md bg-[#141920] border border-[#2C3542] p-6 shadow-2xl">
        <h2 className="font-display text-xl font-bold uppercase tracking-wider text-slate-100">
          Operation Paused
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          {hud.connectionMode === 'online'
            ? `Online Tactical Room ${hud.roomCode ?? 'Connecting...'} · ${hud.pingMs}ms`
            : 'Offline Combat Simulation · Local AI Bots'}
        </p>

        <div className="mt-5 p-3.5 bg-[#0E1318] border border-[#222A35] text-xs text-slate-300 space-y-1.5">
          <div className="flex justify-between"><span>Move / Sprint</span><span className="font-mono-tabular text-amber-400">WASD + Shift · LS + L3</span></div>
          <div className="flex justify-between"><span>Fire / Aim Sight</span><span className="font-mono-tabular text-amber-400">LMB / RMB · RT / LT</span></div>
          <div className="flex justify-between"><span>Reload / Swap</span><span className="font-mono-tabular text-amber-400">R / Q · X / Y</span></div>
          <div className="flex justify-between"><span>Armor Plate / Frag / UAV</span><span className="font-mono-tabular text-amber-400">4 / G / 3 · RB / LB / D-Up</span></div>
          <div className="flex justify-between"><span>Jump / Crouch & Slide / Exfil</span><span className="font-mono-tabular text-amber-400">Space / C / F · A / B / Hold X</span></div>
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
          >
            <Play className="w-4 h-4" />
            Resume Deployment
          </button>
          <button
            type="button"
            onClick={onExit}
            className="w-full py-3 px-4 bg-[#1B222C] hover:bg-[#252E3C] border border-[#2C3542] text-slate-200 font-semibold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4 text-rose-400" />
            Return to Command Lobby
          </button>
        </div>
      </div>
    </div>
  );
}

interface PostMatchModalProps {
  hud: HudState;
  weaponProgress: Record<WeaponId, WeaponProgress>;
  onReplay: () => void;
  onExit: () => void;
}

export function PostMatchModal({ hud, weaponProgress, onReplay, onExit }: PostMatchModalProps) {
  const playerWon =
    hud.mode === 'ffa'
      ? hud.winnerName === hud.player.name
      : hud.winnerTeam === hud.player.team;
  const sorted = [...hud.combatants].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths).slice(0, 6);
  const xpEarned = hud.player.kills * 120 + (playerWon ? 450 : 180) + (hud.player.extractedValue > 0 ? 500 : 0);

  const usedWeapons = (Object.entries(hud.player.weaponKills) as [WeaponId, number][]).filter(([, k]) => k > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0E11]/88 p-4">
      <div className="w-full max-w-xl bg-[#141920] border border-[#2C3542] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[#252D38] pb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 border ${playerWon ? 'bg-amber-500/15 border-amber-500/50 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold uppercase tracking-wider text-slate-100">
                {hud.mode === 'extraction'
                  ? hud.player.extractedValue > 0
                    ? 'Extraction Complete'
                    : 'MIA — Exfil Missed'
                  : playerWon
                  ? 'Victory Secured'
                  : hud.winnerTeam === 'draw'
                  ? 'Tactical Stalemate'
                  : 'Operation Concluded'}
              </h2>
              <p className="text-xs text-slate-400 uppercase tracking-wider mt-0.5">
                {hud.mode.toUpperCase()} · XP Earned +{xpEarned}
                {hud.player.extractedValue > 0 ? ` · Stash Banked +$${hud.player.extractedValue.toLocaleString()}` : ''}
              </p>
            </div>
          </div>
          {hud.mode !== 'extraction' && hud.mode !== 'ffa' && (
            <div className="text-right font-mono-tabular">
              <span className="text-xl font-bold text-sky-400">{hud.alphaScore}</span>
              <span className="mx-2 text-slate-500">:</span>
              <span className="text-xl font-bold text-rose-400">{hud.bravoScore}</span>
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="p-3 bg-[#0E1318] border border-[#222A35]">
            <div className="text-[11px] uppercase text-slate-400">Eliminations</div>
            <div className="font-mono-tabular text-xl font-bold text-slate-100 mt-0.5">{hud.player.kills}</div>
          </div>
          <div className="p-3 bg-[#0E1318] border border-[#222A35]">
            <div className="text-[11px] uppercase text-slate-400">Deaths</div>
            <div className="font-mono-tabular text-xl font-bold text-slate-100 mt-0.5">{hud.player.deaths}</div>
          </div>
          <div className="p-3 bg-[#0E1318] border border-[#222A35]">
            <div className="text-[11px] uppercase text-slate-400">Career Reward</div>
            <div className="font-mono-tabular text-xl font-bold text-amber-400 mt-0.5 flex items-center gap-1">
              <Award className="w-4 h-4" />+{xpEarned} XP
            </div>
          </div>
        </div>

        {usedWeapons.length > 0 && (
          <div className="mt-4 p-3.5 bg-[#0E1318] border border-[#222A35] space-y-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5" />
              Weapon Mastery Progress
            </div>
            {usedWeapons.map(([wId, matchKills]) => {
              const mastery = getWeaponMasteryInfo(weaponProgress[wId]?.kills ?? matchKills);
              return (
                <div key={wId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-100">
                      {WEAPONS[wId].name} <span className="text-amber-400 ml-1">Lv {mastery.level}</span>
                    </span>
                    <span className="font-mono-tabular text-slate-300">
                      +{matchKills} kills ({mastery.kills}{mastery.nextLevelKills ? `/${mastery.nextLevelKills}` : ' MAX'})
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#1B222C]">
                    <div className="h-full bg-amber-500" style={{ width: `${Math.round(mastery.progressPct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 border border-[#222A35] bg-[#0E1318] divide-y divide-[#1B222C]">
          {sorted.map((c, idx) => (
            <div
              key={c.id}
              className={`flex items-center justify-between px-4 py-2 text-xs ${
                c.id === hud.player.id ? 'text-amber-300 font-semibold bg-amber-500/10' : 'text-slate-300'
              }`}
            >
              <span>#{idx + 1} {c.name}</span>
              <span className="font-mono-tabular">
                {c.kills} K / {c.deaths} D
              </span>
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onReplay}
            className="flex-1 py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Redeploy
          </button>
          <button
            type="button"
            onClick={onExit}
            className="flex-1 py-3 px-4 bg-[#1B222C] hover:bg-[#252E3C] border border-[#2C3542] text-slate-200 font-semibold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Lobby
          </button>
        </div>
      </div>
    </div>
  );
}
