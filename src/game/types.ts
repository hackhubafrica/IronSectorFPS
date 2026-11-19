export type GameMode = 'tdm' | 'extraction' | 'domination' | 'ffa';
export type MapId = 'zero_dam' | 'dust_compound';
export type ConnectionMode = 'offline' | 'online';
export type WeaponId = 'm4a1' | 'vector9' | 'msr7' | 'p220';
export type AttachmentSlot = 'optic' | 'muzzle' | 'magazine' | 'underbarrel' | 'camo';
export type OpticId = 'iron' | 'holo' | 'scope_25x' | 'thermal_ir';
export type MuzzleId = 'standard' | 'suppressor' | 'compensator' | 'titanium_brake' | 'specops_shroud';
export type MagazineId = 'standard_mag' | 'extended_mag' | 'fast_mag' | 'ap_match_mag' | 'drum_mag';
export type UnderbarrelId = 'none' | 'foregrip' | 'laser' | 'angled_carbon';
export type CamoId = 'factory' | 'urban_hex' | 'gold_trim' | 'apex_obsidian';

export interface WeaponLoadout {
  optic: OpticId;
  muzzle: MuzzleId;
  magazine: MagazineId;
  underbarrel: UnderbarrelId;
  camo: CamoId;
}

export interface WeaponProgress {
  kills: number;
  headshots: number;
}

export interface WeaponBaseSpec {
  id: WeaponId;
  name: string;
  category: 'Assault Rifle' | 'SMG' | 'Marksman Rifle' | 'Sidearm';
  slot: 'primary' | 'secondary';
  caliber: string;
  fireMode: 'AUTO' | 'SEMI';
  damage: number;
  headshotMult: number;
  rpm: number;
  magSize: number;
  reserveMags: number;
  reloadTime: number;
  adsFov: number;
  adsSpeed: number;
  baseSpread: number;
  moveSpread: number;
  adsSpread: number;
  recoilVertical: number;
  recoilHorizontal: number;
  range: number;
  moveSpeedMult: number;
  muzzleVelocityMs: number;
  weightKg: number;
  armorPenetration: number;
  description: string;
}

export interface ComputedWeaponStats {
  id: WeaponId;
  name: string;
  category: WeaponBaseSpec['category'];
  slot: WeaponBaseSpec['slot'];
  fireMode: 'AUTO' | 'SEMI';
  damage: number;
  headshotMult: number;
  rpm: number;
  magSize: number;
  reserveMax: number;
  reloadTime: number;
  adsFov: number;
  adsSpeed: number;
  adsTimeMs: number;
  sprintToFireMs: number;
  baseSpread: number;
  moveSpread: number;
  adsSpread: number;
  recoilVertical: number;
  recoilHorizontal: number;
  range: number;
  moveSpeedMult: number;
  muzzleVelocityMs: number;
  weightKg: number;
  armorPenetration: number;
  suppressed: boolean;
  hasLaser: boolean;
  optic: OpticId;
  muzzle: MuzzleId;
  magazine: MagazineId;
  underbarrel: UnderbarrelId;
  camo: CamoId;
}

export type TeamId = 'alpha' | 'bravo' | 'neutral';
export type Stance = 'stand' | 'crouch' | 'sprint' | 'slide';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface MapBox {
  id: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  material: 'concrete' | 'container_blue' | 'container_rust' | 'container_olive' | 'sandbag' | 'wood' | 'steel' | 'hazard';
  walkableTop?: boolean;
  isRamp?: boolean;
  rampDir?: 'px' | 'nx' | 'pz' | 'nz';
}

export interface CaptureZoneDef {
  id: 'A' | 'B' | 'C';
  label: string;
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface LootCrateDef {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  tier: 'standard' | 'military' | 'classified';
}

export interface ExtractionZoneDef {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface MapDefinition {
  id: MapId;
  name: string;
  location: string;
  description: string;
  previewImage: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  skyColor: string;
  fogColor: string;
  fogDensity: number;
  sunColor: string;
  sunIntensity: number;
  sunPosition: Vec3;
  groundColor: string;
  groundStyle: 'industrial' | 'desert';
  boxes: MapBox[];
  spawnsAlpha: Vec3[];
  spawnsBravo: Vec3[];
  spawnsFfa: Vec3[];
  captureZones: CaptureZoneDef[];
  lootCrates: LootCrateDef[];
  extractionZone: ExtractionZoneDef;
  waypoints: Vec3[];
}

export interface CombatantSnapshot {
  id: string;
  name: string;
  isBot: boolean;
  team: TeamId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  alive: boolean;
  stance: Stance;
  weaponId: WeaponId;
  ads: boolean;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  lootValue: number;
  uavRevealUntil: number;
}

export interface DominationZoneState {
  id: 'A' | 'B' | 'C';
  owner: TeamId;
  capturingTeam: TeamId;
  progress: number;
  contested: boolean;
}

export interface LootCrateState {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  tier: 'standard' | 'military' | 'classified';
  opened: boolean;
  value: number;
}

export interface ExtractionState {
  active: boolean;
  triggeredBy: string | null;
  countdown: number;
  extracted: boolean;
}

export type KillfeedWeaponKind = WeaponId | 'frag';

export interface KillfeedEntry {
  id: string;
  killerId?: string;
  killerName: string;
  killerTeam: TeamId;
  killerIsBot?: boolean;
  victimId?: string;
  victimName: string;
  victimTeam: TeamId;
  victimIsBot?: boolean;
  weaponId?: KillfeedWeaponKind;
  weaponName: string;
  headshot: boolean;
  timestamp: number;
}

export interface DamageIndicatorEntry {
  id: number;
  angle: number;
  damage: number;
  armorHit: boolean;
  createdAt: number;
  until: number;
}

export interface HudState {
  mode: GameMode;
  mapId: MapId;
  connectionMode: ConnectionMode;
  roomCode: string | null;
  phase: 'active' | 'ended';
  timeRemaining: number;
  alphaScore: number;
  bravoScore: number;
  scoreLimit: number;
  player: {
    id: string;
    name: string;
    team: TeamId;
    x: number;
    y: number;
    z: number;
    yaw: number;
    hp: number;
    maxHp: number;
    armor: number;
    maxArmor: number;
    alive: boolean;
    respawnIn: number;
    stance: Stance;
    ads: boolean;
    reloading: boolean;
    reloadProgress: number;
    activeSlot: 'primary' | 'secondary';
    weaponId: WeaponId;
    weaponName: string;
    fireMode: 'AUTO' | 'SEMI';
    ammoInMag: number;
    magSize: number;
    reserveAmmo: number;
    armorPlates: number;
    grenades: number;
    streakKills: number;
    uavActiveUntil: number;
    spread: number;
    optic: OpticId;
    lootValue: number;
    extractedValue: number;
    kills: number;
    deaths: number;
    weaponKills: Partial<Record<WeaponId, number>>;
    weaponHeadshots: Partial<Record<WeaponId, number>>;
  };
  masteryBanner: { weaponName: string; level: number; unlockLabel: string; until: number } | null;
  interactPrompt: string | null;
  interactProgress: number;
  hitmarker: { kind: 'body' | 'head' | 'kill'; until: number } | null;
  damageIndicator: { id: number; angle: number; until: number } | null;
  damageIndicators: DamageIndicatorEntry[];
  explosionShockwave: { id: number; intensity: number; until: number } | null;
  zones: DominationZoneState[];
  lootCrates: LootCrateState[];
  extraction: ExtractionState;
  combatants: CombatantSnapshot[];
  killfeed: KillfeedEntry[];
  winnerTeam: TeamId | 'draw' | null;
  winnerName: string | null;
  pointerLocked: boolean;
  gamepadConnected: boolean;
  gamepadName: string | null;
  hapticsEnabled: boolean;
  pingMs: number;
}

export interface ControlSettings {
  mouseSensitivity: number;
  touchSensitivity: number;
  controllerSensitivity: number;
  controllerDeadzone: number;
  controllerAimAssist: boolean;
  controllerVibration: boolean;
  fov: number;
  invertY: boolean;
  inputMode: 'auto' | 'desktop' | 'touch';
  masterVolume: number;
}

export interface PlayerProfile {
  callsign: string;
  xp: number;
  stashCredits: number;
  totalKills: number;
  totalMatches: number;
  totalExtractions: number;
  primaryWeapon: WeaponId;
  secondaryWeapon: WeaponId;
  loadouts: Record<WeaponId, WeaponLoadout>;
  weaponProgress: Record<WeaponId, WeaponProgress>;
  settings: ControlSettings;
}

export interface PublicRoomSummary {
  code: string;
  name: string;
  mode: GameMode;
  mapId: MapId;
  humanCount: number;
  maxHumans: number;
  botCount: number;
  timeRemaining: number;
}

export type WsClientMessage =
  | { type: 'room:create'; playerName: string; mode: GameMode; mapId: MapId; weaponId: WeaponId; roomName?: string }
  | { type: 'room:join'; code: string; playerName: string; weaponId: WeaponId }
  | { type: 'room:quickmatch'; playerName: string; mode: GameMode; mapId: MapId; weaponId: WeaponId }
  | { type: 'room:leave' }
  | { type: 'player:state'; x: number; y: number; z: number; yaw: number; pitch: number; stance: Stance; weaponId: WeaponId; ads: boolean }
  | { type: 'combat:fire'; weaponId: WeaponId; suppressed: boolean; ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }
  | { type: 'combat:hit'; targetId: string; headshot: boolean; weaponId: WeaponId; distance: number; damage: number }
  | { type: 'combat:grenade'; x: number; y: number; z: number }
  | { type: 'player:plate' }
  | { type: 'player:uav' }
  | { type: 'objective:loot'; crateId: string }
  | { type: 'objective:extract_start' }
  | { type: 'ping'; t: number };

export type WsServerMessage =
  | { type: 'room:joined'; code: string; playerId: string; team: TeamId; mode: GameMode; mapId: MapId; spawn: Vec3 }
  | { type: 'room:error'; message: string }
  | {
      type: 'room:state';
      code: string;
      mode: GameMode;
      mapId: MapId;
      phase: 'active' | 'ended';
      timeRemaining: number;
      alphaScore: number;
      bravoScore: number;
      scoreLimit: number;
      winnerTeam: TeamId | 'draw' | null;
      winnerName: string | null;
      combatants: CombatantSnapshot[];
      zones: DominationZoneState[];
      lootCrates: LootCrateState[];
      extraction: ExtractionState;
      killfeed: KillfeedEntry[];
    }
  | { type: 'combat:tracer'; shooterId: string; weaponId: WeaponId; suppressed: boolean; ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }
  | { type: 'combat:damaged'; victimId: string; attackerId: string; attackerX: number; attackerZ: number; damage: number; headshot: boolean; killed: boolean; weaponId?: WeaponId }
  | { type: 'combat:explosion'; attackerId: string; x: number; y: number; z: number }
  | { type: 'player:respawn'; spawn: Vec3 }
  | { type: 'extraction:banked'; playerId: string; amount: number }
  | { type: 'pong'; t: number };
