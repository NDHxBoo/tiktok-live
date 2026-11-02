/**
 * Kết nối socket.io + tiện ích lấy/sinh mã người chơi (lưu trong trình duyệt).
 */
import { io } from 'socket.io-client';

export function connect(opts = {}) {
  return io('/', { transports: ['websocket', 'polling'], reconnectionDelayMax: 5000, ...opts });
}

export function emitAck(socket, event, payload, timeout = 6000) {
  return new Promise((resolve) => {
    socket.timeout(timeout).emit(event, payload, (err, res) => resolve(err ? { ok: false, reason: 'Mạng chậm, thử lại nhé' } : res));
  });
}

export function clientId() {
  let id = null;
  try {
    id = localStorage.getItem('ditu-client');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^\w-]/g, '');
      localStorage.setItem('ditu-client', id);
    }
  } catch {
    id = 'tmp-' + Math.random().toString(36).slice(2, 12);
  }
  return id;
}

export function roomFromUrl() {
  return (new URLSearchParams(location.search).get('phong') || '').toLowerCase();
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
