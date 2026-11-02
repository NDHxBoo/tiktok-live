
/**
 * Tạo các file âm thanh hiệu ứng (WAV) bằng tổng hợp sóng – không cần tải gì từ mạng,
 * không lo bản quyền. Chạy: npm run sounds
 * Bạn có thể thay bằng file của riêng mình, giữ nguyên tên file trong public/assets/sounds/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/public/assets/sounds');
fs.mkdirSync(OUT, { recursive: true });

// Bộ sinh số ngẫu nhiên cố định để file tạo ra luôn giống nhau
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

function writeWav(name, samples) {
  // Chuẩn hoá biên độ về 0.9 để không bị rè
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const k = peak > 0 ? 0.9 / peak : 1;
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s * k * 32767))), 44 + i * 2));
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log('Đã tạo', name, `${(buf.length / 1024).toFixed(0)}KB`);
}

const make = (sec, fn) => Array.from({ length: Math.floor(sec * RATE) }, (_, i) => fn(i / RATE, i));
const fade = (t, dur, a = 0.01, r = 0.08) => Math.min(1, t / a, Math.max(0, (dur - t) / r));

// 🚨 Còi: hai tông luân phiên, tiếng "hoạt hình" hơi giống còi đồ chơi
(() => {
  const dur = 1.8;
  let phase = 0;
  writeWav('siren.wav', make(dur, (t) => {
    const f = (Math.floor(t / 0.3) % 2 ? 960 : 720) + 25 * Math.sin(2 * Math.PI * 7 * t);
    phase += (2 * Math.PI * f) / RATE;
    const v = Math.sin(phase) * 0.7 + Math.sin(phase * 2) * 0.2 + Math.sin(phase * 3) * 0.1;
    return v * fade(t, dur, 0.02, 0.2) * 0.8;
  }));
})();

// 🔒 Đóng cửa sắt: tiếng "keng" kim loại + tiếng chốt khoá
(() => {
  const dur = 1.2;
  const partials = [[180, 1], [431, 0.6], [757, 0.45], [1183, 0.3], [1702, 0.2], [2390, 0.12]];
  const clang = (t) => partials.reduce((s, [f, a], j) => s + a * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * (4 + j * 2)), 0);
  writeWav('door.wav', make(dur, (t) => {
    let v = t >= 0 ? clang(t) : 0;
    if (t < 0.02) v += rand() * (1 - t / 0.02) * 1.2; // tiếng va chạm
    const t2 = t - 0.32; // tiếng chốt khoá "cạch"
    if (t2 > 0) {
      v += 0.5 * partials.slice(2).reduce((s, [f, a]) => s + a * Math.sin(2 * Math.PI * f * 1.5 * t2) * Math.exp(-t2 * 30), 0);
      if (t2 < 0.01) v += rand() * 0.6;
    }
    return v * fade(t, dur, 0.001, 0.2);
  }));
})();

// 💥 Vượt ngục: tiếng nổ trầm + gạch đổ lạo xạo
(() => {
  const dur = 2.4;
  let lp = 0;
  let lp2 = 0;
  let phase = 0;
  writeWav('escape.wav', make(dur, (t) => {
    const n = rand();
    lp += (n - lp) * 0.08; // lọc thông thấp → tiếng ầm
    lp2 += (lp - lp2) * 0.2;
    const boomF = 30 + 90 * Math.exp(-t * 6);
    phase += (2 * Math.PI * boomF) / RATE;
    let v = lp2 * 3 * Math.exp(-t * 2.2) + Math.sin(phase) * Math.exp(-t * 3) * 0.9;
    // gạch rơi: các tiếng lách cách ngẫu nhiên
    if (t > 0.3 && Math.abs(rand()) > 0.9993) v += 0.6;
    v += n * 0.08 * Math.exp(-(t - 0.6) * (t - 0.6) * 3) * (t > 0.3 ? 1 : 0);
    return v * fade(t, dur, 0.003, 0.4);
  }));
})();

// 🎉 Được thả: giai điệu vui vẻ đi lên
(() => {
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  const step = 0.11;
  const dur = notes.length * step + 0.35;
  writeWav('release.wav', make(dur, (t) => {
    const idx = Math.min(notes.length - 1, Math.floor(t / step));
    const lt = t - idx * step;
    const f = notes[idx];
    const sq = Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.35 + Math.sin(2 * Math.PI * f * t) * 0.65;
    const env = idx === notes.length - 1 ? Math.exp(-lt * 5) : Math.exp(-lt * 12);
    return sq * env * fade(t, dur, 0.005, 0.1);
  }));
})();

// 👑 Cai ngục: kèn chào mừng
(() => {
  const seq = [[392, 0.15], [392, 0.15], [392, 0.15], [523.25, 0.6], [659.25, 0.2], [783.99, 0.8]];
  const total = seq.reduce((s, [, d]) => s + d, 0);
  const starts = [];
  seq.reduce((s, [, d]) => (starts.push(s), s + d), 0);
  writeWav('warden.wav', make(total, (t) => {
    let i = starts.findIndex((s, j) => t >= s && (j === starts.length - 1 || t < starts[j + 1]));
    if (i < 0) i = 0;
    const [f, d] = seq[i];
    const lt = t - starts[i];
    const brass = [1, 0.6, 0.45, 0.3, 0.2].reduce((s, a, h) => s + a * Math.sin(2 * Math.PI * f * (h + 1) * t), 0);
    const env = Math.min(1, lt / 0.02) * Math.max(0, Math.min(1, (d - lt) / 0.04)) * (0.85 + 0.15 * Math.sin(2 * Math.PI * 5 * lt));
    return brass * env;
  }));
})();

// ✨ Giảm án: tiếng "ting"
(() => {
  const dur = 0.45;
  writeWav('ding.wav', make(dur, (t) => {
    const f = t < 0.07 ? 1318.5 : 1975.5;
    const lt = t < 0.07 ? t : t - 0.07;
    return Math.sin(2 * Math.PI * f * t) * Math.exp(-lt * 9) * fade(t, dur, 0.002, 0.05);
  }));
})();

// 📯 Tuần tra: tiếng còi thổi "tuýt tuýt"
(() => {
  const dur = 0.9;
  writeWav('whistle.wav', make(dur, (t) => {
    const on = (t < 0.25) || (t > 0.4 && t < 0.85);
    if (!on) return 0;
    const f = 2400 + 180 * Math.sin(2 * Math.PI * 28 * t);
    return (Math.sin(2 * Math.PI * f * t) * 0.8 + rand() * 0.12) * fade(t % 0.45, 0.42, 0.01, 0.03);
  }));
})();
