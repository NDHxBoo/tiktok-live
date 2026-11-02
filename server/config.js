/**
 * Đọc biến môi trường (.env) và config.json; lưu config.json khi sửa từ trang quản trị.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });

export const CONFIG_PATH = path.resolve(ROOT, process.env.CONFIG_FILE || 'config.json');
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data');

const bool = (v, def) => (v === undefined || String(v).trim() === '' ? def : /^(1|true|yes|on)$/i.test(String(v).trim()));

export const env = {
  production: process.env.NODE_ENV === 'production' || process.argv.includes('--prod'),
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  tiktokUsername: (process.env.TIKTOK_USERNAME || '').replace(/^@/, '').trim(),
  tiktokAutoConnect: bool(process.env.TIKTOK_AUTO_CONNECT, true),
  liveRoom: (process.env.LIVE_ROOM || '').trim(),
  signApiKey: process.env.EULER_API_KEY || '',
  // Mật khẩu trang /admin. Không đặt thì tự sinh ngẫu nhiên mỗi lần chạy (in ra log).
  adminPassword: process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('hex'),
  adminPasswordGenerated: !process.env.ADMIN_PASSWORD,
  trustProxy: bool(process.env.TRUST_PROXY, false),
  demoBot: bool(process.env.DEMO_BOT, false),
  logDir: path.resolve(ROOT, process.env.LOG_DIR || 'logs'),
  logLevel: process.env.LOG_LEVEL || 'info',
  dataDir: DATA_DIR,
  reconnectMinSeconds: Number(process.env.RECONNECT_MIN_SECONDS) || 5,
  reconnectMaxSeconds: Number(process.env.RECONNECT_MAX_SECONDS) || 120,
};

export function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

/** Ghi an toàn: ghi ra file tạm rồi đổi tên để không hỏng file nếu mất điện giữa chừng */
export function saveConfig(config) {
  const tmp = CONFIG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, CONFIG_PATH);
}
