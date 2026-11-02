'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { PrisonGame } = require('../src/game/PrisonGame');
const baseConfig = require('../config.json');

function setup(overrides = {}) {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms) => (t += ms) };
  const config = JSON.parse(JSON.stringify(baseConfig));
  Object.assign(config.game, { commentCooldownSeconds: 0 }, overrides);
  const game = new PrisonGame({ config, now: clock.now });
  const fx = [];
  game.on('fx', (e) => fx.push(e));
  const u = (id, nickname = id) => ({ key: id, uniqueId: id, nickname, avatar: `http://img/${id}.jpg` });
  const chat = (id, comment, nickname) => game.handleEvent({ type: 'chat', user: u(id, nickname), comment });
  const gift = (id, g) => game.handleEvent({ type: 'gift', user: u(id), gift: g });
  const tick = (ms) => {
    clock.advance(ms);
    game.tick(ms);
  };
  return { game, fx, chat, gift, tick, clock, u };
}

test('gõ tội → vào tù với đúng mức án, không phân biệt dấu', () => {
  const { game, chat } = setup();
  assert.equal(chat('a', 'hôm nay tui TRỘM GÀ nè').action, 'arrest');
  assert.equal(chat('b', 'an vung').action, 'arrest');
  const s = game.getState();
  assert.equal(s.prisoners.find((p) => p.key === 'a').remaining, 60);
  assert.equal(s.prisoners.find((p) => p.key === 'b').remaining, 120);
});

test('không khớp một phần từ', () => {
  const { chat } = setup();
  assert.equal(chat('a', 'trộmgà').reason, 'no-crime');
});

test('cụm tội dài được ưu tiên', () => {
  const { game, chat } = setup();
  chat('a', 'quỵt nợ trà sữa');
  assert.equal(game.getState().prisoners[0].remaining, 180);
});

test('phạm tội khi đang ở tù → cộng dồn', () => {
  const { game, chat } = setup();
  chat('a', 'trộm gà');
  assert.equal(chat('a', 'ăn vụng').action, 'extend');
  assert.equal(game.getState().prisoners[0].remaining, 180);
  assert.equal(game.getLeaderboards().danger[0].value, 180);
});

test('hết án → được thả', () => {
  const { game, chat, tick, fx } = setup();
  chat('a', 'trộm gà');
  tick(59_000);
  assert.equal(game.prisoners.size, 1);
  tick(1_000);
  assert.equal(game.prisoners.size, 0);
  assert.ok(fx.some((e) => e.type === 'release' && e.reason === 'served'));
});

test('chỉ tự đưa mình vào tù, @người khác không bị bắt', () => {
  const { game, chat } = setup();
  chat('b', 'xin chào');
  chat('a', '@b trộm gà');
  assert.deepEqual([...game.prisoners.keys()], ['a']);
});

test('quà nhỏ giảm 30s án của chính mình, có thể thả luôn', () => {
  const { game, chat, gift } = setup();
  chat('a', 'trộm gà');
  gift('a', { name: 'Rose', count: 1 });
  assert.equal(game.getState().prisoners[0].remaining, 30);
  gift('a', { name: 'Rose', count: 1 });
  assert.equal(game.prisoners.size, 0);
});

test('quà vừa bảo lãnh người được @ trong bình luận gần nhất', () => {
  const { game, chat, gift } = setup();
  chat('x', 'trộm gà', 'Xoài Non');
  chat('y', 'quỵt nợ trà sữa', 'Yến');
  chat('g', 'cứu @x với');
  const r = gift('g', { name: 'Doughnut' });
  assert.deepEqual(r.freed, ['x']);
  assert.ok(game.prisoners.has('y'));
  assert.equal(game.getLeaderboards().good[0].key, 'g');
});

test('quà vừa bảo lãnh theo tên hiển thị trong bình luận', () => {
  const { game, chat, gift } = setup();
  chat('x', 'trộm gà', 'Xoài Non');
  chat('y', 'quỵt nợ trà sữa', 'Yến');
  chat('g', 'tha cho xoai non đi');
  assert.deepEqual(gift('g', { name: 'Doughnut' }).freed, ['x']);
});

test('quà vừa không chỉ định → bảo lãnh người án dài nhất, không bao giờ là chính mình', () => {
  const { game, chat, gift } = setup();
  chat('g', 'quỵt nợ trà sữa');
  chat('x', 'trộm gà');
  chat('y', 'ăn vụng');
  assert.deepEqual(gift('g', { name: 'Doughnut' }).freed, ['y']);
  assert.ok(game.prisoners.has('g'));
});

test('quà lớn vượt ngục tập thể', () => {
  const { game, chat, gift, fx } = setup();
  ['a', 'b', 'c'].forEach((k) => chat(k, 'trộm gà'));
  gift('z', { name: 'Hand Hearts' });
  assert.equal(game.prisoners.size, 0);
  assert.equal(fx.find((e) => e.type === 'escape').prisoners.length, 3);
});

test('quà rất lớn → Cai ngục 5 phút', () => {
  const { game, gift, tick } = setup();
  gift('w', { name: 'Money Gun' });
  assert.equal(game.getState().warden.key, 'w');
  assert.equal(game.getState().warden.remaining, 300);
  tick(300_000);
  assert.equal(game.getState().warden, null);
});

test('hạng quà theo kim cương khi không khai báo tên', () => {
  const { game } = setup();
  assert.equal(game.resolveGiftTier({ name: 'Unknown', diamonds: 1 }), 'small');
  assert.equal(game.resolveGiftTier({ name: 'Unknown', diamonds: 30 }), 'medium');
  assert.equal(game.resolveGiftTier({ name: 'Unknown', diamonds: 199 }), 'large');
  assert.equal(game.resolveGiftTier({ name: 'Unknown', diamonds: 1000 }), 'huge');
});

test('mỗi 50 like giảm 5 giây, phần dư được giữ', () => {
  const { game, chat } = setup();
  chat('a', 'trộm gà');
  game.handleEvent({ type: 'like', user: { key: 'a' }, likeCount: 30 });
  assert.equal(game.getState().prisoners[0].remaining, 60);
  game.handleEvent({ type: 'like', user: { key: 'a' }, likeCount: 75 });
  assert.equal(game.getState().prisoners[0].remaining, 50);
});

test('follow lần đầu miễn bắt 1 lần', () => {
  const { game, chat } = setup();
  game.handleEvent({ type: 'follow', user: { key: 'a' } });
  game.handleEvent({ type: 'follow', user: { key: 'a' } }); // follow lại không cộng thêm
  assert.equal(chat('a', 'trộm gà').action, 'immune');
  assert.equal(chat('a', 'trộm gà').action, 'arrest');
});

test('quá tải → thả người án ngắn nhất', () => {
  const { game, chat } = setup({ maxCells: 3 });
  chat('a', 'quỵt nợ trà sữa');
  chat('b', 'trộm gà');
  chat('c', 'ăn vụng');
  chat('d', 'ăn vụng');
  assert.deepEqual([...game.prisoners.keys()].sort(), ['a', 'c', 'd']);
  assert.equal(game.prisoners.get('d').cell, 1); // lấy lại ô của b
});

test('bình luận tục tĩu bị bỏ qua, tên tục tĩu bị ẩn', () => {
  const { game, chat } = setup();
  assert.equal(chat('a', 'vcl trộm gà').reason, 'blocked');
  chat('b', 'trộm gà', 'thằng đm');
  const p = game.getState().prisoners[0];
  assert.match(p.name, /^Ẩn danh/);
  assert.equal(p.avatar, null);
});

test('cooldown chống spam', () => {
  const { chat, clock } = setup({ commentCooldownSeconds: 2 });
  assert.equal(chat('a', 'trộm gà').action, 'arrest');
  assert.equal(chat('a', 'trộm gà').reason, 'cooldown');
  clock.advance(2000);
  assert.equal(chat('a', 'trộm gà').action, 'extend');
});

test('treo máy 2 phút → idle, có tương tác → hết idle', () => {
  const { game, tick, chat } = setup();
  tick(119_000);
  assert.equal(game.idle, false);
  tick(1_000);
  assert.equal(game.idle, true);
  chat('a', 'hello');
  assert.equal(game.idle, false);
});

test('tắt game → không bắt, không đếm ngược', () => {
  const { game, chat, tick } = setup();
  chat('a', 'trộm gà');
  game.setEnabled(false);
  assert.equal(chat('b', 'trộm gà').reason, 'disabled');
  tick(120_000);
  assert.equal(game.getState().prisoners[0].remaining, 60);
});

test('bỏ qua sự kiện trùng msgId', () => {
  const { game, u } = setup();
  game.handleEvent({ type: 'chat', msgId: '1', user: u('a'), comment: 'trộm gà' });
  const r = game.handleEvent({ type: 'chat', msgId: '1', user: u('a'), comment: 'trộm gà' });
  assert.equal(r.reason, 'duplicate');
});
