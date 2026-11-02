/**
 * Overlay "Đi Tù Online": nhận trạng thái + hiệu ứng từ server qua socket.io và vẽ lên sân khấu 1080x1920.
 * Server là nơi giữ luật chơi; overlay chỉ hiển thị.
 */
(function () {
  const W = 1080;
  const H = 1920;
  const ROAD_Y = 1840 - 30 - 190; // mép trên của nhân vật đứng trên đường (toạ độ sân khấu)
  const COLS = 4;

  const $ = (s) => document.querySelector(s);
  const stage = $('#stage');
  const grid = $('#grid');
  const fxLayer = $('#fx-layer');
  const params = new URLSearchParams(location.search);
  if (params.get('transparent') === '1') document.body.classList.add('transparent');

  // ───────── Co giãn sân khấu vừa cửa sổ (OBS đặt 1080x1920 thì tỉ lệ = 1) ─────────
  let scale = 1;
  function fit() {
    scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    stage.style.transform = `scale(${scale})`;
    stage.style.left = `${(window.innerWidth - W * scale) / 2}px`;
  }
  window.addEventListener('resize', fit);
  fit();

  // ───────── Tiện ích ─────────
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (sec) => {
    sec = Math.max(0, Math.ceil(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = String(sec % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const COLORS = ['#ff5fa2', '#7b5cff', '#3fb8ff', '#3fe0b0', '#ffb84d', '#ff7a4d', '#a35cff', '#4dc96b'];
  const colorOf = (key) => COLORS[[...String(key)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];

  /** Avatar: ảnh TikTok nếu có, lỗi/không có thì hiện chữ cái đầu trên nền màu; người bị ẩn hiện 🙈 */
  function avatarHTML(u, cls = '') {
    const name = u?.name || '?';
    const bg = colorOf(u?.key || name);
    if (u && u.avatar) {
      return `<div class="avatar ${cls}" style="background-color:${bg}"><img src="${esc(u.avatar)}" referrerpolicy="no-referrer" alt="" onerror="this.remove()"></div>`;
    }
    const hidden = /^Ẩn danh/.test(name);
    const ch = hidden ? '🙈' : esc([...name.trim()][0] || '?').toUpperCase();
    return `<div class="avatar ${cls}" style="background-color:${bg}">${ch}</div>`;
  }

  /** Toạ độ của phần tử trên sân khấu (đã bỏ hệ số scale) */
  function stagePos(el) {
    const r = el.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    return { x: (r.left - s.left) / scale, y: (r.top - s.top) / scale, w: r.width / scale, h: r.height / scale };
  }

  function addActor(html, cls) {
    const el = document.createElement('div');
    el.className = `actor ${cls}`;
    el.innerHTML = html;
    fxLayer.appendChild(el);
    return el;
  }

  function move(el, from, to, ms, easing = 'linear', extra = {}) {
    const a = el.animate(
      [
        { transform: `translate(${from.x}px, ${from.y}px) scale(${from.s ?? 1}) rotate(${from.r ?? 0}deg)` },
        ...(extra.mid ? [extra.mid] : []),
        { transform: `translate(${to.x}px, ${to.y}px) scale(${to.s ?? 1}) rotate(${to.r ?? 0}deg)` },
      ],
      { duration: ms, easing, fill: 'forwards' }
    );
    return a.finished.catch(() => {});
  }

  // ───────── Lưới ô tù ─────────
  let cells = [];
  function buildGrid(n) {
    grid.innerHTML = '';
    const rows = Math.ceil(n / COLS);
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    cells = [];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div');
      c.className = 'cell';
      c.innerHTML = `
        <div class="num">#${String(i + 1).padStart(2, '0')}</div>
        <div class="empty-label">trống</div>
        <div class="content">
          <div class="who"><div class="suit"></div><span class="av"></span></div>
          <div class="info"><div class="pname"></div><div class="crime"></div><div class="timer"></div></div>
        </div>
        <div class="bar"><i></i></div>
        <div class="bars"></div>`;
      grid.appendChild(c);
      cells.push(c);
    }
  }

  function fillCell(cell, p) {
    if (cell.dataset.key !== p.key) {
      cell.dataset.key = p.key;
      cell.querySelector('.av').innerHTML = avatarHTML(p);
      cell.querySelector('.pname').textContent = p.name;
    }
    cell.querySelector('.crime').textContent = p.crimeCount > 1 ? `${p.crime} ×${p.crimeCount}` : p.crime;
    cell.querySelector('.timer').textContent = fmt(p.remaining);
    cell.querySelector('.bar i').style.width = `${Math.max(0, Math.min(100, (p.remaining / Math.max(1, p.total)) * 100))}%`;
    cell.classList.add('full');
    cell.classList.toggle('urgent', p.remaining <= 10);
  }

  function clearCell(cell) {
    delete cell.dataset.key;
    cell.classList.remove('full', 'urgent');
  }

  // Ô đang có animation (đang dẫn giải vào / đang thả ra) – render() không đụng vào
  const busy = new Map(); // cellIndex -> { key, kind }
  let state = null;

  function render() {
    if (!state) return;
    if (cells.length !== state.maxCells) buildGrid(state.maxCells);
    const byCell = new Map(state.prisoners.map((p) => [p.cell, p]));
    cells.forEach((cell, i) => {
      const b = busy.get(i);
      const p = byCell.get(i);
      if (b && (b.kind === 'release' || (b.kind === 'arrest' && p && p.key === b.key))) return;
      if (p) fillCell(cell, p);
      else if (cell.dataset.key) clearCell(cell);
    });
    renderWarden();
    renderBoards();
    renderTicker();
    $('#paused').classList.toggle('hidden', state.enabled);
    setIdle(state.idle && state.enabled);
    SFX.setVolume(state.volume);
  }

  // ───────── Cai ngục ─────────
  let wardenKey = null;
  function renderWarden() {
    const box = $('#warden');
    const w = state.warden;
    if (!w) {
      box.classList.add('hidden');
      wardenKey = null;
      return;
    }
    if (wardenKey !== w.key) {
      wardenKey = w.key;
      box.querySelector('.warden-avatar').outerHTML = avatarHTML(w, 'warden-avatar');
      box.querySelector('.warden-name').textContent = w.name;
      box.classList.remove('hidden');
    }
    box.querySelector('.warden-time').textContent = fmt(w.remaining);
  }

  // ───────── Bảng xếp hạng ─────────
  let boardsSig = '';
  function renderBoards() {
    const sig = JSON.stringify(state.leaders);
    if (sig === boardsSig) return;
    boardsSig = sig;
    const medals = ['🥇', '🥈', '🥉', '4', '5'];
    const fill = (el, list, valFn, emptyText) => {
      el.innerHTML = list.length
        ? list
            .map((u, i) => `<li><span class="rank">${medals[i]}</span>${avatarHTML(u)}<span class="bname">${esc(u.name)}</span><span class="bval">${valFn(u.value)}</span></li>`)
            .join('')
        : `<div class="empty">${emptyText}</div>`;
    };
    fill($('#board-danger'), state.leaders.danger, (v) => fmt(v), 'Chưa có ai phạm tội…');
    fill($('#board-good'), state.leaders.good, (v) => `${v} người`, 'Chưa ai bảo lãnh ai…');
  }

  // ───────── Chữ chạy hướng dẫn ─────────
  let tickerSig = '';
  function renderTicker() {
    const r = state.rules;
    const parts = [];
    parts.push('<b>📖 CÁCH CHƠI:</b>');
    r.crimes.forEach((c) => parts.push(`💬 Gõ <em>"${esc(c.keyword)}"</em> → <b>${fmt(c.seconds)}</b> tù`));
    parts.push('🔁 Gõ thêm tội khi đang ở tù → <b>cộng dồn án</b>');
    parts.push(`🎁 ${esc(r.gifts.small.displayName)}: <b>giảm ${r.gifts.small.reduceSeconds || 30}s</b> án của bạn`);
    parts.push(`🎁 ${esc(r.gifts.medium.displayName)}: <b>bảo lãnh</b> 1 người (gõ <em>@tên</em> trước khi tặng)`);
    parts.push(`🎁 ${esc(r.gifts.large.displayName)}: <b>VƯỢT NGỤC TẬP THỂ</b> 💥`);
    parts.push(`🎁 ${esc(r.gifts.huge.displayName)}: làm <b>CAI NGỤC</b> ${r.wardenMinutes} phút 👑`);
    parts.push(`❤️ Mỗi ${r.likesPerReduction} like: <b>-${r.likeReductionSeconds}s</b>`);
    if (r.followImmunity) parts.push('➕ Follow lần đầu: <b>miễn bị bắt 1 lần</b>');
    (state.ticker || []).forEach((t) => parts.push(esc(t)));
    const html = parts.join('&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;');
    if (html === tickerSig) return;
    tickerSig = html;
    const track = $('#ticker-track');
    track.innerHTML = html;
    requestAnimationFrame(() => {
      const px = track.scrollWidth;
      track.style.animationDuration = `${Math.max(20, px / 160)}s`; // ~160px/giây
    });
  }

  // ───────── Thông báo nhỏ ─────────
  function toast(html, color = '') {
    const box = $('#toasts');
    const t = document.createElement('div');
    t.className = `toast ${color}`;
    t.innerHTML = html;
    box.appendChild(t);
    while (box.children.length > 2) box.firstChild.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 400);
    }, 3800);
  }

  function floatText(cellIdx, text, color = '') {
    const cell = cells[cellIdx];
    if (!cell) return;
    const p = stagePos(cell);
    const el = document.createElement('div');
    el.className = `float-text ${color}`;
    el.textContent = text;
    el.style.left = `${p.x + p.w / 2 - 20}px`;
    el.style.top = `${p.y + p.h / 2 - 20}px`;
    fxLayer.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  function banner(big, small, cls = '') {
    const el = document.createElement('div');
    el.className = `banner ${cls}`;
    el.innerHTML = `<div class="big">${big}</div>${small ? `<div class="small">${small}</div>` : ''}`;
    fxLayer.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function confetti(x, y, n = 30) {
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.background = COLORS[i % COLORS.length];
      c.style.left = `${x}px`;
      c.style.top = `${y}px`;
      fxLayer.appendChild(c);
      const dx = rnd(-260, 260);
      const dy = rnd(-320, -80);
      c.animate(
        [
          { transform: 'translate(0,0) rotate(0)', opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) rotate(${rnd(180, 720)}deg)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${dx * 1.3}px, ${dy + 380}px) rotate(${rnd(720, 1080)}deg)`, opacity: 0 },
        ],
        { duration: rnd(1300, 2000), easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }
      ).finished.then(() => c.remove());
    }
  }

  // ───────── Hình nhân vật ─────────
  const copHTML = () => ART.cop();
  const convictHTML = (p, tag, free = false) =>
    `${tag ? `<div class="tag ${free ? 'free' : ''}">${tag}</div>` : ''}${avatarHTML(p)}<div class="suit"></div>${free ? '' : '<div class="cuffs">⛓️</div>'}`;

  // ───────── Hiệu ứng: BẮT GIAM ─────────
  async function runArrest(p, crime) {
    const cell = cells[p.cell];
    if (!cell) return;
    const token = {};
    busy.set(p.cell, { key: p.key, kind: 'arrest', token });
    clearCell(cell);
    cell.classList.remove('open');
    SFX.play('siren');

    const target = stagePos(cell);
    const destX = Math.max(80, Math.min(W - 260, target.x + target.w / 2 - 55));
    const cop = addActor(copHTML(), 'cop walking');
    const conv = addActor(convictHTML(p, esc(p.name)), 'convict walking');

    // 1) Cảnh sát dắt tù nhân từ bên trái vào
    const dur = 700 + destX * 0.6;
    await Promise.all([
      move(cop, { x: -170, y: ROAD_Y }, { x: destX + 110, y: ROAD_Y }, dur),
      move(conv, { x: -300, y: ROAD_Y + 30 }, { x: destX - 20, y: ROAD_Y + 30 }, dur),
    ]);
    if (busy.get(p.cell)?.token !== token) {
      cop.remove();
      conv.remove();
      return; // đã bị huỷ (vd vượt ngục ngay lúc đang dẫn)
    }

    // 2) Tù nhân "bay" vào ô, cửa sắt sập xuống
    conv.classList.remove('walking');
    conv.querySelector('.tag')?.remove();
    cell.classList.add('open');
    const tx = target.x + 4;
    const ty = target.y + 20;
    move(cop, { x: destX + 110, y: ROAD_Y }, { x: W + 200, y: ROAD_Y }, 1200);
    await move(conv, { x: destX - 20, y: ROAD_Y + 30 }, { x: tx, y: ty, s: 0.85 }, 650, 'ease-in-out', {
      mid: { transform: `translate(${(destX + tx) / 2}px, ${Math.min(ty, ROAD_Y) - 160}px) scale(1.1) rotate(-15deg)` },
    });
    conv.remove();
    if (busy.get(p.cell)?.token !== token) return;
    busy.delete(p.cell);

    const now = state?.prisoners.find((x) => x.key === p.key);
    fillCell(cell, now || p);
    cell.classList.remove('open');
    cell.classList.add('slam');
    setTimeout(() => cell.classList.remove('slam'), 400);
    SFX.play('door');
    setTimeout(() => cop.remove(), 1300);
  }

  // ───────── Hiệu ứng: THẢ TỰ DO ─────────
  const REASON = {
    served: (p) => ['🎉 Mãn hạn tù!', 'green'],
    bail: (p, fx) => [`🤝 Được <b>${esc(fx.by?.name)}</b> bảo lãnh!`, 'blue'],
    overflow: () => ['😅 Tù quá tải – được thả sớm!', ''],
    warden: () => ['👑 Lên chức Cai ngục!', 'gold'],
  };

  async function runRelease(p, reason, fx) {
    const cell = cells[p.cell];
    if (!cell) return;
    const b = busy.get(p.cell);
    if (b && b.kind === 'arrest' && b.key === p.key) {
      busy.delete(p.cell); // huỷ animation bắt
      clearCell(cell);
      cell.classList.remove('open');
      return;
    }
    const token = {};
    busy.set(p.cell, { key: p.key, kind: 'release', token });
    const [label, color] = (REASON[reason] || REASON.served)(p, fx);
    toast(`${esc(p.name)}: ${label}`, color);
    SFX.play('door');

    const pos = stagePos(cell);
    cell.classList.add('open');
    await sleep(350);
    clearCell(cell);
    const runner = addActor(convictHTML(p, 'TỰ DO!', true), 'convict walking');
    const startX = pos.x + 10;
    const startY = pos.y + 10;
    SFX.play('release');
    confetti(pos.x + pos.w / 2, pos.y + pos.h / 2, 18);
    const landX = Math.max(40, Math.min(W - 200, startX));
    await move(runner, { x: startX, y: startY, s: 0.85 }, { x: landX, y: ROAD_Y + 30 }, 650, 'ease-in', {
      mid: { transform: `translate(${startX + 40}px, ${startY - 80}px) scale(1) rotate(10deg)` },
    });
    await move(runner, { x: landX, y: ROAD_Y + 30 }, { x: W + 160, y: ROAD_Y + 30 }, 500 + (W - landX) * 0.9);
    runner.remove();

    if (busy.get(p.cell)?.token === token) {
      busy.delete(p.cell);
      cell.classList.remove('open');
      render();
    }
  }

  // ───────── Hiệu ứng: VƯỢT NGỤC TẬP THỂ ─────────
  async function runEscape(list, by) {
    SFX.play('escape');
    $('#flash').classList.remove('on');
    void $('#flash').offsetWidth;
    $('#flash').classList.add('on');
    stage.classList.remove('shake');
    void stage.offsetWidth;
    stage.classList.add('shake');
    banner('💥 VƯỢT NGỤC!', `${esc(by?.name || '')} phá tường thả <b>${list.length}</b> tù nhân!`);

    const wall = $('#wall-fx');
    wall.innerHTML = `<div class="hole">${ART.wallHole()}</div>`;
    setTimeout(() => (wall.innerHTML = ''), 3700);

    // Gạch văng
    const prison = stagePos($('#prison'));
    const cx = prison.x + prison.w / 2;
    const cy = prison.y + prison.h / 2;
    for (let i = 0; i < 40; i++) {
      const b = document.createElement('div');
      b.className = 'particle';
      b.style.background = i % 3 ? '#d79a6a' : '#b9784b';
      b.style.left = `${cx}px`;
      b.style.top = `${cy}px`;
      fxLayer.appendChild(b);
      const ang = rnd(0, Math.PI * 2);
      const dist = rnd(250, 700);
      b.animate(
        [
          { transform: 'translate(0,0) rotate(0)', opacity: 1 },
          { transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist + 300}px) rotate(${rnd(-720, 720)}deg)`, opacity: 0 },
        ],
        { duration: rnd(900, 1600), easing: 'cubic-bezier(.1,.8,.3,1)', fill: 'forwards' }
      ).finished.then(() => b.remove());
    }

    // Mọi tù nhân chạy tán loạn
    cells.forEach((c, i) => {
      busy.delete(i);
      c.classList.add('open');
    });
    const runners = list.map((p) => {
      const cell = cells[p.cell];
      if (!cell) return null;
      const pos = stagePos(cell);
      clearCell(cell);
      const r = addActor(convictHTML(p, '', true), 'convict walking');
      const dir = Math.random() < 0.5 ? -1 : 1;
      const ex = dir < 0 ? -200 : W + 200;
      const ey = rnd(ROAD_Y - 200, ROAD_Y + 40);
      return move(r, { x: pos.x, y: pos.y, s: 0.85 }, { x: ex, y: ey, r: dir * 20 }, rnd(1400, 2200), 'cubic-bezier(.3,.1,.6,1)', {
        mid: { transform: `translate(${pos.x + dir * 120}px, ${pos.y - rnd(80, 200)}px) scale(1.1) rotate(${dir * -15}deg)` },
      }).then(() => r.remove());
    });
    await Promise.all(runners);
    await sleep(800);
    cells.forEach((c) => c.classList.remove('open'));
    render();
  }

  // ───────── Chế độ treo máy: tuần tra + lời mời ─────────
  let idleOn = false;
  let inviteTimer = null;
  function setIdle(on) {
    if (on === idleOn) return;
    idleOn = on;
    $('#patrol').classList.toggle('hidden', !on);
    $('#invite').classList.toggle('hidden', !on);
    clearInterval(inviteTimer);
    if (on) {
      $('#patrol').innerHTML = ART.cop({ flashlight: true });
      SFX.play('whistle');
      let i = 0;
      const next = () => {
        const crimes = state?.rules?.crimes || [];
        if (crimes.length) $('#invite-crime').textContent = `"${crimes[i++ % crimes.length].keyword}"`;
      };
      next();
      inviteTimer = setInterval(next, 3500);
    }
  }

  // ───────── Xử lý hiệu ứng từ server ─────────
  function onFx(fx) {
    switch (fx.type) {
      case 'arrest':
        toast(`🚨 <b>${esc(fx.prisoner.name)}</b> bị bắt vì <b>${esc(fx.crime)}</b> (${fmt(fx.seconds)})`, 'red');
        runArrest(fx.prisoner, fx.crime);
        break;
      case 'extend':
        floatText(fx.prisoner.cell, `+${fmt(fx.added)}`, 'red');
        cells[fx.prisoner.cell]?.classList.add('hit');
        setTimeout(() => cells[fx.prisoner.cell]?.classList.remove('hit'), 500);
        toast(`😈 <b>${esc(fx.prisoner.name)}</b> tái phạm: ${esc(fx.crime)} → +${fmt(fx.added)}`, 'red');
        SFX.play('door');
        break;
      case 'reduce':
        floatText(fx.prisoner.cell, `-${fx.seconds}s`, fx.source === 'like' ? '' : 'gold');
        SFX.play('ding');
        if (fx.source === 'gift') toast(`🎁 <b>${esc(fx.prisoner.name)}</b> giảm ${fx.seconds}s án!`, 'gold');
        break;
      case 'release':
        runRelease(fx.prisoner, fx.reason, fx);
        break;
      case 'escape':
        runEscape(fx.prisoners, fx.by);
        break;
      case 'warden':
        SFX.play('warden');
        banner('👑 CAI NGỤC MỚI!', `<b>${esc(fx.user.name)}</b> cai quản trại giam ${fmt(fx.seconds)}`, 'gold');
        confetti(W / 2, 200, 50);
        break;
      case 'warden-end':
        if (fx.user) toast(`👑 ${esc(fx.user.name)} đã hết nhiệm kỳ Cai ngục`, 'gold');
        break;
      case 'immune': {
        toast(`🛡️ <b>${esc(fx.user.name)}</b> định ${esc(fx.crime)} nhưng được <b>miễn bắt</b> nhờ follow!`, 'green');
        const s = document.createElement('div');
        s.className = 'shield';
        s.textContent = '🛡️';
        s.style.left = `${W / 2 - 60}px`;
        s.style.top = `${ROAD_Y - 40}px`;
        fxLayer.appendChild(s);
        setTimeout(() => s.remove(), 1700);
        SFX.play('ding');
        break;
      }
      case 'follow':
        toast(`➕ <b>${esc(fx.user.name)}</b> đã follow – được miễn bắt 1 lần!`, 'green');
        break;
      case 'thanks':
        toast(`💖 Cảm ơn <b>${esc(fx.user.name)}</b> đã tặng ${esc(fx.gift)}!`, 'gold');
        break;
      case 'toast':
        toast(esc(fx.text));
        break;
      case 'reset':
        busy.clear();
        fxLayer.innerHTML = '';
        cells.forEach((c) => {
          clearCell(c);
          c.classList.remove('open');
        });
        break;
    }
  }

  // ───────── Kết nối server ─────────
  const socket = io('/overlay', { reconnectionDelayMax: 5000 });
  socket.on('state', (s) => {
    state = s;
    render();
  });
  socket.on('fx', onFx);
  socket.on('connect', () => console.log('[overlay] đã kết nối server'));
  socket.on('disconnect', () => console.log('[overlay] mất kết nối, đang thử lại…'));

  buildGrid(24);
})();
