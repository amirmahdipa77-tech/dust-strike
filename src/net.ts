/** WebSocket client for the DUST STRIKE server. */

export interface RoomInfo {
  id: string;
  name: string;
  map: string;
  players: number;
  max: number;
  kills: number;
  state: 'empty' | 'live' | 'full';
}

export interface NetPlayer {
  id: string;
  name: string;
  team: 'T' | 'CT';
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;
  kills: number;
  deaths: number;
  alive: boolean;
  moving: boolean;
}

export interface Spawn {
  x: number;
  z: number;
  yaw: number;
}

type Handler<T> = (value: T) => void;

export class Net {
  status: 'offline' | 'connecting' | 'online' | 'error' = 'offline';
  id = '';
  rooms: RoomInfo[] = [];
  room: RoomInfo | null = null;
  players = new Map<string, NetPlayer>();
  ping = 0;
  lastError = '';
  url = '';

  onStatus: Handler<void> | null = null;
  onRooms: Handler<RoomInfo[]> | null = null;
  onJoined: Handler<Spawn> | null = null;
  onPlayers: Handler<void> | null = null;
  onShot: Handler<{ by: string; from: any; to: any }> | null = null;
  onKill: Handler<{ killer: string; victim: string; head: boolean }> | null = null;
  onDamage: Handler<{ by: string; target: string; hp: number; dmg: number; head: boolean }> | null = null;
  onChat: Handler<{ name: string; text: string }> | null = null;
  onRespawn: Handler<Spawn> | null = null;
  onMatchOver: Handler<{ name: string; kills: number }> | null = null;

  private ws: WebSocket | null = null;
  private name = 'player';
  private pingTimer: number | null = null;
  private reconnectAttempts = 0;
  private connectTimer: number | null = null;

  /** Normalises "host:8080", "https://x", "wss://x/ws" into a ws URL. */
  static normalise(raw: string): string {
    let u = raw.trim();
    if (!u) return '';
    if (u.startsWith('https://')) u = 'wss://' + u.slice(8);
    else if (u.startsWith('http://')) u = 'ws://' + u.slice(7);
    else if (!u.startsWith('ws://') && !u.startsWith('wss://')) {
      u = (u.includes('localhost') || u.includes('127.0.0.1') || /^\d+\.\d+\.\d+\.\d+/.test(u)
        ? 'ws://'
        : 'wss://') + u;
    }
    if (!/\/ws$/.test(u) && !/\/$/.test(u)) u += '/ws';
    return u;
  }

  connect(url: string, name: string): void {
    this.close();
    this.name = name || 'player';
    this.url = Net.normalise(url);
    this.status = 'connecting';
    this.lastError = '';
    this.onStatus?.();

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.status = 'error';
      this.lastError = 'bad server address';
      this.onStatus?.();
      return;
    }
    this.ws = ws;

    this.connectTimer = window.setTimeout(() => {
      if (this.status === 'connecting') {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        this.status = 'error';
        this.lastError = 'connection timed out — is the server running and reachable?';
        this.onStatus?.();
      }
    }, 8000);

    ws.onopen = () => {
      if (this.connectTimer) window.clearTimeout(this.connectTimer);
      this.reconnectAttempts = 0;
      this.status = 'online';
      this.send({ t: 'hello', name: this.name });
      this.send({ t: 'list' });
      this.onStatus?.();
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping', ts: Date.now() }), 2000);
    };

    ws.onmessage = (ev) => this.handle(JSON.parse(ev.data));

    ws.onclose = () => {
      if (this.connectTimer) window.clearTimeout(this.connectTimer);
      if (this.pingTimer) window.clearInterval(this.pingTimer);
      this.pingTimer = null;
      const wasOnline = this.status === 'online';
      this.status = 'error';
      this.lastError = wasOnline
        ? 'disconnected from server'
        : this.lastError || 'could not reach server — check the address';
      this.players.clear();
      this.room = null;
      this.onStatus?.();
    };

    ws.onerror = () => {
      this.lastError = 'connection failed — check the address and that the server is up';
      if (this.status === 'connecting') {
        this.status = 'error';
        this.onStatus?.();
      }
    };
  }

  close(): void {
    if (this.pingTimer) window.clearInterval(this.pingTimer);
    this.pingTimer = null;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.status = 'offline';
    this.room = null;
    this.players.clear();
  }

  private send(msg: unknown): void {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  private handle(msg: any): void {
    switch (msg.t) {
      case 'welcome':
        this.id = msg.id;
        this.rooms = msg.rooms || [];
        this.onRooms?.(this.rooms);
        break;
      case 'rooms':
        this.rooms = msg.rooms || [];
        this.onRooms?.(this.rooms);
        break;
      case 'joined': {
        this.room = msg.room;
        this.players.clear();
        this.onJoined?.(msg.spawn);
        break;
      }
      case 'state': {
        if (!this.room) break;
        this.players.clear();
        for (const p of msg.players) this.players.set(p.id, p);
        if (this.room) {
          this.room.players = msg.players.length;
        }
        this.onPlayers?.();
        break;
      }
      case 'playerJoin':
      case 'playerLeave':
        break;
      case 'shot':
        this.onShot?.(msg);
        break;
      case 'damage':
        this.onDamage?.(msg);
        break;
      case 'kill':
        this.onKill?.(msg);
        break;
      case 'chat':
        this.onChat?.(msg);
        break;
      case 'respawn':
        this.onRespawn?.(msg.spawn);
        break;
      case 'matchOver':
        this.onMatchOver?.(msg);
        break;
      case 'pong':
        this.ping = Math.max(0, Date.now() - msg.ts);
        break;
      case 'error':
        this.lastError = msg.msg;
        this.onStatus?.();
        break;
      default:
        break;
    }
  }

  requestRooms(): void {
    this.send({ t: 'list' });
  }

  createRoom(opts: { name: string; max: number; kills: number; map: string }): void {
    this.send({ t: 'create', ...opts });
  }

  joinRoom(id: string): void {
    this.send({ t: 'join', id: id.trim().toUpperCase() });
  }

  leaveRoom(): void {
    this.send({ t: 'leave' });
    this.room = null;
    this.players.clear();
  }

  sendInput(x: number, y: number, z: number, yaw: number, pitch: number, moving: boolean): void {
    this.send({ t: 'input', x, y, z, yaw, pitch, mv: moving });
  }

  sendShot(targetId: string | null, to: { x: number; y: number; z: number }, dmg: number, head: boolean): void {
    this.send({ t: 'shoot', targetId, to, dmg, head });
  }

  sendChat(text: string): void {
    this.send({ t: 'chat', text });
  }

  get self(): NetPlayer | undefined {
    return this.players.get(this.id);
  }
}
