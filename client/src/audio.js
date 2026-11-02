/**
 * Âm thanh: nhạc nền nhẹ tự tổng hợp bằng Web Audio (không cần file nhạc, không lo bản quyền)
 * + hiệu ứng (còi, cửa sắt, nổ tường…). Có nút tắt tiếng, nhớ lựa chọn.
 */
const FILES = ['siren', 'door', 'escape', 'release', 'warden', 'ding', 'whistle'];
const THROTTLE = { siren: 2500, door: 300, release: 300, ding: 120, whistle: 4000, escape: 1500, warden: 1000 };

class Audio {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.last = {};
    let saved = null;
    try {
      saved = localStorage.getItem('ditu-muted');
    } catch {}
    this.muted = new URLSearchParams(location.search).get('mute') === '1' || saved === '1';
    this.musicOn = false;
  }

  /** Phải gọi sau một thao tác của người dùng (chạm/bấm) – trình duyệt mới cho phát tiếng */
  async unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.6;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.11;
      this.musicGain.connect(this.master);
      FILES.forEach((f) =>
        fetch(`/assets/sounds/${f}.wav`)
          .then((r) => r.arrayBuffer())
          .then((b) => this.ctx.decodeAudioData(b))
          .then((buf) => (this.buffers[f] = buf))
          .catch(() => {})
      );
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
  }

  get running() {
    return this.ctx && this.ctx.state === 'running';
  }

  setMuted(m) {
    this.muted = m;
    try {
      localStorage.setItem('ditu-muted', m ? '1' : '0');
    } catch {}
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  play(name, vol = 1) {
    if (!this.ctx || !this.buffers[name]) return;
    const now = performance.now();
    if (this.last[name] && now - this.last[name] < (THROTTLE[name] || 0)) return;
    this.last[name] = now;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.sfxGain);
    src.start();
  }

  /** Nhạc nền: vòng hợp âm C – Am – F – G, pad êm + arpeggio nhẹ */
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const ctx = this.ctx;
    const bpm = 88;
    const beat = 60 / bpm;
    const chords = [
      [261.63, 329.63, 392.0],
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
      [196.0, 246.94, 293.66],
    ];
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    lp.connect(this.musicGain);
    let next = ctx.currentTime + 0.1;
    let step = 0;
    const note = (f, t, dur, type, vol) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + Math.min(0.08, dur / 3));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
    };
    const schedule = () => {
      if (!this.musicOn) return;
      while (next < ctx.currentTime + 0.6) {
        const bar = Math.floor(step / 8) % chords.length;
        const ch = chords[bar];
        const i = step % 8;
        if (i === 0) {
          ch.forEach((f) => note(f / 2, next, beat * 4, 'triangle', 0.18)); // pad
          note(ch[0] / 4, next, beat * 2, 'sine', 0.35); // bass
        }
        if (i === 4) note(ch[0] / 4, next, beat * 2, 'sine', 0.3);
        const arp = [0, 1, 2, 1, 0, 2, 1, 2][i];
        note(ch[arp] * (i % 4 === 3 ? 2 : 1), next, beat * 0.45, 'square', 0.06); // arpeggio
        next += beat / 2;
        step++;
      }
      this.musicTimer = setTimeout(schedule, 200);
    };
    schedule();
  }
}

export const audio = new Audio();
