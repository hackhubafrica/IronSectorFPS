import { useEffect, useMemo, useRef, useState } from 'react';
import { GameHud } from './components/GameHud.tsx';
import { LobbyView } from './components/LobbyView.tsx';
import type { DeployRequest } from './components/LobbyView.tsx';
import { PauseModal, PostMatchModal, ScoreboardModal } from './components/MatchOverlays.tsx';
import { OfflineIndicator } from './components/PWAControls.tsx';
import { TouchControls } from './components/TouchControls.tsx';
import { FpsEngine } from './engine/FpsEngine.ts';
import type { HudState, PlayerProfile, WeaponId } from './game/types.ts';
import { getWeaponMasteryInfo, sanitizeLoadoutForLevel } from './game/weapons.ts';
import { loadProfile, saveProfile } from './utils/storage.ts';

function detectTouchCapability(): boolean {
  if (typeof window === 'undefined') return false;
  return navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches;
}

export default function App() {
  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile());
  const [activeDeploy, setActiveDeploy] = useState<DeployRequest | null>(null);
  const [matchNonce, setMatchNonce] = useState(0);
  const [hud, setHud] = useState<HudState | null>(null);
  const [paused, setPaused] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<FpsEngine | null>(null);
  const rewardAppliedRef = useRef(false);

  const isTouchDevice = useMemo(() => {
    if (profile.settings.inputMode === 'touch') return true;
    if (profile.settings.inputMode === 'desktop') return false;
    return detectTouchCapability();
  }, [profile.settings.inputMode]);

  const handleUpdateProfile = (next: PlayerProfile) => {
    setProfile(next);
    saveProfile(next);
  };

  useEffect(() => {
    if (!activeDeploy || !canvasMountRef.current) return;

    rewardAppliedRef.current = false;
    setPaused(false);
    setShowScoreboard(false);
    setHud(null);

    const engine = new FpsEngine(
      canvasMountRef.current,
      {
        mode: activeDeploy.mode,
        mapId: activeDeploy.mapId,
        connectionMode: activeDeploy.connectionMode,
        roomAction: activeDeploy.roomAction,
        roomCode: activeDeploy.roomCode,
        roomName: activeDeploy.roomName,
        playerName: profile.callsign.trim() || 'Operator',
        primaryWeapon: profile.primaryWeapon,
        secondaryWeapon: profile.secondaryWeapon,
        loadouts: {
          m4a1: sanitizeLoadoutForLevel(profile.loadouts.m4a1, getWeaponMasteryInfo(profile.weaponProgress.m4a1.kills).level),
          vector9: sanitizeLoadoutForLevel(profile.loadouts.vector9, getWeaponMasteryInfo(profile.weaponProgress.vector9.kills).level),
          msr7: sanitizeLoadoutForLevel(profile.loadouts.msr7, getWeaponMasteryInfo(profile.weaponProgress.msr7.kills).level),
          p220: sanitizeLoadoutForLevel(profile.loadouts.p220, getWeaponMasteryInfo(profile.weaponProgress.p220.kills).level),
        },
        weaponProgress: profile.weaponProgress,
        settings: profile.settings,
        isTouchDevice,
        onTogglePause: () => {
          setPaused((prev) => {
            const next = !prev;
            engineRef.current?.setPaused(next);
            return next;
          });
        },
        onToggleScoreboard: (show: boolean) => setShowScoreboard(show),
      },
      (nextHud) => setHud(nextHud),
      (errMsg) => {
        setRoomError(errMsg);
        setActiveDeploy(null);
      }
    );

    engineRef.current = engine;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        setShowScoreboard(true);
      } else if (e.code === 'Escape') {
        setPaused((prev) => {
          const next = !prev;
          engine.setPaused(next);
          return next;
        });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        setShowScoreboard(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      engine.dispose();
      engineRef.current = null;
    };
    // Intentionally re-instantiate engine only when deploy request or matchNonce changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDeploy, matchNonce]);

  useEffect(() => {
    if (!hud || hud.phase !== 'ended' || rewardAppliedRef.current) return;
    rewardAppliedRef.current = true;

    const playerWon =
      hud.mode === 'ffa' ? hud.winnerName === hud.player.name : hud.winnerTeam === hud.player.team;
    const xpGain = hud.player.kills * 120 + (playerWon ? 450 : 180) + (hud.player.extractedValue > 0 ? 500 : 0);

    setProfile((prev) => {
      const nextWeaponProgress = { ...prev.weaponProgress };
      const weaponIds: WeaponId[] = ['m4a1', 'vector9', 'msr7', 'p220'];
      for (const wId of weaponIds) {
        const addKills = hud.player.weaponKills[wId] ?? 0;
        const addHs = hud.player.weaponHeadshots[wId] ?? 0;
        if (addKills > 0 || addHs > 0) {
          nextWeaponProgress[wId] = {
            kills: prev.weaponProgress[wId].kills + addKills,
            headshots: prev.weaponProgress[wId].headshots + addHs,
          };
        }
      }

      const updated: PlayerProfile = {
        ...prev,
        xp: prev.xp + xpGain,
        stashCredits: prev.stashCredits + hud.player.extractedValue,
        totalKills: prev.totalKills + hud.player.kills,
        totalMatches: prev.totalMatches + 1,
        totalExtractions: prev.totalExtractions + (hud.player.extractedValue > 0 ? 1 : 0),
        weaponProgress: nextWeaponProgress,
      };
      saveProfile(updated);
      return updated;
    });
  }, [hud]);

  if (!activeDeploy) {
    return (
      <>
        <LobbyView
          profile={profile}
          onUpdateProfile={handleUpdateProfile}
          onDeploy={(req) => setActiveDeploy(req)}
          roomError={roomError}
          onClearError={() => setRoomError(null)}
        />
        <OfflineIndicator />
      </>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#0B0E11] overflow-hidden select-none">
      {/* Isolated WebGL mount container */}
      <div ref={canvasMountRef} className="w-full h-full" />

      {hud && engineRef.current && (
        <GameHud
          hud={hud}
          engine={engineRef.current}
          isTouchDevice={isTouchDevice}
          onPause={() => {
            setPaused(true);
            engineRef.current?.setPaused(true);
          }}
          onToggleScoreboard={setShowScoreboard}
        />
      )}

      {hud &&
        engineRef.current &&
        isTouchDevice &&
        !(profile.settings.inputMode === 'auto' && hud.gamepadConnected) &&
        hud.phase === 'active' &&
        !paused && <TouchControls engine={engineRef.current} hud={hud} />}

      {hud && showScoreboard && hud.phase === 'active' && <ScoreboardModal hud={hud} />}

      {hud && paused && hud.phase === 'active' && (
        <PauseModal
          hud={hud}
          onResume={() => {
            setPaused(false);
            engineRef.current?.setPaused(false);
            engineRef.current?.requestPointerLock();
          }}
          onExit={() => setActiveDeploy(null)}
        />
      )}

      {hud && hud.phase === 'ended' && (
        <PostMatchModal
          hud={hud}
          weaponProgress={profile.weaponProgress}
          onReplay={() => setMatchNonce((n) => n + 1)}
          onExit={() => setActiveDeploy(null)}
        />
      )}

      <OfflineIndicator />
    </div>
  );
}
