import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { Room } from '../server/Room.js';
import { buildCrimes, buildGiftIndex } from '../server/rules.js';
import { ContentFilter } from '../shared/filter.js';
import { cellBounds } from '../shared/map.js';

const baseConfig = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url)));

function setup(gameOverrides = {}) {
  const config = structuredClone(baseConfig);
  Object.assign(config.game, { commentCooldownSeconds: 0, chatCooldownSeconds: 0 }, gameOverrides);
  const ctx = { config, crimes: buildCrimes(config.crimes), giftIndex: buildGiftIndex(config.gifts), filter: new ContentFilter(config.bannedWords) };
  let t = 1_000_000;
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const room = new Room('tu-1', ctx, { now: () => t, rand });
  const fx = [];
  room.on('fx', (e) => fx.push(e));
  const tick = (ms) => {
    for (let i = 0; i < ms / 100; i++) {
      t += 100;
      room.tick(100);
    }
  };
  const tt = (id, comment, nickname = id) => room.handleTiktok({ type: 'chat', user: { key: id, uniqueId: id, nickname }, comment });
  const gift = (id, g) => room.handleTiktok({ type: 'gift', user: { key: id, uniqueId: id, nickname: id }, gift: g });
  const actorOf = (key) => [...room.actors.values()].find((a) => a.key === key);
  return { room, fx, tick, tt, gift, actorOf, ctx, advance: (ms) => (t += ms) };
}

test('người chơi web nhận án → bị dẫn giải → vào ô → đếm ngược → được thả ra sân', () => {
  const { room, tick, fx } = setup();
  const a = room.addWebPlayer({ clientId: 'abcdefgh1', name: 'Mèo' });
  assert.equal(room.webSentence(a, 0).action, 'arrest');
  assert.equal(a.status, 'escort');
  tick(20_000);
  assert.equal(a.status, 'jailed');
  const b = cellBounds(a.cell);
  assert.ok(a.x >= b.minX && a.x <= b.maxX && a.z >= b.minZ && a.z <= b.maxZ, 'đứng trong ô');
  tick(60_000);
  assert.ok(fx.some((e) => e.type === 'release' && e.reason === 'served'));
  tick(15_000);
  assert.equal(a.status, 'free');
});

test('đếm ngược chỉ bắt đầu khi đã vào ô', () => {
  const { room, tick } = setup();
  const a = room.addWebPlayer({ clientId: 'abcdefgh1', name: 'Mèo' });
  room.webSentence(a, 0);
  tick(3000);
  assert.equal(a.remainingMs, 60_000);
});

test('nhận thêm án khi đang ở tù → cộng dồn', () => {
  const { room, tick } = setup();
  const a = room.addWebPlayer({ clientId: 'abcdefgh1', name: 'Mèo' });
  room.webSentence(a, 0);
  tick(20_000);
  const before = a.remainingMs;
  assert.equal(room.webSentence(a, 1).action, 'extend');
  assert.equal(a.remainingMs - before, 120_000);
});

test('người chơi trong tù không ra khỏi ô được', () => {
  const { room, tick } = setup();
  const a = room.addWebPlayer({ clientId: 'abcdefgh1', name: 'Mèo' });
  room.webSentence(a, 0);
  tick(20_000);
  for (let i = 0; i < 30; i++) {
    room.webMove(a, { x: a.x, z: a.z + 1, ry: 0, anim: 1 });
  }
  assert.ok(a.z <= cellBounds(a.cell).maxZ + 1e-9);
});

test('bảo lãnh: không tự bảo lãnh mình, có thời gian chờ', () => {
  const { room, tick } = setup();
  const a = room.addWebPlayer({ clientId: 'aaaaaaaa1', name: 'An' });
  const b = room.addWebPlayer({ clientId: 'bbbbbbbb1', name: 'Bình' });
  const c = room.addWebPlayer({ clientId: 'cccccccc1', name: 'Chi' });
  room.webSentence(b, 0);
  room.webSentence(c, 0);
  room.webSentence(a, 0);
  tick(20_000);
  assert.equal(room.webBail(a, a.id).ok, false);
  assert.equal(room.webBail(a, b.id).ok, true);
  assert.equal(b.status, 'run');
  assert.equal(room.webBail(a, c.id).ok, false, 'phải chờ cooldown');
});

test('không có cách nào đưa người khác vào tù: bình luận "@b trộm gà" chỉ bắt người gõ', () => {
  const { room, tt, actorOf } = setup();
  tt('b', 'xin chào');
  tt('a', '@b trộm gà');
  assert.ok(actorOf('tt:a'));
  assert.equal(actorOf('tt:b'), undefined);
  assert.equal(room.actors.size, 1);
});

test('TikTok: bình luận tội → nhân vật xuất hiện và bị dẫn giải; bình luận thường → bong bóng chat', () => {
  const { room, tt, actorOf } = setup();
  const chats = [];
  room.on('chat', (c) => chats.push(c));
  assert.equal(tt('x', 'hôm nay TROM GA nè', 'Xoài').action, 'arrest');
  assert.equal(actorOf('tt:x').status, 'escort');
  assert.equal(tt('x', 'cứu với').action, 'bubble');
  assert.equal(chats.at(-1).text, 'cứu với');
  assert.equal(tt('y', 'chào cả nhà').reason, 'no-actor');
});

test('TikTok: bình luận tục tĩu bị bỏ qua, tên tục tĩu bị ẩn', () => {
  const { tt, actorOf } = setup();
  assert.equal(tt('a', 'vcl trộm gà').reason, 'blocked');
  tt('b', 'trộm gà', 'thằng đm');
  assert.match(actorOf('tt:b').name, /^Ẩn danh/);
});

test('quà nhỏ giảm án, quà vừa bảo lãnh người được @, quà lớn vượt ngục, quà rất lớn làm Cai ngục', () => {
  const { room, tt, gift, tick, actorOf, fx } = setup();
  tt('a', 'quỵt nợ trà sữa');
  tt('b', 'trộm gà', 'Bé Na');
  tt('c', 'ăn vụng');
  tick(20_000);
  const before = actorOf('tt:a').remainingMs;
  gift('a', { name: 'Rose', count: 2 });
  assert.equal(before - actorOf('tt:a').remainingMs, 60_000);

  tt('g', 'thả @b ra đi');
  assert.deepEqual(gift('g', { name: 'Doughnut' }).freed, [actorOf('tt:b').id]);

  const r = gift('z', { name: 'Hand Hearts' });
  assert.equal(r.action, 'escape');
  assert.ok(fx.some((e) => e.type === 'escape'));
  assert.ok(![...room.actors.values()].some((x) => x.status === 'jailed'));

  gift('w', { name: 'Money Gun' });
  assert.equal(room.info().warden.name, 'w');
  tick(5 * 60_000 + 1000);
  assert.equal(room.info().warden, null);
});

test('like: mỗi 50 like giảm 5 giây; follow lần đầu miễn bắt 1 lần', () => {
  const { room, tt, tick, actorOf } = setup();
  tt('a', 'trộm gà');
  tick(20_000);
  const before = actorOf('tt:a').remainingMs;
  room.handleTiktok({ type: 'like', user: { key: 'a' }, likeCount: 120 });
  assert.equal(before - actorOf('tt:a').remainingMs, 10_000);

  room.handleTiktok({ type: 'follow', user: { key: 'f', nickname: 'F' } });
  room.handleTiktok({ type: 'follow', user: { key: 'f', nickname: 'F' } });
  assert.equal(tt('f', 'trộm gà').action, 'immune');
  assert.equal(tt('f', 'trộm gà').action, 'arrest');
});

test('đào hầm: nhiều người cùng đào nhanh hơn, thông hầm thì mọi tù nhân ra sân', () => {
  const { room, tick, fx } = setup({ digTapPercent: 1 });
  const a = room.addWebPlayer({ clientId: 'aaaaaaaa1', name: 'An' });
  const b = room.addWebPlayer({ clientId: 'bbbbbbbb1', name: 'Bình' });
  room.webSentence(a, 0);
  room.webSentence(b, 0);
  tick(20_000);
  room.dig(a);
  const solo = room.tunnel.progress;
  room.dig(b);
  assert.ok(room.tunnel.progress - solo > solo, 'người thứ 2 đào được nhiều hơn');
  for (let i = 0; i < 60 && room.tunnel.progress > 0; i++) {
    tick(100);
    room.dig(a);
    room.dig(b);
  }
  assert.ok(fx.some((e) => e.type === 'tunnel' && e.count === 2));
  assert.equal(a.status, 'run');
});

test('quá tải: người án ngắn nhất được thả', () => {
  const { room, tt, tick, fx } = setup({ cellCapacity: 1 });
  for (let i = 0; i < 12; i++) tt(`p${i}`, 'quỵt nợ trà sữa');
  tt('short', 'ngủ nướng');
  tick(500);
  tt('new', 'quỵt nợ trà sữa');
  assert.ok(fx.some((e) => e.type === 'release' && e.reason === 'overflow' && e.name === 'short'));
});

test('chat web: lọc từ cấm, giới hạn độ dài', () => {
  const { room } = setup();
  const a = room.addWebPlayer({ clientId: 'aaaaaaaa1', name: 'An' });
  assert.equal(room.webChat(a, 'đồ vcl').ok, false);
  const chats = [];
  room.on('chat', (c) => chats.push(c));
  room.webChat(a, 'x'.repeat(200));
  assert.ok([...chats[0].text].length <= 60);
});

test('treo máy 2 phút → idle', () => {
  const { room, tick } = setup();
  tick(119_000);
  assert.equal(room.idle, false);
  tick(1_100);
  assert.equal(room.idle, true);
});
