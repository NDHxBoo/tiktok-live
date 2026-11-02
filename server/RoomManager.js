/**
 * RoomManager – chia phòng, quản lý kết nối người chơi / trang live, vòng lặp game.
 *
 * - Phòng chọn qua URL ?phong=tu-1. Tối đa N người chơi web/phòng (config.rooms.maxPlayers).
 * - Phòng đầy → tự chuyển sang phòng tu-2, tu-3… (tạo mới nếu chưa có).
 * - Trang /live vào phòng với vai trò "người xem" (không có nhân vật, không tính vào giới hạn).
 */
import { Room } from './Room.js';
import { TICK_MS } from '../shared/protocol.js';
import { cleanName } from './rules.js';

const ROOM_RE = /^[a-z0-9-]{1,24}$/;

export class RoomManager {
  constructor({ io, ctx, log, bans, trustProxy }) {
    this.io = io;
    this.ctx = ctx;
    this.log = log;
    this.bans = bans;
    this.trustProxy = trustProxy;
    this.rooms = new Map();
    this.sockets = new Map(); // `${room}:${actorId}` -> socket
    this.listeners = new Set(); // hàm nhận mọi fx (cho trang quản trị)
    io.on('connection', (s) => this._onConnection(s));
    let last = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(500, now - last);
      last = now;
      for (const room of this.rooms.values()) {
        room.tick(dt);
        if (room.actors.size) this.io.to(room.name).emit('s', room.snapshot());
      }
      this._cleanup(now);
    }, TICK_MS);
  }

  get prefix() {
    return this.ctx.config.rooms?.prefix || 'tu';
  }
  get maxPlayers() {
    return Math.max(1, Number(this.ctx.config.rooms?.maxPlayers) || 30);
  }
  get liveRoomName() {
    return this.ctx.liveRoom || this.ctx.config.rooms?.liveRoom || `${this.prefix}-1`;
  }

  /** Lấy phòng (tạo mới nếu chưa có) */
  getRoom(name) {
    let room = this.rooms.get(name);
    if (room) return room;
    const maxRooms = Number(this.ctx.config.rooms?.maxRooms) || 50;
    if (this.rooms.size >= maxRooms) return null;
    room = new Room(name, this.ctx);
    room.emptySince = Date.now();
    const to = () => this.io.to(name);
    room.on('metas', (m) => to().emit('metas', m));
    room.on('remove', (id) => to().emit('remove', id));
    room.on('chat', (c) => to().emit('chat', c));
    room.on('info', (i) => to().emit('info', i));
    room.on('tunnel', (t) => to().emit('tunnel', t));
    room.on('fx', (fx) => {
      to().emit('fx', fx);
      if (!['idle', 'jailed', 'reduce'].includes(fx.type)) {
        this.log.info(`[${name}] ${fx.type}${fx.reason ? '/' + fx.reason : ''} ${fx.name || fx.by || ''}${fx.crime ? ' – ' + fx.crime : ''}`);
      }
      this.listeners.forEach((fn) => fn(name, fx));
    });
    this.rooms.set(name, room);
    this.log.info(`Mở phòng ${name}`);
    return room;
  }

  /** Chọn phòng cho người chơi: phòng yêu cầu nếu còn chỗ, nếu không thì phòng kế tiếp còn chỗ */
  pickRoom(requested) {
    const req = ROOM_RE.test(requested || '') ? requested : null;
    if (req) {
      const r = this.getRoom(req);
      if (r && r.webCount() < this.maxPlayers) return r;
    }
    for (let i = 1; i <= (Number(this.ctx.config.rooms?.maxRooms) || 50); i++) {
      const name = `${this.prefix}-${i}`;
      const r = this.rooms.get(name);
      if (!r || r.webCount() < this.maxPlayers) return this.getRoom(name);
    }
    return null;
  }

  ipOf(socket) {
    if (this.trustProxy) {
      const xf = socket.handshake.headers['x-forwarded-for'];
      if (xf) return String(xf).split(',')[0].trim();
    }
    return socket.handshake.address;
  }

  rulesPayload() {
    const c = this.ctx.config;
    const g = c.game || {};
    const gifts = {};
    for (const t of ['small', 'medium', 'large', 'huge']) gifts[t] = { displayName: c.gifts?.[t]?.displayName || t, reduceSeconds: c.gifts?.[t]?.reduceSeconds };
    return {
      crimes: this.ctx.crimes.map((x) => ({ id: x.id, keyword: x.keyword, label: x.label, seconds: x.seconds })),
      gifts,
      likesPerReduction: g.likesPerReduction,
      likeReductionSeconds: g.likeReductionSeconds,
      wardenMinutes: g.wardenMinutes,
      followImmunity: g.followImmunity,
      digKeyword: g.digKeyword,
      chatMaxLength: g.chatMaxLength || 60,
      webBailCooldownSeconds: g.webBailCooldownSeconds,
      ticker: c.ticker || [],
      maxPlayers: this.maxPlayers,
    };
  }

  /** Gửi lại luật chơi cho mọi người khi quản trị sửa cấu hình */
  broadcastRules() {
    this.io.emit('rules', this.rulesPayload());
  }

  // ───────────────────────── Kết nối ─────────────────────────

  _onConnection(socket) {
    const ip = this.ipOf(socket);
    let moveCount = 0;
    const moveReset = setInterval(() => (moveCount = 0), 1000);

    const ctxOf = () => {
      const d = socket.data;
      if (!d.room) return {};
      const room = this.rooms.get(d.room);
      const actor = room && d.actorId ? room.actors.get(d.actorId) : null;
      return { room, actor };
    };
    const reply = (cb, v) => typeof cb === 'function' && cb(v);

    socket.on('join', (p = {}, cb) => {
      if (socket.data.room) return reply(cb, { ok: false, reason: 'Đã vào phòng rồi' });
      const mode = p.mode === 'live' ? 'live' : 'play';

      if (mode === 'live') {
        const name = ROOM_RE.test(p.room || '') ? p.room : this.liveRoomName;
        const room = this.getRoom(name);
        if (!room) return reply(cb, { ok: false, reason: 'Hết phòng' });
        socket.data.room = name;
        socket.data.watcher = true;
        room.watchers++;
        socket.join(name);
        return reply(cb, { ok: true, room: name, you: null, metas: room.allMetas(), info: room.info(), rules: this.rulesPayload(), chat: room.chatLog.slice(-10) });
      }

      const clientId = String(p.clientId || '').slice(0, 64);
      if (!/^[\w-]{8,64}$/.test(clientId)) return reply(cb, { ok: false, reason: 'Thiếu mã người chơi' });
      if (this.bans.isBanned({ clientId, ip })) return reply(cb, { ok: false, reason: 'Bạn đã bị chặn khỏi trò chơi.' });
      const name = cleanName(p.name, 16);
      if ([...name].length < 2) return reply(cb, { ok: false, reason: 'Biệt danh cần ít nhất 2 ký tự' });
      if (this.ctx.filter.isDirty(name)) return reply(cb, { ok: false, reason: 'Biệt danh có từ không phù hợp, chọn tên khác nhé' });

      const room = this.pickRoom(String(p.room || '').toLowerCase());
      if (!room) return reply(cb, { ok: false, reason: 'Tất cả phòng đều đầy, thử lại sau nhé' });

      // Cùng một máy mở 2 tab trong cùng phòng → đá tab cũ
      for (const a of room.actors.values()) {
        if (a.key === `web:${clientId}`) {
          const old = this.sockets.get(`${room.name}:${a.id}`);
          if (old) old.emit('kicked', { reason: 'Bạn đã vào từ tab/thiết bị khác' }), old.disconnect(true);
          room.removeActor(a.id);
        }
      }

      const actor = room.addWebPlayer({ clientId, name });
      actor.ip = ip;
      actor.clientId = clientId;
      socket.data.room = room.name;
      socket.data.actorId = actor.id;
      this.sockets.set(`${room.name}:${actor.id}`, socket);
      socket.join(room.name);
      room.emptySince = 0;
      this.log.info(`[${room.name}] ${name} vào phòng (${room.webCount()}/${this.maxPlayers})`);
      reply(cb, {
        ok: true,
        room: room.name,
        redirected: p.room && p.room !== room.name,
        you: actor.id,
        metas: room.allMetas(),
        info: room.info(),
        rules: this.rulesPayload(),
        chat: room.chatLog.slice(-10),
      });
    });

    socket.on('sentence', (crimeId, cb) => {
      const { room, actor } = ctxOf();
      if (!actor) return reply(cb, { ok: false });
      reply(cb, room.webSentence(actor, crimeId));
    });

    socket.on('move', (m) => {
      if (++moveCount > 25) return; // tối đa ~25 gói/giây
      const { room, actor } = ctxOf();
      if (actor) room.webMove(actor, m);
    });

    socket.on('chat', (text, cb) => {
      const { room, actor } = ctxOf();
      if (!actor) return reply(cb, { ok: false });
      reply(cb, room.webChat(actor, String(text || '')));
    });

    socket.on('emote', (name, cb) => {
      const { room, actor } = ctxOf();
      if (!actor) return reply(cb, { ok: false });
      reply(cb, room.webEmote(actor, String(name)));
    });

    socket.on('bail', (id, cb) => {
      const { room, actor } = ctxOf();
      if (!actor) return reply(cb, { ok: false });
      reply(cb, room.webBail(actor, id));
    });

    socket.on('act', (type, cb) => {
      const { room, actor } = ctxOf();
      if (!actor) return reply(cb, { ok: false });
      reply(cb, room.webAct(actor, String(type)));
    });

    socket.on('disconnect', () => {
      clearInterval(moveReset);
      const d = socket.data;
      const room = d.room && this.rooms.get(d.room);
      if (!room) return;
      if (d.watcher) room.watchers = Math.max(0, room.watchers - 1);
      if (d.actorId) {
        const key = `${room.name}:${d.actorId}`;
        if (this.sockets.get(key) === socket) this.sockets.delete(key);
        const a = room.actors.get(d.actorId);
        if (a) this.log.info(`[${room.name}] ${a.name} rời phòng`);
        room.removeActor(d.actorId);
      }
    });
  }

  // ───────────────────────── Quản trị ─────────────────────────

  kick(roomName, actorId, reason = 'Bạn đã bị mời ra khỏi phòng') {
    const room = this.rooms.get(roomName);
    if (!room) return false;
    const s = this.sockets.get(`${roomName}:${actorId}`);
    if (s) {
      s.emit('kicked', { reason });
      s.disconnect(true);
    }
    room.removeActor(Number(actorId));
    return true;
  }

  ban(roomName, actorId) {
    const room = this.rooms.get(roomName);
    const a = room?.actors.get(Number(actorId));
    if (!a) return false;
    this.bans.add({ clientId: a.clientId, ip: a.ip, name: a.name, key: a.kind === 'tiktok' ? a.key : null });
    this.kick(roomName, actorId, 'Bạn đã bị chặn khỏi trò chơi.');
    return true;
  }

  overview() {
    return [...this.rooms.values()].map((r) => {
      const i = r.info();
      return { name: r.name, players: i.players, maxPlayers: i.maxPlayers, tiktok: i.tiktok, prisoners: i.prisoners, watchers: r.watchers, live: r.name === this.liveRoomName };
    });
  }

  roomDetail(name) {
    const r = this.rooms.get(name);
    if (!r) return null;
    return {
      name,
      actors: [...r.actors.values()].map((a) => ({
        id: a.id, kind: a.kind, name: a.name, status: a.status, crime: a.crime,
        remaining: Math.ceil(Math.max(0, a.remainingMs) / 1000), ip: a.ip || '', warden: a.warden,
      })),
      chat: r.chatLog.slice(-30),
    };
  }

  /** Xoá phòng trống quá 60 giây (trừ phòng live) */
  _cleanup(now) {
    for (const r of this.rooms.values()) {
      if (r.name === this.liveRoomName) continue;
      const empty = r.webCount() === 0 && r.watchers === 0 && ![...r.actors.values()].some((a) => a.kind === 'tiktok');
      if (!empty) {
        r.emptySince = 0;
        continue;
      }
      if (!r.emptySince) r.emptySince = now;
      else if (now - r.emptySince > 60_000) {
        this.rooms.delete(r.name);
        this.log.info(`Đóng phòng trống ${r.name}`);
      }
    }
  }
}
