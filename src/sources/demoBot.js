'use strict';
/**
 * Bot demo: sinh bình luận / quà / like / follow giả ngẫu nhiên,
 * dùng để thử game và đồ hoạ khi chưa lên live.
 */
const NAMES = [
  'Mèo Ú', 'Bé Na', 'Tí Sún', 'Anh Ba Gà', 'Cô Tư Xoài', 'Bắp Rang', 'Kem Dâu', 'Sữa Chua', 'Tèo Em', 'Bé Bơ',
  'Gấu Trúc', 'Cún Con', 'Bánh Bao', 'Hột Vịt', 'Chè Bưởi', 'Mít Tố Nữ', 'Cà Pháo', 'Su Hào', 'Bé Mập', 'Khoai Lang',
  'Trà Đào', 'Ốc Len', 'Bánh Tráng', 'Xôi Gấc', 'Nem Chua', 'Bò Bía', 'Cốm Xanh', 'Me Chua',
];
const CHATTER = ['hello mọi người', 'vui quá', 'haha', 'ai cứu tui với', 'cho xin cái tim', 'live hay quá'];

function slug(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/\s+/g, '').toLowerCase();
}

class DemoBot {
  constructor({ onEvent, getCrimes, logger }) {
    this.onEvent = onEvent;
    this.getCrimes = getCrimes;
    this.log = logger;
    this.timer = null;
    this.running = false;
  }

  _user() {
    const n = NAMES[Math.floor(Math.random() * NAMES.length)];
    return { key: `demo_${slug(n)}`, uniqueId: slug(n), nickname: n, avatar: null };
  }

  _step() {
    const r = Math.random();
    const user = this._user();
    const crimes = this.getCrimes();
    if (r < 0.55 && crimes.length) {
      const c = crimes[Math.floor(Math.random() * crimes.length)];
      this.onEvent({ type: 'chat', user, comment: Math.random() < 0.5 ? c.keyword : `tui ${c.keyword} nè` });
    } else if (r < 0.7) {
      this.onEvent({ type: 'chat', user, comment: CHATTER[Math.floor(Math.random() * CHATTER.length)] });
    } else if (r < 0.85) {
      this.onEvent({ type: 'like', user, likeCount: 10 + Math.floor(Math.random() * 60) });
    } else if (r < 0.9) {
      this.onEvent({ type: 'follow', user });
    } else {
      const g = Math.random();
      const tier = g < 0.6 ? 'small' : g < 0.88 ? 'medium' : g < 0.97 ? 'large' : 'huge';
      this.onEvent({ type: 'gift', user, gift: { tier, name: `Quà demo (${tier})`, count: 1 } });
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.log.info('Bật bot demo');
    const loop = () => {
      if (!this.running) return;
      this._step();
      this.timer = setTimeout(loop, 1200 + Math.random() * 3000);
    };
    loop();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearTimeout(this.timer);
    this.log.info('Tắt bot demo');
  }
}

module.exports = { DemoBot };
