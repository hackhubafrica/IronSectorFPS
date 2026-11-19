import type { PlayerProfile, WeaponId, WeaponProgress } from '../game/types.ts';
import { DEFAULT_LOADOUTS } from '../game/weapons.ts';

const STORAGE_KEY = 'iron_sector_profile_v1';

export const DEFAULT_WEAPON_PROGRESS: Record<WeaponId, WeaponProgress> = {
  m4a1: { kills: 0, headshots: 0 },
  vector9: { kills: 0, headshots: 0 },
  msr7: { kills: 0, headshots: 0 },
  p220: { kills: 0, headshots: 0 },
};

export const DEFAULT_PROFILE: PlayerProfile = {
  callsign: 'Spectre-01',
  xp: 1200,
  stashCredits: 24500,
  totalKills: 0,
  totalMatches: 0,
  totalExtractions: 0,
  primaryWeapon: 'm4a1',
  secondaryWeapon: 'p220',
  loadouts: { ...DEFAULT_LOADOUTS },
  weaponProgress: structuredClone(DEFAULT_WEAPON_PROGRESS),
  settings: {
    mouseSensitivity: 1.0,
    touchSensitivity: 1.15,
    controllerSensitivity: 1.3,
    controllerDeadzone: 0.15,
    controllerAimAssist: true,
    controllerVibration: true,
    fov: 75,
    invertY: false,
    inputMode: 'auto',
    masterVolume: 0.75,
  },
};

export function loadProfile(): PlayerProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_PROFILE);
    const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      loadouts: {
        m4a1: { ...DEFAULT_LOADOUTS.m4a1, ...(parsed.loadouts?.m4a1 ?? {}) },
        vector9: { ...DEFAULT_LOADOUTS.vector9, ...(parsed.loadouts?.vector9 ?? {}) },
        msr7: { ...DEFAULT_LOADOUTS.msr7, ...(parsed.loadouts?.msr7 ?? {}) },
        p220: { ...DEFAULT_LOADOUTS.p220, ...(parsed.loadouts?.p220 ?? {}) },
      },
      weaponProgress: {
        m4a1: { ...DEFAULT_WEAPON_PROGRESS.m4a1, ...(parsed.weaponProgress?.m4a1 ?? {}) },
        vector9: { ...DEFAULT_WEAPON_PROGRESS.vector9, ...(parsed.weaponProgress?.vector9 ?? {}) },
        msr7: { ...DEFAULT_WEAPON_PROGRESS.msr7, ...(parsed.weaponProgress?.msr7 ?? {}) },
        p220: { ...DEFAULT_WEAPON_PROGRESS.p220, ...(parsed.weaponProgress?.p220 ?? {}) },
      },
      settings: {
        ...DEFAULT_PROFILE.settings,
        ...(parsed.settings ?? {}),
      },
    };
  } catch {
    return structuredClone(DEFAULT_PROFILE);
  }
}

export function saveProfile(profile: PlayerProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // storage quota ignored
  }
}

export function getOperatorRank(xp: number): { level: number; title: string } {
  const level = Math.max(1, Math.floor(xp / 1000) + 1);
  const title =
    level >= 25
      ? 'Commander'
      : level >= 15
      ? 'Vanguard Captain'
      : level >= 8
      ? 'Taskforce Sergeant'
      : level >= 4
      ? 'Field Corporal'
      : 'Recon Specialist';
  return { level, title };
}
