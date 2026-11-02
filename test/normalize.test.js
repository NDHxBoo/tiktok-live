'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { normalizeChat, normalizeGift, normalizeLike } = require('../src/sources/normalize');

const user = { userId: '123', uniqueId: 'meo_u', nickname: 'Mèo Ú', profilePicture: { url: ['https://x/a.webp', 'https://x/a.jpeg'] } };

test('chuẩn hoá bình luận (định dạng v2)', () => {
  const e = normalizeChat({ user, comment: 'trộm gà', common: { msgId: '99' } });
  assert.deepEqual(e, { type: 'chat', msgId: '99', user: { key: 'u123', uniqueId: 'meo_u', nickname: 'Mèo Ú', avatar: 'https://x/a.jpeg' }, comment: 'trộm gà' });
});

test('chuẩn hoá định dạng proto (displayId, avatarThumb.urlList)', () => {
  const e = normalizeChat({ user: { id: '5', displayId: 'abc', nickname: 'A', avatarThumb: { urlList: ['https://x/b.png'] } }, comment: 'hi' });
  assert.equal(e.user.key, 'u5');
  assert.equal(e.user.uniqueId, 'abc');
  assert.equal(e.user.avatar, 'https://x/b.png');
});

test('quà combo: bỏ qua khi chưa kết thúc combo, lấy số lượng khi kết thúc', () => {
  const base = { user, giftId: 5655, giftDetails: { giftName: 'Rose', diamondCount: 1, giftType: 1 } };
  assert.equal(normalizeGift(Object.assign({}, base, { repeatCount: 3, repeatEnd: false })), null);
  const g = normalizeGift(Object.assign({}, base, { repeatCount: 5, repeatEnd: true }));
  assert.deepEqual(g.gift, { id: 5655, name: 'Rose', diamonds: 1, count: 5 });
});

test('quà không combo được xử lý ngay', () => {
  const g = normalizeGift({ user, giftId: 1, gift: { name: 'Money Gun', diamondCount: 500, type: 2 }, repeatCount: 1, repeatEnd: 0 });
  assert.equal(g.gift.name, 'Money Gun');
  assert.equal(g.gift.diamonds, 500);
});

test('like', () => {
  assert.equal(normalizeLike({ user, likeCount: 15 }).likeCount, 15);
});
