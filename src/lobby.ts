import { Net, type RoomInfo } from './net';
import { settings, updateSetting } from './settings';

/** Multiplayer lobby: browse, create, direct-connect. */

export class Lobby {
  private tabsEl = document.getElementById('lobbyTabs') as HTMLElement;
  private bodyEl = document.getElementById('lobbyBody') as HTMLElement;
  private statusEl = document.getElementById('netStatus') as HTMLElement;
  private urlEl = document.getElementById('serverUrl') as HTMLInputElement;
  private nameEl = document.getElementById('playerName') as HTMLInputElement;
  private tab: 'browse' | 'create' | 'direct' = 'browse';
  private net: Net;
  private onPlay: () => void;
  private onClose: () => void;
  private refreshTimer: number | null = null;

  constructor(net: Net, onPlay: () => void, onClose: () => void) {
    this.net = net;
    this.onPlay = onPlay;
    this.onClose = onClose;

    this.urlEl.value = settings.serverUrl;
    this.nameEl.value = settings.playerName;

    this.urlEl.onchange = () => updateSetting('serverUrl', this.urlEl.value.trim());
    this.nameEl.onchange = () => updateSetting('playerName', this.nameEl.value.trim() || 'player');

    document.getElementById('btn-connect')?.addEventListener('click', () => this.connect());
    document.getElementById('btn-lobby-close')?.addEventListener('click', () => {
      this.net.close();
      this.onClose();
    });
    document.getElementById('btn-refresh')?.addEventListener('click', () => this.net.requestRooms());

    net.onRooms = (rooms) => {
      if (this.tab === 'browse') this.renderRooms(rooms);
    };


    this.renderStatus();
    this.render();
  }

  show(): void {
    this.render();
    this.renderStatus();
    if (this.net.status !== 'online') this.connect();
    else this.net.requestRooms();
    this.startAutoRefresh();
  }

  private startAutoRefresh(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = window.setInterval(() => {
      if (this.net.status === 'online' && this.tab === 'browse') this.net.requestRooms();
    }, 3000);
  }

  private connect(): void {
    const url = this.urlEl.value.trim();
    updateSetting('serverUrl', url);
    updateSetting('playerName', this.nameEl.value.trim() || 'player');
    this.net.connect(url, this.nameEl.value.trim() || 'player');
  }

  /** Called by the game when the connection state changes. */
  refreshStatus(): void {
    this.renderStatus();
    if (this.tab === 'browse') this.renderRooms(this.net.rooms);
  }

  private renderStatus(): void {
    const s = this.net.status;
    const map: Record<string, string> = {
      offline: 'not connected',
      connecting: 'connecting…',
      online: `connected · ${this.net.ping} ms · ${this.net.rooms.length} servers`,
      error: this.net.lastError || 'error',
    };
    this.statusEl.textContent = map[s] ?? s;
    this.statusEl.dataset.state = s;
  }

  private render(): void {
    this.tabsEl.innerHTML = '';
    for (const t of [
      { id: 'browse', label: 'BROWSE' },
      { id: 'create', label: 'CREATE SERVER' },
      { id: 'direct', label: 'DIRECT JOIN' },
    ] as const) {
      const b = document.createElement('button');
      b.className = 'tab' + (t.id === this.tab ? ' active' : '');
      b.textContent = t.label;
      b.onclick = () => {
        this.tab = t.id;
        this.render();
      };
      this.tabsEl.appendChild(b);
    }

    this.bodyEl.innerHTML = '';
    if (this.tab === 'browse') this.renderRooms(this.net.rooms);
    if (this.tab === 'create') this.renderCreate();
    if (this.tab === 'direct') this.renderDirect();
  }

  private renderRooms(rooms: RoomInfo[]): void {
    if (this.tab !== 'browse') return;
    this.bodyEl.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'roomHead';
    head.innerHTML = `<span>${rooms.length} server${rooms.length === 1 ? '' : 's'} online</span>`;
    const refresh = document.createElement('button');
    refresh.className = 'mini';
    refresh.textContent = 'REFRESH';
    refresh.onclick = () => this.net.requestRooms();
    head.appendChild(refresh);
    this.bodyEl.appendChild(head);

    if (rooms.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'roomEmpty';
      empty.innerHTML =
        'No servers yet.<br><span>Create one and your friends can join with the 4-letter code.</span>';
      this.bodyEl.appendChild(empty);
      return;
    }

    for (const r of rooms) {
      const card = document.createElement('button');
      card.className = 'roomCard';
      card.innerHTML = `
        <div class="roomMain">
          <div class="roomName">${escapeHtml(r.name)}</div>
          <div class="roomMeta">${r.map.toUpperCase()} · ${r.kills} kills · <span class="code">${r.id}</span></div>
        </div>
        <div class="roomSide">
          <div class="roomPlayers">${r.players}/${r.max}</div>
          <div class="roomState ${r.state}">${r.state}</div>
        </div>`;
      card.onclick = () => {
        if (this.net.status !== 'online') {
          this.connect();
          return;
        }
        this.net.joinRoom(r.id);
        this.onPlay();
      };
      this.bodyEl.appendChild(card);
    }
  }

  private renderCreate(): void {
    const wrap = document.createElement('div');

    const field = (label: string, input: HTMLElement) => {
      const row = document.createElement('div');
      row.className = 'row';
      const l = document.createElement('div');
      l.className = 'rowLabel';
      l.textContent = label;
      row.append(l, input);
      wrap.appendChild(row);
      return row;
    };

    const nameInput = document.createElement('input');
    nameInput.className = 'textInput';
    nameInput.value = `${settings.playerName}'s server`;
    nameInput.maxLength = 24;
    field('Server name', nameInput);

    const maxInput = document.createElement('input');
    maxInput.type = 'range';
    maxInput.min = '2';
    maxInput.max = '12';
    maxInput.value = '8';
    const maxVal = document.createElement('div');
    maxVal.className = 'rowValue';
    maxVal.textContent = '8';
    maxInput.oninput = () => (maxVal.textContent = maxInput.value);
    const maxWrap = document.createElement('div');
    maxWrap.className = 'inline';
    maxWrap.append(maxInput, maxVal);
    field('Max players', maxWrap);

    const killsInput = document.createElement('input');
    killsInput.type = 'range';
    killsInput.min = '5';
    killsInput.max = '60';
    killsInput.value = String(settings.targetKills);
    const killsVal = document.createElement('div');
    killsVal.className = 'rowValue';
    killsVal.textContent = String(settings.targetKills);
    killsInput.oninput = () => (killsVal.textContent = killsInput.value);
    const killsWrap = document.createElement('div');
    killsWrap.className = 'inline';
    killsWrap.append(killsInput, killsVal);
    field('Kills to win', killsWrap);

    const btn = document.createElement('button');
    btn.className = 'big';
    btn.textContent = 'CREATE & PLAY';
    btn.style.marginTop = '16px';
    btn.onclick = () => {
      if (this.net.status !== 'online') {
        this.connect();
        this.statusEl.textContent = 'connecting… press CREATE again in a second';
        return;
      }
      this.net.createRoom({
        name: nameInput.value || 'server',
        max: Number(maxInput.value),
        kills: Number(killsInput.value),
        map: 'dust',
      });
      this.onPlay();
    };
    wrap.appendChild(btn);

    const note = document.createElement('div');
    note.className = 'rowHint';
    note.style.marginTop = '10px';
    note.textContent =
      'Your server gets a 4-letter code — share it and anyone on this server address can join.';
    wrap.appendChild(note);

    this.bodyEl.appendChild(wrap);
  }

  private renderDirect(): void {
    const wrap = document.createElement('div');
    const input = document.createElement('input');
    input.className = 'textInput codeInput';
    input.placeholder = 'ABCD';
    input.maxLength = 4;

    const row = document.createElement('div');
    row.className = 'row';
    const l = document.createElement('div');
    l.className = 'rowLabel';
    l.textContent = 'Server code';
    row.append(l, input);
    wrap.appendChild(row);

    const btn = document.createElement('button');
    btn.className = 'big';
    btn.textContent = 'JOIN';
    btn.style.marginTop = '16px';
    btn.onclick = () => {
      const code = input.value.trim().toUpperCase();
      if (this.net.status !== 'online') {
        this.connect();
        return;
      }
      if (code.length < 3) {
        this.statusEl.textContent = 'enter the 4-letter server code';
        return;
      }
      this.net.joinRoom(code);
      this.onPlay();
    };
    wrap.appendChild(btn);
    this.bodyEl.appendChild(wrap);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
