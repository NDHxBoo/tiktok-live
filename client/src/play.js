/**
 * Trang chơi 3D: nhập biệt danh → chọn tội → bị dẫn vào ô → hết án ra sân chơi tự do.
 */
import * as THREE from 'three';
import './styles/play.css';
import { createRenderer } from './three/renderer.js';
import { createWorld } from './three/world.js';
import { ActorManager } from './three/actors.js';
import { Effects } from './three/fx.js';
import { fmtTime } from './three/character.js';
import { Controls } from './ui/joystick.js';
import { audio } from './audio.js';
import { connect, emitAck, clientId, roomFromUrl, esc } from './net.js';
import { resolveFree, resolveCell, BENCHES, queueSlot } from '../../shared/map.js';
import { ANIM, SERVER_DRIVEN, EMOTES } from '../../shared/protocol.js';

const $ = (s) => document.querySelector(s);

// ───────── Cảnh 3D ─────────
const { renderer, scene, camera, watchFps } = createRenderer($('#c'));
const world = createWorld(scene);
const actors = new ActorManager(scene, { maxVisible: 32, maxDist: 46, labelDist: 22 });
const fx = new Effects(scene, world);

let rules = null;
let socket = null;
let myId = null;
let me = null; // Character của mình
let roomInfo = null;
let selectedCrime = null;
let joined = false;
const cam = { yaw: 0, pitch: 0.45, dist: 7.5 };

const controls = new Controls($('#c'), {
  onLook: (dx, dy) => {
    cam.yaw -= dx * 0.006;
    cam.pitch = Math.min(1.25, Math.max(0.12, cam.pitch + dy * 0.004));
  },
  onZoom: (d) => (cam.dist = Math.min(14, Math.max(4, cam.dist + d * 0.8))),
});

// ───────── Màn hình bắt đầu ─────────
try {
  $('#nick').value = localStorage.getItem('ditu-nick') || '';
} catch {}

function renderCrimeList(container, onPick, selected) {
  container.innerHTML = rules.crimes
    .map((c) => `<button class="crime ${selected === c.id ? 'on' : ''}" data-id="${c.id}"><b>${esc(c.label)}</b><span>${fmtTime(c.seconds)}</span></button>`)
    .join('');
  container.querySelectorAll('.crime').forEach((b) =>
    b.addEventListener('click', () => {
      container.querySelectorAll('.crime').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      onPick(Number(b.dataset.id));
    })
  );
}

function validateStart() {
  $('#btn-start').disabled = !(selectedCrime != null && [...$('#nick').value.trim()].length >= 2);
}
$('#nick').addEventListener('input', validateStart);

fetch('/api/rules')
  .then((r) => r.json())
  .then((r) => {
    rules = r;
    renderCrimeList($('#crime-list'), (id) => {
      selectedCrime = id;
      validateStart();
    });
    const room = roomFromUrl() || 'tự chọn phòng còn chỗ';
    $('#room-note').textContent = `Phòng: ${room} • tối đa ${r.maxPlayers} người/phòng`;
  })
  .catch(() => ($('#start-msg').textContent = 'Không tải được dữ liệu, kiểm tra mạng nhé.'));

$('#btn-start').addEventListener('click', async () => {
  const name = $('#nick').value.trim();
  try {
    localStorage.setItem('ditu-nick', name);
  } catch {}
  $('#btn-start').disabled = true;
  $('#start-msg').textContent = 'Đang vào phòng…';
  await audio.unlock();
  audio.startMusic();
  join(name);
});

// ───────── Kết nối & vào phòng ─────────
function join(name) {
  socket = connect();
  socket.on('connect', async () => {
    const res = await emitAck(socket, 'join', { mode: 'play', room: roomFromUrl(), name, clientId: clientId() });
    if (!res.ok) {
      $('#start-msg').textContent = res.reason || 'Không vào được phòng';
      $('#btn-start').disabled = false;
      socket.disconnect();
      return;
    }
    if (joined) {
      // vào lại sau khi rớt mạng
      actors.clear();
      me = null;
    }
    joined = true;
    myId = res.you;
    actors.myId = myId;
    rules = res.rules;
    roomInfo = res.info;
    const url = new URL(location.href);
    url.searchParams.set('phong', res.room);
    history.replaceState(null, '', url);
    if (res.redirected) toast(`Phòng bạn chọn đã đầy – chuyển sang phòng ${res.room}`);
    actors.applyMetas(res.metas);
    res.chat.forEach(addChatLine);
    $('#start').classList.add('hidden');
    $('#hud').classList.remove('hidden');
    updateRoomPill();
    if (selectedCrime != null) {
      const r = await emitAck(socket, 'sentence', selectedCrime);
      if (!r.ok) toast(r.reason || 'Không nhận án được');
      selectedCrime = null;
    }
  });
  socket.on('s', (arr) => actors.applySnapshot(arr));
  socket.on('metas', (list) => {
    actors.applyMetas(list);
    for (const m of list) if (m.id === myId) onMyMeta(m);
  });
  socket.on('remove', (id) => actors.remove(id));
  socket.on('chat', (c) => {
    actors.chat(c.id, c.text);
    addChatLine(c);
  });
  socket.on('info', (i) => {
    roomInfo = i;
    updateRoomPill();
    renderWarden();
  });
  socket.on('tunnel', (t) => {
    if (roomInfo) roomInfo.tunnel = t;
    renderStatus();
  });
  socket.on('fx', onFx);
  socket.on('rules', (r) => (rules = r));
  socket.on('kicked', (k) => {
    $('#kicked-msg').textContent = k.reason;
    $('#kicked').classList.remove('hidden');
  });
  socket.on('disconnect', () => toast('Mất kết nối, đang thử lại…'));
}

let lastStatus = null;
function onMyMeta(m) {
  me = actors.get(myId);
  if (!me) return;
  if (m.status !== lastStatus) {
    // chuyển từ server điều khiển sang tự điều khiển: lấy vị trí hiện tại
    me.local = !SERVER_DRIVEN.has(m.status) && m.status !== 'new';
    if (m.status === 'jailed') toast('🔒 Bạn đã vào ô. Bấm "Đào hầm" liên tục để cùng mọi người vượt ngục!');
    if (m.status === 'free' && (lastStatus === 'run' || lastStatus === 'jailed')) toast('🕊️ Bạn được tự do! Ra sân tập tạ, xếp hàng nhà ăn nhé');
    lastStatus = m.status;
  }
  renderStatus();
}

// ───────── Hiệu ứng từ server ─────────
function posOf(id) {
  const c = actors.get(id);
  return c ? c.root.position : null;
}
function onFx(e) {
  const mine = e.id === myId;
  switch (e.type) {
    case 'arrest':
      audio.play('siren', mine ? 0.9 : 0.35);
      if (!mine) toast(`🚨 ${esc(e.name)} bị bắt vì ${esc(e.crime)}`);
      break;
    case 'jailed':
      audio.play('door', mine ? 1 : 0.3);
      break;
    case 'extend': {
      const p = posOf(e.id);
      if (p) fx.floatText(`+${fmtTime(e.added)}`, p.x, 2.8, p.z, '#ff5e6c');
      if (mine) toast(`😈 Tái phạm: +${fmtTime(e.added)}`);
      break;
    }
    case 'reduce': {
      const p = posOf(e.id);
      if (p) fx.floatText(`-${e.seconds}s`, p.x, 2.8, p.z);
      audio.play('ding', 0.5);
      break;
    }
    case 'release': {
      const p = posOf(e.id);
      if (p) fx.confetti(p.x, 2, p.z, 30);
      audio.play('release', mine ? 1 : 0.4);
      const why = { served: 'mãn hạn tù', bail: `được ${esc(e.by)} bảo lãnh`, overflow: 'tù quá tải nên được thả sớm', warden: 'lên chức Cai ngục', admin: 'được quản trị thả' }[e.reason] || 'được thả';
      toast(`${mine ? '🎉 Bạn' : '🎉 ' + esc(e.name)} ${why}!`);
      break;
    }
    case 'escape':
      fx.explode();
      audio.play('escape');
      toast(`💥 VƯỢT NGỤC TẬP THỂ! ${esc(e.by || '')} phá tường thả ${e.count} người!`, 5000);
      break;
    case 'tunnel':
      fx.tunnel();
      audio.play('escape', 0.6);
      toast(`⛏️ Hầm đã thông! ${e.count} người chui ra ngoài sân!`, 5000);
      break;
    case 'warden':
      audio.play('warden');
      toast(`👑 ${esc(e.name)} trở thành CAI NGỤC!`, 5000);
      break;
    case 'warden-end':
      toast(`👑 ${esc(e.name)} hết nhiệm kỳ Cai ngục`);
      break;
    case 'immune':
      toast(`🛡️ ${esc(e.name)} được miễn bắt nhờ follow!`);
      break;
    case 'follow':
      toast(`➕ ${esc(e.name)} đã follow – được miễn bắt 1 lần`);
      break;
    case 'thanks':
      toast(`💖 Cảm ơn ${esc(e.name)} đã tặng quà!`);
      break;
    case 'toast':
      toast(esc(e.text));
      break;
    case 'chat-clear':
      $('#chat-log').innerHTML = '';
      for (const c of actors.chars.values()) c.bubble.visible = false;
      break;
  }
}

// ───────── HUD ─────────
function toast(html, ms = 3500) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = html;
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 400);
  }, ms);
}

function addChatLine(c) {
  const box = $('#chat-log');
  const d = document.createElement('div');
  d.innerHTML = `<b>${esc(c.name)}:</b> ${esc(c.text)}`;
  box.appendChild(d);
  while (box.children.length > 5) box.firstChild.remove();
  setTimeout(() => d.classList.add('old'), 12000);
}

function updateRoomPill() {
  if (!roomInfo) return;
  $('#room-pill').textContent = `🏠 ${roomInfo.name} · ${roomInfo.players}/${roomInfo.maxPlayers}${roomInfo.tiktok ? ` · 🎵${roomInfo.tiktok}` : ''}`;
}

function renderWarden() {
  const w = roomInfo?.warden;
  const el = $('#warden');
  el.classList.toggle('hidden', !w);
  if (w) el.innerHTML = `👑 Cai ngục: <b>${esc(w.name)}</b> · ${fmtTime(w.remaining)}`;
}

function renderStatus() {
  const m = me?.meta;
  const el = $('#status-card');
  if (!m) return (el.innerHTML = '');
  let html = '';
  if (m.status === 'jailed') {
    const t = roomInfo?.tunnel || { progress: 0, cooldown: 0 };
    html = `<div class="st-time">⏳ ${fmtTime(me.remaining())}</div><div class="st-sub">${esc(m.crime)}${m.crimeCount > 1 ? ' ×' + m.crimeCount : ''} · ô số ${m.cell + 1}</div>
      <div class="tunnel"><span>⛏️ Hầm vượt ngục ${t.cooldown ? `(nghỉ ${t.cooldown}s)` : ''}</span><i style="width:${t.progress}%"></i></div>`;
  } else if (m.status === 'escort') html = `<div class="st-time">🚔 Đang bị dẫn giải…</div><div class="st-sub">${esc(m.crime)} · ${fmtTime(m.remaining)}</div>`;
  else if (m.status === 'run') html = '<div class="st-time">🏃 Chạy ra sân!</div>';
  else if (m.status === 'queue') html = '<div class="st-time">🍲 Đang xếp hàng</div>';
  else if (m.status === 'new') html = '<div class="st-time">📝 Làm thủ tục…</div>';
  else html = `<div class="st-time">🕊️ Tự do</div><div class="st-sub">${m.reps ? `💪 ${m.reps} lần tập tạ` : 'Đi dạo, tập tạ, xếp hàng ăn cơm'}</div>`;
  el.innerHTML = html;
}

/** Nút hành động theo ngữ cảnh: Đào hầm / Tập tạ / Xếp hàng / Rời hàng */
let actType = null;
function updateActionButton() {
  const m = me?.meta;
  const btn = $('#btn-act');
  let type = null;
  let label = '';
  if (m) {
    const p = me.root.position;
    if (m.status === 'jailed') [type, label] = ['dig', '⛏️ Đào hầm'];
    else if (m.status === 'queue') [type, label] = ['leaveQueue', '🚶 Rời hàng'];
    else if (m.status === 'free') {
      if (BENCHES.some((b) => Math.hypot(p.x - b.x, p.z - b.z) < 2.6)) [type, label] = ['lift', '🏋️ Tập tạ'];
      else {
        const q = queueSlot(0);
        if (Math.hypot(p.x - q.x, p.z - q.z) < 10) [type, label] = ['queue', '🍲 Xếp hàng'];
      }
    }
  }
  if (type !== actType) {
    actType = type;
    btn.classList.toggle('hidden', !type);
    btn.textContent = label;
  }
}

$('#btn-act').addEventListener('click', doAction);
async function doAction() {
  if (!actType || !socket) return;
  const r = await emitAck(socket, 'act', actType);
  if (actType === 'dig') {
    if (r.ok) {
      me.anim = ANIM.dig;
      digUntil = performance.now() + 400;
    } else if (r.reason === 'cooldown') toast('Hầm vừa sập, chờ chút rồi đào tiếp!');
  } else if (!r.ok && r.reason) toast(esc(r.reason));
  else if (actType === 'lift') audio.play('ding', 0.4);
}
let digUntil = 0;

$('#btn-mute').addEventListener('click', async () => {
  await audio.unlock();
  audio.setMuted(!audio.muted);
  $('#btn-mute').textContent = audio.muted ? '🔇' : '🔊';
});
$('#btn-mute').textContent = audio.muted ? '🔇' : '🔊';

// Biểu cảm
$('#btn-emote').addEventListener('click', () => $('#emote-panel').classList.toggle('hidden'));
document.querySelectorAll('[data-emote]').forEach((b) => b.addEventListener('click', () => emote(b.dataset.emote)));
function emote(name) {
  $('#emote-panel').classList.add('hidden');
  if (!socket || !me) return;
  emitAck(socket, 'emote', name);
  me.anim = ANIM[name];
  emoteUntil = performance.now() + 2600;
}
let emoteUntil = 0;

// Chat
$('#btn-chat').addEventListener('click', openChat);
function openChat() {
  $('#chat-bar').classList.remove('hidden');
  $('#chat-input').focus();
}
$('#chat-bar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#chat-input').value.trim();
  if (!text) return $('#chat-bar').classList.add('hidden');
  const r = await emitAck(socket, 'chat', text);
  if (!r.ok) return toast(esc(r.reason));
  $('#chat-input').value = '';
  $('#chat-bar').classList.add('hidden');
  $('#chat-input').blur();
});

// Bảng trượt (bảo lãnh / menu / nhận thêm án)
function openSheet(html, bind) {
  $('#sheet-content').innerHTML = html;
  $('#sheet').classList.remove('hidden');
  bind && bind($('#sheet-content'));
}
function closeSheet() {
  $('#sheet').classList.add('hidden');
}
$('#sheet-close').addEventListener('click', closeSheet);
$('#sheet').addEventListener('click', (e) => e.target.id === 'sheet' && closeSheet());

$('#btn-bail').addEventListener('click', () => {
  const list = [...actors.chars.values()].filter((c) => c.meta.id !== myId && (c.meta.status === 'jailed' || c.meta.status === 'escort'));
  openSheet(
    `<h3>🤝 Bảo lãnh người khác ra tù</h3>
     <p class="note">Mỗi ${rules?.webBailCooldownSeconds || 60} giây bảo lãnh được 1 người. Bạn không thể tự bảo lãnh mình.</p>
     <div class="bail-list">${
       list.length
         ? list
             .sort((a, b) => b.remaining() - a.remaining())
             .map((c) => `<div class="bail-row"><span>${c.meta.kind === 'tiktok' ? '🎵 ' : ''}<b>${esc(c.meta.name)}</b><small>${esc(c.meta.crime)} · ${fmtTime(c.remaining())}</small></span><button class="btn" data-id="${c.meta.id}">Bảo lãnh</button></div>`)
             .join('')
         : '<p class="note">Không có ai đang ở tù 🎉</p>'
     }</div>`,
    (el) =>
      el.querySelectorAll('[data-id]').forEach((b) =>
        b.addEventListener('click', async () => {
          const r = await emitAck(socket, 'bail', Number(b.dataset.id));
          if (!r.ok) toast(esc(r.reason));
          closeSheet();
        })
      )
  );
});

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});

$('#btn-menu').addEventListener('click', () => {
  openSheet(
    `<h3>☰ Menu</h3>
     <div class="menu">
       <button class="btn" id="m-crime">⚖️ Nhận thêm án</button>
       <button class="btn ghost" id="m-room">🔀 Đổi phòng</button>
       ${installPrompt ? '<button class="btn ghost" id="m-install">📲 Cài lên màn hình chính</button>' : ''}
       <button class="btn ghost" id="m-help">❓ Cách chơi</button>
     </div>`,
    (el) => {
      el.querySelector('#m-crime').onclick = () =>
        openSheet('<h3>⚖️ Chọn tội</h3><div class="crime-list" id="sheet-crimes"></div>', (el2) =>
          renderCrimeList(el2.querySelector('#sheet-crimes'), async (id) => {
            const r = await emitAck(socket, 'sentence', id);
            if (!r.ok) toast(esc(r.reason));
            closeSheet();
          })
        );
      el.querySelector('#m-room').onclick = () => {
        const name = prompt('Nhập tên phòng (vd: tu-2):', roomInfo?.name || 'tu-1');
        if (name) location.href = `/?phong=${encodeURIComponent(name.trim().toLowerCase())}`;
      };
      const ins = el.querySelector('#m-install');
      if (ins) ins.onclick = () => installPrompt.prompt();
      el.querySelector('#m-help').onclick = () =>
        openSheet(`<h3>❓ Cách chơi</h3><ul class="help">
          <li>Chọn tội để nhận án, cảnh sát Bánh Bao dẫn bạn vào ô. Đồng hồ trên đầu là thời gian còn lại.</li>
          <li>Đang ở tù: bấm <b>⛏️ Đào hầm</b> liên tục. Càng nhiều người cùng đào càng nhanh – thông hầm là cả trại chui ra sân!</li>
          <li>Hết án: đi lại tự do, <b>tập tạ</b> ở sân, <b>xếp hàng</b> ở nhà ăn.</li>
          <li>🤝 Bảo lãnh người khác ra tù (không tống được ai vào tù cả).</li>
          <li>Người xem TikTok cũng có thể vào chung phòng qua bình luận và quà.</li></ul>`);
    }
  );
});

// Phím tắt máy tính
window.addEventListener('keydown', (e) => {
  if (!joined || e.target.closest('input')) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    openChat();
  } else if (e.code === 'KeyE') doAction();
  else if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) emote(EMOTES[Number(e.code.slice(-1)) - 1]);
});

// ───────── Vòng lặp ─────────
const clock = new THREE.Clock();
let sendTimer = 0;
let lastSent = '';
let startAngle = 0;
const look = new THREE.Vector3();

function loop() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  world.update(dt);

  if (me && me.local) {
    // Tự di chuyển (dự đoán phía client, server kiểm tra lại)
    const v = controls.vector();
    const mag = Math.hypot(v.x, v.y);
    const p = me.root.position;
    let anim = ANIM.idle;
    if (mag > 0.08) {
      const speed = v.run ? 5 : 2.8;
      const fwdX = -Math.sin(cam.yaw);
      const fwdZ = -Math.cos(cam.yaw);
      const rightX = -fwdZ;
      const rightZ = fwdX;
      const dx = (fwdX * v.y + rightX * v.x) * speed * dt;
      const dz = (fwdZ * v.y + rightZ * v.x) * speed * dt;
      const np = me.meta.status === 'jailed' ? resolveCell(me.meta.cell, p.x + dx, p.z + dz) : resolveFree(p.x + dx, p.z + dz);
      p.x = np.x;
      p.z = np.z;
      me.root.rotation.y = Math.atan2(dx, dz);
      anim = v.run ? ANIM.run : ANIM.walk;
    }
    const busy = performance.now() < emoteUntil || performance.now() < digUntil;
    if (!busy || anim !== ANIM.idle) {
      me.anim = anim;
      emoteUntil = 0;
    }
    sendTimer += dt;
    if (sendTimer >= 0.1) {
      sendTimer = 0;
      const msg = { x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +me.root.rotation.y.toFixed(2), anim };
      const key = JSON.stringify(msg);
      if (key !== lastSent) {
        lastSent = key;
        socket.emit('move', msg);
      }
    }
  }

  actors.update(dt, t, camera);

  // Camera góc nhìn thứ ba
  if (me && me.root.visible) {
    const p = me.root.position;
    look.set(p.x, 1.4, p.z);
    const cx = p.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
    const cz = p.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
    const cy = 1.4 + Math.sin(cam.pitch) * cam.dist;
    camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 8));
    camera.lookAt(look);
  } else {
    // Chưa vào: camera bay vòng quanh trại
    startAngle += dt * 0.08;
    camera.position.set(Math.sin(startAngle) * 42, 24, Math.cos(startAngle) * 42);
    camera.lookAt(0, 0, -2);
  }

  fx.update(dt, camera);
  if (me && Math.floor(t * 2) !== Math.floor((t - dt) * 2)) {
    renderStatus();
    updateActionButton();
  }
  renderer.render(scene, camera);
  watchFps(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// PWA: đăng ký service worker (chỉ bản build)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

