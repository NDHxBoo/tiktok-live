'use strict';
/**
 * Điểm khởi động game "Đi Tù Online".
 * Luồng dữ liệu:  [TikTok | Trang điều khiển | Bot demo] → PrisonGame → socket.io → Overlay
 */
const { env, loadConfig, saveConfig } = require('./config');
const { Logger } = require('./logger');
const { PrisonGame } = require('./game/PrisonGame');
const { TikTokSource } = require('./sources/tiktokSource');
const { DemoBot } = require('./sources/demoBot');
const { createWebServer } = require('./web/server');

const logger = new Logger({ dir: env.logDir, level: env.logLevel });
process.on('uncaughtException', (e) => logger.error('Lỗi không bắt được', e));
process.on('unhandledRejection', (e) => logger.error('Promise bị từ chối không xử lý', e));

let config;
try {
  config = loadConfig();
} catch (e) {
  logger.error('Không đọc được config.json – kiểm tra lại cú pháp JSON', e);
  process.exit(1);
}

const game = new PrisonGame({ config });
const { server, overlay, control } = createWebServer({ controlToken: env.controlToken, logger });

// ───────── Đưa sự kiện vào game (dùng chung cho mọi nguồn) ─────────
function ingest(evt, source) {
  const res = game.handleEvent(evt);
  if (res && res.reason === 'blocked') logger.info(`[${source}] Chặn bình luận tục tĩu từ ${evt.user.key}`);
  else if (evt.type === 'gift') {
    // Luôn ghi tên quà / giftId / kim cương để dễ khai báo map quà trong config.json
    const g = evt.gift || {};
    logger.info(`[${source}] Quà "${g.name || g.tier || '?'}" (giftId=${g.id ?? '-'}, ${g.diamonds || 0} kim cương) x${g.count || 1} từ ${evt.user.uniqueId || evt.user.key} → ${res.action || res.reason}`);
  } else logger.debug(`[${source}] ${evt.type} ${evt.user.key} → ${JSON.stringify(res)}`);
  return res;
}

const tiktok = new TikTokSource({
  username: env.tiktokUsername,
  signApiKey: env.signApiKey,
  logger,
  minDelay: env.reconnectMinSeconds,
  maxDelay: env.reconnectMaxSeconds,
  onEvent: (evt) => ingest(evt, 'tiktok'),
});
const demo = new DemoBot({ logger, getCrimes: () => game.getState().rules.crimes, onEvent: (evt) => ingest(evt, 'demo') });

// ───────── Đồng bộ trạng thái sang overlay ─────────
let pending = null;
game.on('change', () => {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    const state = game.getState();
    overlay.emit('state', state);
    control.emit('state', state);
  }, 80);
});
game.on('fx', (fx) => {
  overlay.emit('fx', fx);
  control.emit('fx', fx);
  if (!['idle', 'toast'].includes(fx.type)) {
    const who = fx.prisoner?.name || fx.user?.name || fx.by?.name || '';
    logger.info(`[game] ${fx.type}${fx.reason ? '/' + fx.reason : ''} ${who}${fx.crime ? ' – ' + fx.crime : ''}`);
  }
});

// Đồng hồ game: đo thời gian thật trôi qua để không bị lệch khi máy lag
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  game.tick(now - last);
  last = now;
}, 1000);

// ───────── Overlay ─────────
overlay.on('connection', (socket) => {
  logger.info(`Overlay đã kết nối (${socket.handshake.address})`);
  socket.emit('state', game.getState());
});

// ───────── Trang điều khiển ─────────
function statusPayload() {
  return { mode: env.mode, tiktok: tiktok.getStatus(), demo: demo.running, config, logs: logger.recent.slice(-80) };
}
const pushStatus = () => control.emit('status', statusPayload());
tiktok.on('status', pushStatus);
logger.on('line', (l) => control.emit('log', l));

function persist(mutator, label) {
  mutator(config);
  game.updateConfig(config);
  try {
    saveConfig(config);
    logger.info(`Đã lưu config.json (${label})`);
  } catch (e) {
    logger.error('Không lưu được config.json', e);
  }
  pushStatus();
}

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^a-z0-9_.]/gi, '').toLowerCase();

control.on('connection', (socket) => {
  logger.info('Trang điều khiển đã kết nối');
  socket.emit('status', statusPayload());
  socket.emit('state', game.getState());

  const ack = (fn) => (...args) => {
    const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    try {
      const r = fn(...args);
      cb && cb({ ok: true, result: r });
    } catch (e) {
      logger.warn('Lỗi lệnh điều khiển', e);
      cb && cb({ ok: false, error: e.message });
    }
  };

  socket.on('setEnabled', ack((on) => game.setEnabled(on)));
  socket.on('reset', ack((opts) => game.reset(opts || {})));
  socket.on('setVolume', ack((v) => {
    const vol = Math.max(0, Math.min(1, Number(v) || 0));
    persist((c) => { c.audio = Object.assign({}, c.audio, { volume: vol }); }, 'âm lượng');
  }));
  socket.on('demo', ack((on) => { on ? demo.start() : demo.stop(); pushStatus(); }));
  socket.on('tiktok:connect', ack((username) => tiktok.start(username || env.tiktokUsername)));
  socket.on('tiktok:disconnect', ack(() => tiktok.stop()));

  // Sự kiện giả để test khi chưa live
  socket.on('fake', ack((e) => {
    const uid = slug(e.uniqueId || e.nickname) || 'tester';
    const user = { key: `test_${uid}`, uniqueId: uid, nickname: String(e.nickname || e.uniqueId || 'Tester').slice(0, 40), avatar: e.avatar || null };
    const evt = { type: e.type, user };
    if (e.type === 'chat') evt.comment = String(e.comment || '').slice(0, 300);
    if (e.type === 'gift') evt.gift = { tier: e.tier || undefined, name: e.giftName || '', diamonds: Number(e.diamonds) || 0, count: Number(e.count) || 1 };
    if (e.type === 'like') evt.likeCount = Number(e.likeCount) || 1;
    return ingest(evt, 'test');
  }));

  socket.on('saveCrimes', ack((list) => {
    if (!Array.isArray(list)) throw new Error('Danh sách tội không hợp lệ');
    const crimes = list
      .map((c) => ({ keyword: String(c.keyword || '').trim().slice(0, 50), seconds: Math.round(Number(c.seconds)), label: String(c.label || c.keyword || '').trim().slice(0, 40) }))
      .filter((c) => c.keyword && c.seconds > 0 && c.seconds <= 3600);
    persist((c) => { c.crimes = crimes; }, 'danh sách tội');
    return crimes.length;
  }));
  socket.on('saveBannedWords', ack((list) => {
    const words = (Array.isArray(list) ? list : []).map((w) => String(w).trim()).filter(Boolean);
    persist((c) => { c.bannedWords = [...new Set(words)]; }, 'từ cấm');
    return words.length;
  }));
  socket.on('saveTicker', ack((list) => {
    persist((c) => { c.ticker = (Array.isArray(list) ? list : []).map((s) => String(s).trim()).filter(Boolean); }, 'chữ chạy');
  }));
  socket.on('saveGame', ack((g) => {
    const allowed = ['maxCells', 'idleSeconds', 'maxSentenceSeconds', 'commentCooldownSeconds', 'likesPerReduction', 'likeReductionSeconds', 'wardenMinutes'];
    persist((c) => {
      for (const k of allowed) if (g && g[k] !== undefined && Number(g[k]) >= 0) c.game[k] = Number(g[k]);
    }, 'thông số game');
  }));
});

// ───────── Khởi động ─────────
server.listen(env.port, env.host, () => {
  const base = `http://${env.host === '0.0.0.0' ? 'localhost' : env.host}:${env.port}`;
  logger.info('════════ ĐI TÙ ONLINE ════════');
  logger.info(`Overlay (OBS):     ${base}/overlay`);
  logger.info(`Trang điều khiển:  ${base}/control`);
  logger.info(`Chế độ: ${env.mode === 'live' ? 'LIVE (kết nối TikTok)' : 'TEST (dữ liệu giả)'}`);
  if (env.mode === 'live') {
    if (env.tiktokUsername) tiktok.start();
    else logger.warn('Chưa đặt TIKTOK_USERNAME trong .env – nhập username trên trang điều khiển');
  }
  if (env.demoBot) demo.start();
});
server.on('error', (e) => {
  logger.error(`Không mở được cổng ${env.port}`, e);
  process.exit(1);
});

// Tắt gọn gàng
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    logger.info('Đang tắt game…');
    demo.stop();
    await tiktok.stop(true);
    process.exit(0);
  });
}
