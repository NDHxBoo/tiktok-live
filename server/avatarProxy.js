/**
 * Proxy ảnh đại diện TikTok: WebGL chỉ dùng được ảnh cùng nguồn (hoặc có CORS),
 * trong khi CDN TikTok thường không trả header CORS. Server tải hộ và lưu đệm trong bộ nhớ.
 * Chỉ cho phép các tên miền ảnh của TikTok để tránh bị lợi dụng làm proxy tự do.
 */
const ALLOWED = [/\.tiktokcdn\.com$/i, /\.tiktokcdn-us\.com$/i, /\.tiktokcdn-eu\.com$/i, /\.ibyteimg\.com$/i, /\.byteimg\.com$/i, /\.muscdn\.com$/i];
const MAX_BYTES = 1024 * 1024;
const MAX_ITEMS = 400;

export function avatarProxy(log) {
  const cache = new Map(); // url -> { type, buf }

  return async (req, res) => {
    const raw = String(req.query.u || '');
    let url;
    try {
      url = new URL(raw);
    } catch {
      return res.status(400).end();
    }
    if (url.protocol !== 'https:' || !ALLOWED.some((r) => r.test(url.hostname))) return res.status(403).end();

    const hit = cache.get(raw);
    if (hit) {
      res.set('Content-Type', hit.type).set('Cache-Control', 'public, max-age=86400');
      return res.end(hit.buf);
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
      clearTimeout(t);
      const type = r.headers.get('content-type') || '';
      if (!r.ok || !type.startsWith('image/')) return res.status(502).end();
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > MAX_BYTES) return res.status(413).end();
      cache.set(raw, { type, buf });
      if (cache.size > MAX_ITEMS) cache.delete(cache.keys().next().value);
      res.set('Content-Type', type).set('Cache-Control', 'public, max-age=86400');
      res.end(buf);
    } catch (e) {
      log.debug('Không tải được avatar', e.message);
      res.status(504).end();
    }
  };
}
