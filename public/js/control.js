/**
 * Trang điều khiển: bật/tắt, reset, âm lượng, gửi sự kiện giả, sửa tội/từ cấm/thông số.
 */
(function () {
  const $ = (s) => document.querySelector(s);
  const token = new URLSearchParams(location.search).get('token') || undefined;
  const socket = io('/control', { auth: { token } });
  let config = null;
  let state = null;
  let crimesDirty = false;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pill = (el, text, cls) => {
    el.textContent = text;
    el.className = `pill ${cls || ''}`;
  };

  function send(event, payload, okMsg) {
    socket.emit(event, payload, (res) => {
      if (!res) return;
      if (!res.ok) alert('Lỗi: ' + res.error);
      else if (okMsg) flash(okMsg);
    });
  }
  function flash(msg) {
    const r = $('#f-result');
    r.textContent = msg;
  }

  // ───────── Kết nối ─────────
  socket.on('connect', () => pill($('#socket-pill'), 'Server: đã kết nối', 'ok'));
  socket.on('disconnect', () => pill($('#socket-pill'), 'Server: mất kết nối', 'bad'));
  socket.on('connect_error', (e) => pill($('#socket-pill'), e.message === 'forbidden' ? 'Không có quyền' : 'Không kết nối được', 'bad'));

  socket.on('status', (s) => {
    config = s.config;
    pill($('#mode-pill'), s.mode === 'live' ? 'Chế độ: LIVE' : 'Chế độ: TEST', s.mode === 'live' ? 'ok' : 'wait');
    const t = s.tiktok;
    const cls = t.status === 'connected' ? 'ok' : t.status === 'connecting' || t.status === 'waiting' ? 'wait' : '';
    pill($('#tiktok-pill'), `TikTok: ${t.status === 'connected' ? '@' + t.username : t.status}`, cls);
    $('#tt-status').textContent = t.text;
    if (!$('#tt-user').value && t.username) $('#tt-user').value = t.username;
    $('#demo').checked = s.demo;
    $('#volume').value = config.audio?.volume ?? 0.7;
    $('#volume-val').textContent = Math.round(($('#volume').value || 0) * 100) + '%';
    if (!crimesDirty) renderCrimes(config.crimes);
    if (document.activeElement !== $('#banned')) $('#banned').value = (config.bannedWords || []).join(', ');
    if (document.activeElement !== $('#ticker')) $('#ticker').value = (config.ticker || []).join('\n');
    renderSettings();
    renderQuickCrimes();
    if (s.logs) {
      $('#log').innerHTML = '';
      s.logs.forEach(addLog);
    }
  });

  socket.on('state', (s) => {
    state = s;
    const btn = $('#btn-toggle');
    btn.textContent = s.enabled ? '⏸️ Tạm dừng game' : '▶️ Bật game';
    btn.classList.toggle('paused', !s.enabled);
    const st = s.stats;
    $('#stats').innerHTML = [
      ['Đang ở tù', `${st.prisoners}/${s.maxCells}`],
      ['Lượt bắt', st.arrests],
      ['Người chơi', st.users],
      ['Bảo lãnh', st.bails],
      ['Vượt ngục', st.escapes],
      ['Chặn tục tĩu', st.blocked],
    ]
      .map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`)
      .join('');
  });

  function addLog(l) {
    const box = $('#log');
    const div = document.createElement('div');
    div.className = l.level === 'warn' || l.level === 'error' ? l.level : l.text.includes('[game]') ? 'fx' : '';
    div.textContent = `${new Date(l.time).toLocaleTimeString('vi-VN')} ${l.text}`;
    const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 20;
    box.appendChild(div);
    while (box.children.length > 300) box.firstChild.remove();
    if (atBottom) box.scrollTop = box.scrollHeight;
  }
  socket.on('log', addLog);

  // ───────── Điều khiển chung ─────────
  $('#btn-toggle').onclick = () => send('setEnabled', !(state && state.enabled));
  $('#btn-reset').onclick = () => confirm('Thả hết tù nhân và làm trống nhà tù?') && send('reset', { leaderboards: false });
  $('#btn-reset-all').onclick = () => confirm('Xoá cả nhà tù lẫn bảng xếp hạng phiên?') && send('reset', { leaderboards: true });
  let volTimer;
  $('#volume').oninput = (e) => {
    $('#volume-val').textContent = Math.round(e.target.value * 100) + '%';
    clearTimeout(volTimer);
    volTimer = setTimeout(() => send('setVolume', Number(e.target.value)), 250);
  };
  $('#demo').onchange = (e) => send('demo', e.target.checked);
  $('#overlay-url').textContent = `${location.origin}/overlay`;

  $('#tt-connect').onclick = () => send('tiktok:connect', $('#tt-user').value.trim());
  $('#tt-disconnect').onclick = () => send('tiktok:disconnect');

  // ───────── Sự kiện giả ─────────
  const FAKE = ['Mèo Mun', 'Bé Heo', 'Chú Cuội', 'Tôm Hùm', 'Cá Viên', 'Gà Rán', 'Ốc Bươu', 'Bánh Flan', 'Chè Thái'];
  $('#f-random').onclick = () => {
    const n = FAKE[Math.floor(Math.random() * FAKE.length)] + ' ' + Math.floor(Math.random() * 90 + 10);
    $('#f-nick').value = n;
    $('#f-uid').value = n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/\s+/g, '').toLowerCase();
  };
  const who = () => ({ nickname: $('#f-nick').value.trim() || 'Tester', uniqueId: $('#f-uid').value.trim() || $('#f-nick').value.trim() || 'tester' });
  const fake = (payload) =>
    socket.emit('fake', Object.assign(who(), payload), (res) => {
      if (!res.ok) return flash('Lỗi: ' + res.error);
      const r = res.result || {};
      flash(`→ ${r.ok ? 'OK' : 'Bỏ qua'}: ${r.action || r.reason || ''}`);
    });

  $('#f-chat').onclick = () => fake({ type: 'chat', comment: $('#f-comment').value });
  $('#f-comment').onkeydown = (e) => e.key === 'Enter' && $('#f-chat').click();
  document.querySelectorAll('[data-gift]').forEach((b) => (b.onclick = () => fake({ type: 'gift', tier: b.dataset.gift, count: Number($('#f-count').value) || 1 })));
  $('#f-gift').onclick = () =>
    fake({ type: 'gift', giftName: $('#f-giftname').value.trim(), diamonds: Number($('#f-diamonds').value) || 0, count: Number($('#f-count').value) || 1 });
  $('#f-like').onclick = () => fake({ type: 'like', likeCount: Number($('#f-likes').value) || 1 });
  $('#f-follow').onclick = () => fake({ type: 'follow' });

  function renderQuickCrimes() {
    const box = $('#quick-crimes');
    box.innerHTML = (config.crimes || []).map((c, i) => `<button class="chip" data-i="${i}">${esc(c.keyword)}</button>`).join('');
    box.querySelectorAll('button').forEach((b) => (b.onclick = () => fake({ type: 'chat', comment: config.crimes[b.dataset.i].keyword })));
  }

  // ───────── Danh sách tội ─────────
  function renderCrimes(list) {
    const body = $('#crimes-body');
    body.innerHTML = '';
    (list || []).forEach(addCrimeRow);
  }
  function addCrimeRow(c = { keyword: '', seconds: 60, label: '' }) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="k" value="${esc(c.keyword)}" placeholder="vd: trộm gà"></td>
      <td><input class="s" type="number" min="1" max="3600" value="${esc(c.seconds)}"></td>
      <td><input class="l" value="${esc(c.label)}" placeholder="vd: Trộm gà 🐔"></td>
      <td><button class="ghost del" title="Xoá">✕</button></td>`;
    tr.querySelector('.del').onclick = () => {
      tr.remove();
      crimesDirty = true;
    };
    tr.querySelectorAll('input').forEach((i) => (i.oninput = () => (crimesDirty = true)));
    $('#crimes-body').appendChild(tr);
  }
  $('#crime-add').onclick = () => {
    addCrimeRow();
    crimesDirty = true;
  };
  $('#crime-save').onclick = () => {
    const list = [...document.querySelectorAll('#crimes-body tr')].map((tr) => ({
      keyword: tr.querySelector('.k').value.trim(),
      seconds: Number(tr.querySelector('.s').value),
      label: tr.querySelector('.l').value.trim(),
    }));
    socket.emit('saveCrimes', list, (res) => {
      if (!res.ok) return alert(res.error);
      crimesDirty = false;
      alert(`Đã lưu ${res.result} tội.`);
    });
  };

  // ───────── Thông số ─────────
  const SETTINGS = [
    ['maxCells', 'Số ô tù tối đa (1–24)'],
    ['idleSeconds', 'Treo máy bao lâu thì đi tuần (giây)'],
    ['maxSentenceSeconds', 'Án tối đa một người (giây)'],
    ['commentCooldownSeconds', 'Chống spam: giây giữa 2 lần phạm tội'],
    ['likesPerReduction', 'Số like để được giảm án'],
    ['likeReductionSeconds', 'Số giây giảm mỗi mốc like'],
    ['wardenMinutes', 'Thời gian làm Cai ngục (phút)'],
  ];
  function renderSettings() {
    const box = $('#game-settings');
    if (box.contains(document.activeElement)) return;
    box.innerHTML = SETTINGS.map(([k, label]) => `<label for="g-${k}">${label}</label><input id="g-${k}" type="number" min="0" value="${esc(config.game?.[k] ?? '')}">`).join('');
  }
  $('#game-save').onclick = () => {
    const g = {};
    SETTINGS.forEach(([k]) => {
      const v = $(`#g-${k}`).value;
      if (v !== '') g[k] = Number(v);
    });
    send('saveGame', g);
    alert('Đã lưu thông số.');
  };

  // ───────── Từ cấm & chữ chạy ─────────
  $('#banned-save').onclick = () => {
    const words = $('#banned').value.split(/[,\n]/).map((w) => w.trim()).filter(Boolean);
    socket.emit('saveBannedWords', words, (res) => (res.ok ? alert(`Đã lưu ${res.result} từ cấm.`) : alert(res.error)));
  };
  $('#ticker-save').onclick = () => {
    send('saveTicker', $('#ticker').value.split('\n').map((s) => s.trim()).filter(Boolean));
    alert('Đã lưu dòng chữ chạy.');
  };
})();
