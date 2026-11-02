/**
 * Trang /live – khung dọc 1080x1920 cho OBS / TikTok LIVE Studio.
 * Không có nhân vật riêng: chỉ xem phòng live, camera tự lướt qua các khu vực,
 * tự lao tới chỗ có sự kiện (bắt giam, vượt ngục, Cai ngục…).
 * Tham số: ?phong=tu-1  ?mute=1  ?gio=21 (thử ban đêm)
 */
import * as THREE from 'three';
import './styles/live.css';
import { createRenderer } from './three/renderer.js';
import { createWorld } from './three/world.js';
import { ActorManager } from './three/actors.js';
import { Effects } from './three/fx.js';
import { fmtTime } from './three/character.js';
import { audio } from './audio.js';
import { connect, emitAck, roomFromUrl, esc } from './net.js';
import { DESK, BENCHES, CANTEEN, TUNNEL_EXIT, PODIUM, cellDoor } from '../../shared/map.js';

const $ = (s) => document.querySelector(s);
const W = 1080;
const H = 1920;

// ───────── Co giãn lớp giao diện ─────────
const stage = $('#stage');
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `scale(${s})`;
  stage.style.left = `${(innerWidth - W * s) / 2}px`;
  stage.style.top = `${(innerHeight - H * s) / 2}px`;
}
addEventListener('resize', fit);
fit();

// ───────── Cảnh 3D ─────────
const { renderer, scene, camera } = createRenderer($('#c'), { quality: 'high', fov: 55 });
const world = createWorld(scene);
const actors = new ActorManager(scene, { maxVisible: 70, maxDist: 90, labelDist: 60, labelScale: 1.35 });
const fx = new Effects(scene, world);

// Các cảnh quay camera tự động: [vị trí camera, điểm nhìn]
const SHOTS = {
  overview: [[0, 34, 40], [0, 0, -4]],
  cells: [[0, 9, -6], [0, 1.5, -24]],
  cellsLeft: [[-14, 6, -11], [-14, 1.4, -25]],
  cellsRight: [[14, 6, -11], [14, 1.4, -25]],
  yard: [[24, 9, 10], [BENCHES[1].x, 1, BENCHES[1].z]],
  canteen: [[-8, 7, 9], [CANTEEN.counterX + 3, 1, 0]],
  gate: [[6, 6, 31], [DESK.x, 1, DESK.z - 3]],
  tunnel: [[18, 6, 22], [TUNNEL_EXIT.x, 1, TUNNEL_EXIT.z]],
  podium: [[PODIUM.x + 9, 6, PODIUM.z - 7], [PODIUM.x, 1.4, PODIUM.z + 1]],
};
const TOUR = ['overview', 'cells', 'yard', 'cellsLeft', 'canteen', 'gate', 'cellsRight', 'overview'];
let tourIdx = 0;
let shotUntil = 0;
let focus = null; // { pos, look, until } khi có sự kiện
const camPos = new THREE.Vector3(...SHOTS.overview[0]);
const camLook = new THREE.Vector3(...SHOTS.overview[1]);
const wantPos = new THREE.Vector3();
const wantLook = new THREE.Vector3();
let orbit = 0;

function focusOn(pos, look, ms = 6000) {
  focus = { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look), until: performance.now() + ms };
}
function focusShot(name, ms) {
  focusOn(SHOTS[name][0], SHOTS[name][1], ms);
}

// ───────── Kết nối (vai trò người xem) ─────────
let info = null;
let rules = null;
const socket = connect();
socket.on('connect', async () => {
  const res = await emitAck(socket, 'join', { mode: 'live', room: roomFromUrl() });
  if (!res.ok) return toast(esc(res.reason || 'Không vào được phòng'));
  actors.clear();
  actors.applyMetas(res.metas);
  info = res.info;
  rules = res.rules;
  renderInfo();
  renderTicker();
  $('#l-room').textContent = `Phòng ${res.room}`;
});
socket.on('s', (a) => actors.applySnapshot(a));
socket.on('metas', (l) => actors.applyMetas(l));
socket.on('remove', (id) => actors.remove(id));
socket.on('chat', (c) => actors.chat(c.id, c.text));
socket.on('info', (i) => {
  info = i;
  renderInfo();
});
socket.on('tunnel', (t) => {
  if (info) info.tunnel = t;
  renderTunnel();
});
socket.on('rules', (r) => {
  rules = r;
  renderTicker();
});
socket.on('fx', onFx);

function charPos(id) {
  const c = actors.get(id);
  return c ? c.root.position : null;
}

function onFx(e) {
  switch (e.type) {
    case 'arrest':
      audio.play('siren', 0.7);
      toast(`🚨 <b>${esc(e.name)}</b> bị bắt vì <b>${esc(e.crime)}</b> (${fmtTime(e.seconds)})`, 'red');
      focusShot('gate', 5000);
      break;
    case 'jailed':
      audio.play('door', 0.8);
      if (e.cell != null) {
        const d = cellDoor(e.cell);
        focusOn([d.x + 3, 4, d.z + 7], [d.x, 1.4, d.z - 3], 3500);
      }
      break;
    case 'extend': {
      const p = charPos(e.id);
      if (p) fx.floatText(`+${fmtTime(e.added)}`, p.x, 3.2, p.z, '#ff5e6c');
      toast(`😈 <b>${esc(e.name)}</b> tái phạm: ${esc(e.crime)} → +${fmtTime(e.added)}`, 'red');
      break;
    }
    case 'reduce': {
      const p = charPos(e.id);
      if (p) fx.floatText(`-${e.seconds}s`, p.x, 3.2, p.z, e.source === 'like' ? '#3fc9b0' : '#ffcf3f');
      audio.play('ding', 0.6);
      if (e.source === 'gift') toast(`🎁 <b>${esc(e.name)}</b> giảm ${e.seconds}s án!`, 'gold');
      break;
    }
    case 'release': {
      const p = charPos(e.id);
      if (p) fx.confetti(p.x, 2, p.z, 35);
      audio.play('release', 0.8);
      const why = { served: '🎉 mãn hạn tù!', bail: `🤝 được <b>${esc(e.by)}</b> bảo lãnh!`, overflow: '😅 tù quá tải, được thả sớm', warden: '👑 lên chức Cai ngục!', admin: 'được thả' }[e.reason] || 'được thả';
      toast(`<b>${esc(e.name)}</b> ${why}`, e.reason === 'bail' ? 'blue' : 'green');
      break;
    }
    case 'escape':
      fx.explode();
      audio.play('escape');
      banner('💥 VƯỢT NGỤC TẬP THỂ!', `${esc(e.by || '')} phá tường thả <b>${e.count}</b> tù nhân!`);
      focusShot('cells', 7000);
      break;
    case 'tunnel':
      fx.tunnel();
      audio.play('escape', 0.7);
      banner('⛏️ HẦM ĐÃ THÔNG!', `<b>${e.count}</b> tù nhân chui ra sân!`);
      focusShot('tunnel', 6000);
      break;
    case 'warden':
      audio.play('warden');
      banner('👑 CAI NGỤC MỚI!', `<b>${esc(e.name)}</b> cai quản trại giam ${fmtTime(e.seconds)}`, 'gold');
      fx.confetti(PODIUM.x, 3, PODIUM.z, 60);
      focusShot('podium', 7000);
      break;
    case 'warden-end':
      toast(`👑 ${esc(e.name)} đã hết nhiệm kỳ Cai ngục`, 'gold');
      break;
    case 'immune':
      toast(`🛡️ <b>${esc(e.name)}</b> định ${esc(e.crime)} nhưng được <b>miễn bắt</b> nhờ follow!`, 'green');
      audio.play('ding');
      break;
    case 'follow':
      toast(`➕ <b>${esc(e.name)}</b> đã follow – được miễn bắt 1 lần!`, 'green');
      break;
    case 'thanks':
      toast(`💖 Cảm ơn <b>${esc(e.name)}</b> đã tặng ${esc(e.gift || 'quà')}!`, 'gold');
      break;
    case 'toast':
      toast(esc(e.text));
      break;
    case 'idle':
      setIdle(e.idle);
      break;
    case 'chat-clear':
      for (const c of actors.chars.values()) c.bubble.visible = false;
      break;
  }
}

// ───────── Giao diện ─────────
function toast(html, color = '') {
  const box = $('#l-toasts');
  const t = document.createElement('div');
  t.className = `toast ${color}`;
  t.innerHTML = html;
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 400);
  }, 4200);
}

let bannerTimer = null;
function banner(big, small, cls = '') {
  const el = $('#l-banner');
  el.className = `l-banner ${cls}`;
  el.innerHTML = `<div class="big">${big}</div><div class="small">${small}</div>`;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

function avatarHTML(u) {
  const ch = esc([...(u.name || '?')][0] || '?');
  return u.avatar ? `<img src="${esc(u.avatar)}" alt="" onerror="this.replaceWith(document.createTextNode('${ch}'))">` : ch;
}

let boardsSig = '';
function renderInfo() {
  if (!info) return;
  const w = info.warden;
  const we = $('#l-warden');
  we.classList.toggle('hidden', !w);
  if (w) we.innerHTML = `<span class="crown">👑</span><span class="av">${avatarHTML(w)}</span><span><small>CAI NGỤC</small><b>${esc(w.name)}</b></span><span class="time">${fmtTime(w.remaining)}</span>`;
  const sig = JSON.stringify(info.leaders);
  if (sig !== boardsSig) {
    boardsSig = sig;
    const medals = ['🥇', '🥈', '🥉', '4', '5'];
    const fill = (el, list, fmt, empty) =>
      (el.innerHTML = list.length
        ? list.map((u, i) => `<li><span class="rank">${medals[i]}</span><span class="av">${avatarHTML(u)}</span><span class="nm">${esc(u.name)}</span><span class="val">${fmt(u.value)}</span></li>`).join('')
        : `<div class="empty">${empty}</div>`);
    fill($('#b-danger'), info.leaders.danger, (v) => fmtTime(v), 'Chưa có ai phạm tội…');
    fill($('#b-good'), info.leaders.good, (v) => `${v} người`, 'Chưa ai bảo lãnh ai…');
  }
  renderTunnel();
  setIdle(info.idle);
}

function renderTunnel() {
  const t = info?.tunnel;
  if (!t) return;
  $('#l-tunnel i').style.width = `${t.progress}%`;
  $('#l-tunnel').classList.toggle('cool', !!t.cooldown);
}

let tickerSig = '';
function renderTicker() {
  if (!rules) return;
  $('#dig-kw').textContent = rules.digKeyword || 'đào';
  const p = ['<b>📖 CÁCH CHƠI:</b>'];
  rules.crimes.forEach((c) => p.push(`💬 Gõ <em>"${esc(c.keyword)}"</em> → <b>${fmtTime(c.seconds)}</b> tù`));
  p.push('🔁 Tái phạm khi đang ở tù → <b>cộng dồn án</b>');
  p.push(`⛏️ Đang ở tù gõ <em>"${esc(rules.digKeyword || 'đào')}"</em> để đào hầm cùng mọi người`);
  p.push(`🎁 ${esc(rules.gifts.small.displayName)}: <b>giảm ${rules.gifts.small.reduceSeconds || 30}s</b> án`);
  p.push(`🎁 ${esc(rules.gifts.medium.displayName)}: <b>bảo lãnh</b> 1 người (gõ <em>@tên</em> trước khi tặng)`);
  p.push(`🎁 ${esc(rules.gifts.large.displayName)}: <b>VƯỢT NGỤC TẬP THỂ</b> 💥`);
  p.push(`🎁 ${esc(rules.gifts.huge.displayName)}: làm <b>CAI NGỤC</b> ${rules.wardenMinutes} phút 👑`);
  p.push(`❤️ Mỗi ${rules.likesPerReduction} like: <b>-${rules.likeReductionSeconds}s</b>`);
  if (rules.followImmunity) p.push('➕ Follow lần đầu: <b>miễn bị bắt 1 lần</b>');
  p.push(`🌐 Chơi trên web: <b>${esc(location.host)}</b>`);
  (rules.ticker || []).forEach((t) => p.push(esc(t)));
  const html = p.join('&nbsp;&nbsp;•&nbsp;&nbsp;');
  if (html === tickerSig) return;
  tickerSig = html;
  const tr = $('#l-track');
  tr.innerHTML = html;
  requestAnimationFrame(() => (tr.style.animationDuration = `${Math.max(25, tr.scrollWidth / 150)}s`));
}

// Treo máy: camera đi theo cảnh sát tuần tra + lời mời
let idle = false;
let inviteTimer = null;
function setIdle(on) {
  if (on === idle) return;
  idle = on;
  $('#l-invite').classList.toggle('hidden', !on);
  clearInterval(inviteTimer);
  if (on) {
    audio.play('whistle', 0.6);
    let i = 0;
    const next = () => {
      const cr = rules?.crimes || [];
      if (cr.length) $('#l-invite-crime').textContent = `"${cr[i++ % cr.length].keyword}"`;
    };
    next();
    inviteTimer = setInterval(next, 3500);
  }
}

// Âm thanh: OBS cho tự phát; trình duyệt thường cần bấm 1 lần
audio.unlock().then(() => {
  if (audio.running) audio.startMusic();
  else {
    const b = $('#sound-unlock');
    b.classList.remove('hidden');
    b.onclick = async () => {
      await audio.unlock();
      audio.startMusic();
      b.classList.add('hidden');
    };
  }
});

// ───────── Vòng lặp ─────────
const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  const now = performance.now();
  world.update(dt);
  actors.update(dt, t, camera);

  // Chọn cảnh quay
  if (focus && now < focus.until) {
    wantPos.copy(focus.pos);
    wantLook.copy(focus.look);
  } else if (idle) {
    const g = actors.guards.patrolGuard.root;
    wantPos.set(g.position.x + Math.sin(t * 0.2) * 7, 5, g.position.z + Math.cos(t * 0.2) * 7);
    wantLook.set(g.position.x, 1.3, g.position.z);
  } else {
    focus = null;
    if (now > shotUntil) {
      tourIdx = (tourIdx + 1) % TOUR.length;
      shotUntil = now + 9000;
    }
    const [p, l] = SHOTS[TOUR[tourIdx]];
    orbit += dt * 0.15;
    wantPos.set(p[0] + Math.sin(orbit) * 2.5, p[1], p[2] + Math.cos(orbit) * 1.5);
    wantLook.set(...l);
  }
  const k = Math.min(1, dt * 1.6);
  camPos.lerp(wantPos, k);
  camLook.lerp(wantLook, k);
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  fx.update(dt, camera);
  if (info?.warden && Math.floor(t) !== Math.floor(t - dt)) {
    info.warden.remaining = Math.max(0, info.warden.remaining - 1);
    const el = $('#l-warden .time');
    if (el) el.textContent = fmtTime(info.warden.remaining);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

