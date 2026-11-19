import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  BOT_CALLSIGNS,
  BOT_WEAPONS,
  createBotAgent,
  stepBotAgent,
} from '../game/botBrain.ts';
import type { BotAgentState } from '../game/botBrain.ts';
import {
  getGroundHeightAt,
  raycastMapDistance,
  resolveHorizontalCollision,
  resolveSphereCollision,
} from '../game/collision.ts';
import { MAPS } from '../game/maps.ts';
import type {
  CombatantSnapshot,
  ComputedWeaponStats,
  ConnectionMode,
  ControlSettings,
  DamageIndicatorEntry,
  DominationZoneState,
  ExtractionState,
  GameMode,
  HudState,
  KillfeedEntry,
  KillfeedWeaponKind,
  LootCrateState,
  MapId,
  Stance,
  TeamId,
  Vec3,
  WeaponId,
  WeaponLoadout,
  WeaponProgress,
  WsClientMessage,
  WsServerMessage,
} from '../game/types.ts';
import { computeWeaponStats, getWeaponMasteryInfo, MASTERY_MILESTONES, WEAPONS } from '../game/weapons.ts';
import { cancelHapticFeedback, triggerHapticFeedback } from '../utils/haptics.ts';
import type { HapticEventKind } from '../utils/haptics.ts';
import { AudioEngine } from './AudioEngine.ts';
import { buildMapScene } from './MapBuilder.ts';
import type { BuiltMapScene } from './MapBuilder.ts';
import { OperatorRig } from './OperatorRig.ts';
import { buildProceduralTextures } from './Textures.ts';
import type { ProceduralTextureSet } from './Textures.ts';
import { WeaponViewmodel } from './WeaponViewmodel.ts';

export interface MatchLaunchConfig {
  mode: GameMode;
  mapId: MapId;
  connectionMode: ConnectionMode;
  roomAction?: 'create' | 'join' | 'quickmatch';
  roomCode?: string;
  roomName?: string;
  playerName: string;
  primaryWeapon: WeaponId;
  secondaryWeapon: WeaponId;
  loadouts: Record<WeaponId, WeaponLoadout>;
  weaponProgress: Record<WeaponId, WeaponProgress>;
  settings: ControlSettings;
  isTouchDevice: boolean;
  onTogglePause?: () => void;
  onToggleScoreboard?: (show: boolean) => void;
}

interface ActiveTracer {
  mesh: THREE.Mesh;
  life: number;
}

interface ActiveGrenade {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuse: number;
  ownerId: string;
}

interface ActiveExplosion {
  mesh: THREE.Mesh;
  life: number;
}

function detectSoftwareWebGL(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      const ren = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
      if (/SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(ren)) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export class FpsEngine {
  private readonly container: HTMLElement;
  private readonly cfg: MatchLaunchConfig;
  private readonly onHudUpdate: (hud: HudState) => void;
  private readonly onRoomError: (msg: string) => void;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private pmremGenerator: THREE.PMREMGenerator;
  private envTarget: THREE.WebGLRenderTarget;
  private textures: ProceduralTextureSet;
  private mapScene: BuiltMapScene;
  private viewmodel: WeaponViewmodel;
  private isSoftwareGl = false;

  private disposed = false;
  private paused = false;
  private rafId = 0;
  private timerId = 0;
  private lastTickMs = performance.now();
  private hudEmitAccum = 0;
  private stateSendAccum = 0;

  private pointerLocked = false;
  private keys = new Set<string>();
  private mouseFireDown = false;
  private mouseAdsDown = false;
  private touchMoveVec = { x: 0, y: 0 };
  private touchFireDown = false;
  private touchAdsDown = false;
  private touchInteractDown = false;
  private semiTriggerConsumed = false;

  private gamepadConnected = false;
  private gamepadName: string | null = null;
  private gamepadMoveVec = { x: 0, y: 0 };
  private gamepadFireDown = false;
  private gamepadAdsDown = false;
  private gamepadInteractDown = false;
  private gamepadSprintToggle = false;
  private prevPadButtons: boolean[] = [];

  private playerId = 'local_player';
  private playerTeam: TeamId = 'alpha';
  private playerPos = new THREE.Vector3(0, 0.1, 0);
  private playerVelX = 0;
  private playerVelZ = 0;
  private playerVelY = 0;
  private grounded = true;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private slideTimer = 0;
  private slideCooldown = 0;
  private slideDirX = 0;
  private slideDirZ = -1;
  private currentEyeHeight = 1.62;
  private landingDip = 0;
  private cameraRoll = 0;
  private headBobPhase = 0;
  private yaw = 0;
  private pitch = 0;
  private recoilPitchOffset = 0;
  private recoilYawOffset = 0;

  private hp = 100;
  private maxHp = 100;
  private armor = 50;
  private maxArmor = 100;
  private alive = true;
  private respawnIn = 0;
  private crouch = false;
  private stance: Stance = 'stand';

  private activeSlot: 'primary' | 'secondary' = 'primary';
  private primaryStats: ComputedWeaponStats;
  private secondaryStats: ComputedWeaponStats;
  private ammoState: Record<'primary' | 'secondary', { mag: number; reserve: number }> = {
    primary: { mag: 30, reserve: 150 },
    secondary: { mag: 12, reserve: 48 },
  };
  private fireCooldown = 0;
  private reloading = false;
  private reloadElapsed = 0;
  private armorPlates = 2;
  private grenades = 2;
  private streakKills = 0;
  private uavActiveUntil = 0;
  private playerKills = 0;
  private playerDeaths = 0;
  private playerScore = 0;
  private lootValue = 0;
  private extractedValue = 0;
  private weaponKills: Partial<Record<WeaponId, number>> = {};
  private weaponHeadshots: Partial<Record<WeaponId, number>> = {};
  private masteryBanner: { weaponName: string; level: number; unlockLabel: string; until: number } | null = null;

  private interactPrompt: string | null = null;
  private interactProgress = 0;
  private hitmarker: { kind: 'body' | 'head' | 'kill'; until: number } | null = null;
  private damageIndicator: { id: number; angle: number; until: number } | null = null;
  private damageIndicators: {
    id: number;
    sourceX: number;
    sourceZ: number;
    damage: number;
    armorHit: boolean;
    createdAt: number;
    until: number;
  }[] = [];
  private explosionShockwave: { id: number; intensity: number; until: number } | null = null;
  private hapticEventSeq = 1;
  private stepAccum = 0;

  private phase: 'active' | 'ended' = 'active';
  private timeRemaining = 300;
  private alphaScore = 0;
  private bravoScore = 0;
  private scoreLimit = 40;
  private winnerTeam: TeamId | 'draw' | null = null;
  private winnerName: string | null = null;

  private zones: DominationZoneState[] = [];
  private lootCrates: LootCrateState[] = [];
  private extraction: ExtractionState = { active: false, triggeredBy: null, countdown: 15, extracted: false };
  private killfeed: KillfeedEntry[] = [];
  private domTickAccum = 0;

  private offlineBots: BotAgentState[] = [];
  private remoteSnapshots: CombatantSnapshot[] = [];
  private operatorRigs = new Map<string, OperatorRig>();
  private tracers: ActiveTracer[] = [];
  private activeGrenades: ActiveGrenade[] = [];
  private explosions: ActiveExplosion[] = [];

  private ws: WebSocket | null = null;
  private pingMs = 0;
  private pingIntervalId = 0;
  private roomCode: string | null = null;

  private raycaster = new THREE.Raycaster();
  private resizeObserver: ResizeObserver;

  private readonly _scratchOrigin = new THREE.Vector3();
  private readonly _scratchDir = new THREE.Vector3();
  private readonly _scratchMuzzle = new THREE.Vector3();
  private readonly _scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly _scratchEnemyPos = new THREE.Vector3();

  constructor(
    container: HTMLElement,
    cfg: MatchLaunchConfig,
    onHudUpdate: (hud: HudState) => void,
    onRoomError: (msg: string) => void
  ) {
    this.container = container;
    this.cfg = cfg;
    this.onHudUpdate = onHudUpdate;
    this.onRoomError = onRoomError;

    this.primaryStats = computeWeaponStats(cfg.primaryWeapon, cfg.loadouts[cfg.primaryWeapon]);
    this.secondaryStats = computeWeaponStats(cfg.secondaryWeapon, cfg.loadouts[cfg.secondaryWeapon]);
    this.ammoState = {
      primary: { mag: this.primaryStats.magSize, reserve: this.primaryStats.reserveMax },
      secondary: { mag: this.secondaryStats.magSize, reserve: this.secondaryStats.reserveMax },
    };

    const map = MAPS[cfg.mapId];
    this.timeRemaining = cfg.mode === 'extraction' ? 420 : cfg.mode === 'domination' ? 360 : 300;
    this.scoreLimit = cfg.mode === 'tdm' ? 40 : cfg.mode === 'domination' ? 150 : cfg.mode === 'ffa' ? 25 : 999;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.isSoftwareGl = detectSoftwareWebGL(this.renderer);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(map.skyColor);
    this.scene.fog = new THREE.FogExp2(map.fogColor, map.fogDensity);

    const aspect = (container.clientWidth || window.innerWidth) / Math.max(1, container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(cfg.settings.fov, aspect, 0.08, 320);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.envTarget = this.pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envTarget.texture;

    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x3f3a34, 0.72);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(map.sunColor, map.sunIntensity);
    sun.position.set(map.sunPosition.x, map.sunPosition.y, map.sunPosition.z);
    if (!this.isSoftwareGl) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 10;
      sun.shadow.camera.far = 170;
      const s = 62;
      sun.shadow.camera.left = -s;
      sun.shadow.camera.right = s;
      sun.shadow.camera.top = s;
      sun.shadow.camera.bottom = -s;
    }
    this.scene.add(sun);

    this.textures = buildProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.mapScene = buildMapScene(map, this.textures, cfg.mode);
    this.scene.add(this.mapScene.group);

    this.viewmodel = new WeaponViewmodel();
    this.viewmodel.rebuildIfNeeded(this.getActiveWeaponStats());
    this.camera.add(this.viewmodel.root);

    AudioEngine.setVolume(cfg.settings.masterVolume);

    this.bindInputListeners();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    if (cfg.connectionMode === 'offline') {
      this.initOfflineMatch();
    } else {
      this.initOnlineMatch();
    }

    this.scheduleNextFrame();
  }

  private getActiveWeaponStats(): ComputedWeaponStats {
    return this.activeSlot === 'primary' ? this.primaryStats : this.secondaryStats;
  }

  private handleResize(): void {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private initOfflineMatch(): void {
    const map = MAPS[this.cfg.mapId];
    this.playerTeam = this.cfg.mode === 'ffa' ? 'neutral' : 'alpha';
    const spawn = this.pickSpawn(this.playerTeam);
    this.playerPos.set(spawn.x, spawn.y, spawn.z);
    this.yaw = this.playerTeam === 'alpha' ? Math.PI : 0;

    if (this.cfg.mode === 'domination') {
      this.zones = map.captureZones.map((z) => ({
        id: z.id,
        owner: 'neutral',
        capturingTeam: 'neutral',
        progress: 0,
        contested: false,
      }));
    }

    if (this.cfg.mode === 'extraction') {
      this.lootCrates = map.lootCrates.map((c) => ({
        ...c,
        opened: false,
        value:
          c.tier === 'classified'
            ? 20000 + Math.floor(Math.random() * 8000)
            : c.tier === 'military'
            ? 11000 + Math.floor(Math.random() * 4500)
            : 5000 + Math.floor(Math.random() * 2500),
      }));
    }

    this.offlineBots = [];
    if (this.cfg.mode === 'tdm' || this.cfg.mode === 'domination') {
      for (let i = 0; i < 4; i++) {
        const bSpawn = this.pickSpawn('alpha');
        this.offlineBots.push(
          createBotAgent(`bot_a_${i}`, BOT_CALLSIGNS[i], 'alpha', bSpawn, BOT_WEAPONS[i % BOT_WEAPONS.length])
        );
      }
      for (let i = 0; i < 5; i++) {
        const bSpawn = this.pickSpawn('bravo');
        this.offlineBots.push(
          createBotAgent(`bot_b_${i}`, BOT_CALLSIGNS[4 + i], 'bravo', bSpawn, BOT_WEAPONS[(i + 1) % BOT_WEAPONS.length])
        );
      }
    } else if (this.cfg.mode === 'ffa') {
      for (let i = 0; i < 7; i++) {
        const bSpawn = this.pickSpawn('neutral');
        this.offlineBots.push(
          createBotAgent(`bot_f_${i}`, BOT_CALLSIGNS[i], 'neutral', bSpawn, BOT_WEAPONS[i % BOT_WEAPONS.length])
        );
      }
    } else {
      for (let i = 0; i < 7; i++) {
        const c = map.lootCrates[i % map.lootCrates.length];
        this.offlineBots.push(
          createBotAgent(
            `guard_${i}`,
            `Sentinel-0${i + 1}`,
            'bravo',
            { x: c.x + 2.5, y: c.y, z: c.z + 2.5 },
            BOT_WEAPONS[i % BOT_WEAPONS.length]
          )
        );
      }
    }
  }

  private initOnlineMatch(): void {
    const map = MAPS[this.cfg.mapId];
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws`;
    const spawn = this.pickSpawn('alpha');
    this.playerPos.set(spawn.x, spawn.y, spawn.z);

    if (this.cfg.mode === 'domination') {
      this.zones = map.captureZones.map((z) => ({
        id: z.id,
        owner: 'neutral',
        capturingTeam: 'neutral',
        progress: 0,
        contested: false,
      }));
    }

    const socket = new WebSocket(wsUrl);
    this.ws = socket;

    socket.addEventListener('open', () => {
      const action = this.cfg.roomAction ?? 'quickmatch';
      if (action === 'create') {
        this.sendWs({
          type: 'room:create',
          playerName: this.cfg.playerName,
          mode: this.cfg.mode,
          mapId: this.cfg.mapId,
          weaponId: this.cfg.primaryWeapon,
          roomName: this.cfg.roomName,
        });
      } else if (action === 'join' && this.cfg.roomCode) {
        this.sendWs({
          type: 'room:join',
          code: this.cfg.roomCode,
          playerName: this.cfg.playerName,
          weaponId: this.cfg.primaryWeapon,
        });
      } else {
        this.sendWs({
          type: 'room:quickmatch',
          playerName: this.cfg.playerName,
          mode: this.cfg.mode,
          mapId: this.cfg.mapId,
          weaponId: this.cfg.primaryWeapon,
        });
      }
      this.pingIntervalId = window.setInterval(() => {
        this.sendWs({ type: 'ping', t: Date.now() });
      }, 2500);
    });

    socket.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as WsServerMessage;
        this.handleWsMessage(msg);
      } catch {
        // ignore malformed packets
      }
    });

    socket.addEventListener('error', () => {
      this.onRoomError('Unable to reach multiplayer tactical server.');
    });
  }

  private sendWs(msg: WsClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleWsMessage(msg: WsServerMessage): void {
    if (msg.type === 'pong') {
      this.pingMs = Math.max(1, Date.now() - msg.t);
      return;
    }
    if (msg.type === 'room:error') {
      this.onRoomError(msg.message);
      return;
    }
    if (msg.type === 'room:joined') {
      this.roomCode = msg.code;
      this.playerId = msg.playerId;
      this.playerTeam = msg.team;
      this.playerPos.set(msg.spawn.x, msg.spawn.y, msg.spawn.z);
      this.yaw = msg.team === 'alpha' ? Math.PI : 0;
      return;
    }
    if (msg.type === 'player:respawn') {
      this.alive = true;
      this.hp = 100;
      this.armor = 50;
      this.playerPos.set(msg.spawn.x, msg.spawn.y, msg.spawn.z);
      this.playerVelX = 0;
      this.playerVelZ = 0;
      this.playerVelY = 0;
      this.slideTimer = 0;
      this.crouch = false;
      this.refillAmmo();
      return;
    }
    if (msg.type === 'extraction:banked' && msg.playerId === this.playerId) {
      this.extractedValue += msg.amount;
      this.lootValue = 0;
      AudioEngine.playUiTone('exfil');
      return;
    }
    if (msg.type === 'combat:tracer' && msg.shooterId !== this.playerId) {
      this.operatorRigs.get(msg.shooterId)?.triggerFireKick();
      this.spawnTracer(
        new THREE.Vector3(msg.ox, msg.oy, msg.oz),
        new THREE.Vector3(msg.dx, msg.dy, msg.dz),
        msg.suppressed
      );
      const dist = this.playerPos.distanceTo(this._scratchOrigin.set(msg.ox, msg.oy, msg.oz));
      AudioEngine.playGunshot(msg.weaponId, msg.suppressed, dist);
      return;
    }
    if (msg.type === 'combat:explosion' && msg.attackerId !== this.playerId) {
      const exPos = this._scratchOrigin.set(msg.x, msg.y, msg.z);
      const dist = this.playerPos.distanceTo(exPos);
      AudioEngine.playExplosion(dist);
      const blast = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.8 })
      );
      blast.position.copy(exPos);
      this.scene.add(blast);
      this.explosions.push({ mesh: blast, life: 0.35 });
      this.applyExplosionFeedback(msg.x, msg.y, msg.z, dist);
      return;
    }
    if (msg.type === 'combat:damaged') {
      if (msg.victimId === this.playerId) {
        const dmgId = this.pushDamageIndicator(msg.attackerX, msg.attackerZ, msg.damage, this.armor > 0);
        this.recoilPitchOffset = Math.min(0.14, this.recoilPitchOffset + 0.025);
        this.emitHaptic('damage', 1.0, dmgId);
        if (msg.killed) {
          this.alive = false;
          this.respawnIn = this.cfg.mode === 'extraction' ? 8.0 : 3.5;
          this.streakKills = 0;
          this.emitHaptic('explosion', 0.85);
        }
      } else if (msg.attackerId === this.playerId) {
        const kind = msg.killed ? 'kill' : msg.headshot ? 'head' : 'body';
        this.hitmarker = { kind, until: performance.now() + 210 };
        AudioEngine.playHitmarker(kind);
        if (msg.killed) {
          this.streakKills += 1;
          this.emitHaptic('kill');
          if (msg.weaponId) {
            this.recordWeaponKill(msg.weaponId, msg.headshot);
          }
        } else {
          this.emitHaptic('hit');
        }
      }
      return;
    }
    if (msg.type === 'room:state') {
      this.phase = msg.phase;
      this.timeRemaining = msg.timeRemaining;
      this.alphaScore = msg.alphaScore;
      this.bravoScore = msg.bravoScore;
      this.scoreLimit = msg.scoreLimit;
      this.winnerTeam = msg.winnerTeam;
      this.winnerName = msg.winnerName;
      this.zones = msg.zones;
      this.lootCrates = msg.lootCrates;
      this.extraction = msg.extraction;
      this.killfeed = msg.killfeed;
      this.remoteSnapshots = msg.combatants;

      const me = msg.combatants.find((c) => c.id === this.playerId);
      if (me) {
        this.hp = me.hp;
        this.armor = me.armor;
        this.alive = me.alive;
        this.playerKills = me.kills;
        this.playerDeaths = me.deaths;
        this.playerScore = me.score;
        this.lootValue = me.lootValue;
      }
    }
  }

  private pickSpawn(team: TeamId): Vec3 {
    const map = MAPS[this.cfg.mapId];
    if (this.cfg.mode === 'ffa') {
      return { ...map.spawnsFfa[Math.floor(Math.random() * map.spawnsFfa.length)] };
    }
    const pool = team === 'bravo' ? map.spawnsBravo : map.spawnsAlpha;
    return { ...pool[Math.floor(Math.random() * pool.length)] };
  }

  private refillAmmo(): void {
    this.ammoState = {
      primary: { mag: this.primaryStats.magSize, reserve: this.primaryStats.reserveMax },
      secondary: { mag: this.secondaryStats.magSize, reserve: this.secondaryStats.reserveMax },
    };
    this.reloading = false;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape') return;
    this.keys.add(e.code);
    if (this.paused || this.phase !== 'active') return;
    if (e.code === 'KeyR') this.triggerReload();
    else if (e.code === 'Space') this.triggerJump();
    else if (e.code === 'KeyC') this.toggleCrouch();
    else if (e.code === 'KeyQ' || e.code === 'Digit1' || e.code === 'Digit2') {
      if (e.code === 'Digit1' && this.activeSlot !== 'primary') this.swapWeapon();
      else if (e.code === 'Digit2' && this.activeSlot !== 'secondary') this.swapWeapon();
      else if (e.code === 'KeyQ') this.swapWeapon();
    } else if (e.code === 'Digit4') this.useArmorPlate();
    else if (e.code === 'KeyG') this.throwGrenade();
    else if (e.code === 'Digit3') this.activateUav();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked || this.paused || !this.alive || this.phase !== 'active') return;
    const stats = this.getActiveWeaponStats();
    const adsMult = this.isAdsActive() ? 0.58 : 1.0;
    const sens = 0.0021 * this.cfg.settings.mouseSensitivity * adsMult * (stats.optic === 'scope_25x' && this.isAdsActive() ? 0.65 : 1);
    const ySign = this.cfg.settings.invertY ? 1 : -1;
    this.yaw -= e.movementX * sens;
    this.pitch = Math.max(-1.42, Math.min(1.42, this.pitch + e.movementY * sens * ySign));
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.paused || this.cfg.isTouchDevice) return;
    AudioEngine.unlock();
    if (!this.pointerLocked && this.phase === 'active') {
      this.requestPointerLock();
    }
    if (e.button === 0) this.mouseFireDown = true;
    else if (e.button === 2) this.mouseAdsDown = true;
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.mouseFireDown = false;
      this.semiTriggerConsumed = false;
    } else if (e.button === 2) {
      this.mouseAdsDown = false;
    }
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
  };

  private onGamepadConnected = (e: GamepadEvent) => {
    this.gamepadConnected = true;
    this.gamepadName = e.gamepad.id || 'Controller';
  };

  private onGamepadDisconnected = () => {
    const pads = typeof navigator.getGamepads === 'function' ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    if (pads.length === 0) {
      this.gamepadConnected = false;
      this.gamepadName = null;
      this.gamepadMoveVec.x = 0;
      this.gamepadMoveVec.y = 0;
      this.gamepadFireDown = false;
      this.gamepadAdsDown = false;
      this.gamepadInteractDown = false;
      this.gamepadSprintToggle = false;
      this.prevPadButtons = [];
    }
  };

  private bindInputListeners(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    window.addEventListener('gamepadconnected', this.onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);

    if (typeof navigator.getGamepads === 'function') {
      const active = Array.from(navigator.getGamepads()).find((p) => p && p.connected);
      if (active) {
        this.gamepadConnected = true;
        this.gamepadName = active.id || 'Controller';
      }
    }
  }

  public requestPointerLock(): void {
    if (this.cfg.isTouchDevice || this.paused) return;
    try {
      this.renderer.domElement.requestPointerLock();
    } catch {
      // pointer lock may require gesture
    }
  }

  public setPaused(p: boolean): void {
    this.paused = p;
    if (p) {
      cancelHapticFeedback();
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock();
      }
    }
  }

  public setTouchMove(x: number, y: number): void {
    this.touchMoveVec.x = x;
    this.touchMoveVec.y = y;
  }

  public addTouchLook(dx: number, dy: number): void {
    if (this.paused || !this.alive || this.phase !== 'active') return;
    const adsMult = this.isAdsActive() ? 0.58 : 1;
    const sens = 0.0042 * this.cfg.settings.touchSensitivity * adsMult;
    const ySign = this.cfg.settings.invertY ? 1 : -1;
    this.yaw -= dx * sens;
    this.pitch = Math.max(-1.42, Math.min(1.42, this.pitch + dy * sens * ySign));
  }

  public setTouchFire(firing: boolean): void {
    AudioEngine.unlock();
    this.touchFireDown = firing;
    if (!firing) this.semiTriggerConsumed = false;
  }

  public setTouchAds(ads: boolean): void {
    this.touchAdsDown = ads;
  }

  public setInteractHeld(held: boolean): void {
    this.touchInteractDown = held;
  }

  public triggerJump(): void {
    if (!this.alive || this.paused) return;
    this.jumpBufferTimer = 0.14;
  }

  private executeJump(): void {
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    this.crouch = false;
    if (this.slideTimer > 0) {
      // Slide-cancel hop maintains forward speed burst cleanly
      this.slideTimer = 0;
      this.playerVelY = 6.25;
    } else {
      this.playerVelY = 6.55;
    }
    this.grounded = false;
  }

  public toggleCrouch(): void {
    if (!this.alive || this.paused) return;
    const horizSpeed = Math.hypot(this.playerVelX, this.playerVelZ);
    if (
      !this.crouch &&
      this.grounded &&
      this.slideTimer <= 0 &&
      this.slideCooldown <= 0 &&
      (this.stance === 'sprint' || horizSpeed > 5.7)
    ) {
      this.slideTimer = 0.62;
      this.slideCooldown = 0.85;
      this.crouch = true;
      const spd = Math.max(0.01, horizSpeed);
      this.slideDirX = this.playerVelX / spd;
      this.slideDirZ = this.playerVelZ / spd;
      this.playerVelX = this.slideDirX * 9.4;
      this.playerVelZ = this.slideDirZ * 9.4;
      AudioEngine.playFootstep(true);
      this.emitHaptic('slide');
      return;
    }
    this.crouch = !this.crouch;
    if (!this.crouch) this.slideTimer = 0;
  }

  public swapWeapon(): void {
    if (!this.alive || this.paused) return;
    this.activeSlot = this.activeSlot === 'primary' ? 'secondary' : 'primary';
    this.reloading = false;
    this.reloadElapsed = 0;
    this.viewmodel.rebuildIfNeeded(this.getActiveWeaponStats());
    AudioEngine.playReloadClick('start');
    this.emitHaptic('ui');
  }

  public triggerReload(): void {
    if (!this.alive || this.reloading || this.paused) return;
    const stats = this.getActiveWeaponStats();
    const ammo = this.ammoState[this.activeSlot];
    if (ammo.mag >= stats.magSize || ammo.reserve <= 0) return;
    this.reloading = true;
    this.reloadElapsed = 0;
    AudioEngine.playReloadClick('start');
    this.emitHaptic('reload');
  }

  public useArmorPlate(): void {
    if (!this.alive || this.paused || this.armorPlates <= 0 || this.armor >= this.maxArmor) return;
    this.armorPlates -= 1;
    this.armor = Math.min(this.maxArmor, this.armor + 50);
    AudioEngine.playUiTone('plate');
    this.emitHaptic('reload');
    if (this.cfg.connectionMode === 'online') {
      this.sendWs({ type: 'player:plate' });
    }
  }

  public activateUav(): void {
    if (!this.alive || this.paused || this.streakKills < 3) return;
    this.streakKills -= 3;
    const until = Date.now() + 10000;
    this.uavActiveUntil = until;
    AudioEngine.playUiTone('uav');
    this.emitHaptic('ui');
    if (this.cfg.connectionMode === 'offline') {
      for (const b of this.offlineBots) {
        if (this.cfg.mode === 'ffa' || b.team !== this.playerTeam) {
          b.uavRevealUntil = until;
        }
      }
    } else {
      this.sendWs({ type: 'player:uav' });
    }
  }

  public throwGrenade(): void {
    if (!this.alive || this.paused || this.grenades <= 0 || this.phase !== 'active') return;
    this.grenades -= 1;
    this.emitHaptic('ui');
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch + 0.18, this.yaw, 0, 'YXZ')).normalize();
    const start = new THREE.Vector3(this.playerPos.x, this.playerPos.y + 1.45, this.playerPos.z).addScaledVector(dir, 0.7);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x3f4d36, roughness: 0.55 })
    );
    mesh.position.copy(start);
    this.scene.add(mesh);
    this.activeGrenades.push({
      mesh,
      pos: start,
      vel: dir.multiplyScalar(17).add(new THREE.Vector3(0, 3.2, 0)),
      fuse: 1.55,
      ownerId: this.playerId,
    });
  }

  private isAdsActive(): boolean {
    return (this.mouseAdsDown || this.touchAdsDown || this.gamepadAdsDown) && !this.reloading && this.slideTimer <= 0;
  }

  private nextHapticId(): number {
    this.hapticEventSeq += 1;
    return this.hapticEventSeq;
  }

  private emitHaptic(kind: HapticEventKind, intensity = 1, eventId?: number): void {
    triggerHapticFeedback(kind, {
      enabled: this.cfg.settings.controllerVibration,
      intensity,
      enableWebVibration: true,
      enableGamepadRumble: this.gamepadConnected,
      eventId,
    });
  }

  private applyExplosionFeedback(exX: number, _exY: number, exZ: number, dist: number): void {
    if (dist >= 14) return;
    const hapticFalloff = Math.max(0.25, 1 - dist / 14);
    const shockId = this.nextHapticId();
    this.explosionShockwave = { id: shockId, intensity: hapticFalloff, until: performance.now() + 420 };
    this.emitHaptic('explosion', hapticFalloff, shockId);

    if (dist < 8.5) {
      const knockFalloff = 1 - dist / 8.5;
      this.pushDamageIndicator(exX, exZ, Math.round(45 * knockFalloff), this.armor > 0);
      const kx = this.playerPos.x - exX;
      const kz = this.playerPos.z - exZ;
      const kLen = Math.max(0.1, Math.hypot(kx, kz));
      this.playerVelX += (kx / kLen) * 8.5 * knockFalloff;
      this.playerVelZ += (kz / kLen) * 8.5 * knockFalloff;
      this.playerVelY = Math.max(this.playerVelY, 4.2 * knockFalloff);
      this.grounded = false;
      this.recoilPitchOffset = Math.min(0.18, this.recoilPitchOffset + 0.08 * knockFalloff);
    }
  }

  private computeIncomingAngle(sourceX: number, sourceZ: number): number {
    const dx = sourceX - this.playerPos.x;
    const dz = sourceZ - this.playerPos.z;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const fwdDot = -dx * sinY - dz * cosY;
    const rightDot = dx * cosY - dz * sinY;
    return Math.atan2(rightDot, fwdDot);
  }

  private pushDamageIndicator(sourceX: number, sourceZ: number, damage: number, armorHit: boolean): number {
    const now = performance.now();
    const id = this.nextHapticId();
    const angle = this.computeIncomingAngle(sourceX, sourceZ);
    this.damageIndicator = { id, angle, until: now + 750 };
    this.damageIndicators.push({
      id,
      sourceX,
      sourceZ,
      damage,
      armorHit,
      createdAt: now,
      until: now + 950,
    });
    if (this.damageIndicators.length > 5) {
      this.damageIndicators.shift();
    }
    return id;
  }

  private pollGamepad(dt: number): void {
    if (typeof navigator.getGamepads !== 'function') return;
    const pads = navigator.getGamepads();
    let pad: Gamepad | null = null;
    for (let i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i]!.connected) {
        pad = pads[i];
        break;
      }
    }
    if (!pad) {
      if (this.gamepadConnected) this.onGamepadDisconnected();
      return;
    }

    if (!this.gamepadConnected) {
      this.gamepadConnected = true;
      this.gamepadName = pad.id || 'Controller';
    }

    const isPressed = (idx: number): boolean => {
      const btn = pad!.buttons[idx];
      return Boolean(btn && (btn.pressed || btn.value > 0.45));
    };
    const justPressed = (idx: number): boolean => isPressed(idx) && !this.prevPadButtons[idx];
    const justReleased = (idx: number): boolean => !isPressed(idx) && Boolean(this.prevPadButtons[idx]);

    // Start / Menu button (9) toggles Pause even when paused
    if (justPressed(9)) {
      this.cfg.onTogglePause?.();
    }
    // B button (1) while paused resumes
    if (this.paused && justPressed(1)) {
      this.cfg.onTogglePause?.();
    }

    if (justPressed(8)) this.cfg.onToggleScoreboard?.(true);
    else if (justReleased(8)) this.cfg.onToggleScoreboard?.(false);

    if (this.paused || this.phase !== 'active') {
      this.gamepadFireDown = false;
      this.gamepadAdsDown = false;
      this.gamepadInteractDown = false;
      this.gamepadMoveVec.x = 0;
      this.gamepadMoveVec.y = 0;
      for (let i = 0; i < pad.buttons.length; i++) {
        this.prevPadButtons[i] = isPressed(i);
      }
      return;
    }

    // Left stick movement with radial deadzone
    const dz = Math.max(0.05, Math.min(0.35, this.cfg.settings.controllerDeadzone));
    const lx = pad.axes[0] ?? 0;
    const ly = -(pad.axes[1] ?? 0);
    const lMag = Math.hypot(lx, ly);
    if (lMag > dz) {
      const norm = Math.min(1, (lMag - dz) / (1 - dz));
      this.gamepadMoveVec.x = (lx / lMag) * norm;
      this.gamepadMoveVec.y = (ly / lMag) * norm;
    } else {
      this.gamepadMoveVec.x = 0;
      this.gamepadMoveVec.y = 0;
      this.gamepadSprintToggle = false;
    }

    // L3 click (10) toggles sprint while pushing stick forward
    if (justPressed(10) && this.gamepadMoveVec.y > 0.25) {
      this.gamepadSprintToggle = !this.gamepadSprintToggle;
      AudioEngine.unlock();
    }
    if (this.gamepadMoveVec.y < 0.2) this.gamepadSprintToggle = false;

    // Right stick look with deadzone + precision curve
    const rx = pad.axes[2] ?? 0;
    const ry = pad.axes[3] ?? 0;
    const rMag = Math.hypot(rx, ry);
    if (rMag > dz && this.alive) {
      const norm = Math.min(1, (rMag - dz) / (1 - dz));
      const curved = Math.pow(norm, 1.65);
      const stats = this.getActiveWeaponStats();
      const adsMult = this.isAdsActive() ? 0.54 : 1.0;
      const scopeMult = stats.optic === 'scope_25x' && this.isAdsActive() ? 0.62 : 1.0;
      const assistSlowdown = this.cfg.settings.controllerAimAssist ? this.computeControllerAimSlowdown(stats.range) : 1.0;
      const rate = 2.65 * this.cfg.settings.controllerSensitivity * adsMult * scopeMult * assistSlowdown;
      const ySign = this.cfg.settings.invertY ? -1 : 1;

      this.yaw -= (rx / rMag) * curved * rate * dt;
      this.pitch = Math.max(-1.42, Math.min(1.42, this.pitch - (ry / rMag) * curved * rate * 0.78 * ySign * dt));
    }

    // Gentle rotational magnetism when strafing/aiming near visible enemy
    if (this.cfg.settings.controllerAimAssist && this.alive && (rMag > dz || lMag > dz || this.isAdsActive())) {
      this.applyControllerAimMagnetism(dt);
    }

    // Triggers: LT (6) ADS, RT (7) Fire
    const ltVal = pad.buttons[6]?.value ?? 0;
    const rtVal = pad.buttons[7]?.value ?? 0;
    this.gamepadAdsDown = ltVal > 0.35;
    const wasFiring = this.gamepadFireDown;
    this.gamepadFireDown = rtVal > 0.35;
    if (this.gamepadFireDown && !wasFiring) AudioEngine.unlock();
    if (!this.gamepadFireDown && wasFiring) this.semiTriggerConsumed = false;

    // Face & Shoulder buttons
    if (justPressed(0)) this.triggerJump(); // A / Cross
    if (justPressed(1)) this.toggleCrouch(); // B / Circle
    this.gamepadInteractDown = isPressed(2); // X / Square hold for loot/exfil
    if (justPressed(2) && !this.interactPrompt) this.triggerReload(); // X / Square tap for reload
    if (justPressed(3)) this.swapWeapon(); // Y / Triangle
    if (justPressed(4)) this.throwGrenade(); // LB
    if (justPressed(5)) this.useArmorPlate(); // RB
    if (justPressed(12)) this.activateUav(); // D-Pad Up

    for (let i = 0; i < pad.buttons.length; i++) {
      this.prevPadButtons[i] = isPressed(i);
    }
  }

  private computeControllerAimSlowdown(maxRange: number): number {
    const combatants = this.getCombatantsSnapshot();
    const map = MAPS[this.cfg.mapId];
    this._scratchEuler.set(this.pitch, this.yaw, 0, 'YXZ');
    this._scratchDir.set(0, 0, -1).applyEuler(this._scratchEuler).normalize();

    let bestDot = 0.992; // ~7.2 deg cone
    for (let i = 0; i < combatants.length; i++) {
      const c = combatants[i];
      if (!c.alive || c.id === this.playerId) continue;
      if (this.cfg.mode !== 'ffa' && c.team === this.playerTeam) continue;
      this._scratchEnemyPos.set(c.x, c.y + (c.stance === 'crouch' ? 0.95 : 1.32), c.z);
      this._scratchMuzzle.subVectors(this._scratchEnemyPos, this.camera.position);
      const dist = this._scratchMuzzle.length();
      if (dist < 1 || dist > maxRange) continue;
      this._scratchMuzzle.multiplyScalar(1 / dist);
      const dot = this._scratchDir.dot(this._scratchMuzzle);
      if (dot > bestDot) {
        const wallDist = raycastMapDistance(
          map,
          this.camera.position.x,
          this.camera.position.y,
          this.camera.position.z,
          this._scratchMuzzle.x,
          this._scratchMuzzle.y,
          this._scratchMuzzle.z,
          dist
        );
        if (wallDist >= dist - 0.5) {
          bestDot = dot;
        }
      }
    }
    return bestDot > 0.9965 ? 0.52 : bestDot > 0.992 ? 0.72 : 1.0;
  }

  private applyControllerAimMagnetism(dt: number): void {
    const combatants = this.getCombatantsSnapshot();
    const map = MAPS[this.cfg.mapId];
    const maxRange = this.getActiveWeaponStats().range;
    this._scratchEuler.set(this.pitch, this.yaw, 0, 'YXZ');
    this._scratchDir.set(0, 0, -1).applyEuler(this._scratchEuler).normalize();

    let targetYaw = 0;
    let targetPitch = 0;
    let bestDot = 0.995; // ~5.7 deg cone
    let found = false;

    for (let i = 0; i < combatants.length; i++) {
      const c = combatants[i];
      if (!c.alive || c.id === this.playerId) continue;
      if (this.cfg.mode !== 'ffa' && c.team === this.playerTeam) continue;
      this._scratchEnemyPos.set(c.x, c.y + (c.stance === 'crouch' ? 0.95 : 1.32), c.z);
      this._scratchMuzzle.subVectors(this._scratchEnemyPos, this.camera.position);
      const dist = this._scratchMuzzle.length();
      if (dist < 1.5 || dist > maxRange) continue;
      this._scratchMuzzle.multiplyScalar(1 / dist);
      const dot = this._scratchDir.dot(this._scratchMuzzle);
      if (dot > bestDot) {
        const wallDist = raycastMapDistance(
          map,
          this.camera.position.x,
          this.camera.position.y,
          this.camera.position.z,
          this._scratchMuzzle.x,
          this._scratchMuzzle.y,
          this._scratchMuzzle.z,
          dist
        );
        if (wallDist >= dist - 0.5) {
          bestDot = dot;
          const dx = this._scratchEnemyPos.x - this.camera.position.x;
          const dy = this._scratchEnemyPos.y - this.camera.position.y;
          const dz = this._scratchEnemyPos.z - this.camera.position.z;
          targetYaw = Math.atan2(-dx, -dz);
          targetPitch = Math.atan2(dy, Math.max(0.1, Math.hypot(dx, dz)));
          found = true;
        }
      }
    }

    if (found) {
      let yawDiff = targetYaw - this.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      const pull = (this.isAdsActive() ? 3.2 : 1.7) * dt;
      this.yaw += yawDiff * Math.min(0.25, pull);
      this.pitch += (targetPitch - this.pitch) * Math.min(0.2, pull * 0.75);
    }
  }

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = typeof gl.fenceSync === 'function' ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      if (sync) {
        const poll = () => {
          if (this.disposed) {
            gl.deleteSync(sync);
            return;
          }
          const status = gl.clientWaitSync(sync, 0, 0);
          if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED || status === gl.WAIT_FAILED) {
            gl.deleteSync(sync);
            this.timerId = window.setTimeout(() => this.loop(), 16);
          } else {
            this.timerId = window.setTimeout(poll, 16);
          }
        };
        this.timerId = window.setTimeout(poll, 16);
      } else {
        this.timerId = window.setTimeout(() => this.loop(), 80);
      }
    } else {
      this.rafId = requestAnimationFrame(() => this.loop());
    }
  }

  private loop(): void {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTickMs) / 1000));
    this.lastTickMs = now;

    this.pollGamepad(dt);

    if (!this.paused) {
      this.stepSimulation(dt);
    }

    this.renderer.render(this.scene, this.camera);
    this.scheduleNextFrame();
  }

  private stepSimulation(dt: number): void {
    const map = MAPS[this.cfg.mapId];
    const stats = this.getActiveWeaponStats();

    if (this.phase === 'active') {
      this.stepPlayerMovement(dt, stats);
      this.stepWeaponLogic(dt, stats);
      this.stepInteractLogic(dt);
    }

    this.stepProjectiles(dt);

    if (this.cfg.connectionMode === 'offline') {
      this.stepOfflineMatch(dt);
    } else {
      this.stateSendAccum += dt;
      if (this.stateSendAccum >= 0.05) {
        this.stateSendAccum = 0;
        this.sendWs({
          type: 'player:state',
          x: this.playerPos.x,
          y: this.playerPos.y,
          z: this.playerPos.z,
          yaw: this.yaw,
          pitch: this.pitch,
          stance: this.stance,
          weaponId: stats.id,
          ads: this.isAdsActive(),
        });
      }
    }

    const combatants = this.getCombatantsSnapshot();
    this.syncOperatorRigs(combatants, dt);
    this.mapScene.updateVisuals(performance.now() / 1000, this.cfg.mode, this.zones, this.lootCrates, this.extraction);

    const targetEyeH = this.stance === 'slide' ? 0.84 : this.crouch ? 1.12 : 1.62;
    this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, targetEyeH, 14, dt);
    this.landingDip = THREE.MathUtils.damp(this.landingDip, 0, 12, dt);

    const moveMag = this.getMovementInputMagnitude();
    if (this.grounded && moveMag > 0.15 && this.slideTimer <= 0) {
      this.headBobPhase += dt * (this.stance === 'sprint' ? 11.5 : 8.0);
    }
    const bobY = this.grounded && this.slideTimer <= 0 ? Math.sin(this.headBobPhase * 2) * 0.022 * moveMag : 0;

    this.camera.position.set(
      this.playerPos.x,
      this.playerPos.y + this.currentEyeHeight - this.landingDip + bobY,
      this.playerPos.z
    );
    this.camera.rotation.set(
      this.pitch + this.recoilPitchOffset,
      this.yaw + this.recoilYawOffset,
      this.cameraRoll,
      'YXZ'
    );

    const baseFov = this.cfg.settings.fov;
    const targetFov = this.isAdsActive()
      ? stats.adsFov
      : this.stance === 'slide'
      ? baseFov + 7
      : this.stance === 'sprint' && moveMag > 0.2
      ? baseFov + 3.5
      : baseFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, stats.adsSpeed, dt);
      this.camera.updateProjectionMatrix();
    }

    const recoilDecay = Math.exp(-9 * dt);
    this.recoilPitchOffset *= recoilDecay;
    this.recoilYawOffset *= recoilDecay;

    this.viewmodel.root.visible = this.alive;
    this.viewmodel.update(
      dt,
      this.isAdsActive(),
      stats.adsSpeed,
      moveMag,
      this.stance === 'sprint' || this.stance === 'slide',
      this.reloading
    );

    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.05) {
      this.hudEmitAccum = 0;
      this.emitHudState(combatants, stats);
    }
  }

  private getMovementInputMagnitude(): number {
    let f = 0;
    let s = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) f += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) f -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) s += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) s -= 1;
    f += this.touchMoveVec.y + this.gamepadMoveVec.y;
    s += this.touchMoveVec.x + this.gamepadMoveVec.x;
    return Math.min(1, Math.hypot(f, s));
  }

  private stepPlayerMovement(dt: number, stats: ComputedWeaponStats): void {
    const map = MAPS[this.cfg.mapId];
    if (!this.alive) {
      if (this.cfg.connectionMode === 'offline') {
        this.respawnIn = Math.max(0, this.respawnIn - dt);
        if (this.respawnIn <= 0) {
          const sp = this.pickSpawn(this.playerTeam);
          this.playerPos.set(sp.x, sp.y, sp.z);
          this.playerVelX = 0;
          this.playerVelZ = 0;
          this.playerVelY = 0;
          this.slideTimer = 0;
          this.crouch = false;
          this.hp = 100;
          this.armor = 50;
          this.alive = true;
          this.refillAmmo();
        }
      }
      return;
    }

    this.slideCooldown = Math.max(0, this.slideCooldown - dt);
    this.coyoteTimer = this.grounded ? 0.12 : Math.max(0, this.coyoteTimer - dt);
    this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);

    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.executeJump();
    }

    let forwardIn = 0;
    let strafeIn = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forwardIn += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forwardIn -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafeIn += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafeIn -= 1;

    forwardIn += this.touchMoveVec.y + this.gamepadMoveVec.y;
    strafeIn += this.touchMoveVec.x + this.gamepadMoveVec.x;

    const len = Math.hypot(forwardIn, strafeIn);
    if (len > 1) {
      forwardIn /= len;
      strafeIn /= len;
    }

    const wantSprint =
      (this.keys.has('ShiftLeft') ||
        this.keys.has('ShiftRight') ||
        this.touchMoveVec.y > 0.85 ||
        (this.gamepadSprintToggle && this.gamepadMoveVec.y > 0.35)) &&
      forwardIn > 0.3 &&
      !this.isAdsActive() &&
      !this.crouch &&
      this.slideTimer <= 0;

    if (this.slideTimer > 0) {
      this.slideTimer -= dt;
      this.stance = 'slide';
      const slideDrag = Math.exp(-2.8 * dt);
      this.playerVelX *= slideDrag;
      this.playerVelZ *= slideDrag;
      if (this.slideTimer <= 0) {
        this.stance = 'crouch';
      }
    } else {
      this.stance = this.crouch ? 'crouch' : wantSprint ? 'sprint' : 'stand';
      const maxSpeed =
        (this.stance === 'sprint' ? 7.6 : this.stance === 'crouch' ? 3.1 : this.isAdsActive() ? 3.5 : 5.45) *
        stats.moveSpeedMult;

      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
      const targetVx = (-sinY * forwardIn + cosY * strafeIn) * maxSpeed;
      const targetVz = (-cosY * forwardIn - sinY * strafeIn) * maxSpeed;

      if (this.grounded) {
        const hasInput = len > 0.05;
        const accel = hasInput ? 14.5 : 11.5;
        const alpha = 1 - Math.exp(-accel * dt);
        this.playerVelX += (targetVx - this.playerVelX) * alpha;
        this.playerVelZ += (targetVz - this.playerVelZ) * alpha;
      } else {
        // Reduced air-control preserves jump momentum while permitting subtle mid-air steering
        const airAlpha = 1 - Math.exp(-3.4 * dt);
        this.playerVelX += (targetVx - this.playerVelX) * airAlpha;
        this.playerVelZ += (targetVz - this.playerVelZ) * airAlpha;
      }
    }

    // Subtle tactical strafe / slide roll
    const targetRoll = this.stance === 'slide' ? -0.055 : -strafeIn * 0.018;
    this.cameraRoll = THREE.MathUtils.damp(this.cameraRoll, targetRoll, 11, dt);

    const prevX = this.playerPos.x;
    const prevZ = this.playerPos.z;
    const pos: Vec3 = {
      x: this.playerPos.x + this.playerVelX * dt,
      y: this.playerPos.y,
      z: this.playerPos.z + this.playerVelZ * dt,
    };
    const bodyHeight = this.stance === 'slide' ? 0.92 : this.crouch ? 1.2 : 1.78;
    resolveHorizontalCollision(map, pos, bodyHeight);

    // Damp velocity along blocked wall normals
    if (dt > 0.0001) {
      const actualVx = (pos.x - prevX) / dt;
      const actualVz = (pos.z - prevZ) / dt;
      if (Math.abs(actualVx) < Math.abs(this.playerVelX) * 0.35) this.playerVelX = actualVx;
      if (Math.abs(actualVz) < Math.abs(this.playerVelZ) * 0.35) this.playerVelZ = actualVz;
    }

    const wasGrounded = this.grounded;
    const preLandVelY = this.playerVelY;
    this.playerVelY -= 18.8 * dt;
    pos.y += this.playerVelY * dt;
    const ground = getGroundHeightAt(map, pos.x, pos.z, pos.y);
    if (pos.y <= ground) {
      pos.y = ground;
      if (!wasGrounded && preLandVelY < -3.2) {
        this.landingDip = Math.min(0.18, Math.abs(preLandVelY) * 0.016);
        AudioEngine.playFootstep(true);
        this.emitHaptic('land');
      }
      this.playerVelY = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    this.playerPos.set(pos.x, pos.y, pos.z);

    if (this.grounded && len > 0.2 && this.slideTimer <= 0) {
      this.stepAccum += dt * (this.stance === 'sprint' ? 2.8 : 1.9);
      if (this.stepAccum >= 1) {
        this.stepAccum = 0;
        AudioEngine.playFootstep(this.stance === 'sprint');
      }
    }
  }

  private stepWeaponLogic(dt: number, stats: ComputedWeaponStats): void {
    if (!this.alive) return;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    if (this.reloading) {
      this.reloadElapsed += dt;
      if (this.reloadElapsed >= stats.reloadTime) {
        const ammo = this.ammoState[this.activeSlot];
        const need = stats.magSize - ammo.mag;
        const load = Math.min(need, ammo.reserve);
        ammo.mag += load;
        ammo.reserve -= load;
        this.reloading = false;
        this.reloadElapsed = 0;
        AudioEngine.playReloadClick('end');
      }
      return;
    }

    const firingInput = this.mouseFireDown || this.touchFireDown || this.gamepadFireDown;
    if (!firingInput) return;
    if (stats.fireMode === 'SEMI' && this.semiTriggerConsumed) return;
    if (this.fireCooldown > 0) return;

    const ammo = this.ammoState[this.activeSlot];
    if (ammo.mag <= 0) {
      this.semiTriggerConsumed = true;
      AudioEngine.playUiTone('empty');
      this.triggerReload();
      return;
    }

    if (stats.fireMode === 'SEMI') this.semiTriggerConsumed = true;
    ammo.mag -= 1;
    this.fireCooldown = 60 / stats.rpm;

    this.firePlayerShot(stats);
  }

  private firePlayerShot(stats: ComputedWeaponStats): void {
    const map = MAPS[this.cfg.mapId];
    const moving = this.getMovementInputMagnitude() > 0.15;
    const spread = this.isAdsActive()
      ? stats.adsSpread
      : moving
      ? stats.moveSpread
      : stats.baseSpread;

    this._scratchEuler.set(this.pitch + this.recoilPitchOffset, this.yaw + this.recoilYawOffset, 0, 'YXZ');
    const forward = this._scratchDir.set(0, 0, -1).applyEuler(this._scratchEuler);
    forward.x += (Math.random() - 0.5) * spread * 2;
    forward.y += (Math.random() - 0.5) * spread * 2;
    forward.z += (Math.random() - 0.5) * spread * 2;
    forward.normalize();

    const origin = this._scratchOrigin.copy(this.camera.position);
    this.viewmodel.triggerShot(stats.suppressed);
    AudioEngine.playGunshot(stats.id, stats.suppressed, 0);
    this.emitHaptic(stats.id === 'msr7' ? 'fire_heavy' : 'fire');

    this.recoilPitchOffset = Math.min(0.18, this.recoilPitchOffset + stats.recoilVertical);
    this.recoilYawOffset += (Math.random() - 0.5) * stats.recoilHorizontal;

    const wallDist = raycastMapDistance(map, origin.x, origin.y, origin.z, forward.x, forward.y, forward.z, stats.range);

    const enemyMeshes: THREE.Object3D[] = [];
    const combatants = this.getCombatantsSnapshot();
    for (const c of combatants) {
      if (!c.alive || c.id === this.playerId) continue;
      if (this.cfg.mode !== 'ffa' && c.team === this.playerTeam) continue;
      const rig = this.operatorRigs.get(c.id);
      if (rig) enemyMeshes.push(...rig.hitMeshes);
    }

    this.raycaster.set(origin, forward);
    this.raycaster.far = wallDist;
    const hits = this.raycaster.intersectObjects(enemyMeshes, false);

    let tracerLen = wallDist;
    if (hits.length > 0) {
      const hit = hits[0];
      tracerLen = hit.distance;
      const targetId = String(hit.object.userData.combatantId);
      const isHead = hit.object.userData.hitbox === 'head';
      const falloff = hit.distance > stats.range * 0.55 ? 0.78 : 1.0;
      const dmg = Math.round(stats.damage * falloff * (isHead ? stats.headshotMult : 1));

      this.operatorRigs.get(targetId)?.flashHit();

      if (this.cfg.connectionMode === 'offline') {
        const bot = this.offlineBots.find((b) => b.id === targetId);
        if (bot && bot.alive) {
          const killed = this.applyOfflineDamage(this.playerId, this.cfg.playerName, this.playerTeam, bot, dmg, isHead, stats.name, stats.id);
          const kind = killed ? 'kill' : isHead ? 'head' : 'body';
          this.hitmarker = { kind, until: performance.now() + 210 };
          AudioEngine.playHitmarker(kind);
        }
      } else {
        this.sendWs({
          type: 'combat:hit',
          targetId,
          headshot: isHead,
          weaponId: stats.id,
          distance: hit.distance,
          damage: dmg,
        });
      }
    }

    const muzzleStart = origin.clone().addScaledVector(forward, 0.75).add(new THREE.Vector3(0, -0.08, 0));
    this.spawnTracer(muzzleStart, forward, stats.suppressed, tracerLen);

    if (this.cfg.connectionMode === 'online') {
      this.sendWs({
        type: 'combat:fire',
        weaponId: stats.id,
        suppressed: stats.suppressed,
        ox: muzzleStart.x,
        oy: muzzleStart.y,
        oz: muzzleStart.z,
        dx: forward.x,
        dy: forward.y,
        dz: forward.z,
      });
    }
  }

  private spawnTracer(origin: THREE.Vector3, dir: THREE.Vector3, suppressed: boolean, length = 32): void {
    const segLen = Math.min(28, Math.max(2, length));
    const geo = new THREE.CylinderGeometry(0.012, 0.012, segLen, 4);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: suppressed ? 0x7dd3fc : 0xfbbf24,
      transparent: true,
      opacity: suppressed ? 0.35 : 0.75,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin).addScaledVector(dir, segLen * 0.5);
    mesh.lookAt(origin.clone().addScaledVector(dir, segLen));
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.055 });
  }

  private stepProjectiles(dt: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        (t.mesh.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      }
    }

    const map = MAPS[this.cfg.mapId];
    for (let i = this.activeGrenades.length - 1; i >= 0; i--) {
      const g = this.activeGrenades[i];
      g.fuse -= dt;
      g.vel.y -= 18 * dt;
      g.pos.addScaledVector(g.vel, dt);
      const bounced = resolveSphereCollision(map, g.pos, g.vel, 0.12, 0.45, 0.76);
      if (bounced) {
        g.mesh.rotation.x += g.vel.z * 0.25;
        g.mesh.rotation.z -= g.vel.x * 0.25;
      } else {
        g.mesh.rotation.x += dt * 7;
        g.mesh.rotation.y += dt * 5;
      }
      g.mesh.position.copy(g.pos);

      if (g.fuse <= 0) {
        this.detonateGrenade(g);
        this.scene.remove(g.mesh);
        g.mesh.geometry.dispose();
        (g.mesh.material as THREE.Material).dispose();
        this.activeGrenades.splice(i, 1);
      }
    }

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.life -= dt;
      ex.mesh.scale.addScalar(dt * 18);
      (ex.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, ex.life * 2.2);
      if (ex.life <= 0) {
        this.scene.remove(ex.mesh);
        ex.mesh.geometry.dispose();
        (ex.mesh.material as THREE.Material).dispose();
        this.explosions.splice(i, 1);
      }
    }
  }

  private detonateGrenade(g: ActiveGrenade): void {
    const dist = this.playerPos.distanceTo(g.pos);
    AudioEngine.playExplosion(dist);
    this.applyExplosionFeedback(g.pos.x, g.pos.y, g.pos.z, dist);

    const blast = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.8 })
    );
    blast.position.copy(g.pos);
    this.scene.add(blast);
    this.explosions.push({ mesh: blast, life: 0.35 });

    if (this.cfg.connectionMode === 'online') {
      this.sendWs({ type: 'combat:grenade', x: g.pos.x, y: g.pos.y, z: g.pos.z });
      return;
    }

    for (const bot of this.offlineBots) {
      if (!bot.alive) continue;
      const d = Math.hypot(bot.x - g.pos.x, bot.y - g.pos.y, bot.z - g.pos.z);
      if (d < 6.5) {
        const dmg = Math.round(115 * (1 - d / 6.5));
        if (dmg > 5) {
          this.applyOfflineDamage(this.playerId, this.cfg.playerName, this.playerTeam, bot, dmg, false, 'M67 Frag', 'frag');
        }
      }
    }
  }

  private stepInteractLogic(dt: number): void {
    if (this.cfg.mode !== 'extraction' || !this.alive) {
      this.interactPrompt = null;
      this.interactProgress = 0;
      return;
    }
    const map = MAPS[this.cfg.mapId];
    const holdingF = this.keys.has('KeyF') || this.touchInteractDown || this.gamepadInteractDown;
    const keyLabel = this.gamepadConnected ? 'X' : 'F';

    let nearestCrate: LootCrateState | null = null;
    let bestDist = 3.2;
    for (const c of this.lootCrates) {
      if (c.opened) continue;
      const d = Math.hypot(this.playerPos.x - c.x, this.playerPos.z - c.z);
      if (d < bestDist) {
        bestDist = d;
        nearestCrate = c;
      }
    }

    if (nearestCrate) {
      this.interactPrompt = `Hold [${keyLabel}] Loot ${nearestCrate.label} (+$${nearestCrate.value.toLocaleString()})`;
      if (holdingF) {
        this.interactProgress = Math.min(1, this.interactProgress + dt * 1.15);
        if (this.interactProgress >= 1) {
          this.interactProgress = 0;
          AudioEngine.playUiTone('loot');
          this.emitHaptic('ui');
          if (this.cfg.connectionMode === 'offline') {
            nearestCrate.opened = true;
            this.lootValue += nearestCrate.value;
            this.playerScore += 250;
          } else {
            this.sendWs({ type: 'objective:loot', crateId: nearestCrate.id });
          }
        }
      } else {
        this.interactProgress = 0;
      }
      return;
    }

    const ex = map.extractionZone;
    const distEx = Math.hypot(this.playerPos.x - ex.x, this.playerPos.z - ex.z);
    if (distEx <= ex.radius && !this.extraction.active && !this.extraction.extracted) {
      this.interactPrompt = `Hold [${keyLabel}] Call Extraction Chopper (15s Defense)`;
      if (holdingF) {
        this.interactProgress = Math.min(1, this.interactProgress + dt * 0.9);
        if (this.interactProgress >= 1) {
          this.interactProgress = 0;
          AudioEngine.playUiTone('exfil');
          if (this.cfg.connectionMode === 'offline') {
            this.extraction.active = true;
            this.extraction.triggeredBy = this.cfg.playerName;
            this.extraction.countdown = 15;
          } else {
            this.sendWs({ type: 'objective:extract_start' });
          }
        }
      } else {
        this.interactProgress = 0;
      }
      return;
    }

    this.interactPrompt = null;
    this.interactProgress = 0;
  }

  private recordWeaponKill(weaponId: WeaponId, headshot: boolean): void {
    const baseKills = this.cfg.weaponProgress[weaponId]?.kills ?? 0;
    const prevSession = this.weaponKills[weaponId] ?? 0;
    const prevLevel = getWeaponMasteryInfo(baseKills + prevSession).level;

    const nextSession = prevSession + 1;
    this.weaponKills[weaponId] = nextSession;
    if (headshot) {
      this.weaponHeadshots[weaponId] = (this.weaponHeadshots[weaponId] ?? 0) + 1;
    }

    const nextLevel = getWeaponMasteryInfo(baseKills + nextSession).level;
    if (nextLevel > prevLevel) {
      const milestone = MASTERY_MILESTONES.find((m) => m.level === nextLevel);
      this.masteryBanner = {
        weaponName: WEAPONS[weaponId].name,
        level: nextLevel,
        unlockLabel: milestone?.label ?? `Mastery Level ${nextLevel}`,
        until: performance.now() + 4000,
      };
      AudioEngine.playUiTone('exfil');
    }
  }

  private applyOfflineDamage(
    attackerId: string,
    attackerName: string,
    attackerTeam: TeamId,
    target: BotAgentState | 'player',
    rawDamage: number,
    headshot: boolean,
    weaponName: string,
    weaponId?: KillfeedWeaponKind
  ): boolean {
    if (this.phase !== 'active') return false;

    const attackerIsBot = attackerId !== this.playerId;
    let remaining = Math.max(1, Math.round(rawDamage));
    if (target === 'player') {
      if (!this.alive) return false;
      if (this.cfg.mode !== 'ffa' && attackerTeam === this.playerTeam) return false;
      if (this.armor > 0) {
        const abs = Math.min(this.armor, Math.round(remaining * 0.55));
        this.armor -= abs;
        remaining -= abs;
      }
      this.hp = Math.max(0, this.hp - remaining);
      this.emitHaptic('damage', 1.0, this.damageIndicator?.id);
      if (this.hp <= 0) {
        this.alive = false;
        this.playerDeaths += 1;
        this.streakKills = 0;
        this.respawnIn = this.cfg.mode === 'extraction' ? 8.0 : 3.5;
        this.emitHaptic('explosion', 0.85);
        this.pushKillfeed({
          killerId: attackerId,
          killerName: attackerName,
          killerTeam: attackerTeam,
          killerIsBot: attackerIsBot,
          victimId: this.playerId,
          victimName: this.cfg.playerName,
          victimTeam: this.playerTeam,
          victimIsBot: false,
          weaponId,
          weaponName,
          headshot,
        });
        if (this.cfg.mode === 'tdm') {
          if (attackerTeam === 'alpha') this.alphaScore += 1;
          else if (attackerTeam === 'bravo') this.bravoScore += 1;
        }
        return true;
      }
      return false;
    }

    if (!target.alive) return false;
    if (this.cfg.mode !== 'ffa' && attackerTeam === target.team) return false;
    if (target.armor > 0) {
      const abs = Math.min(target.armor, Math.round(remaining * 0.55));
      target.armor -= abs;
      remaining -= abs;
    }
    target.hp = Math.max(0, target.hp - remaining);
    if (target.hp <= 0) {
      target.alive = false;
      target.deaths += 1;
      target.respawnTimer = this.cfg.mode === 'extraction' ? 14.0 : 4.0;
      if (attackerId === this.playerId) {
        this.playerKills += 1;
        this.playerScore += 100;
        this.streakKills += 1;
        this.emitHaptic('kill');
        if (this.cfg.mode === 'extraction') this.lootValue += 1500;
        if (weaponId && weaponId !== 'frag') this.recordWeaponKill(weaponId, headshot);
      } else {
        const botAtt = this.offlineBots.find((b) => b.id === attackerId);
        if (botAtt) {
          botAtt.kills += 1;
          botAtt.score += 100;
        }
      }
      if (this.cfg.mode === 'tdm') {
        if (attackerTeam === 'alpha') this.alphaScore += 1;
        else if (attackerTeam === 'bravo') this.bravoScore += 1;
      }
      this.pushKillfeed({
        killerId: attackerId,
        killerName: attackerName,
        killerTeam: attackerTeam,
        killerIsBot: attackerIsBot,
        victimId: target.id,
        victimName: target.name,
        victimTeam: target.team,
        victimIsBot: true,
        weaponId,
        weaponName,
        headshot,
      });
      this.checkWinConditions(attackerName);
      return true;
    }
    return false;
  }

  private pushKillfeed(entry: Omit<KillfeedEntry, 'id' | 'timestamp'>): void {
    this.killfeed.unshift({
      id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...entry,
      timestamp: Date.now(),
    });
    if (this.killfeed.length > 6) this.killfeed.length = 6;
  }

  private checkWinConditions(latestKillerName?: string): void {
    if (this.phase !== 'active') return;
    if (this.cfg.mode === 'tdm') {
      if (this.alphaScore >= this.scoreLimit) {
        this.phase = 'ended';
        this.winnerTeam = 'alpha';
      } else if (this.bravoScore >= this.scoreLimit) {
        this.phase = 'ended';
        this.winnerTeam = 'bravo';
      }
    } else if (this.cfg.mode === 'ffa') {
      if (this.playerKills >= this.scoreLimit) {
        this.phase = 'ended';
        this.winnerTeam = 'neutral';
        this.winnerName = this.cfg.playerName;
      } else {
        const topBot = this.offlineBots.find((b) => b.kills >= this.scoreLimit);
        if (topBot) {
          this.phase = 'ended';
          this.winnerTeam = 'neutral';
          this.winnerName = latestKillerName ?? topBot.name;
        }
      }
    }
  }

  private stepOfflineMatch(dt: number): void {
    if (this.phase !== 'active') return;
    const map = MAPS[this.cfg.mapId];
    this.timeRemaining = Math.max(0, this.timeRemaining - dt);

    const allNow = this.getCombatantsSnapshot();
    for (const bot of this.offlineBots) {
      if (!bot.alive) {
        bot.respawnTimer -= dt;
        if (bot.respawnTimer <= 0) {
          const sp = this.pickSpawn(bot.team);
          bot.alive = true;
          bot.hp = 100;
          bot.armor = 50;
          bot.x = sp.x;
          bot.y = sp.y;
          bot.z = sp.z;
          bot.ammoInMag = WEAPONS[bot.weaponId].magSize;
        }
        continue;
      }

      const shot = stepBotAgent(bot, dt, map, this.cfg.mode, allNow, this.zones);
      if (shot) {
        this.operatorRigs.get(bot.id)?.triggerFireKick();
        const origin = new THREE.Vector3(shot.ox, shot.oy, shot.oz);
        const dir = new THREE.Vector3(shot.dx, shot.dy, shot.dz).normalize();
        this.spawnTracer(origin, dir, false, 24);
        AudioEngine.playGunshot(shot.weaponId, false, this.playerPos.distanceTo(origin));
        if (shot.hit && shot.damage > 0) {
          if (shot.targetId === this.playerId) {
            this.pushDamageIndicator(bot.x, bot.z, shot.damage, this.armor > 0);
            this.applyOfflineDamage(
              bot.id,
              bot.name,
              bot.team,
              'player',
              shot.damage,
              shot.headshot,
              WEAPONS[shot.weaponId].name,
              shot.weaponId
            );
          } else {
            const targetBot = this.offlineBots.find((b) => b.id === shot.targetId);
            if (targetBot) {
              this.applyOfflineDamage(
                bot.id,
                bot.name,
                bot.team,
                targetBot,
                shot.damage,
                shot.headshot,
                WEAPONS[shot.weaponId].name,
                shot.weaponId
              );
            }
          }
        }
      }
    }

    if (this.cfg.mode === 'domination') {
      this.domTickAccum += dt;
      const combatants = this.getCombatantsSnapshot();
      for (const zState of this.zones) {
        const zDef = map.captureZones.find((c) => c.id === zState.id);
        if (!zDef) continue;
        let alphaInside = 0;
        let bravoInside = 0;
        for (const c of combatants) {
          if (!c.alive) continue;
          if (Math.hypot(c.x - zDef.x, c.z - zDef.z) <= zDef.radius) {
            if (c.team === 'alpha') alphaInside += 1;
            else if (c.team === 'bravo') bravoInside += 1;
          }
        }
        zState.contested = alphaInside > 0 && bravoInside > 0;
        if (!zState.contested) {
          if (alphaInside > 0) {
            zState.capturingTeam = 'alpha';
            zState.progress = Math.min(100, zState.progress + alphaInside * 16 * dt);
            if (zState.progress >= 100) zState.owner = 'alpha';
          } else if (bravoInside > 0) {
            zState.capturingTeam = 'bravo';
            zState.progress = Math.max(-100, zState.progress - bravoInside * 16 * dt);
            if (zState.progress <= -100) zState.owner = 'bravo';
          } else {
            zState.capturingTeam = 'neutral';
          }
        }
      }
      if (this.domTickAccum >= 1.0) {
        this.domTickAccum -= 1.0;
        for (const z of this.zones) {
          if (z.owner === 'alpha') this.alphaScore += 1;
          else if (z.owner === 'bravo') this.bravoScore += 1;
        }
        if (this.alphaScore >= this.scoreLimit || this.bravoScore >= this.scoreLimit) {
          this.phase = 'ended';
          this.winnerTeam = this.alphaScore >= this.bravoScore ? 'alpha' : 'bravo';
        }
      }
    }

    if (this.cfg.mode === 'extraction' && this.extraction.active && !this.extraction.extracted) {
      this.extraction.countdown = Math.max(0, this.extraction.countdown - dt);
      if (this.extraction.countdown <= 0) {
        this.extraction.extracted = true;
        this.extraction.active = false;
        const ex = map.extractionZone;
        if (this.alive && Math.hypot(this.playerPos.x - ex.x, this.playerPos.z - ex.z) <= ex.radius + 1.5) {
          this.extractedValue += Math.max(4500, this.lootValue);
          this.lootValue = 0;
          this.winnerTeam = 'alpha';
        } else {
          this.winnerTeam = 'bravo';
        }
        this.phase = 'ended';
        AudioEngine.playUiTone('exfil');
      }
    }

    if (this.timeRemaining <= 0 && this.phase === 'active') {
      this.phase = 'ended';
      if (this.cfg.mode === 'ffa') {
        const sorted = this.getCombatantsSnapshot().sort((a, b) => b.kills - a.kills);
        this.winnerTeam = 'neutral';
        this.winnerName = sorted[0]?.name ?? this.cfg.playerName;
      } else if (this.cfg.mode === 'extraction') {
        this.winnerTeam = this.extraction.extracted ? 'alpha' : 'bravo';
      } else {
        this.winnerTeam =
          this.alphaScore > this.bravoScore ? 'alpha' : this.bravoScore > this.alphaScore ? 'bravo' : 'draw';
      }
    }
  }

  private getCombatantsSnapshot(): CombatantSnapshot[] {
    if (this.cfg.connectionMode === 'online' && this.remoteSnapshots.length > 0) {
      return this.remoteSnapshots;
    }
    const stats = this.getActiveWeaponStats();
    const localSnap: CombatantSnapshot = {
      id: this.playerId,
      name: this.cfg.playerName,
      isBot: false,
      team: this.playerTeam,
      x: this.playerPos.x,
      y: this.playerPos.y,
      z: this.playerPos.z,
      yaw: this.yaw,
      pitch: this.pitch,
      hp: this.hp,
      maxHp: this.maxHp,
      armor: this.armor,
      maxArmor: this.maxArmor,
      alive: this.alive,
      stance: this.stance,
      weaponId: stats.id,
      ads: this.isAdsActive(),
      kills: this.playerKills,
      deaths: this.playerDeaths,
      assists: 0,
      score: this.playerScore,
      lootValue: this.lootValue,
      uavRevealUntil: 0,
    };
    return [localSnap, ...this.offlineBots];
  }

  private syncOperatorRigs(combatants: CombatantSnapshot[], dt: number): void {
    const activeIds = new Set<string>();
    for (const c of combatants) {
      if (c.id === this.playerId) continue;
      activeIds.add(c.id);
      let rig = this.operatorRigs.get(c.id);
      if (!rig) {
        rig = new OperatorRig(c.id);
        this.scene.add(rig.root);
        this.operatorRigs.set(c.id, rig);
      }
      rig.updateFromSnapshot(c, this.playerTeam, this.cfg.mode, dt);
    }

    for (const [id, rig] of this.operatorRigs.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(rig.root);
        rig.dispose();
        this.operatorRigs.delete(id);
      }
    }
  }

  private emitHudState(combatants: CombatantSnapshot[], stats: ComputedWeaponStats): void {
    const moving = this.getMovementInputMagnitude() > 0.15;
    const ammo = this.ammoState[this.activeSlot];
    const now = performance.now();

    if (this.hitmarker && this.hitmarker.until < now) this.hitmarker = null;
    if (this.damageIndicator && this.damageIndicator.until < now) this.damageIndicator = null;
    if (this.explosionShockwave && this.explosionShockwave.until < now) this.explosionShockwave = null;
    if (this.masteryBanner && this.masteryBanner.until < now) this.masteryBanner = null;

    for (let i = this.damageIndicators.length - 1; i >= 0; i--) {
      if (this.damageIndicators[i].until < now) {
        this.damageIndicators.splice(i, 1);
      }
    }
    const mappedDamageIndicators: DamageIndicatorEntry[] = this.damageIndicators.map((d) => ({
      id: d.id,
      angle: this.computeIncomingAngle(d.sourceX, d.sourceZ),
      damage: d.damage,
      armorHit: d.armorHit,
      createdAt: d.createdAt,
      until: d.until,
    }));
    if (this.damageIndicator && mappedDamageIndicators.length > 0) {
      const latest = mappedDamageIndicators[mappedDamageIndicators.length - 1];
      this.damageIndicator = { id: latest.id, angle: latest.angle, until: this.damageIndicator.until };
    }

    this.onHudUpdate({
      mode: this.cfg.mode,
      mapId: this.cfg.mapId,
      connectionMode: this.cfg.connectionMode,
      roomCode: this.roomCode,
      phase: this.phase,
      timeRemaining: this.timeRemaining,
      alphaScore: this.alphaScore,
      bravoScore: this.bravoScore,
      scoreLimit: this.scoreLimit,
      player: {
        id: this.playerId,
        name: this.cfg.playerName,
        team: this.playerTeam,
        x: this.playerPos.x,
        y: this.playerPos.y,
        z: this.playerPos.z,
        yaw: this.yaw,
        hp: this.hp,
        maxHp: this.maxHp,
        armor: this.armor,
        maxArmor: this.maxArmor,
        alive: this.alive,
        respawnIn: this.respawnIn,
        stance: this.stance,
        ads: this.isAdsActive(),
        reloading: this.reloading,
        reloadProgress: this.reloading ? Math.min(1, this.reloadElapsed / stats.reloadTime) : 0,
        activeSlot: this.activeSlot,
        weaponId: stats.id,
        weaponName: stats.name,
        fireMode: stats.fireMode,
        ammoInMag: ammo.mag,
        magSize: stats.magSize,
        reserveAmmo: ammo.reserve,
        armorPlates: this.armorPlates,
        grenades: this.grenades,
        streakKills: this.streakKills,
        uavActiveUntil: this.uavActiveUntil,
        spread: this.isAdsActive() ? stats.adsSpread : moving ? stats.moveSpread : stats.baseSpread,
        optic: stats.optic,
        lootValue: this.lootValue,
        extractedValue: this.extractedValue,
        kills: this.playerKills,
        deaths: this.playerDeaths,
        weaponKills: { ...this.weaponKills },
        weaponHeadshots: { ...this.weaponHeadshots },
      },
      masteryBanner: this.masteryBanner,
      interactPrompt: this.interactPrompt,
      interactProgress: this.interactProgress,
      hitmarker: this.hitmarker,
      damageIndicator: this.damageIndicator,
      damageIndicators: mappedDamageIndicators,
      explosionShockwave: this.explosionShockwave,
      zones: this.zones,
      lootCrates: this.lootCrates,
      extraction: this.extraction,
      combatants,
      killfeed: this.killfeed,
      winnerTeam: this.winnerTeam,
      winnerName: this.winnerName,
      pointerLocked: this.pointerLocked,
      gamepadConnected: this.gamepadConnected,
      gamepadName: this.gamepadName,
      hapticsEnabled: this.cfg.settings.controllerVibration,
      pingMs: this.pingMs,
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelHapticFeedback();
    cancelAnimationFrame(this.rafId);
    clearTimeout(this.timerId);
    clearInterval(this.pingIntervalId);
    this.resizeObserver.disconnect();

    if (this.ws) {
      this.sendWs({ type: 'room:leave' });
      this.ws.close();
      this.ws = null;
    }

    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    window.removeEventListener('gamepadconnected', this.onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected);

    for (const rig of this.operatorRigs.values()) rig.dispose();
    this.operatorRigs.clear();
    this.viewmodel.dispose();
    this.mapScene.dispose();
    this.textures.dispose();
    this.envTarget.dispose();
    this.pmremGenerator.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
