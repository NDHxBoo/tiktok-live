/**
 * Các hàm luật chơi thuần (không trạng thái) – dễ kiểm thử.
 */
import { stripDiacritics, tokenize, containsTokens } from '../shared/text.js';

export const GIFT_TIERS = ['huge', 'large', 'medium', 'small']; // thứ tự ưu tiên khi xét theo kim cương

/** Chuẩn bị danh sách tội: cụm dài được ưu tiên ("quỵt nợ trà sữa" trước "trà sữa") */
export function buildCrimes(crimes) {
  return (crimes || [])
    .filter((c) => c && c.keyword && Number(c.seconds) > 0)
    .map((c, i) => ({
      id: i,
      keyword: String(c.keyword),
      label: String(c.label || c.keyword),
      seconds: Math.round(Number(c.seconds)),
      tokens: tokenize(stripDiacritics(c.keyword)),
    }))
    .filter((c) => c.tokens.length);
}

/** Tìm tội trong bình luận (không phân biệt dấu/hoa thường, so nguyên cụm từ) */
export function matchCrime(crimes, comment) {
  const tokens = tokenize(stripDiacritics(comment));
  if (!tokens.length) return null;
  let best = null;
  for (const c of crimes) {
    if (containsTokens(tokens, c.tokens) && (!best || c.tokens.length > best.tokens.length)) best = c;
  }
  return best;
}

/** Bình luận có chứa từ khoá (vd "đào") hay không */
export function hasKeyword(comment, keyword) {
  if (!keyword) return false;
  return containsTokens(tokenize(stripDiacritics(comment)), tokenize(stripDiacritics(keyword)));
}

/** Bảng tra quà theo tên/id */
export function buildGiftIndex(gifts = {}) {
  const byName = new Map();
  const byId = new Map();
  for (const tier of GIFT_TIERS) {
    const t = gifts[tier];
    if (!t) continue;
    for (const n of t.names || []) byName.set(stripDiacritics(n).trim(), tier);
    for (const id of t.ids || []) byId.set(String(id), tier);
  }
  return { byName, byId, gifts };
}

/** Xác định hạng quà: tier (quà giả) → id → tên → số kim cương */
export function resolveGiftTier(index, gift) {
  if (gift.tier && GIFT_TIERS.includes(gift.tier)) return gift.tier;
  if (gift.id != null && index.byId.has(String(gift.id))) return index.byId.get(String(gift.id));
  if (gift.name) {
    const t = index.byName.get(stripDiacritics(gift.name).trim());
    if (t) return t;
  }
  if (index.gifts.useDiamondFallback !== false) {
    const d = Number(gift.diamonds) || 0;
    if (d > 0) {
      for (const tier of GIFT_TIERS) {
        const min = Number(index.gifts[tier]?.minDiamonds);
        if (min > 0 && d >= min) return tier;
      }
    }
  }
  return null;
}

const squash = (s) => stripDiacritics(s || '').replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Tìm người được bảo lãnh dựa trên bình luận gần nhất:
 *  1. "@tên" khớp username hoặc tên hiển thị
 *  2. bình luận chứa tên hiển thị
 *  3. không chỉ định được → người có án dài nhất
 * candidates: [{ id, name, uniqueId, remainingMs, hidden }]
 */
export function pickBailTarget(candidates, text) {
  if (!candidates.length) return null;
  if (text) {
    const mentions = [...text.matchAll(/@([^\s@,]+)/g)].map((m) => squash(m[1])).filter(Boolean);
    for (const m of mentions) {
      const hit = candidates.find((c) => squash(c.uniqueId) === m || squash(c.name) === m);
      if (hit) return hit;
    }
    const textTokens = tokenize(stripDiacritics(text));
    let best = null;
    let bestLen = 0;
    for (const c of candidates) {
      if (c.hidden) continue;
      for (const n of [c.name, c.uniqueId]) {
        const nt = tokenize(stripDiacritics(n || ''));
        const len = nt.join('').length;
        if (len >= 2 && len > bestLen && containsTokens(textTokens, nt)) {
          best = c;
          bestLen = len;
        }
      }
    }
    if (best) return best;
  }
  return [...candidates].sort((a, b) => b.remainingMs - a.remainingMs)[0];
}

/** Làm sạch tên hiển thị: bỏ ký tự điều khiển, cắt độ dài */
export function cleanName(raw, max = 16) {
  const s = String(raw || '')
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = [...s];
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : s;
}
