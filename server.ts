import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  BOT_CALLSIGNS,
  BOT_WEAPONS,
  createBotAgent,
  stepBotAgent,
} from './src/game/botBrain.ts';
import type { BotAgentState } from './src/game/botBrain.ts';
import { MAPS } from './src/game/maps.ts';
import type {
  CombatantSnapshot,
  DominationZoneState,
  ExtractionState,
  GameMode,
  KillfeedEntry,
  KillfeedWeaponKind,
  LootCrateState,
  MapId,
  PublicRoomSummary,
  TeamId,
  Vec3,
  WeaponId,
  WsClientMessage,
  WsServerMessage,
} from './src/game/types.ts';
import { WEAPONS } from './src/game/weapons.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface HumanClient {
  id: string;
  ws: WebSocket;
  roomCode: string | null;
  snapshot: CombatantSnapshot;
  respawnTimer: number;
  lastFireAt: number;
}

interface GameRoom {
  code: string;
  name: string;
  mode: GameMode;
  mapId: MapId;
  phase: 'active' | 'ended';
  timeRemaining: number;
  alphaScore: number;
  bravoScore: number;
  scoreLimit: number;
  winnerTeam: TeamId | 'draw' | null;
  winnerName: string | null;
  humans: Map<string, HumanClient>;
  bots: Map<string, BotAgentState>;
  zones: DominationZoneState[];
  lootCrates: LootCrateState[];
  extraction: ExtractionState;
  killfeed: KillfeedEntry[];
  domTickAccum: number;
}

const rooms = new Map<string, GameRoom>();
let idCounter = 1;

function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function getScoreLimit(mode: GameMode): number {
  if (mode === 'tdm') return 40;
  if (mode === 'domination') return 150;
  if (mode === 'ffa') return 25;
  return 999;
}

function getMatchDuration(mode: GameMode): number {
  if (mode === 'extraction') return 420;
  if (mode === 'domination') return 360;
  return 300;
}

function pickSpawn(mapId: MapId, mode: GameMode, team: TeamId): Vec3 {
  const map = MAPS[mapId];
  if (mode === 'ffa') {
    return { ...map.spawnsFfa[Math.floor(Math.random() * map.spawnsFfa.length)] };
  }
  const pool = team === 'bravo' ? map.spawnsBravo : map.spawnsAlpha;
  return { ...pool[Math.floor(Math.random() * pool.length)] };
}

function assignTeamForHuman(room: GameRoom): TeamId {
  if (room.mode === 'ffa') return 'neutral';
  if (room.mode === 'extraction') return 'alpha';
  let alphaHumans = 0;
  let bravoHumans = 0;
  for (const h of room.humans.values()) {
    if (h.snapshot.team === 'alpha') alphaHumans += 1;
    else if (h.snapshot.team === 'bravo') bravoHumans += 1;
  }
  return alphaHumans <= bravoHumans ? 'alpha' : 'bravo';
}

function syncRoomBotBackfill(room: GameRoom): void {
  const map = MAPS[room.mapId];
  if (room.mode === 'tdm' || room.mode === 'domination') {
    const targetPerTeam = 4;
    let alphaCount = 0;
    let bravoCount = 0;
    for (const h of room.humans.values()) {
      if (h.snapshot.team === 'alpha') alphaCount += 1;
      else bravoCount += 1;
    }
    const alphaBots: BotAgentState[] = [];
    const bravoBots: BotAgentState[] = [];
    for (const b of room.bots.values()) {
      if (b.team === 'alpha') alphaBots.push(b);
      else bravoBots.push(b);
    }

    while (alphaCount + alphaBots.length > targetPerTeam && alphaBots.length > 0) {
      room.bots.delete(alphaBots.pop()!.id);
    }
    while (bravoCount + bravoBots.length > targetPerTeam && bravoBots.length > 0) {
      room.bots.delete(bravoBots.pop()!.id);
    }

    let callIdx = 0;
    while (alphaCount + alphaBots.length < targetPerTeam) {
      const botId = nextId('bot');
      const name = BOT_CALLSIGNS[(callIdx + alphaBots.length) % BOT_CALLSIGNS.length];
      const wId = BOT_WEAPONS[(alphaBots.length + callIdx) % BOT_WEAPONS.length];
      const bot = createBotAgent(botId, name, 'alpha', pickSpawn(room.mapId, room.mode, 'alpha'), wId);
      room.bots.set(botId, bot);
      alphaBots.push(bot);
      callIdx += 1;
    }
    while (bravoCount + bravoBots.length < targetPerTeam) {
      const botId = nextId('bot');
      const name = BOT_CALLSIGNS[(5 + callIdx + bravoBots.length) % BOT_CALLSIGNS.length];
      const wId = BOT_WEAPONS[(bravoBots.length + callIdx) % BOT_WEAPONS.length];
      const bot = createBotAgent(botId, name, 'bravo', pickSpawn(room.mapId, room.mode, 'bravo'), wId);
      room.bots.set(botId, bot);
      bravoBots.push(bot);
      callIdx += 1;
    }
  } else if (room.mode === 'ffa') {
    const targetTotal = 7;
    if (room.humans.size + room.bots.size > targetTotal) {
      for (const b of room.bots.values()) {
        if (room.humans.size + room.bots.size <= targetTotal) break;
        room.bots.delete(b.id);
      }
    } else {
      let i = 0;
      while (room.humans.size + room.bots.size < targetTotal) {
        const botId = nextId('bot');
        const name = BOT_CALLSIGNS[(i + room.bots.size) % BOT_CALLSIGNS.length];
        const wId = BOT_WEAPONS[i % BOT_WEAPONS.length];
        room.bots.set(botId, createBotAgent(botId, name, 'neutral', pickSpawn(room.mapId, 'ffa', 'neutral'), wId));
        i += 1;
      }
    }
  } else if (room.mode === 'extraction') {
    const targetHostiles = 6;
    while (room.bots.size < targetHostiles) {
      const idx = room.bots.size;
      const botId = nextId('guard');
      const spawn = map.lootCrates[idx % map.lootCrates.length] ?? map.spawnsBravo[0];
      room.bots.set(
        botId,
        createBotAgent(
          botId,
          `Sentinel-0${idx + 1}`,
          'bravo',
          { x: spawn.x + 2, y: spawn.y, z: spawn.z + 2 },
          BOT_WEAPONS[idx % BOT_WEAPONS.length]
        )
      );
    }
  }
}

function createRoom(mode: GameMode, mapId: MapId, roomName?: string): GameRoom {
  const map = MAPS[mapId];
  const code = generateRoomCode();
  const zones: DominationZoneState[] =
    mode === 'domination'
      ? map.captureZones.map((z) => ({
          id: z.id,
          owner: 'neutral',
          capturingTeam: 'neutral',
          progress: 0,
          contested: false,
        }))
      : [];

  const lootCrates: LootCrateState[] =
    mode === 'extraction'
      ? map.lootCrates.map((c) => ({
          ...c,
          opened: false,
          value:
            c.tier === 'classified'
              ? 18500 + Math.floor(Math.random() * 8000)
              : c.tier === 'military'
              ? 9500 + Math.floor(Math.random() * 4500)
              : 4500 + Math.floor(Math.random() * 2500),
        }))
      : [];

  const room: GameRoom = {
    code,
    name: roomName && roomName.trim() ? roomName.trim().slice(0, 32) : `${map.name} · ${mode.toUpperCase()}`,
    mode,
    mapId,
    phase: 'active',
    timeRemaining: getMatchDuration(mode),
    alphaScore: 0,
    bravoScore: 0,
    scoreLimit: getScoreLimit(mode),
    winnerTeam: null,
    winnerName: null,
    humans: new Map(),
    bots: new Map(),
    zones,
    lootCrates,
    extraction: { active: false, triggeredBy: null, countdown: 15, extracted: false },
    killfeed: [],
    domTickAccum: 0,
  };

  syncRoomBotBackfill(room);
  rooms.set(code, room);
  return room;
}

function sendMsg(ws: WebSocket, msg: WsServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcastRoom(room: GameRoom, msg: WsServerMessage): void {
  const raw = JSON.stringify(msg);
  for (const h of room.humans.values()) {
    if (h.ws.readyState === WebSocket.OPEN) h.ws.send(raw);
  }
}

function getAllCombatants(room: GameRoom): CombatantSnapshot[] {
  const list: CombatantSnapshot[] = [];
  for (const h of room.humans.values()) list.push(h.snapshot);
  for (const b of room.bots.values()) {
    list.push({
      id: b.id,
      name: b.name,
      isBot: true,
      team: b.team,
      x: b.x,
      y: b.y,
      z: b.z,
      yaw: b.yaw,
      pitch: b.pitch,
      hp: b.hp,
      maxHp: b.maxHp,
      armor: b.armor,
      maxArmor: b.maxArmor,
      alive: b.alive,
      stance: b.stance,
      weaponId: b.weaponId,
      ads: b.ads,
      kills: b.kills,
      deaths: b.deaths,
      assists: b.assists,
      score: b.score,
      lootValue: b.lootValue,
      uavRevealUntil: b.uavRevealUntil,
    });
  }
  return list;
}

function findCombatant(room: GameRoom, id: string): CombatantSnapshot | null {
  return room.humans.get(id)?.snapshot ?? room.bots.get(id) ?? null;
}

function applyDamage(
  room: GameRoom,
  attackerId: string,
  victimId: string,
  rawDamage: number,
  headshot: boolean,
  weaponName: string,
  weaponId?: KillfeedWeaponKind
): void {
  if (room.phase !== 'active') return;
  const attacker = findCombatant(room, attackerId);
  const victim = findCombatant(room, victimId);
  if (!attacker || !victim || !victim.alive) return;
  if (room.mode !== 'ffa' && attacker.team === victim.team && attacker.id !== victim.id) return;

  let remaining = Math.max(1, Math.round(rawDamage));
  if (victim.armor > 0) {
    const absorbed = Math.min(victim.armor, Math.round(remaining * 0.55));
    victim.armor -= absorbed;
    remaining -= absorbed;
  }
  victim.hp = Math.max(0, victim.hp - remaining);

  const killed = victim.hp <= 0;
  if (killed) {
    victim.alive = false;
    victim.deaths += 1;
    if (victim.id !== attacker.id) {
      attacker.kills += 1;
      attacker.score += 100;
      if (room.mode === 'tdm') {
        if (attacker.team === 'alpha') room.alphaScore += 1;
        else if (attacker.team === 'bravo') room.bravoScore += 1;
      }
      if (room.mode === 'extraction' && victim.isBot) attacker.lootValue += 1500;
    }

    const vh = room.humans.get(victim.id);
    if (vh) vh.respawnTimer = room.mode === 'extraction' ? 8.0 : 3.5;
    const vb = room.bots.get(victim.id);
    if (vb) vb.respawnTimer = room.mode === 'extraction' ? 14.0 : 4.0;

    room.killfeed.unshift({
      id: nextId('kf'),
      killerId: attacker.id,
      killerName: attacker.name,
      killerTeam: attacker.team,
      killerIsBot: attacker.isBot,
      victimId: victim.id,
      victimName: victim.name,
      victimTeam: victim.team,
      victimIsBot: victim.isBot,
      weaponId,
      weaponName,
      headshot,
      timestamp: Date.now(),
    });
    if (room.killfeed.length > 6) room.killfeed.length = 6;
  }

  broadcastRoom(room, {
    type: 'combat:damaged',
    victimId: victim.id,
    attackerId: attacker.id,
    attackerX: attacker.x,
    attackerZ: attacker.z,
    damage: rawDamage,
    headshot,
    killed,
    weaponId: weaponId && weaponId !== 'frag' ? weaponId : undefined,
  });

  if (room.mode === 'tdm') {
    if (room.alphaScore >= room.scoreLimit) {
      room.phase = 'ended';
      room.winnerTeam = 'alpha';
    } else if (room.bravoScore >= room.scoreLimit) {
      room.phase = 'ended';
      room.winnerTeam = 'bravo';
    }
  } else if (room.mode === 'ffa' && attacker.kills >= room.scoreLimit) {
    room.phase = 'ended';
    room.winnerTeam = 'neutral';
    room.winnerName = attacker.name;
  }
}

function leaveCurrentRoom(client: HumanClient): void {
  if (!client.roomCode) return;
  const room = rooms.get(client.roomCode);
  client.roomCode = null;
  if (!room) return;
  room.humans.delete(client.id);
  if (room.humans.size === 0) rooms.delete(room.code);
  else syncRoomBotBackfill(room);
}

function joinClientToRoom(client: HumanClient, room: GameRoom, playerName: string, weaponId: WeaponId): void {
  leaveCurrentRoom(client);
  const team = assignTeamForHuman(room);
  const spawn = pickSpawn(room.mapId, room.mode, team);
  client.roomCode = room.code;
  client.respawnTimer = 0;
  client.snapshot = {
    id: client.id,
    name: playerName.trim().slice(0, 18) || 'Operator',
    isBot: false,
    team,
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    yaw: team === 'alpha' ? Math.PI : 0,
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
  };
  room.humans.set(client.id, client);
  syncRoomBotBackfill(room);

  sendMsg(client.ws, {
    type: 'room:joined',
    code: room.code,
    playerId: client.id,
    team,
    mode: room.mode,
    mapId: room.mapId,
    spawn,
  });
}

setInterval(() => {
  const dt = 0.1;
  for (const room of rooms.values()) {
    if (room.humans.size === 0) {
      rooms.delete(room.code);
      continue;
    }

    if (room.phase === 'active') {
      room.timeRemaining = Math.max(0, room.timeRemaining - dt);

      for (const h of room.humans.values()) {
        if (!h.snapshot.alive) {
          h.respawnTimer -= dt;
          if (h.respawnTimer <= 0) {
            const spawn = pickSpawn(room.mapId, room.mode, h.snapshot.team);
            h.snapshot.alive = true;
            h.snapshot.hp = 100;
            h.snapshot.armor = 50;
            h.snapshot.x = spawn.x;
            h.snapshot.y = spawn.y;
            h.snapshot.z = spawn.z;
            sendMsg(h.ws, { type: 'player:respawn', spawn });
          }
        }
      }

      const map = MAPS[room.mapId];
      const allNow = getAllCombatants(room);

      for (const bot of room.bots.values()) {
        if (!bot.alive) {
          bot.respawnTimer -= dt;
          if (bot.respawnTimer <= 0) {
            const spawn = pickSpawn(room.mapId, room.mode, bot.team);
            bot.alive = true;
            bot.hp = 100;
            bot.armor = 50;
            bot.x = spawn.x;
            bot.y = spawn.y;
            bot.z = spawn.z;
            bot.ammoInMag = WEAPONS[bot.weaponId].magSize;
          }
          continue;
        }

        const shot = stepBotAgent(bot, dt, map, room.mode, allNow, room.zones);
        if (shot) {
          broadcastRoom(room, {
            type: 'combat:tracer',
            shooterId: bot.id,
            weaponId: shot.weaponId,
            suppressed: false,
            ox: shot.ox,
            oy: shot.oy,
            oz: shot.oz,
            dx: shot.dx,
            dy: shot.dy,
            dz: shot.dz,
          });
          if (shot.hit && shot.damage > 0) {
            applyDamage(room, bot.id, shot.targetId, shot.damage, shot.headshot, WEAPONS[shot.weaponId].name, shot.weaponId);
          }
        }
      }

      if (room.mode === 'domination') {
        room.domTickAccum += dt;
        const combatants = getAllCombatants(room);
        for (const zState of room.zones) {
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

        if (room.domTickAccum >= 1.0) {
          room.domTickAccum -= 1.0;
          for (const z of room.zones) {
            if (z.owner === 'alpha') room.alphaScore += 1;
            else if (z.owner === 'bravo') room.bravoScore += 1;
          }
          if (room.alphaScore >= room.scoreLimit || room.bravoScore >= room.scoreLimit) {
            room.phase = 'ended';
            room.winnerTeam = room.alphaScore >= room.bravoScore ? 'alpha' : 'bravo';
          }
        }
      }

      if (room.mode === 'extraction' && room.extraction.active && !room.extraction.extracted) {
        room.extraction.countdown = Math.max(0, room.extraction.countdown - dt);
        if (room.extraction.countdown <= 0) {
          room.extraction.extracted = true;
          room.extraction.active = false;
          const exDef = map.extractionZone;
          for (const h of room.humans.values()) {
            if (
              h.snapshot.alive &&
              Math.hypot(h.snapshot.x - exDef.x, h.snapshot.z - exDef.z) <= exDef.radius + 1.5
            ) {
              const banked = Math.max(3500, h.snapshot.lootValue);
              h.snapshot.lootValue = 0;
              sendMsg(h.ws, { type: 'extraction:banked', playerId: h.id, amount: banked });
            }
          }
          room.phase = 'ended';
          room.winnerTeam = 'alpha';
        }
      }

      if (room.timeRemaining <= 0 && room.phase === 'active') {
        room.phase = 'ended';
        if (room.mode === 'ffa') {
          const sorted = getAllCombatants(room).sort((a, b) => b.kills - a.kills);
          room.winnerTeam = 'neutral';
          room.winnerName = sorted[0]?.name ?? 'Operator';
        } else if (room.mode === 'extraction') {
          room.winnerTeam = room.extraction.extracted ? 'alpha' : 'bravo';
        } else {
          room.winnerTeam =
            room.alphaScore > room.bravoScore
              ? 'alpha'
              : room.bravoScore > room.alphaScore
              ? 'bravo'
              : 'draw';
        }
      }
    }

    broadcastRoom(room, {
      type: 'room:state',
      code: room.code,
      mode: room.mode,
      mapId: room.mapId,
      phase: room.phase,
      timeRemaining: room.timeRemaining,
      alphaScore: room.alphaScore,
      bravoScore: room.bravoScore,
      scoreLimit: room.scoreLimit,
      winnerTeam: room.winnerTeam,
      winnerName: room.winnerName,
      combatants: getAllCombatants(room),
      zones: room.zones,
      lootCrates: room.lootCrates,
      extraction: room.extraction,
      killfeed: room.killfeed,
    });
  }
}, 100);

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.get('/api/rooms', (_req, res) => {
    const list: PublicRoomSummary[] = [];
    for (const r of rooms.values()) {
      if (r.phase !== 'active') continue;
      list.push({
        code: r.code,
        name: r.name,
        mode: r.mode,
        mapId: r.mapId,
        humanCount: r.humans.size,
        maxHumans: r.mode === 'extraction' ? 4 : 10,
        botCount: r.bots.size,
        timeRemaining: Math.round(r.timeRemaining),
      });
    }
    res.json({ rooms: list });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', (ws) => {
    const client: HumanClient = {
      id: nextId('plr'),
      ws,
      roomCode: null,
      respawnTimer: 0,
      lastFireAt: 0,
      snapshot: {
        id: '',
        name: 'Operator',
        isBot: false,
        team: 'alpha',
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        pitch: 0,
        hp: 100,
        maxHp: 100,
        armor: 50,
        maxArmor: 100,
        alive: true,
        stance: 'stand',
        weaponId: 'm4a1',
        ads: false,
        kills: 0,
        deaths: 0,
        assists: 0,
        score: 0,
        lootValue: 0,
        uavRevealUntil: 0,
      },
    };
    client.snapshot.id = client.id;

    ws.on('message', (rawData) => {
      let msg: WsClientMessage;
      try {
        msg = JSON.parse(String(rawData)) as WsClientMessage;
      } catch {
        return;
      }

      if (msg.type === 'ping') {
        sendMsg(ws, { type: 'pong', t: msg.t });
        return;
      }
      if (msg.type === 'room:create') {
        const room = createRoom(msg.mode, msg.mapId, msg.roomName);
        joinClientToRoom(client, room, msg.playerName, msg.weaponId);
        return;
      }
      if (msg.type === 'room:join') {
        const code = msg.code.trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          sendMsg(ws, { type: 'room:error', message: `Room ${code} not found or already closed.` });
          return;
        }
        joinClientToRoom(client, room, msg.playerName, msg.weaponId);
        return;
      }
      if (msg.type === 'room:quickmatch') {
        let targetRoom: GameRoom | undefined;
        for (const r of rooms.values()) {
          if (r.phase === 'active' && r.mode === msg.mode && r.mapId === msg.mapId && r.humans.size < 10) {
            targetRoom = r;
            break;
          }
        }
        if (!targetRoom) targetRoom = createRoom(msg.mode, msg.mapId);
        joinClientToRoom(client, targetRoom, msg.playerName, msg.weaponId);
        return;
      }
      if (msg.type === 'room:leave') {
        leaveCurrentRoom(client);
        return;
      }

      if (!client.roomCode) return;
      const room = rooms.get(client.roomCode);
      if (!room) return;

      if (msg.type === 'player:state') {
        if (!client.snapshot.alive) return;
        client.snapshot.x = msg.x;
        client.snapshot.y = msg.y;
        client.snapshot.z = msg.z;
        client.snapshot.yaw = msg.yaw;
        client.snapshot.pitch = msg.pitch;
        client.snapshot.stance = msg.stance;
        client.snapshot.weaponId = msg.weaponId;
        client.snapshot.ads = msg.ads;
        return;
      }
      if (msg.type === 'combat:fire') {
        if (!client.snapshot.alive || room.phase !== 'active') return;
        client.lastFireAt = Date.now();
        if (!msg.suppressed) client.snapshot.uavRevealUntil = Date.now() + 2000;
        broadcastRoom(room, {
          type: 'combat:tracer',
          shooterId: client.id,
          weaponId: msg.weaponId,
          suppressed: msg.suppressed,
          ox: msg.ox,
          oy: msg.oy,
          oz: msg.oz,
          dx: msg.dx,
          dy: msg.dy,
          dz: msg.dz,
        });
        return;
      }
      if (msg.type === 'combat:hit') {
        if (!client.snapshot.alive || room.phase !== 'active') return;
        const spec = WEAPONS[msg.weaponId];
        if (!spec) return;
        const maxAllowed = Math.round(spec.damage * spec.headshotMult * 1.35);
        const clampedDmg = Math.max(1, Math.min(maxAllowed, Math.round(msg.damage)));
        applyDamage(room, client.id, msg.targetId, clampedDmg, msg.headshot, spec.name, msg.weaponId);
        return;
      }
      if (msg.type === 'player:plate') {
        if (client.snapshot.alive) client.snapshot.armor = Math.min(100, client.snapshot.armor + 50);
        return;
      }
      if (msg.type === 'player:uav') {
        const now = Date.now();
        for (const c of getAllCombatants(room)) {
          if (room.mode === 'ffa' ? c.id !== client.id : c.team !== client.snapshot.team) {
            const h = room.humans.get(c.id);
            if (h) h.snapshot.uavRevealUntil = now + 10000;
            const b = room.bots.get(c.id);
            if (b) b.uavRevealUntil = now + 10000;
          }
        }
        return;
      }
      if (msg.type === 'combat:grenade') {
        if (!client.snapshot.alive || room.phase !== 'active') return;
        broadcastRoom(room, {
          type: 'combat:explosion',
          attackerId: client.id,
          x: msg.x,
          y: msg.y,
          z: msg.z,
        });
        for (const c of getAllCombatants(room)) {
          if (!c.alive) continue;
          const dist = Math.hypot(c.x - msg.x, c.y - msg.y, c.z - msg.z);
          if (dist < 6.5) {
            const dmg = Math.round(115 * (1 - dist / 6.5));
            if (dmg > 5) applyDamage(room, client.id, c.id, dmg, false, 'M67 Frag', 'frag');
          }
        }
        return;
      }
      if (msg.type === 'objective:loot') {
        if (room.mode !== 'extraction' || !client.snapshot.alive) return;
        const crate = room.lootCrates.find((c) => c.id === msg.crateId && !c.opened);
        if (!crate) return;
        if (Math.hypot(client.snapshot.x - crate.x, client.snapshot.z - crate.z) > 4.5) return;
        crate.opened = true;
        client.snapshot.lootValue += crate.value;
        client.snapshot.score += 250;
        return;
      }
      if (msg.type === 'objective:extract_start') {
        if (room.mode !== 'extraction' || !client.snapshot.alive || room.extraction.active) return;
        const exDef = MAPS[room.mapId].extractionZone;
        if (Math.hypot(client.snapshot.x - exDef.x, client.snapshot.z - exDef.z) > exDef.radius + 1.0) return;
        room.extraction.active = true;
        room.extraction.triggeredBy = client.snapshot.name;
        room.extraction.countdown = 15;
      }
    });

    ws.on('close', () => {
      leaveCurrentRoom(client);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server },
      },
      appType: 'spa',
    });
    if (process.env.DISABLE_HMR === 'true') {
      app.get('/@vite/client', async (_req, res, next) => {
        try {
          const result = await vite.transformRequest('/@vite/client');
          if (!result) return next();
          const patched = result.code
            .replace('transport.connect(createHMRHandler(handleMessage));', '/* HMR disabled */')
            .replace('setupForwardConsoleHandler(transport, forwardConsole);', '/* console forward disabled */')
            .replace('else throw new SendBeforeConnectError("send was called before connect");', 'else return;')
            .replace('else throw new SendBeforeConnectError("invoke was called before connect");', 'else return;');
          res.setHeader('Content-Type', 'application/javascript');
          res.send(patched);
        } catch (err) {
          next(err);
        }
      });
    }
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Iron Sector server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
