'use strict';
/**
 * Đọc biến môi trường (.env) và config.json; lưu config.json khi sửa từ trang điều khiển.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.resolve(ROOT, process.env.CONFIG_FILE || 'config.json');

const env = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '127.0.0.1',
  mode: (process.env.MODE || 'test').toLowerCase() === 'live' ? 'live' : 'test',
  tiktokUsername: (process.env.TIKTOK_USERNAME || '').replace(/^@/, '').trim(),
  signApiKey: process.env.EULER_API_KEY || '',
  controlToken: process.env.CONTROL_TOKEN || '',
  // Bot demo: mặc định bật ở chế độ test, tắt ở chế độ live (trừ khi DEMO_BOT ghi rõ)
  demoBot: (process.env.DEMO_BOT || '').trim()
    ? /^(1|true|yes|on)$/i.test(process.env.DEMO_BOT.trim())
    : (process.env.MODE || 'test').toLowerCase() !== 'live',
  logDir: path.resolve(ROOT, process.env.LOG_DIR || 'logs'),
  logLevel: process.env.LOG_LEVEL || 'info',
  reconnectMinSeconds: Number(process.env.RECONNECT_MIN_SECONDS) || 5,
  reconnectMaxSeconds: Number(process.env.RECONNECT_MAX_SECONDS) || 120,
};

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

/** Ghi an toàn: ghi ra file tạm rồi đổi tên để không hỏng file khi mất điện giữa chừng */
function saveConfig(config) {
  const tmp = CONFIG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, CONFIG_PATH);
}

module.exports = { env, loadConfig, saveConfig, ROOT, CONFIG_PATH };
