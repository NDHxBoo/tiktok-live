/**
 * Quản lý âm thanh hiệu ứng: nạp trước, phát chồng nhiều tiếng, chống phát dồn dập.
 */
(function () {
  const FILES = {
    siren: 'siren.wav',
    door: 'door.wav',
    escape: 'escape.wav',
    release: 'release.wav',
    warden: 'warden.wav',
    ding: 'ding.wav',
    whistle: 'whistle.wav',
  };
  // Khoảng cách tối thiểu giữa 2 lần phát cùng một tiếng (ms)
  const THROTTLE = { siren: 2500, door: 250, release: 300, ding: 150, whistle: 3000, escape: 1500, warden: 1000 };

  const params = new URLSearchParams(location.search);
  const muted = params.get('mute') === '1';
  const base = {};
  const lastPlay = {};
  let volume = 0.7;
  let blocked = false;

  for (const [k, f] of Object.entries(FILES)) {
    const a = new Audio('/assets/sounds/' + f);
    a.preload = 'auto';
    base[k] = a;
  }

  function showUnlock() {
    const btn = document.getElementById('sound-unlock');
    if (!btn || !blocked) return;
    btn.classList.remove('hidden');
    btn.onclick = () => {
      blocked = false;
      btn.classList.add('hidden');
      play('ding', true);
    };
  }

  function play(name, force = false) {
    if (muted || volume <= 0 || !base[name]) return;
    const now = Date.now();
    if (!force && lastPlay[name] && now - lastPlay[name] < (THROTTLE[name] || 0)) return;
    lastPlay[name] = now;
    const a = base[name].cloneNode();
    a.volume = volume;
    const p = a.play();
    if (p && p.catch) {
      p.catch(() => {
        // Trình duyệt thường chặn tự phát tiếng; OBS thì không.
        blocked = true;
        showUnlock();
      });
    }
  }

  window.SFX = {
    play,
    setVolume(v) {
      volume = Math.max(0, Math.min(1, Number(v) || 0));
    },
  };
})();
