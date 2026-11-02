/**
 * Điểm khởi động server "Đi Tù Online 3D".
 *
 *   /            trang chơi 3D (PWA)
 *   /live        trang phát live dọc 1080x1920 cho OBS / TikTok LIVE Studio
 *   /admin       trang quản trị (mật khẩu ADMIN_PASSWORD)
 *   /avatar?u=   proxy ảnh đại diện TikTok
 *
 * Luồng dữ liệu: [Người chơi web | TikTok | Sự kiện giả] → Room → socket.io → trình duyệt
 */
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { env, ROOT, loadConfig, saveConfig } from './config.js';
import { Logger } from './logger.js';
import { ContentFilter } from '../shared/filter.js';
import { buildCrimes, buildGiftIndex } from './rules.js';
import { RoomManager } from './RoomManager.js';
import { BanList } from './bans.js';
import { avatarProxy } from './avatarProxy.js';
import { setupAdmin } from './admin.js';
import { TikTokSource } from './sources/tiktokSource.js';
import { DemoBot } from './sources/demoBot.js';

const log = new Logger({ dir: env.logDir, level: env.logLevel });
process.on('uncaughtException', (e) => log.error('Lỗi không bắt được', e));
process.on('unhandledRejection', (e) => log.error('Promise bị từ chối không xử lý', e));

// ───────── Cấu hình dùng chung cho mọi phòng ─────────
const ctx = { config: null, crimes: [], giftIndex: null, filter: new ContentFilter(), liveRoom: env.liveRoom };
let manager = null;
function applyConfig(config, persist = false) {
  ctx.config = config;
  ctx.crimes = buildCrimes(config.crimes);
  ctx.giftIndex = buildGiftIndex(config.gifts);
  ctx.filter.setWords(config.bannedWords || []);
  if (persist) {
    saveConfig(config);
    log.info('Đã lưu config.json');
  }
  if (manager) manager.broadcastRules();
}
try {
  applyConfig(loadConfig());
} catch (e) {
  log.error('Không đọc được config.json – kiểm tra lại cú pháp JSON', e);
  process.exit(1);
}

// ───────── Web server ─────────
const app = express();
app.disable('x-powered-by');
if (env.trustProxy) app.set('trust proxy', true);
const server = http.createServer(app);
const io = new Server(server, { serveClient: false, pingInterval: 20000, pingTimeout: 20000, maxHttpBufferSize: 1e5 });

app.get('/healthz', (req, res) => res.json({ ok: true, rooms: manager?.rooms.size || 0 }));
app.get('/avatar', avatarProxy(log));
app.get('/api/rules', (req, res) => res.json(manager.rulesPayload()));

const PAGES = { '/': 'index.html', '/live': 'live.html', '/admin': 'admin.html' };
if (env.production) {
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    log.error('Chưa build giao diện. Chạy: npm run build');
    process.exit(1);
  }
  for (const [route, file] of Object.entries(PAGES)) app.get(route, (req, res) => res.sendFile(path.join(dist, file)));
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '30d' }));
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
} else {
  // Chế độ phát triển: Vite chạy chung tiến trình, tự tải lại khi sửa code giao diện
  const { createServer } = await import('vite');
  const vite = await createServer({ configFile: path.join(ROOT, 'vite.config.js'), server: { middlewareMode: true, hmr: { server } }, appType: 'mpa' });
  for (const [route, file] of Object.entries(PAGES)) {
    app.get(route, (req, res, next) => {
      req.url = '/' + file + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
      next();
    });
  }
  app.use(vite.middlewares);
}

// ───────── Phòng chơi ─────────
const bans = new BanList(env.dataDir, log);
manager = new RoomManager({ io, ctx, log, bans, trustProxy: env.trustProxy });
manager.getRoom(manager.liveRoomName); // phòng live luôn mở sẵn

/** Đưa sự kiện TikTok (thật hoặc giả) vào phòng live */
function ingest(evt, source, roomName) {
  if (!evt?.user?.key) return { ok: false };
  if (bans.isBanned({ key: `tt:${evt.user.key}` })) return { ok: false, reason: 'banned' };
  const room = manager.getRoom(roomName || manager.liveRoomName);
  if (!room) return { ok: false, reason: 'no-room' };
  const res = room.handleTiktok(evt);
  if (evt.type === 'gift') {
    const g = evt.gift || {};
    log.info(`[${source}] Quà "${g.name || g.tier || '?'}" (giftId=${g.id ?? '-'}, ${g.diamonds || 0} kim cương) x${g.count || 1} từ ${evt.user.uniqueId || evt.user.key} → ${res.action || res.reason}`);
  } else if (res.reason === 'blocked') log.info(`[${source}] Chặn bình luận tục tĩu từ ${evt.user.key}`);
  else log.debug(`[${source}] ${evt.type} ${evt.user.key} → ${JSON.stringify(res)}`);
  return res;
}

const tiktok = new TikTokSource({
  username: env.tiktokUsername,
  signApiKey: env.signApiKey,
  logger: log,
  minDelay: env.reconnectMinSeconds,
  maxDelay: env.reconnectMaxSeconds,
  onEvent: (evt) => ingest(evt, 'tiktok'),
});
const demo = new DemoBot({ logger: log, getCrimes: () => ctx.crimes, onEvent: (evt) => ingest(evt, 'demo') });

setupAdmin({ io, manager, ctx, env, log, bans, tiktok, demo, applyConfig, ingest });

// ───────── Khởi động ─────────
server.listen(env.port, env.host, () => {
  const base = `http://localhost:${env.port}`;
  log.info('════════ ĐI TÙ ONLINE 3D ════════');
  log.info(`Chơi:       ${base}/?phong=tu-1`);
  log.info(`Live (OBS): ${base}/live?phong=${manager.liveRoomName}`);
  log.info(`Quản trị:   ${base}/admin`);
  if (env.adminPasswordGenerated) log.warn(`Chưa đặt ADMIN_PASSWORD – mật khẩu tạm lần này: ${env.adminPassword}`);
  if (env.tiktokUsername && env.tiktokAutoConnect) tiktok.start();
  else log.info('Chưa kết nối TikTok (đặt TIKTOK_USERNAME trong .env hoặc kết nối ở trang quản trị)');
  if (env.demoBot) demo.start();
});
server.on('error', (e) => {
  log.error(`Không mở được cổng ${env.port}`, e);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    log.info('Đang tắt server…');
    demo.stop();
    await tiktok.stop(true);
    process.exit(0);
  });
}
