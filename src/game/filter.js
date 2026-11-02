'use strict';
/**
 * Bộ lọc nội dung tục tĩu.
 * - So khớp theo NGUYÊN TỪ / cụm từ (không so khớp một phần của từ),
 *   không phân biệt hoa thường.
 * - Giữ nguyên dấu khi so khớp để tránh bắt nhầm: "đeo kính" không bị coi là "deo",
 *   "lớn" không bị coi là "lồn". Vì vậy nên khai báo cả bản có dấu lẫn không dấu
 *   trong danh sách (vd "địt" và "dit").
 * - Bắt thêm kiểu viết tách từng chữ cái để lách luật: "v c l", "đ.ị.t", "d-m".
 */
const { lower, tokenize, containsTokens } = require('../utils/text');

class ContentFilter {
  constructor(words = []) {
    this.setWords(words);
  }

  setWords(words) {
    this.words = [];
    for (const raw of words || []) {
      const tokens = tokenize(lower(String(raw || '').trim()));
      if (!tokens.length) continue;
      this.words.push({ tokens, compact: tokens.join('') });
    }
  }

  /** Trả về true nếu chuỗi chứa từ cấm */
  isDirty(text) {
    if (!text) return false;
    const tokens = tokenize(lower(text));
    if (!tokens.length) return false;
    // Ghép các "từ" chỉ có 1 ký tự liền nhau lại: "v c l" -> "vcl"
    const joinedSingles = [];
    let buf = '';
    for (const t of tokens) {
      if ([...t].length === 1) buf += t;
      else {
        if (buf) joinedSingles.push(buf);
        buf = '';
      }
    }
    if (buf) joinedSingles.push(buf);

    for (const w of this.words) {
      if (containsTokens(tokens, w.tokens)) return true;
      if (w.compact.length >= 2 && joinedSingles.some((j) => j === w.compact || (j.length > w.compact.length && j.includes(w.compact) && j.length <= w.compact.length + 2))) {
        return true;
      }
    }
    return false;
  }
}

module.exports = { ContentFilter };
