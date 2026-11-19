import { MAPS } from '../game/maps.ts';
import type { HudState } from '../game/types.ts';

interface MinimapRadarProps {
  hud: HudState;
}

export function MinimapRadar({ hud }: MinimapRadarProps) {
  const map = MAPS[hud.mapId];
  const size = 136;
  const half = size / 2;
  const scale = 1.45;
  const cos = Math.cos(-hud.player.yaw);
  const sin = Math.sin(-hud.player.yaw);
  const now = Date.now();

  const toRadar = (wx: number, wz: number) => {
    const dx = wx - hud.player.x;
    const dz = wz - hud.player.z;
    const rx = dx * cos - dz * sin;
    const rz = dx * sin + dz * cos;
    const clampedDist = Math.min(half - 8, Math.hypot(rx * scale, rz * scale));
    const ang = Math.atan2(rz, rx);
    return {
      x: half + Math.cos(ang) * clampedDist,
      y: half + Math.sin(ang) * clampedDist,
    };
  };

  return (
    <div className="relative w-[136px] h-[136px] rounded-full bg-[#0B0E11]/88 border border-slate-500/45 overflow-hidden shadow-xl">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
        <circle cx={half} cy={half} r={half - 2} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
        <circle cx={half} cy={half} r={half * 0.52} fill="none" stroke="rgba(148,163,184,0.14)" strokeWidth="1" />
        <line x1={half} y1={0} x2={half} y2={size} stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
        <line x1={0} y1={half} x2={size} y2={half} stroke="rgba(148,163,184,0.12)" strokeWidth="1" />

        {/* Domination Zones */}
        {hud.mode === 'domination' &&
          map.captureZones.map((zDef) => {
            const zState = hud.zones.find((z) => z.id === zDef.id);
            const pt = toRadar(zDef.x, zDef.z);
            const color =
              zState?.owner === 'alpha'
                ? '#38bdf8'
                : zState?.owner === 'bravo'
                ? '#f43f5e'
                : '#cbd5e1';
            return (
              <g key={zDef.id}>
                <circle cx={pt.x} cy={pt.y} r="7" fill="rgba(15,23,42,0.85)" stroke={color} strokeWidth="1.5" />
                <text x={pt.x} y={pt.y + 3} textAnchor="middle" fill={color} fontSize="8" fontWeight="700">
                  {zDef.id}
                </text>
              </g>
            );
          })}

        {/* Extraction Loot & Helipad */}
        {hud.mode === 'extraction' &&
          hud.lootCrates
            .filter((c) => !c.opened)
            .map((c) => {
              const pt = toRadar(c.x, c.z);
              return <rect key={c.id} x={pt.x - 2.5} y={pt.y - 2.5} width="5" height="5" fill="#fbbf24" />;
            })}

        {hud.mode === 'extraction' && (() => {
          const pt = toRadar(map.extractionZone.x, map.extractionZone.z);
          return (
            <g>
              <circle cx={pt.x} cy={pt.y} r="6.5" fill="rgba(16,185,129,0.2)" stroke="#10b981" strokeWidth="1.5" />
              <text x={pt.x} y={pt.y + 2.8} textAnchor="middle" fill="#34d399" fontSize="7.5" fontWeight="800">
                EX
              </text>
            </g>
          );
        })()}

        {/* Combatants */}
        {hud.combatants.map((c) => {
          if (!c.alive || c.id === hud.player.id) return null;
          const isFriendly = hud.mode !== 'ffa' && c.team === hud.player.team;
          const revealed = isFriendly || c.uavRevealUntil > now || hud.player.uavActiveUntil > now;
          if (!revealed) return null;
          const pt = toRadar(c.x, c.z);
          return (
            <circle
              key={c.id}
              cx={pt.x}
              cy={pt.y}
              r={isFriendly ? 3.2 : 3.6}
              fill={isFriendly ? '#38bdf8' : '#f43f5e'}
              stroke="#0B0E11"
              strokeWidth="1"
            />
          );
        })}

        {/* Player arrow */}
        <polygon
          points={`${half},${half - 6} ${half - 4.5},${half + 4.5} ${half},${half + 2} ${half + 4.5},${half + 4.5}`}
          fill="#f59e0b"
        />
      </svg>
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-mono-tabular uppercase tracking-wider text-slate-400">
        {hud.player.uavActiveUntil > now ? 'UAV SWEEP' : 'RADAR'}
      </div>
    </div>
  );
}
