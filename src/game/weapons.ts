import type {
  CamoId,
  ComputedWeaponStats,
  MagazineId,
  MuzzleId,
  OpticId,
  UnderbarrelId,
  WeaponBaseSpec,
  WeaponId,
  WeaponLoadout,
} from './types.ts';

export const WEAPONS: Record<WeaponId, WeaponBaseSpec> = {
  m4a1: {
    id: 'm4a1',
    name: 'M4A1 Tactical',
    category: 'Assault Rifle',
    slot: 'primary',
    caliber: '5.56x45mm NATO',
    fireMode: 'AUTO',
    damage: 27,
    headshotMult: 1.65,
    rpm: 680,
    magSize: 30,
    reserveMags: 5,
    reloadTime: 1.85,
    adsFov: 52,
    adsSpeed: 10,
    baseSpread: 0.016,
    moveSpread: 0.036,
    adsSpread: 0.0028,
    recoilVertical: 0.022,
    recoilHorizontal: 0.008,
    range: 140,
    moveSpeedMult: 0.96,
    muzzleVelocityMs: 880,
    weightKg: 3.12,
    armorPenetration: 58,
    description: 'Modular special-operations carbine with balanced mid-range lethality and controllable recoil.',
  },
  vector9: {
    id: 'vector9',
    name: 'Vector-9 CQB',
    category: 'SMG',
    slot: 'primary',
    caliber: '9x19mm Parabellum',
    fireMode: 'AUTO',
    damage: 21,
    headshotMult: 1.5,
    rpm: 940,
    magSize: 28,
    reserveMags: 6,
    reloadTime: 1.55,
    adsFov: 56,
    adsSpeed: 13.5,
    baseSpread: 0.022,
    moveSpread: 0.034,
    adsSpread: 0.0055,
    recoilVertical: 0.016,
    recoilHorizontal: 0.011,
    range: 85,
    moveSpeedMult: 1.06,
    muzzleVelocityMs: 410,
    weightKg: 2.68,
    armorPenetration: 42,
    description: 'High-cyclic close-quarters submachine gun built for aggressive breaching and rapid ADS snap.',
  },
  msr7: {
    id: 'msr7',
    name: 'MSR-7 Marksman',
    category: 'Marksman Rifle',
    slot: 'primary',
    caliber: '7.62x51mm Match',
    fireMode: 'SEMI',
    damage: 58,
    headshotMult: 2.1,
    rpm: 190,
    magSize: 12,
    reserveMags: 5,
    reloadTime: 2.25,
    adsFov: 36,
    adsSpeed: 8.5,
    baseSpread: 0.028,
    moveSpread: 0.055,
    adsSpread: 0.0008,
    recoilVertical: 0.048,
    recoilHorizontal: 0.01,
    range: 220,
    moveSpeedMult: 0.91,
    muzzleVelocityMs: 845,
    weightKg: 4.35,
    armorPenetration: 76,
    description: 'Precision semi-automatic designated marksman rifle capable of one-tap headshots at long range.',
  },
  p220: {
    id: 'p220',
    name: 'P220 Combat',
    category: 'Sidearm',
    slot: 'secondary',
    caliber: '.45 ACP',
    fireMode: 'SEMI',
    damage: 34,
    headshotMult: 1.75,
    rpm: 360,
    magSize: 12,
    reserveMags: 4,
    reloadTime: 1.3,
    adsFov: 58,
    adsSpeed: 14.5,
    baseSpread: 0.015,
    moveSpread: 0.026,
    adsSpread: 0.0035,
    recoilVertical: 0.026,
    recoilHorizontal: 0.007,
    range: 70,
    moveSpeedMult: 1.08,
    muzzleVelocityMs: 285,
    weightKg: 0.94,
    armorPenetration: 38,
    description: 'Reliable tactical backup sidearm with crisp trigger response and rapid draw handling.',
  },
};

export interface AttachmentOption<T extends string> {
  id: T;
  name: string;
  summary: string;
  unlockLevel: number;
  isMastery?: boolean;
}

export const MASTERY_KILL_THRESHOLDS = [0, 3, 7, 12, 18, 26, 36, 48, 62, 80] as const;

export const MASTERY_MILESTONES: { level: number; label: string }[] = [
  { level: 1, label: 'Standard Arsenal' },
  { level: 2, label: 'Field Proven Badge' },
  { level: 3, label: 'Urban Hex Finish' },
  { level: 4, label: 'IR Thermal Holo' },
  { level: 5, label: 'Titanium Muzzle Brake' },
  { level: 6, label: 'AP Tungsten Match Mag' },
  { level: 7, label: 'Angled Carbon Grip · Gold Trim' },
  { level: 8, label: 'Spec-Ops Integral Shroud' },
  { level: 9, label: 'Casket Drum Mag' },
  { level: 10, label: 'Apex Obsidian Finish' },
];

export interface WeaponMasteryInfo {
  level: number;
  tierName: string;
  kills: number;
  currentLevelFloor: number;
  nextLevelKills: number | null;
  killsToNext: number;
  progressPct: number;
  isMax: boolean;
}

export function getWeaponMasteryInfo(kills: number): WeaponMasteryInfo {
  const safeKills = Math.max(0, Math.floor(kills));
  let level = 1;
  for (let i = 0; i < MASTERY_KILL_THRESHOLDS.length; i++) {
    if (safeKills >= MASTERY_KILL_THRESHOLDS[i]) {
      level = i + 1;
    }
  }
  const isMax = level >= MASTERY_KILL_THRESHOLDS.length;
  const floor = MASTERY_KILL_THRESHOLDS[level - 1];
  const next = isMax ? null : MASTERY_KILL_THRESHOLDS[level];
  const progressPct =
    next === null ? 100 : Math.min(100, Math.max(0, ((safeKills - floor) / (next - floor)) * 100));

  const tierName =
    level >= 10
      ? 'Apex Obsidian'
      : level >= 8
      ? 'Spec-Ops Legend'
      : level >= 6
      ? 'Tactical Veteran'
      : level >= 4
      ? 'Master Marksman'
      : level >= 2
      ? 'Field Proven'
      : 'Standard Issue';

  return {
    level,
    tierName,
    kills: safeKills,
    currentLevelFloor: floor,
    nextLevelKills: next,
    killsToNext: next === null ? 0 : Math.max(0, next - safeKills),
    progressPct,
    isMax,
  };
}

export const OPTIC_OPTIONS: AttachmentOption<OpticId>[] = [
  { id: 'iron', name: 'Iron Sights', summary: 'Fastest ADS speed · Standard sight picture', unlockLevel: 1 },
  { id: 'holo', name: 'EOTech Reflex Holo', summary: 'Crisp red reticle · Slight zoom clarity', unlockLevel: 1 },
  { id: 'scope_25x', name: '2.5x Tactical ACOG', summary: 'Long-range magnification · Slower ADS', unlockLevel: 1 },
  {
    id: 'thermal_ir',
    name: 'IR Thermal Holo',
    summary: '+25% ADS clarity · +8% ADS snap · Crisp target contrast',
    unlockLevel: 4,
    isMastery: true,
  },
];

export const MUZZLE_OPTIONS: AttachmentOption<MuzzleId>[] = [
  { id: 'standard', name: 'Standard Flash Hider', summary: 'Baseline ballistics & sound signature', unlockLevel: 1 },
  { id: 'suppressor', name: 'Monolithic Suppressor', summary: 'Hides minimap ping · -10% recoil', unlockLevel: 1 },
  { id: 'compensator', name: 'Tactical Compensator', summary: '-22% vertical & horizontal recoil', unlockLevel: 1 },
  {
    id: 'titanium_brake',
    name: 'Titanium Muzzle Brake',
    summary: '-32% recoil · +10% effective range',
    unlockLevel: 5,
    isMastery: true,
  },
  {
    id: 'specops_shroud',
    name: 'Spec-Ops Integral Shroud',
    summary: 'Zero minimap ping · Zero damage loss · -22% recoil',
    unlockLevel: 8,
    isMastery: true,
  },
];

export const MAGAZINE_OPTIONS: AttachmentOption<MagazineId>[] = [
  { id: 'standard_mag', name: 'Standard Issue Mag', summary: 'Baseline capacity & reload cadence', unlockLevel: 1 },
  { id: 'extended_mag', name: 'Extended 45% Mag', summary: '+45% rounds per mag · +12% reload duration', unlockLevel: 1 },
  { id: 'fast_mag', name: 'Magpul Fast-Pull', summary: '-28% reload duration', unlockLevel: 1 },
  {
    id: 'ap_match_mag',
    name: 'AP Tungsten Match Mag',
    summary: '+14% base damage · +12% headshot multiplier · -12% reload',
    unlockLevel: 6,
    isMastery: true,
  },
  {
    id: 'drum_mag',
    name: 'Casket Drum Mag',
    summary: '+75% rounds per mag · Fast-feed spring',
    unlockLevel: 9,
    isMastery: true,
  },
];

export const UNDERBARREL_OPTIONS: AttachmentOption<UnderbarrelId>[] = [
  { id: 'none', name: 'Bare Picatinny Rail', summary: 'Baseline handling & mobility', unlockLevel: 1 },
  { id: 'foregrip', name: 'Vertical Foregrip', summary: '-18% recoil · +12% ADS stability', unlockLevel: 1 },
  { id: 'laser', name: 'IR/Visible Tactical Laser', summary: '-32% hipfire spread · +15% ADS speed', unlockLevel: 1 },
  {
    id: 'angled_carbon',
    name: 'Carbon Angled Grip-Laser',
    summary: '-24% recoil · -28% hipfire spread · +18% ADS speed',
    unlockLevel: 7,
    isMastery: true,
  },
];

export const CAMO_OPTIONS: AttachmentOption<CamoId>[] = [
  { id: 'factory', name: 'Factory Gunmetal', summary: 'Standard anodized receiver & polymer furniture', unlockLevel: 1 },
  { id: 'urban_hex', name: 'Urban Slate Tactical', summary: 'Matte tactical slate finish', unlockLevel: 3, isMastery: true },
  { id: 'gold_trim', name: 'Gilded Spec-Ops', summary: 'Brushed gold alloy receiver & accent trim', unlockLevel: 7, isMastery: true },
  { id: 'apex_obsidian', name: 'Apex Obsidian', summary: 'Carbon obsidian plating with glowing amber trim', unlockLevel: 10, isMastery: true },
];

export const DEFAULT_LOADOUTS: Record<WeaponId, WeaponLoadout> = {
  m4a1: { optic: 'holo', muzzle: 'compensator', magazine: 'standard_mag', underbarrel: 'foregrip', camo: 'factory' },
  vector9: { optic: 'holo', muzzle: 'suppressor', magazine: 'extended_mag', underbarrel: 'laser', camo: 'factory' },
  msr7: { optic: 'scope_25x', muzzle: 'suppressor', magazine: 'fast_mag', underbarrel: 'foregrip', camo: 'factory' },
  p220: { optic: 'iron', muzzle: 'standard', magazine: 'fast_mag', underbarrel: 'laser', camo: 'factory' },
};

export function sanitizeLoadoutForLevel(loadout: WeaponLoadout, masteryLevel: number): WeaponLoadout {
  const opt = OPTIC_OPTIONS.find((o) => o.id === loadout.optic);
  const muz = MUZZLE_OPTIONS.find((m) => m.id === loadout.muzzle);
  const mag = MAGAZINE_OPTIONS.find((m) => m.id === loadout.magazine);
  const und = UNDERBARREL_OPTIONS.find((u) => u.id === loadout.underbarrel);
  const cam = CAMO_OPTIONS.find((c) => c.id === loadout.camo);

  return {
    optic: opt && masteryLevel >= opt.unlockLevel ? opt.id : 'iron',
    muzzle: muz && masteryLevel >= muz.unlockLevel ? muz.id : 'standard',
    magazine: mag && masteryLevel >= mag.unlockLevel ? mag.id : 'standard_mag',
    underbarrel: und && masteryLevel >= und.unlockLevel ? und.id : 'none',
    camo: cam && masteryLevel >= cam.unlockLevel ? cam.id : 'factory',
  };
}

export function computeWeaponStats(weaponId: WeaponId, loadout?: WeaponLoadout): ComputedWeaponStats {
  const base = WEAPONS[weaponId];
  const cfg = loadout ?? DEFAULT_LOADOUTS[weaponId];

  let adsFov = base.adsFov;
  let adsSpeed = base.adsSpeed;
  let recoilVertical = base.recoilVertical;
  let recoilHorizontal = base.recoilHorizontal;
  let baseSpread = base.baseSpread;
  let moveSpread = base.moveSpread;
  let adsSpread = base.adsSpread;
  let magSize = base.magSize;
  let reloadTime = base.reloadTime;
  let moveSpeedMult = base.moveSpeedMult;
  let damage = base.damage;
  let headshotMult = base.headshotMult;
  let range = base.range;
  let muzzleVelocityMs = base.muzzleVelocityMs;
  let weightKg = base.weightKg;
  let armorPenetration = base.armorPenetration;
  let suppressed = false;
  let hasLaser = false;

  if (cfg.optic === 'holo') {
    adsFov = Math.min(adsFov, 50);
    adsSpeed *= 0.96;
    adsSpread *= 0.85;
    weightKg += 0.16;
  } else if (cfg.optic === 'scope_25x') {
    adsFov = Math.min(adsFov, 32);
    adsSpeed *= 0.82;
    adsSpread *= 0.55;
    weightKg += 0.34;
  } else if (cfg.optic === 'thermal_ir') {
    adsFov = Math.min(adsFov, 46);
    adsSpeed *= 1.08;
    adsSpread *= 0.72;
    weightKg += 0.24;
  }

  if (cfg.muzzle === 'suppressor') {
    suppressed = true;
    recoilVertical *= 0.9;
    recoilHorizontal *= 0.9;
    moveSpeedMult *= 0.97;
    damage = Math.round(damage * 0.96);
    muzzleVelocityMs = Math.round(muzzleVelocityMs * 0.92);
    weightKg += 0.38;
  } else if (cfg.muzzle === 'compensator') {
    recoilVertical *= 0.78;
    recoilHorizontal *= 0.78;
    weightKg += 0.09;
  } else if (cfg.muzzle === 'titanium_brake') {
    recoilVertical *= 0.68;
    recoilHorizontal *= 0.68;
    range = Math.round(range * 1.1);
    muzzleVelocityMs = Math.round(muzzleVelocityMs * 1.06);
    armorPenetration = Math.min(98, armorPenetration + 4);
    weightKg += 0.07;
  } else if (cfg.muzzle === 'specops_shroud') {
    suppressed = true;
    recoilVertical *= 0.78;
    recoilHorizontal *= 0.78;
    range = Math.round(range * 1.06);
    muzzleVelocityMs = Math.round(muzzleVelocityMs * 1.04);
    weightKg += 0.29;
  }

  if (cfg.magazine === 'extended_mag') {
    magSize = Math.round(magSize * 1.45);
    reloadTime *= 1.12;
    moveSpeedMult *= 0.97;
    weightKg += 0.24;
  } else if (cfg.magazine === 'fast_mag') {
    reloadTime *= 0.72;
    weightKg += 0.05;
  } else if (cfg.magazine === 'ap_match_mag') {
    damage = Math.round(damage * 1.14);
    headshotMult = Number((headshotMult * 1.12).toFixed(2));
    reloadTime *= 0.88;
    muzzleVelocityMs = Math.round(muzzleVelocityMs * 1.08);
    armorPenetration = Math.min(99, armorPenetration + 16);
    weightKg += 0.09;
  } else if (cfg.magazine === 'drum_mag') {
    magSize = Math.round(magSize * 1.75);
    reloadTime *= 0.95;
    moveSpeedMult *= 0.96;
    weightKg += 0.56;
  }

  if (cfg.underbarrel === 'foregrip') {
    recoilVertical *= 0.82;
    recoilHorizontal *= 0.84;
    adsSpread *= 0.88;
    weightKg += 0.12;
  } else if (cfg.underbarrel === 'laser') {
    hasLaser = true;
    baseSpread *= 0.68;
    moveSpread *= 0.72;
    adsSpeed *= 1.15;
    weightKg += 0.14;
  } else if (cfg.underbarrel === 'angled_carbon') {
    hasLaser = true;
    recoilVertical *= 0.76;
    recoilHorizontal *= 0.78;
    baseSpread *= 0.72;
    moveSpread *= 0.74;
    adsSpeed *= 1.18;
    weightKg += 0.11;
  }

  const adsTimeMs = Math.round(2450 / adsSpeed);
  const sprintToFireMs = Math.round(135 + weightKg * 26 - (hasLaser ? 22 : 0));

  return {
    id: base.id,
    name: base.name,
    category: base.category,
    slot: base.slot,
    fireMode: base.fireMode,
    damage,
    headshotMult,
    rpm: base.rpm,
    magSize,
    reserveMax: magSize * base.reserveMags,
    reloadTime,
    adsFov,
    adsSpeed,
    adsTimeMs,
    sprintToFireMs,
    baseSpread,
    moveSpread,
    adsSpread,
    recoilVertical,
    recoilHorizontal,
    range,
    moveSpeedMult,
    muzzleVelocityMs,
    weightKg: Number(weightKg.toFixed(2)),
    armorPenetration,
    suppressed,
    hasLaser,
    optic: cfg.optic,
    muzzle: cfg.muzzle,
    magazine: cfg.magazine,
    underbarrel: cfg.underbarrel,
    camo: cfg.camo ?? 'factory',
  };
}
