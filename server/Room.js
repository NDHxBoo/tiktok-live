/**
 * Room – một phòng nhà tù. Người chơi web và người xem TikTok có thể ở chung một phòng.
 *
 * Server là nơi quyết định luật chơi:
 *   - Ai vào tù, án bao lâu, ai được thả, vượt ngục, Cai ngục…
 *   - Vị trí của nhân vật khi bị dẫn giải / chạy (server điều khiển)
 *   - Người chơi web chỉ tự di chuyển khi tự do hoặc đi lại trong ô tù (server giới hạn lại)
 *
 * AN TOÀN: không có hàm nào cho phép người A đưa người B vào tù.
 * Tội chỉ áp lên CHÍNH người gửi; người khác chỉ có thể được bảo lãnh RA.
 *
 * Phát sự kiện (EventEmitter) để RoomManager chuyển cho client:
 *   'metas'  [meta…]      thông tin nhân vật thay đổi
 *   'remove' id            nhân vật rời phòng
 *   'chat'   {id,name,text}
 *   'fx'     {type,…}      hiệu ứng (bắt, thả, vượt ngục, cai ngục…)
 *   'info'   {…}           thông tin phòng (1 lần/giây)
 *   'tunnel' {progress}    tiến độ đào hầm
 */
import { EventEmitter } from 'node:events';
import {
  SPAWN, CELLS, PODIUM, BENCHES, TUNNEL_EXIT, QUEUE_MAX,
  cellDoor, cellSlot, escortPath, releasePath, randomYardPoint, resolveFree, resolveCell, queueSlot,
} from '../shared/map.js';
import { ANIM, EMOTES, SERVER_DRIVEN } from '../shared/protocol.js';
import { matchCrime, hasKeyword, resolveGiftTier, pickBailTarget, cleanName } from './rules.js';

const SPEED = { escort: 5.2, run: 5.8, wander: 2.0, queue: 3.0, leaving: 3.2 };
const EMOTE_MS = 2600;
const MAX_WEB_SPEED = 6.5; // u/giây, chống "dịch chuyển tức thời"

export class Room extends EventEmitter {
  /**
   * @param {string} name
   * @param {object} ctx  ngữ cảnh dùng chung: { config, crimes, giftIndex, filter, log }
   * @param {object} [opts] { now, rand } – thay được khi test
   */
  constructor(name, ctx, { now = Date.now, rand = Math.random } = {}) {
    super();
    this.name = name;
    this.ctx = ctx;
    this.now = now;
    this.rand = rand;
    this.actors = new Map();
    this.nextId = 1;
    this.tiktokUsers = new Map(); // key TikTok -> { immunity, followed, likeBank, lastComment, lastCrimeAt }
    this.stats = new Map(); // key -> { name, avatar, danger, good }
    this.warden = null; // { id, until }
    this.tunnel = { progress: 0, cooldownUntil: 0, lastTapAt: 0, diggers: new Map(), lastSent: -1 };
    this.queue = [];
    this.chatLog = [];
    this.lastInteraction = this.now();
    this.idle = false;
    this.dirty = new Set();
    this.watchers = 0;
    this.infoTimer = 0;
  }

  get g() {
    return this.ctx.config.game || {};
  }

  // ═════════════════════════ Quản lý nhân vật ═════════════════════════

  _newActor(kind, key, name, avatar) {
    const id = this.nextId++;
    const a = {
      id, kind, key, name, avatar: avatar || null, hidden: false,
      color: hash(key) % 8,
      x: SPAWN.x + (this.rand() - 0.5) * 2, z: SPAWN.z, ry: Math.PI,
      moveAnim: ANIM.idle, anim: ANIM.idle, animUntil: 0,
      status: 'new', cell: null, slot: null,
      remainingMs: 0, totalMs: 0, crime: '', crimeCount: 0,
      path: null, speed: 0, waitUntil: 0, onArrive: null,
      warden: false, reps: 0,
      lastActive: this.now(), lastMoveAt: this.now(), nextThinkAt: 0,
      bailReadyAt: 0, lastChatAt: 0, lastCrimeAt: -Infinity, lastDigAt: 0, serveAt: 0,
    };
    this.actors.set(id, a);
    this.markMeta(a);
    return a;
  }

  /** Người chơi web vào phòng (tên đã được kiểm tra ở RoomManager) */
  addWebPlayer({ clientId, name }) {
    return this._newActor('web', `web:${clientId}`, name, null);
  }

  webCount() {
    let n = 0;
    for (const a of this.actors.values()) if (a.kind === 'web') n++;
    return n;
  }

  removeActor(id) {
    const a = this.actors.get(id);
    if (!a) return;
    this._leaveQueue(a);
    this.actors.delete(id);
    if (this.warden && this.warden.id === id) this.warden = null;
    this.dirty.delete(id);
    this.emit('remove', id);
  }

  markMeta(a) {
    this.dirty.add(a.id);
  }

  meta(a) {
    return {
      id: a.id,
      kind: a.kind,
      name: a.name,
      avatar: a.hidden ? null : proxify(a.avatar),
      color: a.color,
      status: a.status,
      cell: a.cell,
      crime: a.crime,
      crimeCount: a.crimeCount,
      remaining: Math.max(0, Math.round(a.remainingMs / 100) / 10),
      total: Math.round(a.totalMs / 1000),
      warden: a.warden,
      reps: a.reps,
    };
  }

  allMetas() {
    return [...this.actors.values()].map((a) => this.meta(a));
  }

  _stat(a) {
    let s = this.stats.get(a.key);
    if (!s) {
      s = { name: a.name, avatar: null, danger: 0, good: 0 };
      this.stats.set(a.key, s);
    }
    s.name = a.name;
    s.avatar = a.hidden ? null : proxify(a.avatar);
    return s;
  }

  _touch() {
    this.lastInteraction = this.now();
  }

  // ═════════════════════════ Nhận án / dẫn giải ═════════════════════════

  _cellLoad() {
    const load = new Array(CELLS.count).fill(0).map(() => new Set());
    for (const a of this.actors.values()) {
      if ((a.status === 'jailed' || a.status === 'escort') && a.cell != null) load[a.cell].add(a.slot);
    }
    return load;
  }

  /** Chọn ô ít người nhất; nếu nhà tù đầy thì thả người án ngắn nhất */
  _assignCell() {
    const cap = Math.max(1, Math.min(6, Number(this.g.cellCapacity) || 6));
    let load = this._cellLoad();
    let min = Math.min(...load.map((s) => s.size));
    if (min >= cap) {
      this._releaseShortest();
      load = this._cellLoad();
      min = Math.min(...load.map((s) => s.size));
    }
    const choices = load.map((s, i) => (s.size === min ? i : -1)).filter((i) => i >= 0);
    const cell = choices[Math.floor(this.rand() * choices.length)];
    let slot = 0;
    while (load[cell].has(slot)) slot++;
    return { cell, slot };
  }

  _releaseShortest() {
    let s = null;
    for (const a of this.actors.values()) {
      if ((a.status === 'jailed' || a.status === 'escort') && (!s || a.remainingMs < s.remainingMs)) s = a;
    }
    if (s) this.release(s, 'overflow');
  }

  /** Đưa CHÍNH nhân vật `a` vào tù (hoặc cộng dồn án nếu đang ở tù) */
  commitCrime(a, crime) {
    const maxMs = num(this.g.maxSentenceSeconds, 3600) * 1000;
    const addMs = crime.seconds * 1000;
    const stat = this._stat(a);

    if (a.status === 'jailed' || a.status === 'escort') {
      const before = a.remainingMs;
      a.remainingMs = Math.min(maxMs, a.remainingMs + addMs);
      const added = a.remainingMs - before;
      a.totalMs = Math.max(a.totalMs + added, a.remainingMs);
      a.crime = crime.label;
      a.crimeCount++;
      stat.danger += added / 1000;
      this.markMeta(a);
      this.emit('fx', { type: 'extend', id: a.id, name: a.name, crime: crime.label, added: added / 1000 });
      return { ok: true, action: 'extend', added: added / 1000 };
    }

    this._leaveQueue(a);
    if (this.warden && this.warden.id === a.id) this.warden = null; // Cai ngục phạm tội thì mất chức
    const fromGate = a.status === 'new';
    const { cell, slot } = this._assignCell();
    const ms = Math.min(maxMs, addMs);
    Object.assign(a, { cell, slot, remainingMs: ms, totalMs: ms, crime: crime.label, crimeCount: 1, status: 'escort', warden: false });
    const path = escortPath(cell, slot);
    this._setPath(a, fromGate ? path : path.slice(2), SPEED.escort, 'jail');
    stat.danger += ms / 1000;
    this.markMeta(a);
    this.emit('fx', { type: 'arrest', id: a.id, name: a.name, crime: crime.label, seconds: ms / 1000, kind: a.kind });
    return { ok: true, action: 'arrest', cell };
  }

  /** Thả một tù nhân: chạy ra khỏi ô rồi tự do trên sân */
  release(a, reason, extra = {}) {
    if (!(a.status === 'jailed' || a.status === 'escort')) return false;
    const cell = a.cell;
    a.status = 'run';
    a.cell = null;
    a.slot = null;
    a.remainingMs = 0;
    this._setPath(a, cell != null ? releasePath(cell, a, this.rand) : [randomYardPoint(this.rand)], SPEED.run, 'free');
    this.markMeta(a);
    this.emit('fx', Object.assign({ type: 'release', id: a.id, name: a.name, reason, kind: a.kind }, extra));
    return true;
  }

  _reduce(a, seconds, source) {
    if (!(a.status === 'jailed' || a.status === 'escort')) return false;
    a.remainingMs -= seconds * 1000;
    this.emit('fx', { type: 'reduce', id: a.id, name: a.name, seconds, source });
    if (a.remainingMs <= 0) this.release(a, 'served');
    else this.markMeta(a);
    return true;
  }

  /** Vượt ngục tập thể: tường phòng giam nổ, mọi người chạy ra sân */
  massEscape(byName, byKey) {
    let n = 0;
    for (const a of this.actors.values()) {
      if (a.status !== 'jailed' && a.status !== 'escort') continue;
      const door = a.cell != null ? cellDoor(a.cell) : { x: a.x, z: a.z };
      a.status = 'run';
      a.cell = null;
      a.slot = null;
      a.remainingMs = 0;
      this._setPath(a, [{ x: door.x + (this.rand() - 0.5) * 2, z: door.z + 2 }, randomYardPoint(this.rand)], SPEED.run + 0.8, 'free');
      this.markMeta(a);
      n++;
    }
    if (byKey) {
      const s = this.stats.get(byKey);
      if (s) s.good += n;
    }
    this.emit('fx', { type: 'escape', by: byName, count: n });
    return n;
  }

  // ═════════════════════════ Đào hầm ═════════════════════════

  dig(a, taps = 1) {
    if (a.status !== 'jailed') return { ok: false, reason: 'not-jailed' };
    const now = this.now();
    const t = this.tunnel;
    if (now < t.cooldownUntil) return { ok: false, reason: 'cooldown' };
    if (now - a.lastDigAt < 90) return { ok: false, reason: 'too-fast' };
    a.lastDigAt = now;
    a.anim = ANIM.dig;
    a.animUntil = now + 500;
    t.diggers.set(a.id, now);
    t.lastTapAt = now;
    let active = 0;
    for (const [id, at] of t.diggers) {
      if (now - at < 2000) active++;
      else t.diggers.delete(id);
    }
    // Nhiều người cùng đào thì nhanh hơn
    const per = num(this.g.digTapPercent, 0.35) * (1 + 0.5 * (active - 1));
    t.progress = Math.min(100, t.progress + per * taps);
    if (t.progress >= 100) this._tunnelEscape();
    return { ok: true, progress: t.progress, diggers: active };
  }

  _tunnelEscape() {
    const t = this.tunnel;
    let n = 0;
    for (const a of this.actors.values()) {
      if (a.status !== 'jailed' && a.status !== 'escort') continue;
      a.x = TUNNEL_EXIT.x - this.rand() * 0.8;
      a.z = TUNNEL_EXIT.z + (this.rand() - 0.5) * 3;
      a.status = 'run';
      a.cell = null;
      a.slot = null;
      a.remainingMs = 0;
      this._setPath(a, [randomYardPoint(this.rand)], SPEED.run, 'free');
      this.markMeta(a);
      n++;
    }
    t.progress = 0;
    t.diggers.clear();
    t.cooldownUntil = this.now() + num(this.g.digCooldownSeconds, 60) * 1000;
    this.emit('fx', { type: 'tunnel', count: n });
  }

  // ═════════════════════════ Nhà ăn ═════════════════════════

  _joinQueue(a) {
    if (this.queue.length >= QUEUE_MAX || this.queue.includes(a.id)) return false;
    this.queue.push(a.id);
    a.status = 'queue';
    a.serveAt = 0;
    this.markMeta(a);
    return true;
  }

  _leaveQueue(a) {
    const i = this.queue.indexOf(a.id);
    if (i < 0) return;
    this.queue.splice(i, 1);
    if (a.status === 'queue') {
      a.status = 'free';
      a.path = null;
      this.markMeta(a);
    }
  }

  _updateQueue(now) {
    this.queue.forEach((id, i) => {
      const a = this.actors.get(id);
      if (!a) return;
      const s = queueSlot(i);
      const far = Math.hypot(a.x - s.x, a.z - s.z) > 0.15;
      if (far && (!a.path || a.path.length === 0 || a.path[a.path.length - 1].x !== s.x)) this._setPath(a, [s], SPEED.queue, null);
      if (i === 0 && !far && !a.path) {
        if (!a.serveAt) a.serveAt = now + 2500;
        else if (now >= a.serveAt) {
          this.queue.shift();
          a.status = 'free';
          a.serveAt = 0;
          a.anim = ANIM.eat;
          a.animUntil = now + 3500;
          this.markMeta(a);
          this.emit('chat', { id: a.id, name: a.name, text: '🍲 Cơm tù ngon quá!' });
        }
      }
    });
  }

  // ═════════════════════════ Di chuyển theo lộ trình ═════════════════════════

  _setPath(a, path, speed, onArrive) {
    a.path = path.map((p) => ({ ...p }));
    a.speed = speed;
    a.onArrive = onArrive;
    a.waitUntil = 0;
  }

  _stepPath(a, dt, now) {
    if (now < a.waitUntil) {
      a.moveAnim = ANIM.idle;
      return;
    }
    const p = a.path[0];
    const dx = p.x - a.x;
    const dz = p.z - a.z;
    const dist = Math.hypot(dx, dz);
    const step = a.speed * dt;
    if (dist > 0.001) a.ry = Math.atan2(dx, dz);
    if (dist <= step) {
      a.x = p.x;
      a.z = p.z;
      a.path.shift();
      if (p.wait) a.waitUntil = now + p.wait * 1000;
    } else {
      a.x += (dx / dist) * step;
      a.z += (dz / dist) * step;
    }
    a.moveAnim = a.speed >= 4.5 ? ANIM.run : ANIM.walk;
    if (!a.path.length) {
      a.path = null;
      a.moveAnim = ANIM.idle;
      this._arrive(a);
    }
  }

  _arrive(a) {
    const what = a.onArrive;
    a.onArrive = null;
    if (what === 'jail' && a.status === 'escort') {
      a.status = 'jailed';
      a.ry = Math.PI; // quay mặt ra song sắt
      this.markMeta(a);
      this.emit('fx', { type: 'jailed', id: a.id, cell: a.cell });
    } else if (what === 'free' && a.status === 'run') {
      a.status = 'free';
      a.lastActive = this.now();
      this.markMeta(a);
    } else if (what === 'remove') {
      this.removeActor(a.id);
    } else if (what === 'lift') {
      a.anim = ANIM.lift;
      a.animUntil = this.now() + 4000;
      a.reps++;
      this.markMeta(a);
    }
  }

  // ═════════════════════════ Hành động người chơi web ═════════════════════════

  webSentence(a, crimeId) {
    const crime = this.ctx.crimes.find((c) => c.id === Number(crimeId));
    if (!crime) return { ok: false, reason: 'Tội không tồn tại' };
    const now = this.now();
    if (now - a.lastCrimeAt < num(this.g.commentCooldownSeconds, 2) * 1000) return { ok: false, reason: 'Từ từ thôi, vừa nhận án xong mà!' };
    if (a.status === 'run' || a.status === 'leaving') return { ok: false, reason: 'Đang chạy, chờ chút nhé' };
    a.lastCrimeAt = now;
    this._touch();
    return this.commitCrime(a, crime);
  }

  webMove(a, m) {
    if (!m || SERVER_DRIVEN.has(a.status) || a.status === 'new') return;
    const now = this.now();
    let x = Number(m.x);
    let z = Number(m.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    // Chống dịch chuyển: không cho đi xa hơn tốc độ tối đa
    const dt = Math.max(0.05, Math.min(1, (now - a.lastMoveAt) / 1000));
    a.lastMoveAt = now;
    const dx = x - a.x;
    const dz = z - a.z;
    const d = Math.hypot(dx, dz);
    const max = MAX_WEB_SPEED * dt + 0.3;
    if (d > max) {
      x = a.x + (dx / d) * max;
      z = a.z + (dz / d) * max;
    }
    const p = a.status === 'jailed' ? resolveCell(a.cell, x, z) : resolveFree(x, z);
    a.x = p.x;
    a.z = p.z;
    if (Number.isFinite(Number(m.ry))) a.ry = Number(m.ry);
    a.moveAnim = [ANIM.idle, ANIM.walk, ANIM.run].includes(m.anim) ? m.anim : ANIM.idle;
  }

  webChat(a, text) {
    const now = this.now();
    if (now - a.lastChatAt < num(this.g.chatCooldownSeconds, 1.2) * 1000) return { ok: false, reason: 'Gõ chậm lại chút nhé' };
    const clean = cleanName(text, Number(this.g.chatMaxLength) || 60);
    if (!clean) return { ok: false, reason: 'Tin nhắn trống' };
    if (this.ctx.filter.isDirty(clean)) return { ok: false, reason: 'Tin nhắn có từ không phù hợp nên đã bị chặn' };
    a.lastChatAt = now;
    this._touch();
    this._chat(a, clean);
    return { ok: true };
  }

  _chat(a, text) {
    const msg = { id: a.id, name: a.name, text, at: this.now() };
    this.chatLog.push(msg);
    if (this.chatLog.length > 50) this.chatLog.shift();
    this.emit('chat', msg);
  }

  clearChat() {
    this.chatLog = [];
    this.emit('fx', { type: 'chat-clear' });
  }

  webEmote(a, name) {
    if (!EMOTES.includes(name) || a.status === 'new') return { ok: false };
    a.anim = ANIM[name];
    a.animUntil = this.now() + EMOTE_MS;
    this._touch();
    return { ok: true };
  }

  webBail(a, targetId) {
    const t = this.actors.get(Number(targetId));
    if (!t || t.id === a.id) return { ok: false, reason: 'Không thể tự bảo lãnh chính mình' };
    if (t.status !== 'jailed' && t.status !== 'escort') return { ok: false, reason: 'Người này không ở tù' };
    const now = this.now();
    if (now < a.bailReadyAt) return { ok: false, reason: `Chờ ${Math.ceil((a.bailReadyAt - now) / 1000)} giây nữa mới bảo lãnh tiếp được` };
    a.bailReadyAt = now + num(this.g.webBailCooldownSeconds, 60) * 1000;
    this._touch();
    this.release(t, 'bail', { by: a.name });
    this._stat(a).good++;
    return { ok: true };
  }

  /** Hoạt động mini: lift (tập tạ), queue (xếp hàng), leaveQueue, dig (đào hầm) */
  webAct(a, type) {
    if (type === 'dig') return this.dig(a, 1);
    this._touch();
    if (type === 'leaveQueue') {
      this._leaveQueue(a);
      return { ok: true };
    }
    if (a.status !== 'free' || a.path) return { ok: false, reason: 'Chỉ làm được khi đang tự do' };
    if (type === 'lift') {
      const near = BENCHES.some((b) => Math.hypot(a.x - b.x, a.z - b.z) < 2.6);
      if (!near) return { ok: false, reason: 'Lại gần ghế tập tạ ở sân nhé' };
      a.anim = ANIM.lift;
      a.animUntil = this.now() + 3000;
      a.reps++;
      this.markMeta(a);
      return { ok: true, reps: a.reps };
    }
    if (type === 'queue') {
      const s = queueSlot(0);
      if (Math.hypot(a.x - s.x, a.z - s.z) > 12) return { ok: false, reason: 'Lại gần nhà ăn để xếp hàng' };
      return this._joinQueue(a) ? { ok: true } : { ok: false, reason: 'Hàng đông quá, chờ chút' };
    }
    return { ok: false };
  }

  // ═════════════════════════ Người xem TikTok ═════════════════════════

  _ttUser(key) {
    let u = this.tiktokUsers.get(key);
    if (!u) {
      u = { immunity: 0, followed: false, likeBank: 0, lastComment: null, lastCrimeAt: -Infinity };
      this.tiktokUsers.set(key, u);
    }
    return u;
  }

  _findTiktokActor(key) {
    for (const a of this.actors.values()) if (a.key === key) return a;
    return null;
  }

  _applyTiktokIdentity(a, user) {
    const nick = user.nickname || user.uniqueId || 'Khách';
    a.uniqueId = user.uniqueId || '';
    a.hidden = this.ctx.filter.isDirty(nick) || this.ctx.filter.isDirty(user.uniqueId || '');
    if (a.hidden) {
      if (!a.anonName) a.anonName = `Ẩn danh #${a.id}`;
      a.name = a.anonName;
    } else {
      a.name = cleanName(nick, 16) || 'Khách';
    }
    if (user.avatar) a.avatar = user.avatar;
  }

  _getOrCreateTiktokActor(user) {
    const key = `tt:${user.key}`;
    let a = this._findTiktokActor(key);
    if (!a) {
      const max = Number(this.g.maxTiktokActors) || 40;
      const tiktok = [...this.actors.values()].filter((x) => x.kind === 'tiktok');
      if (tiktok.length >= max) {
        // Ưu tiên cho người đang tự do lâu nhất rời phòng
        const free = tiktok.filter((x) => !x.warden && (x.status === 'free' || x.status === 'leaving' || x.status === 'queue')).sort((p, q) => p.lastActive - q.lastActive);
        const victim = free[0] || tiktok.filter((x) => !x.warden).sort((p, q) => p.remainingMs - q.remainingMs)[0];
        if (victim) this.removeActor(victim.id);
      }
      a = this._newActor('tiktok', key, 'Khách', user.avatar);
    }
    this._applyTiktokIdentity(a, user);
    a.lastActive = this.now();
    if (a.status === 'leaving') {
      a.status = 'free';
      a.path = null;
    }
    this.markMeta(a);
    return a;
  }

  /**
   * Sự kiện TikTok đã chuẩn hoá:
   * { type: 'chat'|'gift'|'like'|'follow', user: { key, uniqueId, nickname, avatar }, comment?, gift?, likeCount? }
   */
  handleTiktok(evt) {
    if (!evt || !evt.user || !evt.user.key) return { ok: false, reason: 'invalid' };
    this._touch();
    const u = this._ttUser(evt.user.key);
    const existing = this._findTiktokActor(`tt:${evt.user.key}`);
    if (existing) {
      this._applyTiktokIdentity(existing, evt.user);
      existing.lastActive = this.now();
    }

    if (evt.type === 'chat') {
      const comment = String(evt.comment || '');
      if (this.ctx.filter.isDirty(comment)) return { ok: false, reason: 'blocked' };
      u.lastComment = { text: comment, at: this.now() };
      const crime = matchCrime(this.ctx.crimes, comment);
      if (crime) {
        const now = this.now();
        if (now - u.lastCrimeAt < num(this.g.commentCooldownSeconds, 2) * 1000) return { ok: false, reason: 'cooldown' };
        u.lastCrimeAt = now;
        const jailed = existing && (existing.status === 'jailed' || existing.status === 'escort');
        if (!jailed && u.immunity > 0) {
          u.immunity--;
          const name = existing ? existing.name : cleanName(evt.user.nickname || evt.user.uniqueId, 16);
          this.emit('fx', { type: 'immune', id: existing?.id, name, crime: crime.label });
          return { ok: true, action: 'immune' };
        }
        const a = this._getOrCreateTiktokActor(evt.user);
        return this.commitCrime(a, crime);
      }
      if (existing && hasKeyword(comment, this.g.digKeyword) && existing.status === 'jailed') {
        existing.lastDigAt = 0;
        return this.dig(existing, 5);
      }
      if (existing) {
        this._chat(existing, cleanName(comment, Number(this.g.chatMaxLength) || 60));
        return { ok: true, action: 'bubble' };
      }
      return { ok: false, reason: 'no-actor' };
    }

    if (evt.type === 'gift') return this._tiktokGift(evt, u, existing);

    if (evt.type === 'like') {
      const per = Math.max(1, Number(this.g.likesPerReduction) || 50);
      u.likeBank += Number(evt.likeCount) || 1;
      const times = Math.floor(u.likeBank / per);
      u.likeBank %= per;
      if (times > 0 && existing && this._reduce(existing, times * num(this.g.likeReductionSeconds, 5), 'like')) {
        return { ok: true, action: 'reduce' };
      }
      return { ok: true, action: 'like-banked' };
    }

    if (evt.type === 'follow') {
      if (u.followed) return { ok: false, reason: 'already-followed' };
      u.followed = true;
      u.immunity += num(this.g.followImmunity, 0);
      const name = existing ? existing.name : this.ctx.filter.isDirty(evt.user.nickname || '') ? 'Ẩn danh' : cleanName(evt.user.nickname || evt.user.uniqueId, 16);
      this.emit('fx', { type: 'follow', name });
      return { ok: true, action: 'immunity' };
    }
    return { ok: false, reason: 'unknown-type' };
  }

  _tiktokGift(evt, u, existing) {
    const tier = resolveGiftTier(this.ctx.giftIndex, evt.gift || {});
    if (!tier) return { ok: false, reason: 'unmapped-gift' };
    const count = Math.max(1, Math.min(100, Number(evt.gift.count) || 1));
    const gifts = this.ctx.config.gifts || {};

    if (tier === 'small') {
      const secs = (Number(gifts.small?.reduceSeconds) || 30) * count;
      if (existing && this._reduce(existing, secs, 'gift')) return { ok: true, action: 'reduce', seconds: secs };
      const name = existing ? existing.name : cleanName(evt.user.nickname || evt.user.uniqueId, 16);
      this.emit('fx', { type: 'thanks', name, gift: evt.gift.name || gifts.small?.displayName });
      return { ok: true, action: 'thanks' };
    }

    // Quà vừa/lớn/rất lớn: người tặng xuất hiện trong nhà tù
    const giver = this._getOrCreateTiktokActor(evt.user);
    if (giver.status === 'new') {
      giver.status = 'free';
      this._setPath(giver, [{ x: 0, z: 18 }, randomYardPoint(this.rand)], SPEED.wander + 1, null);
    }
    const stat = this._stat(giver);

    if (tier === 'medium') {
      const freed = [];
      for (let i = 0; i < count; i++) {
        const cands = [...this.actors.values()]
          .filter((x) => x.id !== giver.id && (x.status === 'jailed' || x.status === 'escort'))
          .map((x) => ({ id: x.id, name: x.name, uniqueId: x.uniqueId || '', remainingMs: x.remainingMs, hidden: x.hidden }));
        const lc = u.lastComment;
        const fresh = lc && this.now() - lc.at <= num(this.g.bailMemorySeconds, 180) * 1000;
        const target = pickBailTarget(cands, fresh ? lc.text : '');
        if (!target) break;
        this.release(this.actors.get(target.id), 'bail', { by: giver.name });
        stat.good++;
        freed.push(target.id);
      }
      if (!freed.length) this.emit('fx', { type: 'toast', text: `🎁 ${giver.name}: không có ai để bảo lãnh, cảm ơn tấm lòng vàng!` });
      return { ok: true, action: 'bail', freed };
    }

    if (tier === 'large') {
      const n = this.massEscape(giver.name, giver.key);
      return { ok: true, action: 'escape', freed: n };
    }

    if (tier === 'huge') {
      const dur = num(this.g.wardenMinutes, 5) * 60 * 1000 * count;
      const now = this.now();
      if (this.warden && this.warden.id !== giver.id) {
        const old = this.actors.get(this.warden.id);
        if (old) {
          old.warden = false;
          this.markMeta(old);
        }
        this.warden = null;
      }
      if (this.warden) this.warden.until = Math.max(this.warden.until, now) + dur;
      else this.warden = { id: giver.id, until: now + dur };
      if (giver.status === 'jailed' || giver.status === 'escort') this.release(giver, 'warden');
      giver.warden = true;
      this._leaveQueue(giver);
      giver.status = 'run';
      this._setPath(giver, [{ x: PODIUM.x, z: PODIUM.z + 1.8 }], SPEED.run, 'free');
      this.markMeta(giver);
      this.emit('fx', { type: 'warden', id: giver.id, name: giver.name, seconds: Math.round((this.warden.until - now) / 1000) });
      return { ok: true, action: 'warden' };
    }
    return { ok: false, reason: 'unknown-tier' };
  }

  // ═════════════════════════ AI cho nhân vật TikTok ═════════════════════════

  _think(a, now) {
    if (now < a.nextThinkAt || a.path) return;
    a.nextThinkAt = now + 4000 + this.rand() * 6000;
    if (a.status === 'jailed') {
      const r = this.rand();
      if (r < 0.35) {
        a.anim = [ANIM.bang, ANIM.cry, ANIM.wave][Math.floor(this.rand() * 3)];
        a.animUntil = now + EMOTE_MS;
      } else if (r < 0.7) {
        const b = cellSlot(a.cell, Math.floor(this.rand() * 6));
        this._setPath(a, [resolveCell(a.cell, b.x, b.z)], SPEED.wander, null);
      }
      return;
    }
    if (a.status !== 'free') return;
    if (a.warden) {
      const p = resolveFree(PODIUM.x + (this.rand() - 0.5) * 5, PODIUM.z + 2 + this.rand() * 2);
      this._setPath(a, [p], SPEED.wander, null);
      if (this.rand() < 0.4) {
        a.anim = ANIM.wave;
        a.animUntil = now + EMOTE_MS;
      }
      return;
    }
    if (now - a.lastActive > num(this.g.tiktokDespawnSeconds, 300) * 1000) {
      a.status = 'leaving';
      this.markMeta(a);
      this._setPath(a, [{ x: 0, z: 18 }, { x: SPAWN.x, z: SPAWN.z }, { x: 0, z: 29.6 }], SPEED.leaving, 'remove');
      return;
    }
    const r = this.rand();
    if (r < 0.55) this._setPath(a, [randomYardPoint(this.rand)], SPEED.wander, null);
    else if (r < 0.7 && this.queue.length < 5) this._joinQueue(a);
    else if (r < 0.85) {
      const b = BENCHES[Math.floor(this.rand() * BENCHES.length)];
      this._setPath(a, [resolveFree(b.x - 1.4, b.z)], SPEED.wander, 'lift');
    } else {
      a.anim = [ANIM.wave, ANIM.dance][Math.floor(this.rand() * 2)];
      a.animUntil = now + EMOTE_MS;
    }
  }

  // ═════════════════════════ Vòng lặp ═════════════════════════

  /** Gọi mỗi TICK (100ms). dtMs = thời gian thật trôi qua. */
  tick(dtMs) {
    const now = this.now();
    const dt = dtMs / 1000;
    for (const a of [...this.actors.values()]) {
      if (!this.actors.has(a.id)) continue;
      if (a.path) this._stepPath(a, dt, now);
      if (a.status === 'jailed') {
        a.remainingMs -= dtMs;
        if (a.remainingMs <= 0) this.release(a, 'served');
      }
      if (a.kind === 'tiktok') this._think(a, now);
    }
    this._updateQueue(now);

    // Cai ngục hết nhiệm kỳ
    if (this.warden && now >= this.warden.until) {
      const w = this.actors.get(this.warden.id);
      this.warden = null;
      if (w) {
        w.warden = false;
        this.markMeta(w);
        this.emit('fx', { type: 'warden-end', name: w.name });
      }
    }

    // Hầm tự lấp dần nếu không ai đào
    const t = this.tunnel;
    if (t.progress > 0 && now - t.lastTapAt > 3000) t.progress = Math.max(0, t.progress - num(this.g.digDecayPercentPerSecond, 0.5) * dt);
    const p = Math.floor(t.progress * 2) / 2;
    if (p !== t.lastSent) {
      t.lastSent = p;
      this.emit('tunnel', { progress: p, cooldown: Math.max(0, Math.ceil((t.cooldownUntil - now) / 1000)) });
    }

    // Treo máy
    const idleNow = now - this.lastInteraction >= num(this.g.idleSeconds, 120) * 1000;
    if (idleNow !== this.idle) {
      this.idle = idleNow;
      this.emit('fx', { type: 'idle', idle: idleNow });
    }

    if (this.dirty.size) {
      const metas = [...this.dirty].map((id) => this.actors.get(id)).filter(Boolean).map((a) => this.meta(a));
      this.dirty.clear();
      if (metas.length) this.emit('metas', metas);
    }

    this.infoTimer += dtMs;
    if (this.infoTimer >= 1000) {
      this.infoTimer = 0;
      this.emit('info', this.info());
    }
  }

  /** Vị trí mọi nhân vật – gửi 10 lần/giây. [id, x*100, z*100, ry*100, anim] */
  snapshot() {
    const now = this.now();
    const out = [];
    for (const a of this.actors.values()) {
      const anim = now < a.animUntil ? a.anim : a.moveAnim;
      out.push([a.id, Math.round(a.x * 100), Math.round(a.z * 100), Math.round(a.ry * 100), anim]);
    }
    return out;
  }

  leaderboards() {
    const all = [...this.stats.values()];
    const top = (f) =>
      all
        .filter((s) => s[f] > 0)
        .sort((a, b) => b[f] - a[f])
        .slice(0, 5)
        .map((s) => ({ name: s.name, avatar: s.avatar, value: Math.round(s[f]) }));
    return { danger: top('danger'), good: top('good') };
  }

  info() {
    const now = this.now();
    let prisoners = 0;
    let tiktok = 0;
    for (const a of this.actors.values()) {
      if (a.status === 'jailed' || a.status === 'escort') prisoners++;
      if (a.kind === 'tiktok') tiktok++;
    }
    let warden = null;
    if (this.warden) {
      const w = this.actors.get(this.warden.id);
      if (w) warden = { id: w.id, name: w.name, avatar: w.hidden ? null : proxify(w.avatar), remaining: Math.max(0, Math.ceil((this.warden.until - now) / 1000)) };
    }
    return {
      name: this.name,
      players: this.webCount(),
      maxPlayers: Number(this.ctx.config.rooms?.maxPlayers) || 30,
      tiktok,
      prisoners,
      watchers: this.watchers,
      warden,
      leaders: this.leaderboards(),
      idle: this.idle,
      tunnel: { progress: Math.floor(this.tunnel.progress * 2) / 2, cooldown: Math.max(0, Math.ceil((this.tunnel.cooldownUntil - now) / 1000)) },
    };
  }
}

/** Đọc số từ cấu hình; cho phép giá trị 0 (khác với `|| mặc định`) */
function num(v, d) {
  const n = Number(v);
  return v === undefined || v === null || v === '' || !Number.isFinite(n) ? d : n;
}

function hash(s) {
  let h = 7;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Ảnh TikTok đi qua proxy của server để WebGL dùng được (tránh lỗi CORS) */
function proxify(url) {
  if (!url) return null;
  if (url.startsWith('/')) return url;
  return /^https?:\/\//i.test(url) ? `/avatar?u=${encodeURIComponent(url)}` : null;
}
