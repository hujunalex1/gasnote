import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmountInput, formatMoney, toISODate, todayISO, isValidDate } from '../src/lib/format.ts';

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

// Review Focus 第 2 条：本地时区。
// 用 new Date(...) 构造的是「本地时间」，toISODate 必须原样反映本地年月日。
// 如果实现里混进了 toISOString()，这两条会立刻挂掉。
test('本地时间的深夜时刻不会被算成第二天', () => {
  assert.equal(toISODate(new Date(2026, 9, 15, 23, 50, 0)), '2026-10-15');
});

test('本地时间的凌晨时刻不会被算成前一天', () => {
  assert.equal(toISODate(new Date(2026, 9, 15, 0, 10, 0)), '2026-10-15');
});

test('月份和日期补零', () => {
  assert.equal(toISODate(new Date(2026, 0, 5)), '2026-01-05');
});

test('12 月 31 日不越界到下一年', () => {
  assert.equal(toISODate(new Date(2026, 11, 31, 23, 59, 59)), '2026-12-31');
});

test('todayISO 返回合法日期且等于本地今天', () => {
  const today = todayISO();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(today, toISODate(new Date()));
});

test('isValidDate 接受合法日期', () => {
  assert.equal(isValidDate('2026-10-15'), true);
});

test('isValidDate 拒绝格式不对的字符串', () => {
  assert.equal(isValidDate('2026/10/15'), false);
  assert.equal(isValidDate('26-10-15'), false);
  assert.equal(isValidDate('2026-1-5'), false);
  assert.equal(isValidDate(''), false);
  assert.equal(isValidDate(null), false);
  assert.equal(isValidDate(20261015), false);
});

test('isValidDate 拒绝不存在的月份', () => {
  assert.equal(isValidDate('2026-00-15'), false);
  assert.equal(isValidDate('2026-13-15'), false);
});

test('isValidDate 拒绝不存在的日子', () => {
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2026-04-31'), false);
  assert.equal(isValidDate('2026-10-00'), false);
});

test('isValidDate 正确处理闰年二月', () => {
  assert.equal(isValidDate('2024-02-29'), true);  // 闰年
  assert.equal(isValidDate('2026-02-29'), false); // 平年
});
