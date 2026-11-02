/**
 * Danh sách chặn (lưu file data/bans.json, không cần database).
 * Chặn theo mã người chơi (lưu trong trình duyệt) và địa chỉ IP.
 */
import fs from 'node:fs';
import path from 'node:path';

export class BanList {
  constructor(dir, log) {
    this.file = path.join(dir, 'bans.json');
    this.log = log;
    this.list = [];
    try {
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(this.file)) this.list = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (e) {
      log.warn('Không đọc được danh sách chặn', e);
    }
  }

  _save() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.list, null, 2));
    } catch (e) {
      this.log.warn('Không lưu được danh sách chặn', e);
    }
  }

  add({ clientId, ip, name, key }) {
    const entry = { id: Date.now().toString(36), clientId: clientId || null, ip: ip || null, key: key || null, name: name || '', at: new Date().toISOString() };
    this.list.push(entry);
    this._save();
    this.log.info(`Chặn ${name} (${clientId || key || ''} ${ip || ''})`);
    return entry;
  }

  remove(id) {
    this.list = this.list.filter((e) => e.id !== id);
    this._save();
  }

  isBanned({ clientId, ip, key }) {
    return this.list.some((e) => (clientId && e.clientId === clientId) || (ip && e.ip === ip) || (key && e.key === key));
  }
}
