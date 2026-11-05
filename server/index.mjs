/**
 * DUST STRIKE — multiplayer server.
 *
 * Rooms, teams, scoreboard and 20 Hz state sync over plain WebSockets.
 * No database, no build step: `node index.mjs`.
 */
import http from 'node:http';
import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 8080);
const TICK_HZ = 20;
const MAX_ROOMS = 200;
const ROOM_IDLE_MS = 15 * 60 * 1000;

const TEAMS = ['T', 'CT'];
const SPAWNS = {
  T: [
    { x: 0, z: 24, yaw: 0 },
    { x: -4, z: 25, yaw: 0 },
    { x: 4, z: 25, yaw: 0 },
    { x: -6, z: 22, yaw: 0.4 },
    { x: 6, z: 22, yaw: -0.4 },
  ],
  CT: [
    { x: 0, z: -24, yaw: Math.PI },
    { x: -4, z: -25, yaw: Math.PI },
    { x: 4, z: -25, yaw: Math.PI },
    { x: -6, z: -22, yaw: Math.PI - 0.4 },
    { x: 6, z: -22, yaw: Math.PI + 0.4 },
  ],
};

/** @type {Map<string, Room>} */
const rooms = new Map();
let nextPlayerId = 1;

const rand = (n) => crypto.randomInt(n);

class Room {
  constructor(name, opts, owner) {
    this.id = makeRoomId();
    this.name = name || `${owner.name}'s server`;
    this.max = clamp(opts.max ?? 8, 2, 12);
    this.kills = clamp(opts.kills ?? 20, 5, 60);
    this.map = opts.map || 'dust';
    this.players = new Map();
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.round = 1;
    this.timer = setInterval(() => this.tick(), 1000 / TICK_HZ);
  }

  get size() {
    return this.players.size;
  }

  info() {
    return {
      id: this.id,
      name: this.name,
      map: this.map,
      players: this.players.size,
      max: this.max,
      kills: this.kills,
      state: this.players.size >= this.max ? 'full' : this.players.size > 0 ? 'live' : 'empty',
    };
  }

  pickTeam() {
    let t = 0;
    let ct = 0;
    for (const p of this.players.values()) {
      if (p.team === 'T') t++;
      else ct++;
    }
    return t <= ct ? 'T' : 'CT';
  }

  add(player) {
    player.room = this;
    player.team = this.pickTeam();
    player.hp = 100;
    player.kills = 0;
    player.deaths = 0;
    player.alive = true;
    const spawn = SPAWNS[player.team][rand(SPAWNS[player.team].length)];
    player.pos = { x: spawn.x, y: 0, z: spawn.z };
    player.yaw = spawn.yaw;
    player.pitch = 0;
    player.moving = false;
    player.lastShot = 0;
    this.players.set(player.id, player);
    this.lastActivity = Date.now();
  }

  remove(player) {
    this.players.delete(player.id);
    this.lastActivity = Date.now();
    if (this.players.size === 0) {
      clearInterval(this.timer);
      rooms.delete(this.id);
    }
  }

  broadcast(msg, exceptId = null) {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.id === exceptId) continue;
      if (p.ws.readyState === 1) p.ws.send(data);
    }
  }

  snapshot() {
    return {
      t: 'state',
      tick: Date.now(),
      room: { id: this.id, name: this.name, kills: this.kills, max: this.max, map: this.map },
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        x: round(p.pos.x),
        y: round(p.pos.y),
        z: round(p.pos.z),
        yaw: round(p.yaw),
        pitch: round(p.pitch),
        hp: p.hp,
        kills: p.kills,
        deaths: p.deaths,
        alive: p.alive,
        moving: p.moving,
      })),
    };
  }

  tick() {
    if (this.players.size === 0) return;
    this.broadcast(this.snapshot());
  }
}

const round = (n) => Math.round(n * 1000) / 1000;
const clamp = (v, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};

function makeRoomId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  do {
    id = '';
    for (let i = 0; i < 4; i++) id += alphabet[rand(alphabet.length)];
  } while (rooms.has(id));
  return id;
}

function listRooms() {
  return [...rooms.values()]
    .sort((a, b) => b.players.size - a.players.size)
    .slice(0, 60)
    .map((r) => r.info());
}

// ---------------------------------------------------------------- http
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        version: '1.1.0',
        rooms: rooms.size,
        players: countPlayers(),
        uptime: Math.round(process.uptime()),
      }),
    );
    return;
  }
  if (req.url === '/rooms') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ rooms: listRooms() }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('DUST STRIKE server — connect with a websocket client.\n');
});

function countPlayers() {
  let n = 0;
  for (const r of rooms.values()) n += r.players.size;
  return n;
}

// ---------------------------------------------------------------- ws
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcastLobby() {
  const payload = JSON.stringify({ t: 'rooms', rooms: listRooms() });
  for (const client of wss.clients) {
    const player = client.player;
    if (!player || player.room) continue;
    if (client.readyState === 1) client.send(payload);
  }
}

wss.on('connection', (ws) => {
  const player = {
    id: `p${nextPlayerId++}`,
    ws,
    name: 'player',
    room: null,
    team: 'T',
    hp: 100,
    kills: 0,
    deaths: 0,
    alive: true,
    pos: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    moving: false,
    lastShot: 0,
    respawnAt: 0,
  };

  ws.player = player;
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  const send = (msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));

  send({ t: 'welcome', id: player.id, rooms: listRooms(), tickHz: TICK_HZ });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;
    player.lastSeen = Date.now();

    switch (msg.t) {
      case 'hello': {
        player.name = String(msg.name || 'player').slice(0, 16);
        break;
      }
      case 'list': {
        send({ t: 'rooms', rooms: listRooms() });
        break;
      }
      case 'create': {
        if (rooms.size >= MAX_ROOMS) return send({ t: 'error', msg: 'server is full' });
        if (player.room) return send({ t: 'error', msg: 'already in a room' });
        const room = new Room(String(msg.name || '').slice(0, 24), msg, player);
        rooms.set(room.id, room);
        room.add(player);
        send({
          t: 'joined',
          room: room.info(),
          you: player.id,
          players: [...room.players.values()].map((p) => p.id),
          spawn: { x: player.pos.x, z: player.pos.z, yaw: player.yaw },
        });
        room.broadcast({ t: 'playerJoin', id: player.id, name: player.name, team: player.team }, player.id);
        broadcastLobby();
        break;
      }
      case 'join': {
        if (player.room) return send({ t: 'error', msg: 'already in a room' });
        const room = rooms.get(String(msg.id || '').toUpperCase());
        if (!room) return send({ t: 'error', msg: 'no such server' });
        if (room.players.size >= room.max) return send({ t: 'error', msg: 'server is full' });
        room.add(player);
        send({
          t: 'joined',
          room: room.info(),
          you: player.id,
          players: [...room.players.values()].map((p) => p.id),
          spawn: { x: player.pos.x, z: player.pos.z, yaw: player.yaw },
        });
        room.broadcast({ t: 'playerJoin', id: player.id, name: player.name, team: player.team }, player.id);
        broadcastLobby();
        break;
      }
      case 'leave': {
        leaveRoom(player);
        send({ t: 'rooms', rooms: listRooms() });
        broadcastLobby();
        break;
      }
      case 'input': {
        if (!player.room) return;
        const p = player.pos;
        // light sanity clamp — the client is trusted for position in v1
        p.x = clamp(msg.x, -60, 60);
        p.y = clamp(msg.y, -10, 40);
        p.z = clamp(msg.z, -60, 60);
        player.yaw = clamp(msg.yaw, -10, 10);
        player.pitch = clamp(msg.pitch, -2, 2);
        player.moving = !!msg.mv;
        break;
      }
      case 'shoot': {
        if (!player.room || !player.alive) return;
        const room = player.room;
        const now = Date.now();
        if (now - player.lastShot < 70) return; // rate limit
        player.lastShot = now;

        const target = room.players.get(String(msg.targetId || ''));
        const from = { x: player.pos.x, y: player.pos.y + 1.5, z: player.pos.z };
        const to = msg.to ? { x: clamp(msg.to.x, -60, 60), y: clamp(msg.to.y, -10, 40), z: clamp(msg.to.z, -60, 60) } : from;

        room.broadcast({ t: 'shot', by: player.id, from, to });

        if (!target || !target.alive || target.id === player.id) return;
        const dmg = clamp(msg.dmg, 1, 100);
        target.hp = Math.max(0, target.hp - dmg);
        if (target.hp <= 0) {
          target.alive = false;
          target.deaths++;
          target.respawnAt = now + 3000;
          player.kills++;
          room.broadcast({ t: 'kill', killer: player.id, victim: target.id, head: !!msg.head });
          if (player.kills >= room.kills) {
            room.broadcast({ t: 'matchOver', winner: player.id, name: player.name, kills: player.kills });
            for (const p of room.players.values()) {
              p.kills = 0;
              p.deaths = 0;
              p.hp = 100;
              p.alive = true;
              const spawn = SPAWNS[p.team][rand(SPAWNS[p.team].length)];
              p.pos = { x: spawn.x, y: 0, z: spawn.z };
              p.yaw = spawn.yaw;
              if (p.ws.readyState === 1) {
                p.ws.send(
                  JSON.stringify({ t: 'respawn', spawn: { x: spawn.x, z: spawn.z, yaw: spawn.yaw } }),
                );
              }
            }
          }
        } else {
          room.broadcast({ t: 'damage', by: player.id, target: target.id, hp: target.hp, dmg, head: !!msg.head });
        }
        break;
      }
      case 'chat': {
        if (!player.room) return;
        const text = String(msg.text || '').slice(0, 120);
        if (!text.trim()) return;
        player.room.broadcast({ t: 'chat', id: player.id, name: player.name, text });
        break;
      }
      case 'ping': {
        send({ t: 'pong', ts: msg.ts });
        break;
      }
      default:
        break;
    }
  });

  ws.on('close', () => leaveRoom(player));
  ws.on('error', () => leaveRoom(player));
});

function leaveRoom(player) {
  const room = player.room;
  if (!room) return;
  room.remove(player);
  room.broadcast({ t: 'playerLeave', id: player.id });
  player.room = null;
  broadcastLobby();
}

// respawn sweep
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    for (const p of room.players.values()) {
      if (!p.alive && p.respawnAt && now >= p.respawnAt) {
        p.alive = true;
        p.hp = 100;
        const spawn = SPAWNS[p.team][rand(SPAWNS[p.team].length)];
        p.pos = { x: spawn.x, y: 0, z: spawn.z };
        p.yaw = spawn.yaw;
        p.ws.readyState === 1 && p.ws.send(JSON.stringify({ t: 'respawn', spawn: { x: spawn.x, z: spawn.z, yaw: spawn.yaw } }));
      }
    }
  }
}, 500);

// drop idle empty rooms
setInterval(() => {
  const now = Date.now();
  for (const room of [...rooms.values()]) {
    if (room.players.size === 0 && now - room.lastActivity > ROOM_IDLE_MS) {
      clearInterval(room.timer);
      rooms.delete(room.id);
    }
  }
}, 60_000);

setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  }
}, 20_000);

server.listen(PORT, () => {
  console.log(`DUST STRIKE server listening on :${PORT}  (ws path /ws)`);
});
