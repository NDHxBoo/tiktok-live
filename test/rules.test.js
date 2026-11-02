import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { buildCrimes, matchCrime, buildGiftIndex, resolveGiftTier, pickBailTarget, cleanName } from '../server/rules.js';
import { resolveFree, OBSTACLES, randomYardPoint } from '../shared/map.js';
import { normalizeGift, normalizeChat } from '../server/sources/normalize.js';

const cfg = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url)));

test('khớp tội không dấu, ưu tiên cụm dài, không khớp một phần từ', () => {
  const crimes = buildCrimes(cfg.crimes);
  assert.equal(matchCrime(crimes, 'QUYT NO TRA SUA nè').seconds, 180);
  assert.equal(matchCrime(crimes, 'trộmgà'), null);
});

test('hạng quà theo tên / kim cương', () => {
  const idx = buildGiftIndex(cfg.gifts);
  assert.equal(resolveGiftTier(idx, { name: 'rose' }), 'small');
  assert.equal(resolveGiftTier(idx, { name: 'X', diamonds: 30 }), 'medium');
  assert.equal(resolveGiftTier(idx, { name: 'X', diamonds: 199 }), 'large');
  assert.equal(resolveGiftTier(idx, { name: 'X', diamonds: 1000 }), 'huge');
});

test('chọn người bảo lãnh theo @, theo tên, mặc định án dài nhất', () => {
  const c = [{ id: 1, name: 'Xoài Non', uniqueId: 'xoai', remainingMs: 10 }, { id: 2, name: 'Yến', uniqueId: 'yen', remainingMs: 99 }];
  assert.equal(pickBailTarget(c, 'cứu @xoai').id, 1);
  assert.equal(pickBailTarget(c, 'tha cho xoai non').id, 1);
  assert.equal(pickBailTarget(c, '').id, 2);
});

test('tên sạch: bỏ ký tự điều khiển, cắt độ dài', () => {
  assert.equal(cleanName('  a​b  '), 'ab');
  assert.equal([...cleanName('x'.repeat(40), 16)].length, 16);
});

test('va chạm: điểm trên sân không nằm trong vật cản', () => {
  for (let i = 0; i < 200; i++) {
    const p = randomYardPoint();
    assert.ok(!OBSTACLES.some((o) => p.x > o.minX && p.x < o.maxX && p.z > o.minZ && p.z < o.maxZ));
  }
  const q = resolveFree(999, -999);
  assert.ok(q.x <= 30 && q.z >= -20);
});

test('chuẩn hoá quà TikTok: bỏ qua khi combo chưa kết thúc', () => {
  const user = { userId: '1', uniqueId: 'a', nickname: 'A' };
  assert.equal(normalizeGift({ user, giftId: 1, giftDetails: { giftName: 'Rose', giftType: 1 }, repeatEnd: false }), null);
  assert.equal(normalizeGift({ user, giftId: 1, giftDetails: { giftName: 'Rose', giftType: 1 }, repeatEnd: true, repeatCount: 5 }).gift.count, 5);
  assert.equal(normalizeChat({ user: { id: '5', displayId: 'abc', nickname: 'A', avatarThumb: { urlList: ['https://x/b.png'] } }, comment: 'hi' }).user.avatar, 'https://x/b.png');
});
