import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmountInput, formatMoney } from '../src/format.js';

test('接受整数金额', () => {
  assert.deepEqual(parseAmountInput('320'), { ok: true, amount: 320 });
});

test('接受一位小数', () => {
  assert.deepEqual(parseAmountInput('320.5'), { ok: true, amount: 320.5 });
});

test('接受两位小数', () => {
  assert.deepEqual(parseAmountInput('320.50'), { ok: true, amount: 320.5 });
});

test('去除首尾空白', () => {
  assert.deepEqual(parseAmountInput('  320.50 '), { ok: true, amount: 320.5 });
});

test('空字符串报错', () => {
  const r = parseAmountInput('');
  assert.equal(r.ok, false);
  assert.equal(typeof r.error, 'string');
});

test('空白字符串报错', () => {
  assert.equal(parseAmountInput('   ').ok, false);
});

test('非数字报错', () => {
  assert.equal(parseAmountInput('abc').ok, false);
});

test('负数报错', () => {
  assert.equal(parseAmountInput('-5').ok, false);
});

test('零报错', () => {
  assert.equal(parseAmountInput('0').ok, false);
});

test('零元零角报错', () => {
  assert.equal(parseAmountInput('0.00').ok, false);
});

test('三位小数报错', () => {
  assert.equal(parseAmountInput('320.555').ok, false);
});

// Review Focus 第 1 条：粘贴进来的金额不是裸数字。
// 这三种都必须「明确报错」，绝不能静默截断成一个错的数。
test('带千分位的金额明确报错，而不是被静默截成 1 或 1240', () => {
  assert.equal(parseAmountInput('1,240.50').ok, false);
});

test('带货币符号的金额明确报错', () => {
  assert.equal(parseAmountInput('¥320').ok, false);
});

test('全角数字明确报错', () => {
  assert.equal(parseAmountInput('３２０').ok, false);
});

test('科学计数法报错', () => {
  assert.equal(parseAmountInput('1e3').ok, false);
});

test('格式化：两位小数与千分位', () => {
  assert.equal(formatMoney(1240.5), '¥1,240.50');
});

test('格式化：零', () => {
  assert.equal(formatMoney(0), '¥0.00');
});

test('格式化：整数补足两位小数', () => {
  assert.equal(formatMoney(8930), '¥8,930.00');
});

test('格式化：小额不补千分位', () => {
  assert.equal(formatMoney(320.5), '¥320.50');
});

test('格式化：浮点累加误差不显示出来', () => {
  assert.equal(formatMoney(1240.5000000000002), '¥1,240.50');
});

test('格式化：百万级千分位', () => {
  assert.equal(formatMoney(1234567.89), '¥1,234,567.89');
});
