import {
  Award,
  Crosshair,
  Gamepad2,
  Globe,
  Lock,
  Play,
  RefreshCw,
  Server,
  Settings,
  Shield,
  Sliders,
  WifiOff,
  Wrench,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { MAPS } from '../game/maps.ts';
import type {
  AttachmentSlot,
  ConnectionMode,
  GameMode,
  MapId,
  PlayerProfile,
  PublicRoomSummary,
  WeaponId,
  WeaponLoadout,
} from '../game/types.ts';
import {
  CAMO_OPTIONS,
  computeWeaponStats,
  getWeaponMasteryInfo,
  MAGAZINE_OPTIONS,
  MASTERY_MILESTONES,
  MUZZLE_OPTIONS,
  OPTIC_OPTIONS,
  UNDERBARREL_OPTIONS,
  WEAPONS,
} from '../game/weapons.ts';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';
import { getOperatorRank } from '../utils/storage.ts';
import { GunsmithPreviewCanvas } from './GunsmithPreviewCanvas.tsx';
import { PWAInstallButton } from './PWAControls.tsx';

export interface DeployRequest {
  mode: GameMode;
  mapId: MapId;
  connectionMode: ConnectionMode;
  roomAction?: 'create' | 'join' | 'quickmatch';
  roomCode?: string;
  roomName?: string;
}

interface LobbyViewProps {
  profile: PlayerProfile;
  onUpdateProfile: (next: PlayerProfile) => void;
  onDeploy: (req: DeployRequest) => void;
  roomError: string | null;
  onClearError: () => void;
}

type LobbyTab = 'play' | 'gunsmith' | 'servers' | 'settings';

const MODE_CARDS: { id: GameMode; title: string; subtitle: string; summary: string }[] = [
  {
    id: 'tdm',
    title: 'Team Deathmatch 5v5',
    subtitle: 'Score Limit 40 · Squad Warfare',
    summary: 'Classic 5v5 tactical elimination with rapid respawns and UAV streak support.',
  },
  {
    id: 'extraction',
    title: 'Hazard Operations',
    subtitle: 'Loot & Exfil · 15s Chopper Defense',
    summary: 'Breach high-tier supply crates and hold the helipad extraction beacon to bank credits.',
  },
  {
    id: 'domination',
    title: 'Domination',
    subtitle: 'Zones A / B / C · Score Limit 150',
    summary: 'Capture and fortify three strategic sector objectives to accumulate control points.',
  },
  {
    id: 'ffa',
    title: 'Free-for-All Skirmish',
    subtitle: 'Solo Arena · First to 25 Kills',
    summary: 'Every operator for themselves in high-tempo multi-angle arena combat.',
  },
];

export function LobbyView({
  profile,
  onUpdateProfile,
  onDeploy,
  roomError,
  onClearError,
}: LobbyViewProps) {
  const isOnline = useOnlineStatus();
  const [tab, setTab] = useState<LobbyTab>('play');
  const [mode, setMode] = useState<GameMode>('tdm');
  const [mapId, setMapId] = useState<MapId>('zero_dam');
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('offline');

  const [gunsmithWeapon, setGunsmithWeapon] = useState<WeaponId>(profile.primaryWeapon);
  const [hoveredAttachment, setHoveredAttachment] = useState<{ slot: AttachmentSlot; id: string } | null>(null);
  const [rooms, setRooms] = useState<PublicRoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [customRoomName, setCustomRoomName] = useState('Alpha Strike Room');
  const [connectedGamepad, setConnectedGamepad] = useState<string | null>(() => {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
    const pad = Array.from(navigator.getGamepads()).find((p) => p && p.connected);
    return pad ? pad.id : null;
  });

  useEffect(() => {
    const syncPad = () => {
      if (typeof navigator.getGamepads !== 'function') return;
      const pad = Array.from(navigator.getGamepads()).find((p) => p && p.connected);
      setConnectedGamepad(pad ? pad.id : null);
    };
    window.addEventListener('gamepadconnected', syncPad);
    window.addEventListener('gamepaddisconnected', syncPad);
    return () => {
      window.removeEventListener('gamepadconnected', syncPad);
      window.removeEventListener('gamepaddisconnected', syncPad);
    };
  }, []);

  useEffect(() => {
    if (!isOnline && connectionMode === 'online') {
      setConnectionMode('offline');
    }
  }, [isOnline, connectionMode]);

  const fetchRooms = useCallback(async () => {
    if (!isOnline) return;
    setLoadingRooms(true);
    try {
      const res = await fetch('/api/rooms');
      if (res.ok) {
        const data = (await res.json()) as { rooms?: PublicRoomSummary[] };
        setRooms(data.rooms ?? []);
      }
    } catch {
      // network unavailable
    } finally {
      setLoadingRooms(false);
    }
  }, [isOnline]);

  useEffect(() => {
    if (tab === 'servers') {
      void fetchRooms();
    }
  }, [tab, fetchRooms]);

  const rank = getOperatorRank(profile.xp);
  const currentLoadout = profile.loadouts[gunsmithWeapon];
  const activeStats = computeWeaponStats(gunsmithWeapon, currentLoadout);
  const previewLoadout: WeaponLoadout = hoveredAttachment
    ? { ...currentLoadout, [hoveredAttachment.slot]: hoveredAttachment.id }
    : currentLoadout;
  const previewStats = computeWeaponStats(gunsmithWeapon, previewLoadout);
  const gunsmithProgress = profile.weaponProgress[gunsmithWeapon] ?? { kills: 0, headshots: 0 };
  const gunsmithMastery = getWeaponMasteryInfo(gunsmithProgress.kills);

  const handleDeployClick = () => {
    onClearError();
    onDeploy({
      mode,
      mapId,
      connectionMode: isOnline ? connectionMode : 'offline',
      roomAction: 'quickmatch',
    });
  };

  return (
    <div className="min-h-screen bg-[#0B0E11] text-slate-100 flex flex-col">
      {/* 3-Zone Header */}
      <header className="border-b border-[#222A35] bg-[#10151B] px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 bg-amber-500/15 border border-amber-500/50 flex items-center justify-center text-amber-400">
            <Crosshair className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold uppercase tracking-wider leading-none">Iron Sector</h1>
            <p className="text-[11px] text-slate-400 mt-0.5 whitespace-nowrap">
              {profile.callsign} · Lvl {rank.level} {rank.title}
            </p>
          </div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {(
            [
              { id: 'play', label: 'Play', icon: Play },
              { id: 'gunsmith', label: 'Gunsmith', icon: Wrench },
              { id: 'servers', label: 'Servers', icon: Server },
              { id: 'settings', label: 'Settings', icon: Settings },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`px-3.5 py-2 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-amber-500/15 border-amber-500/60 text-amber-300'
                    : 'bg-transparent border-transparent text-slate-400 hover:text-slate-100 hover:bg-[#171E27]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <PWAInstallButton />
          <button
            type="button"
            onClick={handleDeployClick}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Deploy
          </button>
        </div>
      </header>

      {roomError && (
        <div className="bg-rose-950/70 border-b border-rose-500/50 px-6 py-2.5 flex items-center justify-between text-xs text-rose-200">
          <span>{roomError}</span>
          <button type="button" onClick={onClearError} className="underline text-rose-300">
            Dismiss
          </button>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {tab === 'play' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left / Center Deployment Config */}
            <div className="lg:col-span-8 space-y-6">
              {/* Hero Banner */}
              <div className="relative h-56 sm:h-64 border border-[#2C3542] overflow-hidden bg-[#141920]">
                <img
                  src="/src/assets/images/lobby_hero_ops_1795053268404.jpg"
                  alt="Iron Sector Tactical Operators"
                  className="w-full h-full object-cover opacity-75"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B0E11] via-[#0B0E11]/45 to-transparent" />
                <div className="absolute bottom-4 left-5 right-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-amber-400">
                      Cross-Platform Tactical Combat · Desktop & Mobile PWA
                    </div>
                    <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-wide text-white mt-0.5">
                      {MODE_CARDS.find((m) => m.id === mode)?.title}
                    </h2>
                    <p className="text-xs text-slate-300 mt-1 max-w-xl">
                      {MAPS[mapId].name} · {MAPS[mapId].location}
                    </p>
                  </div>

                  {/* Online / Offline Switch */}
                  <div className="flex border border-[#2C3542] bg-[#0E1318] shrink-0">
                    <button
                      type="button"
                      onClick={() => setConnectionMode('offline')}
                      className={`px-3.5 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap ${
                        connectionMode === 'offline' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:bg-[#1B222C]'
                      }`}
                    >
                      <WifiOff className="w-3.5 h-3.5" />
                      Offline Bots
                    </button>
                    <button
                      type="button"
                      disabled={!isOnline}
                      onClick={() => setConnectionMode('online')}
                      className={`px-3.5 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40 ${
                        connectionMode === 'online' ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:bg-[#1B222C]'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      Online Squad
                    </button>
                  </div>
                </div>
              </div>

              {/* 4 Game Modes */}
              <div>
                <h3 className="font-display text-sm font-bold uppercase tracking-wider text-slate-300 mb-3">
                  Select Combat Mode
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {MODE_CARDS.map((mc) => {
                    const selected = mode === mc.id;
                    return (
                      <button
                        key={mc.id}
                        type="button"
                        onClick={() => setMode(mc.id)}
                        className={`text-left p-4 border transition-colors ${
                          selected
                            ? 'bg-[#19212C] border-amber-500 text-slate-100'
                            : 'bg-[#141920] border-[#252D38] hover:border-slate-500 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-display font-bold uppercase tracking-wide text-sm">{mc.title}</span>
                          {selected && <span className="text-[10px] font-bold uppercase text-amber-400">Active</span>}
                        </div>
                        <div className="text-[11px] text-amber-400/90 mt-0.5">{mc.subtitle}</div>
                        <p className="text-xs text-slate-400 mt-2 leading-relaxed">{mc.summary}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Map Selection */}
              <div>
                <h3 className="font-display text-sm font-bold uppercase tracking-wider text-slate-300 mb-3">
                  Select Theater of Operations
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(['zero_dam', 'dust_compound'] as MapId[]).map((mId) => {
                    const map = MAPS[mId];
                    const selected = mapId === mId;
                    return (
                      <button
                        key={mId}
                        type="button"
                        onClick={() => setMapId(mId)}
                        className={`text-left border overflow-hidden transition-colors bg-[#141920] ${
                          selected ? 'border-amber-500' : 'border-[#252D38] hover:border-slate-500'
                        }`}
                      >
                        <div className="h-32 relative">
                          <img src={map.previewImage} alt={map.name} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#141920] via-transparent to-transparent" />
                          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
                            <span className="font-display font-bold uppercase text-sm text-white">{map.name}</span>
                            {selected && <span className="text-[10px] font-bold uppercase text-amber-400">Selected</span>}
                          </div>
                        </div>
                        <div className="p-3">
                          <div className="text-[11px] text-slate-400">{map.location}</div>
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{map.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Sidebar: Operator Summary & Deploy */}
            <div className="lg:col-span-4 space-y-4">
              <div className="p-5 bg-[#141920] border border-[#252D38]">
                <div className="flex items-center justify-between pb-3 border-b border-[#222A35]">
                  <span className="font-display text-sm font-bold uppercase tracking-wider text-slate-200">
                    Operator Dossier
                  </span>
                  <span className="text-xs font-mono-tabular text-emerald-400">
                    ${profile.stashCredits.toLocaleString()}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <div className="p-2.5 bg-[#0E1318] border border-[#202731]">
                    <div className="text-[10px] uppercase text-slate-400">Matches</div>
                    <div className="font-mono-tabular text-base font-bold mt-0.5">{profile.totalMatches}</div>
                  </div>
                  <div className="p-2.5 bg-[#0E1318] border border-[#202731]">
                    <div className="text-[10px] uppercase text-slate-400">Kills</div>
                    <div className="font-mono-tabular text-base font-bold mt-0.5">{profile.totalKills}</div>
                  </div>
                  <div className="p-2.5 bg-[#0E1318] border border-[#202731]">
                    <div className="text-[10px] uppercase text-slate-400">Exfils</div>
                    <div className="font-mono-tabular text-base font-bold text-amber-400 mt-0.5">
                      {profile.totalExtractions}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 bg-[#141920] border border-[#252D38] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-bold uppercase tracking-wider text-slate-200">
                    Active Loadout
                  </span>
                  <button
                    type="button"
                    onClick={() => setTab('gunsmith')}
                    className="text-xs text-amber-400 hover:text-amber-300 font-semibold"
                  >
                    Customize
                  </button>
                </div>
                <div className="p-3 bg-[#0E1318] border border-[#202731]">
                  <div className="text-[10px] uppercase text-slate-400">Primary Weapon</div>
                  <div className="font-semibold text-sm text-slate-100 mt-0.5">{WEAPONS[profile.primaryWeapon].name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {WEAPONS[profile.primaryWeapon].caliber} · {profile.loadouts[profile.primaryWeapon].optic.toUpperCase()}
                  </div>
                </div>
                <div className="p-3 bg-[#0E1318] border border-[#202731]">
                  <div className="text-[10px] uppercase text-slate-400">Secondary Sidearm</div>
                  <div className="font-semibold text-sm text-slate-100 mt-0.5">{WEAPONS[profile.secondaryWeapon].name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{WEAPONS[profile.secondaryWeapon].caliber}</div>
                </div>

                <button
                  type="button"
                  onClick={handleDeployClick}
                  className="w-full py-3.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-colors mt-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Launch {connectionMode === 'online' ? 'Online Match' : 'Offline Bot Match'}
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'gunsmith' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 space-y-3">
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-slate-300">
                Armory Arsenal & Mastery
              </h2>
              {(['m4a1', 'vector9', 'msr7', 'p220'] as WeaponId[]).map((wId) => {
                const w = WEAPONS[wId];
                const equipped = profile.primaryWeapon === wId || profile.secondaryWeapon === wId;
                const selected = gunsmithWeapon === wId;
                const wp = profile.weaponProgress[wId] ?? { kills: 0, headshots: 0 };
                const wm = getWeaponMasteryInfo(wp.kills);
                return (
                  <div
                    key={wId}
                    className={`p-4 border transition-colors cursor-pointer ${
                      selected ? 'bg-[#19212C] border-amber-500' : 'bg-[#141920] border-[#252D38] hover:border-slate-500'
                    }`}
                    onClick={() => setGunsmithWeapon(wId)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-bold uppercase text-sm text-slate-100">{w.name}</span>
                      <span className="text-[11px] font-mono-tabular font-bold text-amber-400">
                        Lv {wm.level} · {wm.tierName}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{w.description}</p>
                    <div className="mt-3 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-mono-tabular text-slate-400">
                        <span>{wp.kills} Kills · {wp.headshots} HS</span>
                        <span>
                          {wm.isMax ? 'MAX MASTERY' : `${wm.killsToNext} kills to Lv ${wm.level + 1}`}
                        </span>
                      </div>
                      <div className="h-1.5 bg-[#0B0E11]">
                        <div className="h-full bg-amber-500 transition-all" style={{ width: `${Math.round(wm.progressPct)}%` }} />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[11px] font-mono-tabular text-slate-400">{w.caliber}</span>
                      {w.slot === 'primary' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateProfile({ ...profile, primaryWeapon: wId });
                          }}
                          className={`px-2.5 py-1 text-[11px] font-bold uppercase ${
                            equipped
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                              : 'bg-[#1F2833] text-slate-200 hover:bg-amber-500 hover:text-slate-950'
                          }`}
                        >
                          {equipped ? 'Equipped Primary' : 'Equip Primary'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="lg:col-span-8 space-y-5">
              {/* Interactive 3D Armory Inspection Workbench */}
              <GunsmithPreviewCanvas stats={previewStats} />

              {/* Mastery, Ballistic Telemetry & Recoil Pattern Card */}
              <div className="p-5 bg-[#141920] border border-[#252D38] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#222A35]">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-xl font-bold uppercase tracking-wider text-slate-100">
                        {WEAPONS[gunsmithWeapon].name} · Gunsmith Bench
                      </h2>
                      <span className="text-xs font-mono-tabular font-bold text-amber-400">
                        Mastery Lv {gunsmithMastery.level}/10
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {WEAPONS[gunsmithWeapon].caliber} · {gunsmithMastery.tierName} · {gunsmithProgress.kills} Kills · {gunsmithProgress.headshots} HS
                    </p>
                  </div>
                  <div className="text-xs font-mono-tabular text-amber-400">
                    {previewStats.damage} DMG · {previewStats.rpm} RPM · {previewStats.magSize} MAG
                    {hoveredAttachment && (
                      <span className="ml-2 text-sky-400 uppercase">[Preview]</span>
                    )}
                  </div>
                </div>

                {/* Real-World Ballistic & Ergonomic Telemetry */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  {[
                    {
                      label: 'Velocity',
                      val: previewStats.muzzleVelocityMs,
                      base: activeStats.muzzleVelocityMs,
                      unit: 'm/s',
                      higherIsBetter: true,
                    },
                    {
                      label: 'Eff. Range',
                      val: previewStats.range,
                      base: activeStats.range,
                      unit: 'm',
                      higherIsBetter: true,
                    },
                    {
                      label: 'ADS Snap',
                      val: previewStats.adsTimeMs,
                      base: activeStats.adsTimeMs,
                      unit: 'ms',
                      higherIsBetter: false,
                    },
                    {
                      label: 'Sprint-Fire',
                      val: previewStats.sprintToFireMs,
                      base: activeStats.sprintToFireMs,
                      unit: 'ms',
                      higherIsBetter: false,
                    },
                    {
                      label: 'Armor Pen',
                      val: previewStats.armorPenetration,
                      base: activeStats.armorPenetration,
                      unit: '%',
                      higherIsBetter: true,
                    },
                    {
                      label: 'Mass',
                      val: previewStats.weightKg,
                      base: activeStats.weightKg,
                      unit: 'kg',
                      higherIsBetter: false,
                      decimals: 2,
                    },
                  ].map((t) => {
                    const diff = Number((t.val - t.base).toFixed(t.decimals ?? 0));
                    const improved = diff !== 0 && (t.higherIsBetter ? diff > 0 : diff < 0);
                    return (
                      <div key={t.label} className="p-2.5 bg-[#0E1318] border border-[#202731]">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">{t.label}</div>
                        <div className="font-mono-tabular text-sm font-bold text-slate-100 mt-0.5">
                          {t.decimals ? t.val.toFixed(t.decimals) : t.val}
                          <span className="text-[10px] text-slate-400 ml-0.5">{t.unit}</span>
                        </div>
                        {diff !== 0 && (
                          <div
                            className={`text-[10px] font-mono-tabular font-bold ${
                              improved ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {diff > 0 ? `+${diff}` : diff}
                            {t.unit}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Stat Bars + Live 10-Round Recoil Dispersion Target */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  <div className="md:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {[
                      {
                        label: 'Damage',
                        val: Math.min(100, previewStats.damage * 1.45),
                        base: Math.min(100, activeStats.damage * 1.45),
                      },
                      {
                        label: 'Fire Rate',
                        val: Math.min(100, previewStats.rpm / 10),
                        base: Math.min(100, activeStats.rpm / 10),
                      },
                      {
                        label: 'Precision',
                        val: Math.max(15, 100 - previewStats.adsSpread * 12000),
                        base: Math.max(15, 100 - activeStats.adsSpread * 12000),
                      },
                      {
                        label: 'Recoil Ctrl',
                        val: Math.max(15, 100 - previewStats.recoilVertical * 1800),
                        base: Math.max(15, 100 - activeStats.recoilVertical * 1800),
                      },
                      {
                        label: 'Reload Speed',
                        val: Math.max(20, 100 - previewStats.reloadTime * 28),
                        base: Math.max(20, 100 - activeStats.reloadTime * 28),
                      },
                      {
                        label: 'Mobility',
                        val: Math.min(100, previewStats.moveSpeedMult * 85),
                        base: Math.min(100, activeStats.moveSpeedMult * 85),
                      },
                    ].map((st) => {
                      const delta = Math.round(st.val - st.base);
                      return (
                        <div key={st.label}>
                          <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                            <span>{st.label}</span>
                            <span className="font-mono-tabular text-amber-400">
                              {Math.round(st.val)}
                              {delta !== 0 && (
                                <span className={`ml-1 ${delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  ({delta > 0 ? `+${delta}` : delta})
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="h-1.5 bg-[#0B0E11] relative overflow-hidden">
                            <div
                              className="h-full bg-amber-500 transition-all duration-150"
                              style={{ width: `${Math.round(st.val)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Simulated 10-Round Recoil Dispersion Plot */}
                  <div className="md:col-span-4 p-3 bg-[#0E1318] border border-[#202731] flex items-center gap-3">
                    <svg viewBox="0 0 80 80" className="w-20 h-20 shrink-0 bg-[#080B0E] border border-[#1E2530]">
                      <circle cx="40" cy="60" r="14" fill="none" stroke="#1e293b" strokeWidth="1" />
                      <circle cx="40" cy="60" r="28" fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 2" />
                      <line x1="40" y1="6" x2="40" y2="74" stroke="#1e293b" strokeWidth="1" />
                      <line x1="8" y1="60" x2="72" y2="60" stroke="#1e293b" strokeWidth="1" />
                      {Array.from({ length: 10 }).map((_, idx) => {
                        const climb = idx * previewStats.recoilVertical * 245;
                        const drift =
                          Math.sin(idx * 2.15) * previewStats.recoilHorizontal * 620 +
                          Math.cos(idx * 1.4) * previewStats.adsSpread * 700;
                        const px = Math.max(8, Math.min(72, 40 + drift));
                        const py = Math.max(7, Math.min(72, 60 - climb));
                        return (
                          <circle
                            key={idx}
                            cx={px}
                            cy={py}
                            r={idx === 0 ? 2.4 : 1.9}
                            fill={idx === 0 ? '#38bdf8' : '#f59e0b'}
                            opacity={0.95 - idx * 0.04}
                          />
                        );
                      })}
                    </svg>
                    <div className="min-w-0">
                      <div className="text-[10px] font-display font-bold uppercase tracking-wider text-slate-200">
                        Ballistic Grouping
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 leading-snug">
                        10-shot ADS climb &amp; horizontal dispersion at 25m range.
                      </div>
                      <div className="text-[10px] font-mono-tabular text-amber-400 mt-1">
                        {previewStats.suppressed ? 'Suppressed Sub-Signature' : 'Full Muzzle Report'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mastery Unlock Milestone Track */}
                <div className="p-3 bg-[#0E1318] border border-[#202731]">
                  <div className="flex items-center justify-between text-[11px] mb-2">
                    <span className="font-display font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-amber-400" />
                      Mastery Unlock Track
                    </span>
                    <span className="font-mono-tabular text-amber-400">
                      {gunsmithMastery.isMax
                        ? 'All Mastery Attachments & Apex Obsidian Unlocked'
                        : `${gunsmithMastery.kills} / ${gunsmithMastery.nextLevelKills} Kills for Lv ${gunsmithMastery.level + 1}`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    {MASTERY_MILESTONES.map((m) => {
                      const unlocked = gunsmithMastery.level >= m.level;
                      return (
                        <div
                          key={m.level}
                          className={`p-2 border text-[10px] leading-tight ${
                            unlocked
                              ? 'bg-amber-500/12 border-amber-500/50 text-amber-200'
                              : 'bg-[#0B0E11] border-[#1D242E] text-slate-500'
                          }`}
                        >
                          <div className="font-mono-tabular font-bold">
                            LV {m.level} {unlocked ? '· UNLOCKED' : ''}
                          </div>
                          <div className="mt-0.5 truncate" title={m.label}>
                            {m.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Attachment & Mastery Camo Slots */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(
                  [
                    { slot: 'optic', title: 'Optic Sight', options: OPTIC_OPTIONS },
                    { slot: 'muzzle', title: 'Muzzle Device', options: MUZZLE_OPTIONS },
                    { slot: 'magazine', title: 'Magazine Feed', options: MAGAZINE_OPTIONS },
                    { slot: 'underbarrel', title: 'Underbarrel Rail', options: UNDERBARREL_OPTIONS },
                    { slot: 'camo', title: 'Mastery Weapon Finish', options: CAMO_OPTIONS },
                  ] as const
                ).map((group) => (
                  <div
                    key={group.slot}
                    className={`p-4 bg-[#141920] border border-[#252D38] space-y-2.5 ${
                      group.slot === 'camo' ? 'sm:col-span-2' : ''
                    }`}
                  >
                    <div className="text-xs font-display font-bold uppercase tracking-wider text-slate-300">
                      {group.title}
                    </div>
                    <div className={group.slot === 'camo' ? 'grid grid-cols-1 sm:grid-cols-2 gap-2.5' : 'space-y-2.5'}>
                      {group.options.map((opt) => {
                        const active = profile.loadouts[gunsmithWeapon][group.slot] === opt.id;
                        const unlocked = gunsmithMastery.level >= opt.unlockLevel;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={!unlocked}
                            onMouseEnter={() => setHoveredAttachment({ slot: group.slot, id: opt.id })}
                            onMouseLeave={() => setHoveredAttachment(null)}
                            onClick={() => {
                              if (!unlocked) return;
                              onUpdateProfile({
                                ...profile,
                                loadouts: {
                                  ...profile.loadouts,
                                  [gunsmithWeapon]: {
                                    ...profile.loadouts[gunsmithWeapon],
                                    [group.slot]: opt.id,
                                  },
                                },
                              });
                            }}
                            className={`w-full text-left p-2.5 border transition-colors ${
                              !unlocked
                                ? 'bg-[#0A0D11] border-[#1A2029] text-slate-500 cursor-not-allowed opacity-75'
                                : active
                                ? 'bg-amber-500/15 border-amber-500 text-amber-200'
                                : 'bg-[#0E1318] border-[#202731] hover:border-slate-500 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold flex items-center gap-1.5">
                                {!unlocked && <Lock className="w-3 h-3 text-slate-500 shrink-0" />}
                                {opt.name}
                              </span>
                              {opt.isMastery && (
                                <span
                                  className={`text-[10px] font-mono-tabular font-bold uppercase ${
                                    unlocked ? 'text-amber-400' : 'text-slate-500'
                                  }`}
                                >
                                  {unlocked ? `Mastery Lv ${opt.unlockLevel}` : `Requires Lv ${opt.unlockLevel}`}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">{opt.summary}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'servers' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 bg-[#141920] border border-[#252D38]">
              <div className="px-5 py-4 border-b border-[#222A35] flex items-center justify-between">
                <div>
                  <h2 className="font-display text-base font-bold uppercase tracking-wider">
                    Live WebSocket Tactical Rooms
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Active rooms automatically backfill open slots with tactical AI operators.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchRooms()}
                  className="px-3 py-1.5 bg-[#1B222C] hover:bg-[#252E3C] border border-[#2C3542] text-xs font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingRooms ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {!isOnline ? (
                <div className="p-8 text-center text-sm text-amber-300">
                  Network offline — use Offline AI Bots on the Play tab to deploy locally.
                </div>
              ) : rooms.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  No open public rooms yet. Create a room on the right or launch Online Squad Quickmatch.
                </div>
              ) : (
                <div className="divide-y divide-[#1E2631]">
                  {rooms.map((r) => (
                    <div key={r.code} className="px-5 py-3.5 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-sm text-slate-100">
                          {r.name} <span className="font-mono-tabular text-xs text-amber-400 ml-2">[{r.code}]</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {r.mode.toUpperCase()} · {MAPS[r.mapId].name} · {r.humanCount}/{r.maxHumans} Players · {r.botCount} AI Bots
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onDeploy({
                            mode: r.mode,
                            mapId: r.mapId,
                            connectionMode: 'online',
                            roomAction: 'join',
                            roomCode: r.code,
                          })
                        }
                        className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs uppercase tracking-wider whitespace-nowrap"
                      >
                        Join Room
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-4 space-y-4">
              <div className="p-5 bg-[#141920] border border-[#252D38] space-y-3">
                <h3 className="font-display text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  Join by Room Code
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={8}
                    placeholder="e.g. A7K9P2"
                    className="flex-1 px-3 py-2 bg-[#0B0E11] border border-[#2C3542] text-sm font-mono-tabular uppercase text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    disabled={!isOnline || joinCode.trim().length < 4}
                    onClick={() =>
                      onDeploy({
                        mode,
                        mapId,
                        connectionMode: 'online',
                        roomAction: 'join',
                        roomCode: joinCode.trim().toUpperCase(),
                      })
                    }
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs uppercase tracking-wider"
                  >
                    Join
                  </button>
                </div>
              </div>

              <div className="p-5 bg-[#141920] border border-[#252D38] space-y-3">
                <h3 className="font-display text-sm font-bold uppercase tracking-wider">Create Custom Room</h3>
                <input
                  type="text"
                  value={customRoomName}
                  onChange={(e) => setCustomRoomName(e.target.value)}
                  maxLength={32}
                  placeholder="Room Title"
                  className="w-full px-3 py-2 bg-[#0B0E11] border border-[#2C3542] text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
                <div className="text-xs text-slate-400">
                  Uses selected mode ({mode.toUpperCase()}) and map ({MAPS[mapId].name}).
                </div>
                <button
                  type="button"
                  disabled={!isOnline}
                  onClick={() =>
                    onDeploy({
                      mode,
                      mapId,
                      connectionMode: 'online',
                      roomAction: 'create',
                      roomName: customRoomName,
                    })
                  }
                  className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-bold text-xs uppercase tracking-wider"
                >
                  Create & Deploy
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="max-w-2xl bg-[#141920] border border-[#252D38] p-6 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-[#222A35]">
              <Sliders className="w-4 h-4 text-amber-400" />
              <h2 className="font-display text-lg font-bold uppercase tracking-wider">
                Operator & Cross-Platform Controls
              </h2>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1.5">Operator Callsign</label>
              <input
                type="text"
                maxLength={18}
                value={profile.callsign}
                onChange={(e) => onUpdateProfile({ ...profile, callsign: e.target.value })}
                className="w-full px-3 py-2 bg-[#0B0E11] border border-[#2C3542] text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Mouse Sensitivity</span>
                  <span className="font-mono-tabular text-amber-400">{profile.settings.mouseSensitivity.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={2.5}
                  step={0.05}
                  value={profile.settings.mouseSensitivity}
                  onChange={(e) =>
                    onUpdateProfile({
                      ...profile,
                      settings: { ...profile.settings, mouseSensitivity: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Touch Look Sensitivity</span>
                  <span className="font-mono-tabular text-amber-400">{profile.settings.touchSensitivity.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.4}
                  max={2.8}
                  step={0.05}
                  value={profile.settings.touchSensitivity}
                  onChange={(e) =>
                    onUpdateProfile({
                      ...profile,
                      settings: { ...profile.settings, touchSensitivity: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Field of View (FOV)</span>
                  <span className="font-mono-tabular text-amber-400">{profile.settings.fov}°</span>
                </div>
                <input
                  type="range"
                  min={60}
                  max={100}
                  step={1}
                  value={profile.settings.fov}
                  onChange={(e) =>
                    onUpdateProfile({
                      ...profile,
                      settings: { ...profile.settings, fov: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Master Audio Volume</span>
                  <span className="font-mono-tabular text-amber-400">{Math.round(profile.settings.masterVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={profile.settings.masterVolume}
                  onChange={(e) =>
                    onUpdateProfile({
                      ...profile,
                      settings: { ...profile.settings, masterVolume: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1.5">Input Layout</label>
                <select
                  value={profile.settings.inputMode}
                  onChange={(e) =>
                    onUpdateProfile({
                      ...profile,
                      settings: { ...profile.settings, inputMode: e.target.value as 'auto' | 'desktop' | 'touch' },
                    })
                  }
                  className="w-full px-3 py-2 bg-[#0B0E11] border border-[#2C3542] text-sm text-slate-100"
                >
                  <option value="auto">Auto-Detect (Linux/Windows/Android)</option>
                  <option value="desktop">Desktop Mouse + Keyboard</option>
                  <option value="touch">Mobile Touch Controls</option>
                </select>
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2.5 cursor-pointer py-2">
                  <input
                    type="checkbox"
                    checked={profile.settings.invertY}
                    onChange={(e) =>
                      onUpdateProfile({
                        ...profile,
                        settings: { ...profile.settings, invertY: e.target.checked },
                      })
                    }
                    className="w-4 h-4 accent-amber-500"
                  />
                  <span className="text-sm text-slate-200">Invert Vertical Look (Y-Axis)</span>
                </label>
              </div>
            </div>

            {/* Controller / Gamepad Support Section */}
            <div className="pt-4 border-t border-[#222A35] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Gamepad2 className="w-4 h-4 text-amber-400" />
                  <h3 className="font-display text-sm font-bold uppercase tracking-wider text-slate-200">
                    Controller / Gamepad Support
                  </h3>
                </div>
                <span
                  className={`text-[11px] font-mono-tabular px-2 py-0.5 border ${
                    connectedGamepad
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                      : 'bg-[#0B0E11] border-[#252D38] text-slate-400'
                  }`}
                >
                  {connectedGamepad ? `Connected: ${connectedGamepad.slice(0, 34)}` : 'Press any gamepad button to connect'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-xs text-slate-300 mb-1">
                    <span>Controller Look Sensitivity</span>
                    <span className="font-mono-tabular text-amber-400">
                      {profile.settings.controllerSensitivity.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.4}
                    max={3.0}
                    step={0.05}
                    value={profile.settings.controllerSensitivity}
                    onChange={(e) =>
                      onUpdateProfile({
                        ...profile,
                        settings: { ...profile.settings, controllerSensitivity: Number(e.target.value) },
                      })
                    }
                    className="w-full accent-amber-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-300 mb-1">
                    <span>Stick Deadzone</span>
                    <span className="font-mono-tabular text-amber-400">
                      {Math.round(profile.settings.controllerDeadzone * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={0.35}
                    step={0.01}
                    value={profile.settings.controllerDeadzone}
                    onChange={(e) =>
                      onUpdateProfile({
                        ...profile,
                        settings: { ...profile.settings, controllerDeadzone: Number(e.target.value) },
                      })
                    }
                    className="w-full accent-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-center gap-2.5 cursor-pointer py-1">
                  <input
                    type="checkbox"
                    checked={profile.settings.controllerAimAssist}
                    onChange={(e) =>
                      onUpdateProfile({
                        ...profile,
                        settings: { ...profile.settings, controllerAimAssist: e.target.checked },
                      })
                    }
                    className="w-4 h-4 accent-amber-500"
                  />
                  <span className="text-sm text-slate-200">Controller Aim Assist</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer py-1">
                  <input
                    type="checkbox"
                    checked={profile.settings.controllerVibration}
                    onChange={(e) =>
                      onUpdateProfile({
                        ...profile,
                        settings: { ...profile.settings, controllerVibration: e.target.checked },
                      })
                    }
                    className="w-4 h-4 accent-amber-500"
                  />
                  <span className="text-sm text-slate-200">Haptic Vibration & Controller Rumble</span>
                </label>
              </div>

              <div className="p-3 bg-[#0E1318] border border-[#202731] grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-slate-300">
                <div><span className="text-amber-400 font-mono-tabular font-bold">LS / L3</span> · Move / Sprint</div>
                <div><span className="text-amber-400 font-mono-tabular font-bold">RS</span> · Aim Look</div>
                <div><span className="text-amber-400 font-mono-tabular font-bold">LT / RT</span> · ADS / Fire</div>
                <div><span className="text-amber-400 font-mono-tabular font-bold">A / B</span> · Jump / Slide-Crouch</div>
                <div><span className="text-amber-400 font-mono-tabular font-bold">X / Y</span> · Reload-Exfil / Swap</div>
                <div><span className="text-amber-400 font-mono-tabular font-bold">LB / RB / D-Up</span> · Frag / Plate / UAV</div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
