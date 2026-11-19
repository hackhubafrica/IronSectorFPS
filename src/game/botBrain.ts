import { getGroundHeightAt, raycastMapDistance, resolveHorizontalCollision } from './collision.ts';
import type { CombatantSnapshot, DominationZoneState, GameMode, MapDefinition, Vec3, WeaponId } from './types.ts';
import { WEAPONS } from './weapons.ts';

export interface BotAgentState extends CombatantSnapshot {
  vx: number;
  vz: number;
  vy: number;
  targetWaypoint: Vec3;
  strafeDir: number;
  strafeTimer: number;
  fireCooldown: number;
  burstLeft: number;
  burstPause: number;
  ammoInMag: number;
  reloadTimer: number;
  respawnTimer: number;
  lastKnownEnemyId: string | null;
}

export interface BotShotEvent {
  botId: string;
  targetId: string;
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
  hit: boolean;
  headshot: boolean;
  damage: number;
  weaponId: WeaponId;
}

export const BOT_CALLSIGNS = [
  'Viper-01',
  'Nomad-04',
  'Kestrel-7',
  'Specter-2',
  'Raptor-9',
  'Warden-5',
  'Reaper-3',
  'Falcon-8',
  'Ghost-6',
  'Talon-11',
];

export const BOT_WEAPONS: WeaponId[] = ['m4a1', 'vector9', 'm4a1', 'msr7'];

export function createBotAgent(
  id: string,
  name: string,
  team: CombatantSnapshot['team'],
  spawn: Vec3,
  weaponId: WeaponId
): BotAgentState {
  const spec = WEAPONS[weaponId];
  return {
    id,
    name,
    isBot: true,
    team,
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    yaw: Math.random() * Math.PI * 2,
    pitch: 0,
    hp: 100,
    maxHp: 100,
    armor: 50,
    maxArmor: 100,
    alive: true,
    stance: 'stand',
    weaponId,
    ads: false,
    kills: 0,
    deaths: 0,
    assists: 0,
    score: 0,
    lootValue: 0,
    uavRevealUntil: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    targetWaypoint: { ...spawn },
    strafeDir: Math.random() > 0.5 ? 1 : -1,
    strafeTimer: 1.5,
    fireCooldown: 0.4 + Math.random() * 0.5,
    burstLeft: 4,
    burstPause: 0,
    ammoInMag: spec.magSize,
    reloadTimer: 0,
    respawnTimer: 0,
    lastKnownEnemyId: null,
  };
}

function pickNextWaypoint(
  bot: BotAgentState,
  map: MapDefinition,
  mode: GameMode,
  zones: DominationZoneState[]
): Vec3 {
  if (mode === 'domination' && zones.length > 0 && Math.random() < 0.72) {
    const contestedOrUnowned = zones.filter((z) => z.owner !== bot.team);
    const pool = contestedOrUnowned.length > 0 ? contestedOrUnowned : zones;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const def = map.captureZones.find((c) => c.id === chosen.id);
    if (def) {
      return { x: def.x + (Math.random() - 0.5) * 4, y: def.y, z: def.z + (Math.random() - 0.5) * 4 };
    }
  }

  if (mode === 'extraction' && Math.random() < 0.45 && map.lootCrates.length > 0) {
    const crate = map.lootCrates[Math.floor(Math.random() * map.lootCrates.length)];
    return { x: crate.x + (Math.random() - 0.5) * 6, y: crate.y, z: crate.z + (Math.random() - 0.5) * 6 };
  }

  const wp = map.waypoints[Math.floor(Math.random() * map.waypoints.length)];
  return { x: wp.x + (Math.random() - 0.5) * 4, y: wp.y, z: wp.z + (Math.random() - 0.5) * 4 };
}

export function stepBotAgent(
  bot: BotAgentState,
  dt: number,
  map: MapDefinition,
  mode: GameMode,
  allCombatants: CombatantSnapshot[],
  zones: DominationZoneState[]
): BotShotEvent | null {
  if (!bot.alive) return null;

  if (bot.reloadTimer > 0) {
    bot.reloadTimer -= dt;
    if (bot.reloadTimer <= 0) bot.ammoInMag = WEAPONS[bot.weaponId].magSize;
  }

  bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
  bot.burstPause = Math.max(0, bot.burstPause - dt);
  bot.strafeTimer -= dt;
  if (bot.strafeTimer <= 0) {
    bot.strafeDir = Math.random() > 0.5 ? 1 : -1;
    bot.strafeTimer = 0.8 + Math.random() * 1.4;
  }

  let targetEnemy: CombatantSnapshot | null = null;
  let bestDist = 68;
  const eyeY = bot.y + 1.55;

  for (let i = 0; i < allCombatants.length; i++) {
    const other = allCombatants[i];
    if (!other.alive || other.id === bot.id) continue;
    if (mode !== 'ffa' && other.team === bot.team) continue;

    const dx = other.x - bot.x;
    const dy = (other.y + 1.35) - eyeY;
    const dz = other.z - bot.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > bestDist || dist < 0.5) continue;

    const wallDist = raycastMapDistance(map, bot.x, eyeY, bot.z, dx / dist, dy / dist, dz / dist, dist);
    if (wallDist >= dist - 0.6) {
      bestDist = dist;
      targetEnemy = other;
    }
  }

  let shotEvent: BotShotEvent | null = null;
  const movePos: Vec3 = { x: bot.x, y: bot.y, z: bot.z };
  const baseSpeed = 4.6 * WEAPONS[bot.weaponId].moveSpeedMult;

  if (targetEnemy) {
    bot.lastKnownEnemyId = targetEnemy.id;
    const dx = targetEnemy.x - bot.x;
    const dy = (targetEnemy.y + 1.35) - eyeY;
    const dz = targetEnemy.z - bot.z;
    const horizDist = Math.max(0.1, Math.hypot(dx, dz));
    const targetYaw = Math.atan2(-dx, -dz);

    let diff = targetYaw - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-dt * 6.5, Math.min(dt * 6.5, diff));
    bot.pitch = Math.atan2(dy, horizDist);
    bot.ads = horizDist > 9;
    bot.stance = 'stand';

    const forwardX = -Math.sin(bot.yaw);
    const forwardZ = -Math.cos(bot.yaw);
    const rightX = Math.cos(bot.yaw);
    const rightZ = -Math.sin(bot.yaw);

    let approach = 0;
    if (horizDist > 22) approach = 0.7;
    else if (horizDist < 7) approach = -0.6;

    const strafeSpeed = baseSpeed * 0.68;
    const desiredVx = (forwardX * approach + rightX * bot.strafeDir * 0.8) * strafeSpeed;
    const desiredVz = (forwardZ * approach + rightZ * bot.strafeDir * 0.8) * strafeSpeed;
    const accelLerp = 1 - Math.exp(-10 * dt);
    bot.vx += (desiredVx - bot.vx) * accelLerp;
    bot.vz += (desiredVz - bot.vz) * accelLerp;
    movePos.x += bot.vx * dt;
    movePos.z += bot.vz * dt;
    if (horizDist > 16 && bot.strafeTimer < 0.65) bot.stance = 'crouch';

    if (
      Math.abs(diff) < 0.35 &&
      bot.reloadTimer <= 0 &&
      bot.fireCooldown <= 0 &&
      bot.burstPause <= 0
    ) {
      if (bot.ammoInMag <= 0) {
        bot.reloadTimer = WEAPONS[bot.weaponId].reloadTime;
      } else {
        const spec = WEAPONS[bot.weaponId];
        bot.ammoInMag -= 1;
        bot.burstLeft -= 1;
        bot.fireCooldown = 60 / spec.rpm;
        if (bot.burstLeft <= 0) {
          bot.burstLeft = 3 + Math.floor(Math.random() * 4);
          bot.burstPause = 0.32 + Math.random() * 0.4;
        }

        const totalDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const hitChance = Math.max(0.16, Math.min(0.62, 0.72 - totalDist * 0.011));
        const didHit = Math.random() < hitChance;
        const isHeadshot = didHit && Math.random() < 0.14;
        const dmg = didHit ? Math.round(spec.damage * 0.72 * (isHeadshot ? 1.5 : 1)) : 0;

        shotEvent = {
          botId: bot.id,
          targetId: targetEnemy.id,
          ox: bot.x,
          oy: eyeY - 0.1,
          oz: bot.z,
          dx: dx / totalDist + (Math.random() - 0.5) * 0.06,
          dy: dy / totalDist + (Math.random() - 0.5) * 0.04,
          dz: dz / totalDist + (Math.random() - 0.5) * 0.06,
          hit: didHit,
          headshot: isHeadshot,
          damage: dmg,
          weaponId: bot.weaponId,
        };
      }
    }
  } else {
    bot.ads = false;
    bot.stance = 'sprint';
    const dx = bot.targetWaypoint.x - bot.x;
    const dz = bot.targetWaypoint.z - bot.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 2.2) {
      bot.targetWaypoint = pickNextWaypoint(bot, map, mode, zones);
    } else {
      const targetYaw = Math.atan2(-dx, -dz);
      let diff = targetYaw - bot.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      bot.yaw += Math.max(-dt * 5.0, Math.min(dt * 5.0, diff));
      bot.pitch *= 0.85;

      const prevX = movePos.x;
      const prevZ = movePos.z;
      const desiredVx = (dx / dist) * baseSpeed * 1.15;
      const desiredVz = (dz / dist) * baseSpeed * 1.15;
      const accelLerp = 1 - Math.exp(-8.5 * dt);
      bot.vx += (desiredVx - bot.vx) * accelLerp;
      bot.vz += (desiredVz - bot.vz) * accelLerp;
      movePos.x += bot.vx * dt;
      movePos.z += bot.vz * dt;

      resolveHorizontalCollision(map, movePos, 1.75);
      if (Math.hypot(movePos.x - prevX, movePos.z - prevZ) < baseSpeed * dt * 0.15) {
        bot.vx *= 0.25;
        bot.vz *= 0.25;
        bot.targetWaypoint = pickNextWaypoint(bot, map, mode, zones);
      }
      bot.x = movePos.x;
      bot.z = movePos.z;
      bot.vy -= 18.5 * dt;
      const groundY = getGroundHeightAt(map, bot.x, bot.z, bot.y);
      bot.y = Math.max(groundY, bot.y + bot.vy * dt);
      if (bot.y <= groundY) {
        bot.y = groundY;
        bot.vy = 0;
      }
      return shotEvent;
    }
  }

  resolveHorizontalCollision(map, movePos, bot.stance === 'crouch' ? 1.2 : 1.75);
  bot.x = movePos.x;
  bot.z = movePos.z;
  bot.vy -= 18.5 * dt;
  const groundY = getGroundHeightAt(map, bot.x, bot.z, bot.y);
  bot.y = Math.max(groundY, bot.y + bot.vy * dt);
  if (bot.y <= groundY) {
    bot.y = groundY;
    bot.vy = 0;
  }
  return shotEvent;
}
