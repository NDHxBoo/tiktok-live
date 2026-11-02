
/**
 * Logger đơn giản: in ra console + ghi file logs/YYYY-MM-DD.log,
 * đồng thời giữ 200 dòng gần nhất để hiện trên trang điều khiển.
 */
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

class Logger extends EventEmitter {
  constructor({ dir = 'logs', level = 'info' } = {}) {
    super();
    this.dir = path.resolve(dir);
    this.level = LEVELS[level] ?? LEVELS.info;
    this.recent = [];
    try {
      fs.mkdirSync(this.dir, { recursive: true });
    } catch (e) {
      console.error('Không tạo được thư mục log:', e.message);
    }
  }

  _write(level, msg, extra) {
    if (LEVELS[level] < this.level) return;
    const time = new Date();
    let line = `[${time.toISOString()}] [${level.toUpperCase()}] ${msg}`;
    if (extra !== undefined) {
      line += ' ' + (extra instanceof Error ? extra.stack || extra.message : typeof extra === 'string' ? extra : JSON.stringify(extra));
    }
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
    // Tên file theo ngày giờ địa phương
    const d = new Date(time.getTime() - time.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    fs.appendFile(path.join(this.dir, `${d}.log`), line + '\n', () => {});
    const entry = { time: time.getTime(), level, text: line.slice(line.indexOf(']') + 2) };
    this.recent.push(entry);
    if (this.recent.length > 200) this.recent.shift();
    this.emit('line', entry);
  }

  debug(m, e) { this._write('debug', m, e); }
  info(m, e) { this._write('info', m, e); }
  warn(m, e) { this._write('warn', m, e); }
  error(m, e) { this._write('error', m, e); }
}

export { Logger };
