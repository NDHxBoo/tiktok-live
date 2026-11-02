
/**
 * Kết nối TikTok LIVE bằng tiktok-live-connector.
 * - Tự kết nối lại khi mất kết nối / streamer chưa live, thời gian chờ tăng dần (backoff).
 * - Chuyển sự kiện thô thành sự kiện chuẩn hoá rồi gọi onEvent(evt).
 */
import { EventEmitter } from 'node:events';
import { normalizeChat, normalizeGift, normalizeLike, normalizeFollow } from './normalize.js';

class TikTokSource extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.username  username TikTok của người live (không cần @)
   * @param {(evt:object)=>void} opts.onEvent
   * @param {import('../logger').Logger} opts.logger
   */
  constructor({ username, onEvent, logger, signApiKey, minDelay = 5, maxDelay = 120 }) {
    super();
    this.username = username;
    this.onEvent = onEvent;
    this.log = logger;
    this.signApiKey = signApiKey;
    this.minDelay = minDelay * 1000;
    this.maxDelay = maxDelay * 1000;
    this.delay = this.minDelay;
    this.status = 'idle'; // idle | connecting | connected | waiting | stopped
    this.statusText = 'Chưa kết nối';
    this.conn = null;
    this.timer = null;
    this.stopped = true;
    this.roomId = null;
  }

  _setStatus(status, text) {
    this.status = status;
    this.statusText = text;
    this.emit('status', { status, text, username: this.username, roomId: this.roomId });
  }

  start(username) {
    if (username) this.username = String(username).replace(/^@/, '').trim();
    if (!this.username) {
      this._setStatus('idle', 'Chưa nhập username TikTok');
      return;
    }
    this.stop(true);
    this.stopped = false;
    this.delay = this.minDelay;
    this._connect();
  }

  async stop(silent = false) {
    this.stopped = true;
    clearTimeout(this.timer);
    const c = this.conn;
    this.conn = null;
    if (c) {
      c.removeAllListeners();
      try {
        await c.disconnect();
      } catch (_) {
        /* bỏ qua */
      }
    }
    if (!silent) this._setStatus('stopped', 'Đã ngắt kết nối');
  }

  async _connect() {
    if (this.stopped) return;
    let lib;
    try {
      lib = await import('tiktok-live-connector');
    } catch (e) {
      this.log.error('Không nạp được tiktok-live-connector, hãy chạy npm install', e);
      this._setStatus('stopped', 'Thiếu thư viện tiktok-live-connector');
      return;
    }
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = lib;
    const opts = { processInitialData: false, enableExtendedGiftInfo: true };
    if (this.signApiKey) opts.signApiKey = this.signApiKey;
    const conn = new TikTokLiveConnection(this.username, opts);
    this.conn = conn;
    this._setStatus('connecting', `Đang kết nối @${this.username}…`);
    this.log.info(`Đang kết nối TikTok LIVE @${this.username}`);

    const safe = (fn) => (data) => {
      try {
        const evt = fn(data);
        if (evt && evt.user && evt.user.key) this.onEvent(evt);
      } catch (e) {
        this.log.warn('Lỗi xử lý sự kiện TikTok', e);
      }
    };
    conn.on(WebcastEvent.CHAT, safe(normalizeChat));
    conn.on(WebcastEvent.GIFT, safe(normalizeGift));
    conn.on(WebcastEvent.LIKE, safe(normalizeLike));
    conn.on(WebcastEvent.FOLLOW, safe(normalizeFollow));
    // Một số phiên bản chỉ báo follow qua sự kiện "social"
    conn.on(WebcastEvent.SOCIAL, safe((d) => {
      const kind = `${d.displayType || ''} ${d.common?.displayText?.key || ''} ${d.action || ''}`.toLowerCase();
      return kind.includes('follow') ? normalizeFollow(d) : null;
    }));
    conn.on(WebcastEvent.STREAM_END, () => {
      this.log.warn('Buổi live đã kết thúc, sẽ chờ live lại');
      this._scheduleReconnect('Buổi live đã kết thúc');
    });
    conn.on(ControlEvent.DISCONNECTED, (info) => {
      this.log.warn('Mất kết nối TikTok', info && (info.reason || info.code));
      this._scheduleReconnect('Mất kết nối');
    });
    conn.on(ControlEvent.ERROR, (err) => {
      this.log.warn('Lỗi từ TikTok connector', err?.info || err?.exception?.message || err);
    });

    try {
      const state = await conn.connect();
      if (this.conn !== conn) return; // đã bị dừng/khởi động lại trong lúc chờ
      this.roomId = state?.roomId || null;
      this.delay = this.minDelay;
      this._setStatus('connected', `Đã kết nối @${this.username}`);
      this.log.info(`Đã kết nối TikTok LIVE @${this.username}, roomId=${this.roomId}`);
    } catch (e) {
      if (this.conn !== conn) return;
      const name = e?.constructor?.name || '';
      const msg = name === 'UserOfflineError' ? 'Streamer chưa live' : e?.message || String(e);
      this.log.warn(`Kết nối thất bại: ${msg}`);
      this._scheduleReconnect(msg);
    }
  }

  _scheduleReconnect(reason) {
    if (this.stopped) return;
    const c = this.conn;
    this.conn = null;
    if (c) {
      c.removeAllListeners();
      Promise.resolve().then(() => c.disconnect()).catch(() => {});
    }
    clearTimeout(this.timer);
    const wait = this.delay;
    this.delay = Math.min(this.maxDelay, this.delay * 2);
    this._setStatus('waiting', `${reason} – thử lại sau ${Math.round(wait / 1000)}s`);
    this.log.info(`Sẽ kết nối lại sau ${Math.round(wait / 1000)} giây`);
    this.timer = setTimeout(() => this._connect(), wait);
  }

  getStatus() {
    return { status: this.status, text: this.statusText, username: this.username, roomId: this.roomId };
  }
}

export { TikTokSource };
