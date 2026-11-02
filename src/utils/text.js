'use strict';
/**
 * Tiện ích xử lý chuỗi tiếng Việt: bỏ dấu, tách từ, so khớp cụm từ.
 */

/** Chuyển về chữ thường, giữ nguyên dấu (dùng cho so khớp từ cấm có dấu) */
function lower(s) {
  return String(s || '').normalize('NFC').toLowerCase();
}

/** Bỏ dấu tiếng Việt: "Trộm Gà" -> "trom ga" */
function stripDiacritics(s) {
  return lower(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

/** Tách chuỗi thành mảng từ (chỉ chữ và số, hỗ trợ Unicode) */
function tokenize(s) {
  return String(s || '').match(/[\p{L}\p{N}]+/gu) || [];
}

/**
 * Kiểm tra mảng từ `hay` có chứa liên tiếp cụm `needle` hay không.
 * Ví dụ: ["toi","trom","ga","day"] chứa ["trom","ga"].
 */
function containsTokens(hay, needle) {
  if (!needle.length || needle.length > hay.length) return false;
  outer: for (let i = 0; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** Có dấu tiếng Việt hay không (để quyết định cách so khớp) */
function hasDiacritics(s) {
  return stripDiacritics(s) !== lower(s);
}

/** Định dạng giây thành mm:ss */
function formatTime(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

module.exports = { lower, stripDiacritics, tokenize, containsTokens, hasDiacritics, formatTime };
