import test from 'node:test';
import assert from 'node:assert';
import { ContentFilter } from '../shared/filter.js';

const f = new ContentFilter(['đm', 'dm', 'vcl', 'lồn', 'địt', 'dit', 'óc chó']);

test('bắt từ cấm nguyên từ', () => {
  for (const t of ['DM luôn', 'ok vcl', 'đồ óc chó', 'v c l', 'đ.ị.t']) assert.ok(f.isDirty(t), t);
});
test('không bắt nhầm từ bình thường', () => {
  for (const t of ['trộm gà', 'lớn rồi', 'đeo kính', 'admin', 'con chó dễ thương', 'lon nước']) assert.ok(!f.isDirty(t), t);
});
