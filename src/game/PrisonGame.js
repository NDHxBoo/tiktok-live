'use strict';
/**
 * PrisonGame – "bộ não" luật chơi Đi Tù Online.
 *
 * Nhận sự kiện đã chuẩn hoá (chat / gift / like / follow) từ bất kỳ nguồn nào
 * (TikTok thật, trang điều khiển, bot demo) và cập nhật trạng thái nhà tù.
 *
 * Phát ra 2 loại sự kiện:
 *   - 'fx'    : hiệu ứng rời rạc để overlay chạy animation (bắt, thả, vượt ngục…)
 *   - 'change': trạng thái thay đổi, server sẽ gửi getState() mới cho overlay
 *
 * AN TOÀN: chỉ người bình luận mới tự đưa CHÍNH MÌNH vào tù.
 * Không có hàm nào cho phép người A đưa người B vào tù – người khác chỉ có thể được bảo lãnh RA.
 */
const { EventEmitter } = require('events');
const { ContentFilter } = require('./filter');
const { stripDiacritics, tokenize, containsTokens } = require('../utils/text');

const GIFT_TIERS = ['huge', 'large', 'medium', 'small']; // thứ tự ưu tiên khi so theo kim cương
const MAX_NAME_LEN = 18;
const LEADERBOARD_SIZE = 5;

class PrisonGame extends EventEmitter {
  /**
   * @param {object} opts
   * @param {object} opts.config  nội dung config.json
   * @param {() => number} [opts.now]  đồng hồ (thay được khi test)
   */
  constructor({ config, now = Date.now } = {}) {
    super();
    this.now = now;
    this.filter = new ContentFilter();
    this.enabled = true;
    this.users = new Map(); // key -> hồ sơ người xem trong phiên
    this.prisoners = new Map(); // key -> tù nhân đang bị giam
    this.warden = null; // { key, until }
    this.idle = false;
    this.lastInteraction = this.now();
    this.seenMsgIds = new Set();
    this.seenQueue = [];
    this.anonCounter = 0;
    this.stats = { arrests: 0, releases: 0, escapes: 0, bails: 0, blocked: 0 };
    this.updateConfig(config || {});
  }

  // ───────────────────────── Cấu hình ─────────────────────────

  /** Nạp/thay cấu hình lúc đang chạy (trang điều khiển sửa tội, từ cấm…) */
  updateConfig(config) {
    this.config = config;
    this.g = Object.assign(
      {
        maxCells: 24,
        idleSeconds: 120,
        maxSentenceSeconds: 3600,
        commentCooldownSeconds: 2,
        likesPerReduction: 50,
        likeReductionSeconds: 5,
        followImmunity: 1,
        wardenMinutes: 5,
        bailMemorySeconds: 180,
      },
      config.game || {}
    );
    this.g.maxCells = Math.max(1, Math.min(24, Number(this.g.maxCells) || 24));
    this.filter.setWords(config.bannedWords || []);

    // Chuẩn bị bộ so khớp tội: cụm dài hơn được ưu tiên ("quỵt nợ trà sữa" trước "trà sữa")
    this.crimeMatchers = (config.crimes || [])
      .filter((c) => c && c.keyword && Number(c.seconds) > 0)
      .map((c) => ({
        keyword: c.keyword,
        label: c.label || c.keyword,
        seconds: Math.round(Number(c.seconds)),
        tokens: tokenize(stripDiacritics(c.keyword)),
      }))
      .filter((c) => c.tokens.length)
      .sort((a, b) => b.tokens.length - a.tokens.length);

    // Bảng tra quà theo tên / id
    this.giftByName = new Map();
    this.giftById = new Map();
    const gifts = config.gifts || {};
    for (const tier of GIFT_TIERS) {
      const t = gifts[tier];
      if (!t) continue;
      for (const n of t.names || []) this.giftByName.set(stripDiacritics(n).trim(), tier);
      for (const id of t.ids || []) this.giftById.set(String(id), tier);
    }

    // Nếu giảm số ô mà đang có nhiều tù nhân hơn → thả bớt người án ngắn nhất
    while (this.prisoners.size > this.g.maxCells) this._releaseShortest();
    this._changed();
  }

  // ───────────────────────── Điều khiển ─────────────────────────

  setEnabled(on) {
    this.enabled = !!on;
    this.emit('fx', { type: 'toast', text: on ? '▶️ Trại giam mở cửa trở lại!' : '⏸️ Trại giam tạm đóng cửa' });
    this._changed();
  }

  /** Reset nhà tù. leaderboards=true thì xoá luôn bảng xếp hạng phiên. */
  reset({ leaderboards = false } = {}) {
    this.prisoners.clear();
    this.warden = null;
    if (leaderboards) {
      this.users.clear();
      this.stats = { arrests: 0, releases: 0, escapes: 0, bails: 0, blocked: 0 };
    }
    this.emit('fx', { type: 'reset' });
    this._changed();
  }

  // ───────────────────────── Xử lý sự kiện ─────────────────────────

  /**
   * Sự kiện chuẩn hoá:
   * { type: 'chat'|'gift'|'like'|'follow', msgId?, user: { key, uniqueId, nickname, avatar },
   *   comment?, gift?: { id, name, diamonds, count }, likeCount? }
   */
  handleEvent(evt) {
    if (!evt || !evt.user || !evt.user.key) return { ok: false, reason: 'invalid' };
    if (evt.msgId && this._isDuplicate(evt.msgId)) return { ok: false, reason: 'duplicate' };

    this._touch();
    const user = this._upsertUser(evt.user);

    if (evt.type === 'chat') return this._onChat(user, String(evt.comment || ''));
    if (!this.enabled) return { ok: false, reason: 'disabled' };
    if (evt.type === 'gift') return this._onGift(user, evt.gift || {});
    if (evt.type === 'like') return this._onLike(user, Number(evt.likeCount) || 1);
    if (evt.type === 'follow') return this._onFollow(user);
    return { ok: false, reason: 'unknown-type' };
  }

  _onChat(user, comment) {
    if (this.filter.isDirty(comment)) {
      // Bình luận tục tĩu: bỏ qua hoàn toàn, không hiển thị, không ghi nhớ
      this.stats.blocked++;
      return { ok: false, reason: 'blocked' };
    }
    user.lastComment = { text: comment, at: this.now() };
    if (!this.enabled) return { ok: false, reason: 'disabled' };

    const crime = this.matchCrime(comment);
    if (!crime) return { ok: false, reason: 'no-crime' };

    const now = this.now();
    if (now - user.lastCrimeAt < this.g.commentCooldownSeconds * 1000) {
      return { ok: false, reason: 'cooldown' };
    }
    user.lastCrimeAt = now;

    // Được miễn bắt nhờ follow (chỉ áp dụng khi chưa ở tù)
    if (!this.prisoners.has(user.key) && user.immunity > 0) {
      user.immunity--;
      this.emit('fx', { type: 'immune', user: this._publicUser(user), crime: crime.label });
      this._changed();
      return { ok: true, action: 'immune' };
    }
    return this._commitCrime(user, crime);
  }

  /** Tự đưa CHÍNH người bình luận vào tù hoặc cộng dồn án */
  _commitCrime(user, crime) {
    const maxMs = this.g.maxSentenceSeconds * 1000;
    const addMs = crime.seconds * 1000;
    let p = this.prisoners.get(user.key);

    if (p) {
      const before = p.remainingMs;
      p.remainingMs = Math.min(maxMs, p.remainingMs + addMs);
      const added = p.remainingMs - before;
      p.totalMs = Math.max(p.totalMs + added, p.remainingMs);
      p.crime = crime.label;
      p.crimeCount++;
      user.totalSentence += added / 1000;
      this.emit('fx', { type: 'extend', prisoner: this._publicPrisoner(p), crime: crime.label, added: added / 1000 });
      this._changed();
      return { ok: true, action: 'extend', added: added / 1000 };
    }

    // Quá tải: thả người có án ngắn nhất để lấy chỗ
    if (this.prisoners.size >= this.g.maxCells) this._releaseShortest();

    const ms = Math.min(maxMs, addMs);
    p = {
      key: user.key,
      cell: this._freeCell(),
      remainingMs: ms,
      totalMs: ms,
      crime: crime.label,
      crimeCount: 1,
      since: this.now(),
    };
    this.prisoners.set(user.key, p);
    user.totalSentence += ms / 1000;
    user.arrests++;
    this.stats.arrests++;
    this.emit('fx', { type: 'arrest', prisoner: this._publicPrisoner(p), crime: crime.label, seconds: ms / 1000 });
    this._changed();
    return { ok: true, action: 'arrest', cell: p.cell };
  }

  _onGift(user, gift) {
    const tier = this.resolveGiftTier(gift);
    if (!tier) return { ok: false, reason: 'unmapped-gift' };
    const count = Math.max(1, Math.min(100, Number(gift.count) || 1));
    const giftName = gift.name || this.config.gifts?.[tier]?.displayName || 'quà';

    if (tier === 'small') {
      const secs = (Number(this.config.gifts?.small?.reduceSeconds) || 30) * count;
      if (!this.prisoners.has(user.key)) {
        this.emit('fx', { type: 'thanks', user: this._publicUser(user), gift: giftName });
        return { ok: true, action: 'thanks' };
      }
      this._reduce(user.key, secs, 'gift');
      return { ok: true, action: 'reduce', seconds: secs };
    }

    if (tier === 'medium') {
      const freed = [];
      for (let i = 0; i < count; i++) {
        const target = this.findBailTarget(user);
        if (!target) break;
        this._release(target.key, 'bail', { by: this._publicUser(user) });
        user.saved++;
        this.stats.bails++;
        freed.push(target.key);
      }
      if (!freed.length) {
        this.emit('fx', { type: 'toast', text: `🎁 ${user.name}: không có ai để bảo lãnh, cảm ơn tấm lòng vàng!` });
      }
      this._changed();
      return { ok: true, action: 'bail', freed };
    }

    if (tier === 'large') {
      const list = [...this.prisoners.values()].map((p) => this._publicPrisoner(p));
      this.prisoners.clear();
      user.saved += list.length;
      this.stats.escapes++;
      this.stats.releases += list.length;
      this.emit('fx', { type: 'escape', by: this._publicUser(user), prisoners: list });
      this._changed();
      return { ok: true, action: 'escape', freed: list.length };
    }

    if (tier === 'huge') {
      const dur = this.g.wardenMinutes * 60 * 1000 * count;
      const now = this.now();
      if (this.warden && this.warden.key === user.key) {
        this.warden.until = Math.max(this.warden.until, now) + dur;
      } else {
        this.warden = { key: user.key, until: now + dur };
      }
      // Cai ngục thì không thể ngồi tù
      if (this.prisoners.has(user.key)) this._release(user.key, 'warden');
      this.emit('fx', { type: 'warden', user: this._publicUser(user), seconds: Math.round((this.warden.until - now) / 1000) });
      this._changed();
      return { ok: true, action: 'warden' };
    }
    return { ok: false, reason: 'unknown-tier' };
  }

  _onLike(user, likeCount) {
    const per = Math.max(1, Number(this.g.likesPerReduction) || 50);
    user.likeBank += likeCount;
    const times = Math.floor(user.likeBank / per);
    user.likeBank %= per;
    if (times > 0 && this.prisoners.has(user.key)) {
      this._reduce(user.key, times * this.g.likeReductionSeconds, 'like');
      return { ok: true, action: 'reduce', seconds: times * this.g.likeReductionSeconds };
    }
    return { ok: true, action: 'like-banked' };
  }

  _onFollow(user) {
    if (user.followed) return { ok: false, reason: 'already-followed' };
    user.followed = true;
    user.immunity += Number(this.g.followImmunity) || 0;
    this.emit('fx', { type: 'follow', user: this._publicUser(user) });
    this._changed();
    return { ok: true, action: 'immunity' };
  }

  // ───────────────────────── Logic phụ ─────────────────────────

  /** Tìm tội trong bình luận (không phân biệt dấu, hoa thường, theo nguyên cụm từ) */
  matchCrime(comment) {
    const tokens = tokenize(stripDiacritics(comment));
    if (!tokens.length) return null;
    return this.crimeMatchers.find((c) => containsTokens(tokens, c.tokens)) || null;
  }

  /** Xác định hạng quà: theo id → theo tên → theo số kim cương (nếu bật) */
  resolveGiftTier(gift) {
    if (gift.tier && GIFT_TIERS.includes(gift.tier)) return gift.tier; // quà giả từ trang điều khiển
    if (gift.id != null && this.giftById.has(String(gift.id))) return this.giftById.get(String(gift.id));
    if (gift.name) {
      const t = this.giftByName.get(stripDiacritics(gift.name).trim());
      if (t) return t;
    }
    const gifts = this.config.gifts || {};
    if (gifts.useDiamondFallback !== false) {
      const d = Number(gift.diamonds) || 0;
      if (d > 0) {
        for (const tier of GIFT_TIERS) {
          const min = Number(gifts[tier]?.minDiamonds);
          if (min > 0 && d >= min) return tier;
        }
      }
    }
    return null;
  }

  /**
   * Tìm người được bảo lãnh cho `giver`, dựa trên bình luận gần nhất của giver:
   *  1. "@tên" khớp uniqueId hoặc nickname của tù nhân
   *  2. Bình luận có chứa tên hiển thị của tù nhân
   *  3. Không chỉ định được ai → bảo lãnh người đang có án dài nhất
   * Không bao giờ chọn chính người tặng.
   */
  findBailTarget(giver) {
    const candidates = [...this.prisoners.values()].filter((p) => p.key !== giver.key);
    if (!candidates.length) return null;

    const lc = giver.lastComment;
    const fresh = lc && this.now() - lc.at <= this.g.bailMemorySeconds * 1000;
    if (fresh) {
      const text = lc.text;
      const squash = (s) => stripDiacritics(s).replace(/[^\p{L}\p{N}]+/gu, '');
      const mentions = [...text.matchAll(/@([^\s@,]+)/g)].map((m) => squash(m[1])).filter(Boolean);
      for (const m of mentions) {
        const hit = candidates.find((p) => {
          const u = this.users.get(p.key);
          return u && (squash(u.uniqueId) === m || squash(u.nickname) === m);
        });
        if (hit) return hit;
      }
      const textTokens = tokenize(stripDiacritics(text));
      let best = null;
      let bestLen = 0;
      for (const p of candidates) {
        const u = this.users.get(p.key);
        if (!u || u.hidden) continue;
        for (const n of [u.nickname, u.uniqueId]) {
          const nt = tokenize(stripDiacritics(n));
          const len = nt.join('').length;
          if (len >= 2 && len > bestLen && containsTokens(textTokens, nt)) {
            best = p;
            bestLen = len;
          }
        }
      }
      if (best) return best;
    }
    return candidates.sort((a, b) => b.remainingMs - a.remainingMs)[0];
  }

  _reduce(key, seconds, source) {
    const p = this.prisoners.get(key);
    if (!p) return;
    p.remainingMs -= seconds * 1000;
    this.emit('fx', { type: 'reduce', prisoner: this._publicPrisoner(p), seconds, source });
    if (p.remainingMs <= 0) this._release(key, 'served');
    this._changed();
  }

  _release(key, reason, extra = {}) {
    const p = this.prisoners.get(key);
    if (!p) return;
    this.prisoners.delete(key);
    this.stats.releases++;
    this.emit('fx', Object.assign({ type: 'release', reason, prisoner: this._publicPrisoner(p) }, extra));
    this._changed();
  }

  _releaseShortest() {
    let shortest = null;
    for (const p of this.prisoners.values()) {
      if (!shortest || p.remainingMs < shortest.remainingMs) shortest = p;
    }
    if (shortest) this._release(shortest.key, 'overflow');
  }

  _freeCell() {
    const used = new Set([...this.prisoners.values()].map((p) => p.cell));
    for (let i = 0; i < this.g.maxCells; i++) if (!used.has(i)) return i;
    return 0;
  }

  /** Gọi định kỳ (mỗi giây) để đếm ngược án, hết hạn Cai ngục, kiểm tra treo máy */
  tick(dtMs) {
    const now = this.now();
    if (this.enabled) {
      const done = [];
      for (const p of this.prisoners.values()) {
        p.remainingMs -= dtMs;
        if (p.remainingMs <= 0) done.push(p.key);
      }
      done.forEach((k) => this._release(k, 'served'));
      if (this.warden && now >= this.warden.until) {
        const u = this.users.get(this.warden.key);
        this.warden = null;
        this.emit('fx', { type: 'warden-end', user: u ? this._publicUser(u) : null });
      }
      if (this.prisoners.size || this.warden) this._changed();
    }
    const idleNow = now - this.lastInteraction >= this.g.idleSeconds * 1000;
    if (idleNow !== this.idle) {
      this.idle = idleNow;
      this.emit('fx', { type: 'idle', idle: idleNow });
      this._changed();
    }
  }

  _touch() {
    this.lastInteraction = this.now();
    if (this.idle) {
      this.idle = false;
      this.emit('fx', { type: 'idle', idle: false });
      this._changed();
    }
  }

  _isDuplicate(id) {
    id = String(id);
    if (this.seenMsgIds.has(id)) return true;
    this.seenMsgIds.add(id);
    this.seenQueue.push(id);
    if (this.seenQueue.length > 2000) this.seenMsgIds.delete(this.seenQueue.shift());
    return false;
  }

  /** Tạo/cập nhật hồ sơ người xem. Tên/ảnh tục tĩu bị ẩn hoàn toàn. */
  _upsertUser(u) {
    let user = this.users.get(u.key);
    if (!user) {
      user = {
        key: u.key,
        uniqueId: '',
        nickname: '',
        avatar: null,
        name: '',
        hidden: false,
        totalSentence: 0,
        arrests: 0,
        saved: 0,
        likeBank: 0,
        immunity: 0,
        followed: false,
        lastCrimeAt: -Infinity,
        lastComment: null,
      };
      this.users.set(u.key, user);
    }
    if (u.uniqueId) user.uniqueId = String(u.uniqueId);
    if (u.nickname) user.nickname = String(u.nickname);
    if (u.avatar) user.avatar = String(u.avatar);

    user.hidden = this.filter.isDirty(user.nickname) || this.filter.isDirty(user.uniqueId);
    if (user.hidden) {
      if (!user.anonId) user.anonId = ++this.anonCounter;
      user.name = `Ẩn danh #${user.anonId}`;
    } else {
      const raw = (user.nickname || user.uniqueId || 'Khách').replace(/[\u0000-\u001f​-‏‪-‮]/g, '').trim() || 'Khách';
      const chars = [...raw];
      user.name = chars.length > MAX_NAME_LEN ? chars.slice(0, MAX_NAME_LEN - 1).join('') + '…' : raw;
    }
    return user;
  }

  _publicUser(user) {
    return { key: user.key, name: user.name, avatar: user.hidden ? null : user.avatar };
  }

  _publicPrisoner(p) {
    const u = this.users.get(p.key) || { name: '?', hidden: true };
    return {
      key: p.key,
      cell: p.cell,
      name: u.name,
      avatar: u.hidden ? null : u.avatar,
      crime: p.crime,
      crimeCount: p.crimeCount,
      remaining: Math.max(0, Math.ceil(p.remainingMs / 1000)),
      total: Math.ceil(p.totalMs / 1000),
    };
  }

  _changed() {
    this.emit('change');
  }

  // ───────────────────────── Xuất trạng thái ─────────────────────────

  getLeaderboards() {
    const all = [...this.users.values()];
    const top = (field) =>
      all
        .filter((u) => u[field] > 0)
        .sort((a, b) => b[field] - a[field])
        .slice(0, LEADERBOARD_SIZE)
        .map((u) => ({ key: u.key, name: u.name, avatar: u.hidden ? null : u.avatar, value: Math.round(u[field]) }));
    return { danger: top('totalSentence'), good: top('saved') };
  }

  getState() {
    const now = this.now();
    let warden = null;
    if (this.warden) {
      const u = this.users.get(this.warden.key);
      if (u) warden = Object.assign(this._publicUser(u), { remaining: Math.max(0, Math.ceil((this.warden.until - now) / 1000)) });
    }
    const gifts = this.config.gifts || {};
    const giftInfo = {};
    for (const t of GIFT_TIERS) giftInfo[t] = { displayName: gifts[t]?.displayName || t, reduceSeconds: gifts[t]?.reduceSeconds };
    return {
      enabled: this.enabled,
      idle: this.idle,
      maxCells: this.g.maxCells,
      prisoners: [...this.prisoners.values()].map((p) => this._publicPrisoner(p)),
      warden,
      leaders: this.getLeaderboards(),
      stats: Object.assign({ prisoners: this.prisoners.size, users: this.users.size }, this.stats),
      rules: {
        crimes: this.crimeMatchers
          .slice()
          .sort((a, b) => a.seconds - b.seconds)
          .map((c) => ({ keyword: c.keyword, seconds: c.seconds, label: c.label })),
        gifts: giftInfo,
        likesPerReduction: this.g.likesPerReduction,
        likeReductionSeconds: this.g.likeReductionSeconds,
        wardenMinutes: this.g.wardenMinutes,
        followImmunity: this.g.followImmunity,
      },
      ticker: this.config.ticker || [],
      volume: this.config.audio?.volume ?? 0.7,
    };
  }
}

module.exports = { PrisonGame };
