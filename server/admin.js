/**
 * Kênh quản trị (socket.io namespace /admin) – yêu cầu mật khẩu ADMIN_PASSWORD.
 * Chức năng: xem phòng, kick/chặn, xoá chat, sửa tội/quà/thông số, gửi sự kiện giả, kết nối TikTok.
 */
import crypto from 'node:crypto';

function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

const GAME_KEYS = [
  'cellCapacity', 'idleSeconds', 'maxSentenceSeconds', 'commentCooldownSeconds', 'likesPerReduction', 'likeReductionSeconds',
  'followImmunity', 'wardenMinutes', 'bailMemorySeconds', 'webBailCooldownSeconds', 'maxTiktokActors', 'tiktokDespawnSeconds',
  'chatMaxLength', 'chatCooldownSeconds', 'digTapPercent', 'digDecayPercentPerSecond', 'digCooldownSeconds',
];

export function setupAdmin({ io, manager, ctx, env, log, bans, tiktok, demo, applyConfig, ingest }) {
  const nsp = io.of('/admin');
  const fails = new Map(); // ip -> { n, until }

  nsp.use((socket, next) => {
    const ip = manager.ipOf(socket);
    const f = fails.get(ip);
    if (f && f.until > Date.now()) return next(new Error('Thử sai quá nhiều, chờ 1 phút'));
    if (safeEqual(socket.handshake.auth?.password || '', env.adminPassword)) {
      fails.delete(ip);
      return next();
    }
    const n = (f?.n || 0) + 1;
    fails.set(ip, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
    log.warn(`Sai mật khẩu quản trị từ ${ip}`);
    next(new Error('Sai mật khẩu'));
  });

  const status = () => ({
    rooms: manager.overview(),
    liveRoom: manager.liveRoomName,
    tiktok: tiktok.getStatus(),
    demo: demo.running,
    bans: bans.list,
    config: ctx.config,
  });

  // Đẩy tổng quan định kỳ cho các trang quản trị đang mở
  setInterval(() => {
    if (nsp.sockets.size) nsp.emit('status', status());
  }, 2000);
  log.on('line', (l) => nsp.emit('log', l));
  manager.listeners.add((room, fx) => {
    if (fx.type !== 'idle' && fx.type !== 'jailed') nsp.emit('fx', { room, ...fx });
  });
  tiktok.on('status', () => nsp.emit('status', status()));

  nsp.on('connection', (socket) => {
    log.info(`Quản trị đăng nhập từ ${manager.ipOf(socket)}`);
    socket.emit('status', status());
    socket.emit('logs', log.recent.slice(-100));

    const on = (event, fn) =>
      socket.on(event, (payload, cb) => {
        try {
          const r = fn(payload);
          if (typeof cb === 'function') cb({ ok: true, result: r });
        } catch (e) {
          log.warn(`Lỗi lệnh quản trị ${event}`, e);
          if (typeof cb === 'function') cb({ ok: false, error: e.message });
        }
      });

    on('room:detail', (name) => manager.roomDetail(String(name)));
    on('kick', ({ room, id }) => manager.kick(room, id));
    on('ban', ({ room, id }) => manager.ban(room, id));
    on('unban', (id) => bans.remove(String(id)));
    on('chat:clear', (room) => manager.rooms.get(room)?.clearChat());
    on('room:reset', (room) => {
      const r = manager.rooms.get(room);
      if (!r) return;
      for (const a of [...r.actors.values()]) if (a.status === 'jailed' || a.status === 'escort') r.release(a, 'admin');
      r.stats.clear();
    });

    on('config:save', (p) => {
      const c = JSON.parse(JSON.stringify(ctx.config));
      if (Array.isArray(p.crimes)) {
        c.crimes = p.crimes
          .map((x) => ({ keyword: String(x.keyword || '').trim().slice(0, 50), seconds: Math.round(Number(x.seconds)), label: String(x.label || x.keyword || '').trim().slice(0, 40) }))
          .filter((x) => x.keyword && x.seconds > 0 && x.seconds <= 3600);
        if (!c.crimes.length) throw new Error('Cần ít nhất 1 tội');
      }
      if (p.gifts && typeof p.gifts === 'object') {
        for (const t of ['small', 'medium', 'large', 'huge']) {
          const g = p.gifts[t];
          if (!g) continue;
          c.gifts[t] = {
            displayName: String(g.displayName || t).slice(0, 40),
            names: (g.names || []).map((s) => String(s).trim()).filter(Boolean),
            ids: (g.ids || []).map((s) => String(s).trim()).filter(Boolean),
            minDiamonds: Math.max(0, Number(g.minDiamonds) || 0),
            ...(t === 'small' ? { reduceSeconds: Math.max(1, Number(g.reduceSeconds) || 30) } : {}),
          };
        }
        if (p.gifts.useDiamondFallback !== undefined) c.gifts.useDiamondFallback = !!p.gifts.useDiamondFallback;
      }
      if (p.game && typeof p.game === 'object') {
        for (const k of GAME_KEYS) if (p.game[k] !== undefined && Number(p.game[k]) >= 0) c.game[k] = Number(p.game[k]);
        if (typeof p.game.digKeyword === 'string') c.game.digKeyword = p.game.digKeyword.trim().slice(0, 20);
      }
      if (p.rooms && typeof p.rooms === 'object') {
        const mp = Number(p.rooms.maxPlayers);
        if (mp >= 1 && mp <= 100) c.rooms.maxPlayers = mp;
      }
      if (Array.isArray(p.bannedWords)) c.bannedWords = [...new Set(p.bannedWords.map((w) => String(w).trim()).filter(Boolean))];
      if (Array.isArray(p.ticker)) c.ticker = p.ticker.map((s) => String(s).trim()).filter(Boolean);
      applyConfig(c, true);
      return true;
    });

    on('fake', (e) => {
      const room = String(e.room || manager.liveRoomName);
      const uid = String(e.uniqueId || e.nickname || 'tester').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^a-z0-9_.]/gi, '').toLowerCase() || 'tester';
      const user = { key: `test_${uid}`, uniqueId: uid, nickname: String(e.nickname || uid).slice(0, 40), avatar: e.avatar || null };
      const evt = { type: e.type, user };
      if (e.type === 'chat') evt.comment = String(e.comment || '').slice(0, 300);
      if (e.type === 'gift') evt.gift = { tier: e.tier || undefined, name: e.giftName || '', diamonds: Number(e.diamonds) || 0, count: Number(e.count) || 1 };
      if (e.type === 'like') evt.likeCount = Number(e.likeCount) || 1;
      return ingest(evt, 'test', room);
    });

    on('tiktok:connect', ({ username, room }) => {
      if (room) ctx.liveRoom = String(room);
      tiktok.start(String(username || env.tiktokUsername));
    });
    on('tiktok:disconnect', () => tiktok.stop());
    on('demo', (onoff) => (onoff ? demo.start() : demo.stop()));
    on('liveRoom', (room) => {
      if (!/^[a-z0-9-]{1,24}$/.test(room)) throw new Error('Tên phòng không hợp lệ');
      ctx.liveRoom = room;
      manager.getRoom(room);
    });
  });
}
