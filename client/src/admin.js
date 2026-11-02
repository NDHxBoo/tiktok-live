/**
 * Trang quản trị: xem phòng, kick/chặn, xoá chat, sửa tội/quà/thông số, sự kiện giả, kết nối TikTok.
 */
import { io } from 'socket.io-client';
import './styles/admin.css';
import { esc } from './net.js';

const $ = (s) => document.querySelector(s);
let socket = null;
let status = null;
let selRoom = null;
let editingLoaded = false;

$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  login($('#pw').value);
});
try {
  const saved = sessionStorage.getItem('ditu-admin');
  if (saved) login(saved);
} catch {}

function login(pw) {
  socket?.disconnect();
  socket = io('/admin', { auth: { password: pw }, transports: ['websocket', 'polling'] });
  socket.on('connect', () => {
    try {
      sessionStorage.setItem('ditu-admin', pw);
    } catch {}
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
  });
  socket.on('connect_error', (e) => {
    $('#login-msg').textContent = e.message;
    try {
      sessionStorage.removeItem('ditu-admin');
    } catch {}
    socket.disconnect();
  });
  socket.on('status', onStatus);
  socket.on('logs', (l) => {
    $('#log').innerHTML = '';
    l.forEach(addLog);
  });
  socket.on('log', addLog);
}

const call = (ev, payload) =>
  new Promise((res) =>
    socket.emit(ev, payload, (r) => {
      if (r && !r.ok) alert('Lỗi: ' + r.error);
      res(r || {});
    })
  );

function addLog(l) {
  const box = $('#log');
  const d = document.createElement('div');
  d.className = l.level;
  d.textContent = `${new Date(l.time).toLocaleTimeString('vi-VN')} ${l.text}`;
  const bottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 20;
  box.appendChild(d);
  while (box.children.length > 400) box.firstChild.remove();
  if (bottom) box.scrollTop = box.scrollHeight;
}

function onStatus(s) {
  status = s;
  const t = s.tiktok;
  const p = $('#p-tiktok');
  p.textContent = `TikTok: ${t.status === 'connected' ? '@' + t.username : t.status}`;
  p.className = `pill ${t.status === 'connected' ? 'ok' : t.status === 'waiting' || t.status === 'connecting' ? 'wait' : ''}`;
  $('#p-live').textContent = `Phòng live: ${s.liveRoom}`;
  $('#tt-status').textContent = t.text;
  if (!$('#tt-user').value && t.username) $('#tt-user').value = t.username;
  if (!$('#tt-room').value) $('#tt-room').value = s.liveRoom;
  $('#demo').checked = s.demo;

  $('#rooms').innerHTML = s.rooms
    .sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }))
    .map((r) => `<tr class="${r.name === selRoom ? 'sel' : ''}"><td><b>${esc(r.name)}</b>${r.live ? ' 📡' : ''}</td><td>${r.players}/${r.maxPlayers}</td><td>${r.tiktok}</td><td>${r.prisoners}</td><td>${r.watchers}</td><td><button class="chip" data-room="${esc(r.name)}">Xem</button></td></tr>`)
    .join('');
  $('#rooms').querySelectorAll('[data-room]').forEach((b) => (b.onclick = () => selectRoom(b.dataset.room)));
  if (!selRoom && s.rooms.length) selectRoom(s.liveRoom);
  else if (selRoom) loadRoom();

  $('#bans').innerHTML = s.bans.length
    ? s.bans.map((b) => `<div class="row">🚫 <b>${esc(b.name)}</b> <span class="hint">${esc(b.ip || '')} ${esc((b.at || '').slice(0, 16))}</span><button class="chip" data-unban="${esc(b.id)}">Bỏ chặn</button></div>`).join('')
    : '<p class="hint">Chưa chặn ai.</p>';
  $('#bans').querySelectorAll('[data-unban]').forEach((b) => (b.onclick = () => call('unban', b.dataset.unban)));

  if (!editingLoaded) {
    editingLoaded = true;
    loadEditors(s.config);
  }
  renderQuickCrimes(s.config);
}

function selectRoom(name) {
  selRoom = name;
  $('#d-name').textContent = name;
  loadRoom();
}

async function loadRoom() {
  const r = await call('room:detail', selRoom);
  const d = r.result;
  if (!d) return ($('#actors').innerHTML = '<tr><td colspan="5" class="hint">Phòng đã đóng</td></tr>');
  const st = { new: '📝 mới vào', escort: '🚔 dẫn giải', jailed: '🔒 ở tù', run: '🏃 chạy', free: '🕊️ tự do', queue: '🍲 xếp hàng', leaving: '👋 rời đi' };
  $('#actors').innerHTML = d.actors
    .map(
      (a) => `<tr><td><b>${esc(a.name)}</b>${a.warden ? ' 👑' : ''}</td><td>${a.kind === 'web' ? '🌐 web' : '🎵 TikTok'}</td><td>${st[a.status] || a.status}${a.remaining ? ` · ${a.remaining}s` : ''}</td><td class="hint">${esc(a.ip)}</td>
      <td><button class="chip" data-kick="${a.id}">Kick</button> <button class="chip" data-ban="${a.id}">Chặn</button></td></tr>`
    )
    .join('') || '<tr><td colspan="5" class="hint">Trống</td></tr>';
  $('#actors').querySelectorAll('[data-kick]').forEach((b) => (b.onclick = () => call('kick', { room: selRoom, id: Number(b.dataset.kick) }).then(loadRoom)));
  $('#actors').querySelectorAll('[data-ban]').forEach((b) => (b.onclick = () => confirm('Chặn người này khỏi trò chơi?') && call('ban', { room: selRoom, id: Number(b.dataset.ban) }).then(loadRoom)));
  $('#d-chat').innerHTML = d.chat.map((c) => `<div><b>${esc(c.name)}:</b> ${esc(c.text)}</div>`).join('') || '<span class="hint">Chưa có chat</span>';
}
$('#d-clear').onclick = () => selRoom && call('chat:clear', selRoom).then(loadRoom);
$('#d-reset').onclick = () => selRoom && confirm('Thả hết tù nhân và xoá bảng xếp hạng phòng này?') && call('room:reset', selRoom).then(loadRoom);

// ───────── TikTok ─────────
$('#tt-connect').onclick = () => call('tiktok:connect', { username: $('#tt-user').value.trim(), room: $('#tt-room').value.trim() || undefined });
$('#tt-off').onclick = () => call('tiktok:disconnect');
$('#demo').onchange = (e) => call('demo', e.target.checked);

// ───────── Sự kiện giả ─────────
const FAKE = ['Mèo Mun', 'Bé Heo', 'Chú Cuội', 'Tôm Hùm', 'Cá Viên', 'Gà Rán', 'Ốc Bươu', 'Bánh Flan', 'Chè Thái'];
$('#f-rand').onclick = () => ($('#f-nick').value = FAKE[Math.floor(Math.random() * FAKE.length)] + ' ' + Math.floor(Math.random() * 90 + 10));
const fake = async (p) => {
  const r = await call('fake', { room: $('#f-room').value.trim() || undefined, nickname: $('#f-nick').value.trim() || 'Tester', ...p });
  const x = r.result || {};
  $('#f-res').textContent = `→ ${x.ok ? 'OK' : 'Bỏ qua'}: ${x.action || x.reason || ''}`;
};
$('#f-chat').onclick = () => fake({ type: 'chat', comment: $('#f-comment').value });
$('#f-comment').onkeydown = (e) => e.key === 'Enter' && $('#f-chat').click();
document.querySelectorAll('[data-gift]').forEach((b) => (b.onclick = () => fake({ type: 'gift', tier: b.dataset.gift, count: Number($('#f-count').value) || 1 })));
$('#f-gift').onclick = () => fake({ type: 'gift', giftName: $('#f-gname').value.trim(), diamonds: Number($('#f-dia').value) || 0, count: Number($('#f-count').value) || 1 });
$('#f-like').onclick = () => fake({ type: 'like', likeCount: Number($('#f-likes').value) || 1 });
$('#f-follow').onclick = () => fake({ type: 'follow' });

let quickSig = '';
function renderQuickCrimes(cfg) {
  const sig = JSON.stringify(cfg.crimes);
  if (sig === quickSig) return;
  quickSig = sig;
  $('#f-crimes').innerHTML = cfg.crimes.map((c, i) => `<button class="chip" data-i="${i}">${esc(c.keyword)}</button>`).join('') + '<button class="chip" data-dig="1">⛏️ đào</button>';
  $('#f-crimes').querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => fake({ type: 'chat', comment: cfg.crimes[b.dataset.i].keyword })));
  $('#f-crimes').querySelector('[data-dig]').onclick = () => fake({ type: 'chat', comment: cfg.game.digKeyword || 'đào' });
}

// ───────── Trình sửa cấu hình ─────────
const SETTINGS = [
  ['rooms.maxPlayers', 'Người chơi web tối đa/phòng'],
  ['game.cellCapacity', 'Số người mỗi ô tù (1–6)'],
  ['game.idleSeconds', 'Treo máy bao lâu thì đi tuần (giây)'],
  ['game.maxSentenceSeconds', 'Án tối đa (giây)'],
  ['game.commentCooldownSeconds', 'Chống spam nhận án (giây)'],
  ['game.likesPerReduction', 'Số like / lần giảm án'],
  ['game.likeReductionSeconds', 'Giây giảm mỗi mốc like'],
  ['game.wardenMinutes', 'Thời gian làm Cai ngục (phút)'],
  ['game.webBailCooldownSeconds', 'Chờ giữa 2 lần bảo lãnh (web, giây)'],
  ['game.maxTiktokActors', 'Số nhân vật TikTok tối đa/phòng'],
  ['game.tiktokDespawnSeconds', 'Nhân vật TikTok rời đi sau (giây)'],
  ['game.chatMaxLength', 'Độ dài chat tối đa'],
  ['game.digTapPercent', '% hầm mỗi lần đào'],
  ['game.digCooldownSeconds', 'Nghỉ sau khi thông hầm (giây)'],
  ['game.digKeyword', 'Từ khoá đào hầm (TikTok)'],
];
const TIERS = [
  ['small', '🌹 Quà nhỏ – giảm án'],
  ['medium', '🍩 Quà vừa – bảo lãnh'],
  ['large', '💥 Quà lớn – vượt ngục'],
  ['huge', '👑 Quà rất lớn – Cai ngục'],
];

function addCrimeRow(c = { keyword: '', seconds: 60, label: '' }) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input class="k" value="${esc(c.keyword)}"></td><td><input class="s" type="number" min="1" max="3600" value="${esc(c.seconds)}"></td><td><input class="l" value="${esc(c.label)}"></td><td><button class="chip">✕</button></td>`;
  tr.querySelector('button').onclick = () => tr.remove();
  $('#crimes').appendChild(tr);
}
$('#crime-add').onclick = () => addCrimeRow();

function loadEditors(cfg) {
  $('#crimes').innerHTML = '';
  cfg.crimes.forEach(addCrimeRow);
  $('#gifts').innerHTML = TIERS.map(([t, label]) => {
    const g = cfg.gifts[t] || {};
    return `<div class="gift" data-tier="${t}"><b>${label}</b>
      <span>Tên hiển thị</span><input class="dn" value="${esc(g.displayName)}">
      <span>Tên quà TikTok</span><input class="nm" value="${esc((g.names || []).join(', '))}" placeholder="Rose, Hoa hồng">
      <span>Gift ID</span><input class="ids" value="${esc((g.ids || []).join(', '))}" placeholder="5655">
      <span>Từ (kim cương)</span><input class="md" type="number" value="${esc(g.minDiamonds)}">
      ${t === 'small' ? `<span>Giảm (giây)</span><input class="rs" type="number" value="${esc(g.reduceSeconds)}">` : ''}</div>`;
  }).join('');
  $('#g-fallback').checked = cfg.gifts.useDiamondFallback !== false;
  $('#settings').innerHTML = SETTINGS.map(([k, label]) => {
    const [a, b] = k.split('.');
    return `<label for="s-${k}">${label}</label><input id="s-${k}" data-k="${k}" value="${esc(cfg[a]?.[b] ?? '')}">`;
  }).join('');
  $('#banned').value = (cfg.bannedWords || []).join(', ');
  $('#ticker').value = (cfg.ticker || []).join('\n');
}

const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
$('#save').onclick = async () => {
  const crimes = [...document.querySelectorAll('#crimes tr')].map((tr) => ({ keyword: tr.querySelector('.k').value, seconds: Number(tr.querySelector('.s').value), label: tr.querySelector('.l').value }));
  const gifts = { useDiamondFallback: $('#g-fallback').checked };
  document.querySelectorAll('#gifts .gift').forEach((el) => {
    gifts[el.dataset.tier] = {
      displayName: el.querySelector('.dn').value,
      names: list(el.querySelector('.nm').value),
      ids: list(el.querySelector('.ids').value),
      minDiamonds: Number(el.querySelector('.md').value) || 0,
      reduceSeconds: el.querySelector('.rs') ? Number(el.querySelector('.rs').value) : undefined,
    };
  });
  const game = {};
  const rooms = {};
  document.querySelectorAll('#settings input').forEach((i) => {
    const [a, b] = i.dataset.k.split('.');
    const v = b === 'digKeyword' ? i.value : Number(i.value);
    (a === 'rooms' ? rooms : game)[b] = v;
  });
  const r = await call('config:save', {
    crimes,
    gifts,
    game,
    rooms,
    bannedWords: $('#banned').value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean),
    ticker: $('#ticker').value.split('\n').map((x) => x.trim()).filter(Boolean),
  });
  if (r.ok) alert('Đã lưu config.json – áp dụng ngay cho mọi phòng.');
};
